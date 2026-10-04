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
 async inspectStorage(){const tables=this.ctx.storage.sql.exec("SELECT name FROM sqlite_master WHERE type='table'").toArray().map(r=>r.name).filter(n=>!n.startsWith('_cf')&&!n.startsWith('sqlite_'));return {tables,alarm:await this.ctx.storage.getAlarm(),bytes:this.ctx.storage.sql.databaseSize};}
 constructor(ctx,env){super(ctx,{...env,AI:{gateway:()=>({run:async request=>{
 const director=!!request.query.response_format;const synopsis=request.query.messages[0].content.startsWith('总结已发生剧情');const input=request.query.messages.at(-1).content;
 if(!director&&!synopsis&&request.query.messages.some(m=>m.role==='user'&&m.content.includes('检索两个片段'))){
  const results=request.query.messages.filter(m=>m.role==='tool');
  if(results.length<2){const query=results.length?'银怀表':'铜钥匙';return new Response('data: '+JSON.stringify({choices:[{delta:{tool_calls:[{index:0,id:'recall-'+results.length,type:'function',function:{name:'search_memory',arguments:JSON.stringify({query})}}]},finish_reason:'tool_calls'}]})+'\\n\\ndata: [DONE]\\n\\n',{headers:{'Content-Type':'text/event-stream'}});}
  const hits=results.map(m=>JSON.parse(m.content)[0]);if(hits[0].source.messageId!==hits[1].source.messageId||!hits[0].text.includes('铜钥匙')||hits[0].text.includes('银怀表')||!hits[1].text.includes('银怀表藏在南塔'))throw new Error('memory fragment provenance missing');
 }
 if(!director&&input.includes('工具抵达北港')&&request.query.messages.at(-1).role!=='tool')return new Response('data: '+JSON.stringify({choices:[{delta:{tool_calls:[{index:0,id:'state-call',type:'function',function:{name:'update_state',arguments:'{"patch":{"scene":"北港"}}'}}]},finish_reason:'tool_calls'}]})+'\\n\\ndata: [DONE]\\n\\n',{headers:{'Content-Type':'text/event-stream'}});
 if(director){if(request.query.tools||request.query.tool_choice||request.query.messages.length!==2||request.query.messages.some(m=>m.role==='tool'))throw new Error('Director context polluted');const data=JSON.parse(input);if(!data.state||data.recentStory.length>4)throw new Error('Director data missing');}
 if(!director&&input.includes('等待'))return new Response(new ReadableStream(),{headers:{'Content-Type':'text/event-stream'}});
 return new Response('data: '+JSON.stringify({choices:[{delta:{content:director?JSON.stringify({choices:['我坐下。','我问问。','我看窗外。']}):synopsis?'旧事':'你好。'},finish_reason:'stop'}]})+'\\n\\ndata: [DONE]\\n\\n',{headers:{'Content-Type':'text/event-stream'}});
 }})}});}
}
export default {async fetch(request,env){const d=await request.json();const stub=env.SESSIONS.getByName(JSON.stringify([d.owner,d.id]));
 if(d.method==='inspect')return Response.json(await stub.inspectStorage());
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
 for(const id of ['a','b','memory'])await db.prepare('INSERT INTO sessions(id,owner,title,character_json,character_name,settings_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').bind(id,'owner','旅店','{"name":"岚"}','岚',JSON.stringify(settings),1,1).run();
 await db.prepare("INSERT INTO messages(id,session_id,role,content,status,ordinal,created_at,finish_reason) VALUES('long-story','memory','assistant',?,'completed',0,1,'stop')").bind('铜钥匙在北门。'+'风'.repeat(1000)+'银怀表藏在南塔。').run();
 await db.prepare("INSERT INTO messages(id,session_id,role,content,status,ordinal,created_at,finish_reason,candidates_json) VALUES('legacy','a','assistant','旧正文','completed',0,1,'stop','[\"问问。\"]')").run();
 await db.prepare('INSERT INTO model_capabilities VALUES(?,?,?)').bind('rp',JSON.stringify({contextTokens:32768,source:'llama.cpp:n_ctx',inputRatio:1.2}),Date.now()+300000).run();
 let a=await(await call('a','read')).json();assert.equal(a.value.messages[0].id,'legacy');assert.deepEqual(a.value.messages[0].candidates,['问问。']);
 assert.equal((await db.prepare('SELECT generation_id FROM sessions WHERE id=?').bind('a').first()).generation_id,'do:a');
 assert.equal((await(await call('a','read',undefined,'stranger')).json()).status,404);
 const requestId=crypto.randomUUID();const streamed=await(await call('a','generate',{requestId,content:'问候'})).text();assert.match(streamed,/"type":"done"/);assert.doesNotMatch(streamed,/\[TAVERN_NEXT\]/);
 a=await(await call('a','read')).json();assert.equal(a.value.messages.at(-1).content,'你好。');assert.equal(a.value.messages.at(-1).candidates.length,3);assert.equal((await(await call('b','read')).json()).value.messages.length,0);
 assert.equal((await(await call('a','generate',{requestId})).json()).replayed,true);
 const memoryRequest=crypto.randomUUID(),memoryStream=await(await call('memory','generate',{requestId:memoryRequest,content:'检索两个片段'})).text();assert.doesNotMatch(memoryStream,/"type":"error"/);let recalled=await(await call('memory','read')).json();assert.equal(recalled.value.messages.at(-1).status,'completed');assert.equal(recalled.value.messages.at(-1).candidates.length,3);assert.equal((await(await call('memory','generate',{requestId:memoryRequest})).json()).replayed,true);
 const memoryExport=await(await call('memory','export')).json();const steps=JSON.parse(memoryExport.value.snapshots.at(-1).steps_json);assert.equal(steps.length,2);assert.equal(JSON.parse(steps[0].result)[0].source.messageId,'long-story');assert.equal(JSON.parse(steps[1].result)[0].source.messageId,'long-story');assert.match(JSON.parse(steps[1].result)[0].text,/银怀表藏在南塔/);
 const fork=await(await call('a','fork',{messageId:a.value.messages.at(-1).id,content:'新分支'})).json();assert.equal((await(await call(fork.value.id,'read')).json()).value.messages.at(-1).content,'新分支');
 await(await call('a','generate',{requestId:crypto.randomUUID(),content:'工具抵达北港'})).text();a=await(await call('a','read')).json();assert.equal(a.value.session.state.scene,'北港');
 const preTool=a.value.messages.findLast(m=>m.role==='user');const priorBranch=await(await call('a','fork',{messageId:preTool.id,content:'不同方向'})).json();assert.equal((await(await call(priorBranch.value.id,'read')).json()).value.session.state.scene,null);
 const stateBranch=await(await call('a','fork',{messageId:a.value.messages.at(-1).id,content:'编辑这一轮'})).json();assert.equal((await(await call(stateBranch.value.id,'read')).json()).value.session.state.scene,null);
 const pending=await call('b','generate',{requestId:crypto.randomUUID(),content:'等待'}),reader=pending.body.getReader();await reader.read();const b=await(await call('b','read')).json();await call('b','stop',{generationId:b.value.session.generationId});while(!(await reader.read()).done){};
 await call('a','update',{title:'已保存'});await runtime.dispose();runtime=new Miniflare(convertV4MiniflareOptions(options));a=await(await call('a','read')).json();assert.equal(a.value.session.title,'已保存');assert.equal(a.value.messages.at(-1).content,'你好。');assert.equal(a.value.session.state.scene,'北港');
 recalled=await(await call('memory','read')).json();assert.equal(recalled.value.messages.at(-1).status,'completed');assert.equal((await(await call('memory','generate',{requestId:memoryRequest})).json()).replayed,true);assert.equal((await(await call('memory','remove')).json()).ok,true);
 const interrupted=await call('b','generate',{requestId:crypto.randomUUID(),content:'等待'});await interrupted.body.getReader().read();await runtime.dispose();runtime=new Miniflare(convertV4MiniflareOptions(options));const recovered=await(await call('b','read')).json();assert.equal(recovered.value.session.generationId,null);assert.equal(recovered.value.messages.at(-1).status,'aborted');
 assert.equal((await(await call('a','remove')).json()).ok,true);let empty=await(await call('a','inspect')).json();assert.deepEqual(empty.tables,[]);assert.equal(empty.alarm,null);assert.equal(typeof empty.bytes,'number');
 await runtime.dispose();runtime=new Miniflare(convertV4MiniflareOptions(options));assert.equal((await(await call('a','read')).json()).status,404);assert.equal((await(await call('a','remove')).json()).ok,true);empty=await(await call('a','inspect')).json();assert.deepEqual(empty.tables,[]);assert.equal(empty.alarm,null);assert.equal(typeof empty.bytes,'number');
 assert.equal((await(await call('a','generate',{requestId:crypto.randomUUID(),content:'旧会话不能复活'})).json()).message,'会话不存在');empty=await(await call('a','inspect')).json();assert.deepEqual(empty.tables,[]);assert.equal(empty.alarm,null);assert.equal((await(await call('b','read')).json()).ok,true);
 db=await runtime.getD1Database('DB');assert.equal((await db.prepare("SELECT count(*) n FROM messages WHERE id='legacy'").first()).n,1);
 console.log('workerd SQLite: import, fence, isolation, streaming, distinct memory fragments, persisted steps, replay, fork, stop, restart, deleteAll with no business tables/alarm and stale-request rejection passed (empty SQLite page bytes: '+empty.bytes+')');
}finally{await runtime.dispose();rmSync(persist,{recursive:true,force:true});}
