// Isolated real workerd/SQLite acceptance. This harness is never bundled into the production Worker.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const require=createRequire(import.meta.url),runtimeRequire=createRequire(require.resolve('wrangler'));
const {Miniflare,convertV4MiniflareOptions}=runtimeRequire('miniflare'),{build}=runtimeRequire('esbuild');
const root=resolve(import.meta.dirname,'..'),persist=mkdtempSync(join(tmpdir(),'tavern-session-'));
const source=`
import {TavernSession} from './worker/session-object';
export class TestSession extends TavernSession {
 constructor(ctx,env){super(ctx,{...env,AI:{gateway:()=>({run:async request=>{
 const input=request.query.messages.at(-1).content;
 if(input.includes('等待'))return new Response(new ReadableStream(),{headers:{'Content-Type':'text/event-stream'}});
 return new Response('data: '+JSON.stringify({choices:[{delta:{content:'你好。[TAVERN_NEXT]\\n我坐下。\\n我问问。\\n我看窗外。'},finish_reason:'stop'}]})+'\\n\\ndata: [DONE]\\n\\n',{headers:{'Content-Type':'text/event-stream'}});
 }})}});}
}
export default {async fetch(request,env){const d=await request.json();const stub=env.SESSIONS.getByName(JSON.stringify([d.owner,d.id]));
 if(d.method==='generate')return stub.fetch(new Request('https://session/generate',{method:'POST',headers:{'X-Tavern-Owner':d.owner,'X-Tavern-Session':d.id,'X-Tavern-Username':'test','Content-Type':'application/json'},body:JSON.stringify(d.data)}));
 return new Response(await stub.invoke(d.owner,d.id,d.method,d.data??{}),{headers:{'Content-Type':'application/json'}});
}};`;
const bundle=await build({stdin:{contents:source,resolveDir:root,sourcefile:'session-test.ts',loader:'ts'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',external:['cloudflare:workers']});
const options={modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-09-18',compatibilityFlags:['nodejs_compat','enable_request_signal'],durableObjects:{SESSIONS:{className:'TestSession',useSQLite:true}},resourcePersistencePath:persist,d1Databases:{DB:'test'},bindings:{AIG_GATEWAY_ID:'default'}};
let runtime=new Miniflare(convertV4MiniflareOptions(options));
async function call(id,method,data,owner='owner'){return runtime.dispatchFetch('https://test',{method:'POST',body:JSON.stringify({id,owner,method,data})});}
try{
 let db=await runtime.getD1Database('DB');for(const name of readdirSync(join(root,'migrations')).filter(n=>n.endsWith('.sql')).sort())await db.exec(readFileSync(join(root,'migrations',name),'utf8').replace(/--[^\n]*/g,'').replace(/\n/g,' '));
 const settings={userName:'旅人',persona:'',systemPrompt:'保持角色',modelId:'rp',thinkingEnabled:false,temperature:.9,topP:1,topK:0,frequencyPenalty:0,presencePenalty:0};
 for(const id of ['a','b'])await db.prepare('INSERT INTO sessions(id,owner,title,character_json,character_name,settings_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').bind(id,'owner','旅店','{"name":"岚"}','岚',JSON.stringify(settings),1,1).run();
 await db.prepare("INSERT INTO messages(id,session_id,role,content,status,ordinal,created_at,finish_reason,candidates_json) VALUES('legacy','a','assistant','旧正文','completed',0,1,'stop','[\"问问。\"]')").run();
 await db.prepare('INSERT INTO model_capabilities VALUES(?,?,?)').bind('rp',JSON.stringify({contextTokens:32768,source:'llama.cpp:n_ctx',inputRatio:1.2}),Date.now()+300000).run();
 let a=await(await call('a','read')).json();assert.equal(a.value.messages[0].id,'legacy');assert.deepEqual(a.value.messages[0].candidates,['问问。']);
 assert.equal((await db.prepare('SELECT generation_id FROM sessions WHERE id=?').bind('a').first()).generation_id,'do:a');
 assert.equal((await(await call('a','read',undefined,'stranger')).json()).status,404);
 const requestId=crypto.randomUUID();const streamed=await(await call('a','generate',{requestId,content:'问候'})).text();assert.match(streamed,/"type":"done"/);assert.doesNotMatch(streamed,/\[TAVERN_NEXT\]/);
 a=await(await call('a','read')).json();assert.equal(a.value.messages.at(-1).content,'你好。');assert.equal((await(await call('b','read')).json()).value.messages.length,0);
 assert.equal((await(await call('a','generate',{requestId})).json()).replayed,true);
 const fork=await(await call('a','fork',{messageId:a.value.messages.at(-1).id,content:'新分支'})).json();assert.equal((await(await call(fork.value.id,'read')).json()).value.messages.at(-1).content,'新分支');
 const pending=await call('b','generate',{requestId:crypto.randomUUID(),content:'等待'}),reader=pending.body.getReader();await reader.read();const b=await(await call('b','read')).json();await call('b','stop',{generationId:b.value.session.generationId});while(!(await reader.read()).done){};
 await call('a','update',{title:'已保存'});await runtime.dispose();runtime=new Miniflare(convertV4MiniflareOptions(options));a=await(await call('a','read')).json();assert.equal(a.value.session.title,'已保存');assert.equal(a.value.messages.at(-1).content,'你好。');
 const interrupted=await call('b','generate',{requestId:crypto.randomUUID(),content:'等待'});await interrupted.body.getReader().read();await runtime.dispose();runtime=new Miniflare(convertV4MiniflareOptions(options));const recovered=await(await call('b','read')).json();assert.equal(recovered.value.session.generationId,null);assert.equal(recovered.value.messages.at(-1).status,'aborted');
 await call('a','remove');await runtime.dispose();runtime=new Miniflare(convertV4MiniflareOptions(options));assert.equal((await(await call('a','read')).json()).status,404);db=await runtime.getD1Database('DB');assert.equal((await db.prepare("SELECT count(*) n FROM messages WHERE id='legacy'").first()).n,1);
 console.log('workerd SQLite: import, fence, identity/session isolation, streamed reply, replay, fork, stop, restart and deletion passed');
}finally{await runtime.dispose();rmSync(persist,{recursive:true,force:true});}
