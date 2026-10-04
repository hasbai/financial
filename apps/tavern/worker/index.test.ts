import {it,expect,vi,beforeEach,afterEach} from 'vitest';import {DatabaseSync} from 'node:sqlite';import {readFileSync} from 'node:fs';
import worker from './index';import {TavernSession} from './session-object';import {SESSION_SCHEMA} from './session-store';
vi.mock('cloudflare:workers',()=>({DurableObject:class {constructor(public ctx:DurableObjectState,public env:Env){}}}));import {identity,AuthError} from './auth';import {DEFAULT_SETTINGS,type Message} from '../shared/types';
import { CANDIDATE_REMINDER } from '../shared/candidates';
vi.mock('./auth',async(original)=>({...await original<typeof import('./auth')>(),identity:vi.fn()}));
const card={spec:'chara_card_v2',spec_version:'2.0',data:{name:'岚',description:'港城的旅店主人',personality:'沉稳',scenario:'港城',first_mes:'你好，{{user}}。',mes_example:'',system_prompt:'',post_history_instructions:'',alternate_greetings:['欢迎'],tags:[],creator:'测试',extensions:{}}};
let db:DatabaseSync,sessionDb:DatabaseSync,env:Env,work:Promise<unknown>[],files:Map<string,Uint8Array>;type AiRun=(data:AIGatewayUniversalRequest,options?:{gateway?:UniversalGatewayOptions;signal?:AbortSignal})=>Promise<unknown>;let aiRun:ReturnType<typeof vi.fn<AiRun>>;let beforeRun:((sql:string,values:unknown[])=>void)|undefined;
function statement(sql:string,values:unknown[]=[]):D1PreparedStatement {return {bind:(...v:unknown[])=>statement(sql,v),first:async()=>db.prepare(sql).get(...values as never[])??null,all:async()=>({results:db.prepare(sql).all(...values as never[])}),run:async()=>{beforeRun?.(sql,values);const r=db.prepare(sql).run(...values as never[]);return {meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};}} as D1PreparedStatement;}
const ctx={waitUntil:(promise:Promise<unknown>)=>{work.push(promise);}};
async function call(path:string,method='GET',data?:unknown){return worker.fetch(new Request('https://tavern.test'+path,{method,headers:data?{'Content-Type':'application/json'}:{},body:data===undefined?undefined:JSON.stringify(data)}),env,ctx);}
beforeEach(()=>{
 beforeRun=undefined;db=new DatabaseSync(':memory:');for(const name of ['0001_schema.sql','0002_source_catalog.sql','0003_generation_outcomes.sql','0004_source_quality.sql','0005_candidates_capabilities.sql','0006_session_summary.sql','0007_session_objects.sql'])db.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));sessionDb=new DatabaseSync(':memory:');sessionDb.exec(SESSION_SCHEMA);files=new Map();work=[];
 aiRun=vi.fn<AiRun>(async()=>new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"reasoning_content":"private"}}]}\n\ndata: {"choices":[{"delta":{"content":"欢迎来到港城。\\n[TAVERN_NEXT]\\n去港口。\\n问问来路。\\n坐下喝茶。"}}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'));c.close();}}));
 env=Object.assign({} as Env,{DB:{prepare:statement,batch:async(stmts:D1PreparedStatement[])=>{const result=[];db.exec('BEGIN');try{for(const s of stmts)result.push(await s.run());db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}},FILES:{put:async(key:string,bytes:Uint8Array)=>files.set(key,bytes),get:async(key:string)=>files.has(key)?{body:new Response(Uint8Array.from(files.get(key)!)).body}:null,delete:async(keys:string|string[])=>{for(const key of Array.isArray(keys)?keys:[keys])files.delete(key);}},AI:{gateway:(id:string)=>{expect(id).toBe('default');return {run:async(data:AIGatewayUniversalRequest,options?:{gateway?:UniversalGatewayOptions;signal?:AbortSignal})=>{const result=await aiRun(data,options);return result instanceof ReadableStream?new Response(result,{headers:{'Content-Type':'text/event-stream','cf-aig-log-id':'test-log'}}):result;}};}},AUTH0_DOMAIN:'hasbai.eu.auth0.com',AUTH0_AUDIENCE:'https://financial.hasbai.xyz/api',AIG_GATEWAY_ID:'default',CONTEXT_TOKENS:'16000',VERSION:{id:'test'},ASSETS:{fetch:async()=>new Response('assets')}});
 const objects=new Map<string,TavernSession>();
 const storage={sql:{exec:(sql:string,...values:unknown[])=>{beforeRun?.(sql,values);const stmt=sessionDb.prepare(sql);const rows=stmt.all(...values as never[]);return {toArray:()=>rows};}},transactionSync:<T>(fn:()=>T)=>{sessionDb.exec('BEGIN');try{const result=fn();sessionDb.exec('COMMIT');return result;}catch(e){sessionDb.exec('ROLLBACK');throw e;}},setAlarm:async()=>{}};
 Object.assign(env,{SESSIONS:{getByName:(name:string)=>{let target=objects.get(name);if(!target){target=new TavernSession({storage,waitUntil:ctx.waitUntil} as unknown as DurableObjectState,env);objects.set(name,target);}return target;}}});
 db.prepare('INSERT INTO model_capabilities(id,value_json,expires_at) VALUES(?,?,?)').run('rp',JSON.stringify({contextTokens:16384,source:'llama.cpp:n_ctx',checkedAt:Date.now(),inputRatio:1.2}),Date.now()+300000);
 vi.mocked(identity).mockResolvedValue({sub:'auth0|owner',email:'owner',username:'月石',admin:true});
});
afterEach(async()=>{await Promise.allSettled(work);db.close();sessionDb.close();vi.clearAllMocks();});
async function seed(){const c=await(await call('/api/characters','POST',card)).json() as {id:string};const s=await(await call('/api/sessions','POST',{characterId:c.id})).json() as {id:string};return {c,s};}
it('installs/imports without duplicate private rows and preserves raw exports',async()=>{const a=await(await call('/api/characters','POST',card)).json() as {id:string};const b=await(await call('/api/characters','POST',card)).json() as {id:string};expect(a.id).toBe(b.id);expect(await(await call('/api/characters/'+a.id+'/export')).json()).toEqual(card);vi.mocked(identity).mockResolvedValue({sub:'auth0|other',email:'other',username:'其他用户',admin:true});expect((await call('/api/characters/'+a.id)).status).toBe(404);});
it('denies missing JWT and cross-origin writes',async()=>{vi.mocked(identity).mockRejectedValue(new AuthError(401,'请先登录'));expect((await call('/api/settings')).status).toBe(401);vi.mocked(identity).mockResolvedValue({sub:'owner',email:'owner',username:'月石',admin:true});const r=await worker.fetch(new Request('https://tavern.test/api/settings',{method:'PUT',headers:{Origin:'https://evil.test'}}),env,ctx);expect(r.status).toBe(403);});
it('snapshots role definitions and creates selected alternate greeting',async()=>{const {c,s}=await seed();await call('/api/characters/'+c.id,'DELETE');const history=await(await call('/api/sessions/'+s.id)).json() as {session:{character:unknown};messages:{content:string}[]};expect(history.session.character).toEqual(card);expect(history.messages[0].content).toBe('你好，旅人。');});
it('persists streamed output, fixed dynamic route, no reasoning leak and idempotent replay',async()=>{const {s}=await seed(),requestId=crypto.randomUUID();const r=await call('/api/sessions/'+s.id+'/generate','POST',{requestId,content:'你好',model:'override'});expect(r.headers.get('Content-Type')).toContain('event-stream');const text=await r.text();await Promise.all(work);expect(text).toContain('欢迎来到港城。');expect(text).not.toContain('private');expect(aiRun).toHaveBeenCalledWith(expect.objectContaining({provider:'compat',endpoint:'chat/completions',query:expect.objectContaining({model:'dynamic/rp',stream:true}),headers:expect.objectContaining({'cf-aig-collect-log-payload':'true'})}),expect.objectContaining({gateway:{id:'default',skipCache:true,collectLog:true,eventId:requestId,retries:{maxAttempts:1},metadata:{app:'tavern',task:'roleplay',username:'月石'}}}));const duplicate=await call('/api/sessions/'+s.id+'/generate','POST',{requestId,content:'你好'});expect((await duplicate.json() as {replayed:boolean}).replayed).toBe(true);expect(aiRun).toHaveBeenCalledTimes(1);expect(sessionDb.prepare('SELECT generation_id FROM sessions WHERE id=?').get(s.id)?.generation_id).toBeNull();});
it('records provider cache and first body observations without adding inference or changing stream events',async()=>{
 const {s}=await seed();const info=vi.spyOn(console,'info').mockImplementation(()=>{});
 aiRun.mockResolvedValue(new Response('data: '+JSON.stringify({choices:[{delta:{content:'故事。\n[TAVERN_NEXT]\n去港口。\n问问来路。\n坐下喝茶。'},finish_reason:'stop'}],usage:{prompt_tokens:1000,completion_tokens:3,prompt_tokens_details:{cached_tokens:800}},timings:{cache_n:800,prompt_n:200,prompt_ms:100,predicted_ms:50}})+'\n\ndata: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}}));
 try{const response=await call('/api/sessions/'+s.id+'/generate','POST',{requestId:crypto.randomUUID(),content:'你好'});await response.text();await Promise.all(work);
  expect(aiRun).toHaveBeenCalledTimes(1);expect(aiRun.mock.calls[0][0].query).toHaveProperty('cache_prompt',true);
  expect(info).toHaveBeenCalledWith('tavern-generation-outcome',expect.objectContaining({promptTokens:1000,outputTokens:3,cachedTokens:800,prefillTokens:200,prefillMs:100,decodeMs:50,firstBodyMs:expect.any(Number),modelFirstBodyMs:expect.any(Number),promptBudget:expect.objectContaining({detectedContextTokens:16384,includedMessages:2})}));
 }finally{info.mockRestore();}
});
it('keeps inline candidate protocol out of deltas and stored story with one model call',async()=>{
 const {s}=await seed();const wire='灯？[TAVERN_NEXT]\n我问问往事。\n我坐下喝茶。\n我看向窗外。';
 aiRun.mockResolvedValue(new Response(wire.split('').map(content=>'data: '+JSON.stringify({choices:[{delta:{content}}]})+'\n\n').join('')+'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}}));
 const requestId=crypto.randomUUID(),r=await call('/api/sessions/'+s.id+'/generate','POST',{requestId,content:'继续'});const text=await r.text();await Promise.all(work);
 const frames=text.split('\n').filter(line=>line.startsWith('data: ')).map(line=>JSON.parse(line.slice(6)));expect(frames.filter(e=>e.type==='delta').map(e=>e.text).join('')).toBe('灯？');
 expect(frames.find(e=>e.type==='done').message).toMatchObject({content:'灯？',status:'completed',candidates:['我问问往事。','我坐下喝茶。','我看向窗外。']});
 expect(sessionDb.prepare("SELECT content,candidates_json FROM messages WHERE role='assistant' AND request_id=?").get(requestId)).toEqual({content:'灯？',candidates_json:JSON.stringify(['我问问往事。','我坐下喝茶。','我看向窗外。'])});expect(aiRun).toHaveBeenCalledTimes(1);
});
it('keeps user messages on model failure and never auto-retries',async()=>{const {s}=await seed();aiRun.mockRejectedValue(new Error('secret upstream error'));const r=await call('/api/sessions/'+s.id+'/generate','POST',{requestId:crypto.randomUUID(),content:'留下这句'});const text=await r.text();await Promise.all(work);expect(text).toContain('生成失败，请重试');expect(text).not.toContain('secret');expect(sessionDb.prepare("SELECT content FROM messages WHERE role='user'").get()?.content).toBe('留下这句');expect(sessionDb.prepare("SELECT status FROM messages WHERE role='assistant' AND request_id IS NOT NULL").get()?.status).toBe('error');});
it('aborts a stopped generation and refuses stale stop or concurrent send',async()=>{const {s}=await seed();let controller:ReadableStreamDefaultController<Uint8Array>;aiRun.mockResolvedValue(new ReadableStream({start(c){controller=c;}}));
 const response=await call('/api/sessions/'+s.id+'/generate','POST',{requestId:crypto.randomUUID(),content:'出发'});const reader=response.body!.getReader();await reader.read();const generationId=sessionDb.prepare('SELECT generation_id FROM sessions WHERE id=?').get(s.id)?.generation_id;
 expect((await call('/api/sessions/'+s.id+'/generate','POST',{requestId:crypto.randomUUID(),content:'重复'})).status).toBe(409);
 expect((await call('/api/sessions/'+s.id+'/stop','POST',{generationId:'wrong'})).status).toBe(409);
 expect((await call('/api/sessions/'+s.id+'/stop','POST',{generationId})).status).toBe(200);
 while(!(await reader.read()).done){}await Promise.all(work);expect(sessionDb.prepare("SELECT status FROM messages WHERE id=?").get(generationId as string)?.status).toBe('aborted');
});
it('forks edited history without changing original messages',async()=>{const {s}=await seed();const data=await(await call('/api/sessions/'+s.id)).json() as {messages:{id:string}[]};const fork=await(await call('/api/sessions/'+s.id+'/fork','POST',{messageId:data.messages[0].id,content:'新的开场'})).json() as {id:string};expect(sessionDb.prepare('SELECT content FROM messages WHERE session_id=?').get(s.id)?.content).toBe('你好，旅人。');expect(sessionDb.prepare('SELECT content FROM messages WHERE session_id=?').get(fork.id)?.content).toBe('新的开场');});
it('validates worldbook ownership, settings and malformed imported files',async()=>{const {s}=await seed();expect((await call('/api/sessions/'+s.id,'PATCH',{bookIds:['missing']})).status).toBe(400);expect((await call('/api/settings','PUT',{...DEFAULT_SETTINGS,temperature:999999})).status).toBe(400);expect((await call('/api/worldbooks','POST',{raw:{name:'bad'}})).status).toBe(400);expect((await call('/api/characters','POST',{fake:true})).status).toBe(400);});
it('searches actual synchronized catalog rows and installs from server definitions',async()=>{const revision='a'.repeat(40);db.prepare('INSERT INTO source_catalog VALUES(?,?,?,?,?,?,?,?,?)').run('theatrelm',revision,'0','岚','旅店主人','G-reen','[]','https://huggingface.co/source',JSON.stringify(card));db.prepare('INSERT INTO source_releases VALUES(?,?,?,?)').run('theatrelm',revision,1,Date.now());const r=await(await call('/api/discover?source=theatrelm&q=岚')).json() as {results:{id:string}[]};expect(r.results[0].id).toBe(revision+':0');const installed=await(await call('/api/install','POST',{source:'theatrelm',id:r.results[0].id,card:{name:'fake'}})).json() as {name:string};expect(installed.name).toBe('岚');expect((await call('/api/install','POST',{source:'theatrelm',id:'../escape'})).status).toBe(400);});

it('refuses deletion of a book bound to sessions and allows explicit detachment',async()=>{const {s}=await seed();const b=await(await call('/api/worldbooks','POST',{raw:{name:'港',entries:[]}})).json() as {id:string};await call('/api/sessions/'+s.id,'PATCH',{bookIds:[b.id]});expect((await call('/api/worldbooks/'+b.id,'DELETE')).status).toBe(409);await call('/api/sessions/'+s.id,'PATCH',{bookIds:[]});expect((await call('/api/worldbooks/'+b.id,'DELETE')).status).toBe(200);});

it('reads history only after claiming generation when a previous turn finishes concurrently',async()=>{
 const {s}=await seed();beforeRun=(sql)=>{if(!sql.startsWith('UPDATE sessions SET generation_id=?'))return;beforeRun=undefined;
  sessionDb.prepare("INSERT INTO messages(id,session_id,role,content,status,ordinal,created_at) VALUES(?,?,'user','previous turn','completed',1,?)").run(crypto.randomUUID(),s.id,Date.now());
  sessionDb.prepare("INSERT INTO messages(id,session_id,role,content,status,ordinal,created_at) VALUES(?,?,'assistant','previous answer','completed',2,?)").run(crypto.randomUUID(),s.id,Date.now());
 };
 const response=await call('/api/sessions/'+s.id+'/generate','POST',{requestId:crypto.randomUUID(),content:'next turn'});await response.text();await Promise.all(work);
 const args=aiRun.mock.calls[0][0].query as {messages:{content:string}[]};expect(args.messages.some(m=>m.content==='previous answer')).toBe(true);expect(sessionDb.prepare("SELECT ordinal FROM messages WHERE content='next turn'").get()?.ordinal).toBe(3);
});
it('atomically refuses a book deletion when binding races with it',async()=>{
 const {s}=await seed();const b=await(await call('/api/worldbooks','POST',{raw:{name:'race',entries:[]}})).json() as {id:string};
 beforeRun=sql=>{if(!sql.startsWith('DELETE FROM worldbooks'))return;beforeRun=undefined;db.prepare('UPDATE sessions SET book_ids_json=? WHERE id=?').run(JSON.stringify([b.id]),s.id);};
 expect((await call('/api/worldbooks/'+b.id,'DELETE')).status).toBe(409);expect(db.prepare('SELECT id FROM worldbooks WHERE id=?').get(b.id)).toBeTruthy();
});
it('atomically refuses binding a book deleted after its ownership check',async()=>{
 const {s}=await seed();const b=await(await call('/api/worldbooks','POST',{raw:{name:'race',entries:[]}})).json() as {id:string};
 beforeRun=sql=>{if(!sql.startsWith('UPDATE sessions SET book_ids_json'))return;beforeRun=undefined;db.prepare('DELETE FROM worldbooks WHERE id=?').run(b.id);};
 expect((await call('/api/sessions/'+s.id,'PATCH',{bookIds:[b.id]})).status).toBe(409);expect(sessionDb.prepare('SELECT book_ids_json FROM sessions WHERE id=?').get(s.id)?.book_ids_json).toBe('[]');
});

it('rejects a fork if its book disappears after the DO snapshot',async()=>{
 const {s}=await seed();const b=await(await call('/api/worldbooks','POST',{raw:{name:'race',entries:[]}})).json() as {id:string};await call('/api/sessions/'+s.id,'PATCH',{bookIds:[b.id]});const m=sessionDb.prepare('SELECT id FROM messages WHERE session_id=?').get(s.id)!;
 beforeRun=sql=>{if(!sql.startsWith('INSERT INTO sessions'))return;beforeRun=undefined;sessionDb.prepare('UPDATE sessions SET book_ids_json=? WHERE id=?').run('[]',s.id);db.prepare('DELETE FROM worldbooks WHERE id=?').run(b.id);};
 const r=await call('/api/sessions/'+s.id+'/fork','POST',{messageId:m.id,content:'fork'});expect(r.status).toBe(409);
});
it('returns conflict when generation claims a session before deletion',async()=>{
 const {s}=await seed();beforeRun=sql=>{if(!sql.startsWith('SELECT * FROM sessions'))return;beforeRun=undefined;sessionDb.prepare('UPDATE sessions SET generation_id=?,generation_until=? WHERE id=?').run(crypto.randomUUID(),Date.now()+60000,s.id);};
 expect((await call('/api/sessions/'+s.id,'DELETE')).status).toBe(409);expect(sessionDb.prepare('SELECT id FROM sessions WHERE id=?').get(s.id)).toBeTruthy();
});

it('cancels idle upstream when the response reader disconnects and releases the lock',async()=>{
 const {s}=await seed(),cancel=vi.fn();aiRun.mockImplementation(async()=>new ReadableStream({cancel}));
 const response=await call('/api/sessions/'+s.id+'/generate','POST',{requestId:crypto.randomUUID(),content:'idle'});const reader=response.body!.getReader();await reader.read();await vi.waitFor(()=>expect(aiRun).toHaveBeenCalled());await reader.cancel();await Promise.all(work);
 expect(cancel).toHaveBeenCalled();expect(sessionDb.prepare('SELECT generation_id FROM sessions WHERE id=?').get(s.id)?.generation_id).toBeNull();expect(sessionDb.prepare("SELECT status FROM messages WHERE request_id IS NOT NULL AND role='assistant'").get()?.status).toBe('aborted');
});
it('stops an idle upstream without waiting for another model chunk',async()=>{
 const {s}=await seed(),cancel=vi.fn();aiRun.mockImplementation(async()=>new ReadableStream({cancel}));
 const response=await call('/api/sessions/'+s.id+'/generate','POST',{requestId:crypto.randomUUID(),content:'idle'});const reader=response.body!.getReader();await reader.read();const generationId=sessionDb.prepare('SELECT generation_id FROM sessions WHERE id=?').get(s.id)?.generation_id;
 expect((await call('/api/sessions/'+s.id+'/stop','POST',{generationId})).status).toBe(200);while(!(await reader.read()).done){}await Promise.all(work);expect(cancel).toHaveBeenCalled();expect(sessionDb.prepare('SELECT generation_id FROM sessions WHERE id=?').get(s.id)?.generation_id).toBeNull();
});

it('rejects non-stream model output and releases the generation lock without retrying',async()=>{
 const {s}=await seed();aiRun.mockResolvedValue({response:'unexpected non-stream'});const r=await call('/api/sessions/'+s.id+'/generate','POST',{requestId:crypto.randomUUID(),content:'stream required'});const text=await r.text();await Promise.all(work);expect(text).toContain('模型返回了不支持的结束类型');expect(aiRun).toHaveBeenCalledTimes(1);expect(sessionDb.prepare('SELECT generation_id FROM sessions WHERE id=?').get(s.id)?.generation_id).toBeNull();expect(sessionDb.prepare("SELECT status FROM messages WHERE request_id IS NOT NULL AND role='assistant'").get()?.status).toBe('error');
});

it.each([['content_filter','content_filter'],['tool_calls','unsupported'],['unknown','unsupported'],[null,'interrupted']])('persists incomplete finish %s with visible reason %s',async(finish,reason)=>{
 const {s}=await seed();aiRun.mockResolvedValue(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('data: '+JSON.stringify({choices:[{delta:{content:'半句'},finish_reason:finish}]})+'\n\ndata: [DONE]\n\n'));c.close();}}));
 const response=await call('/api/sessions/'+s.id+'/generate','POST',{requestId:crypto.randomUUID(),content:'你是谁'});const stream=await response.text();await Promise.all(work);expect(stream).toContain('"type":"error"');
 const saved=await(await call('/api/sessions/'+s.id)).json() as {messages:{status:string;content:string;finishReason:string}[]};expect(saved.messages.at(-1)).toMatchObject({content:'半句',status:'error',finishReason:reason});expect(aiRun).toHaveBeenCalledTimes(1);
});
it('continues saved partial text as a new version without duplicating the user turn',async()=>{
 const {s}=await seed();aiRun.mockResolvedValueOnce(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"她抬起头，"},"finish_reason":"content_filter"}]}\n\ndata: [DONE]\n\n'));c.close();}}));
 await(await call('/api/sessions/'+s.id+'/generate','POST',{requestId:crypto.randomUUID(),content:'问候'})).text();await Promise.all(work);
 await(await call('/api/sessions/'+s.id+'/generate','POST',{requestId:crypto.randomUUID(),continue:true})).text();await Promise.all(work);
 const saved=await(await call('/api/sessions/'+s.id)).json() as {messages:{content:string;status:string;finishReason:string}[]};expect(saved.messages.at(-1)).toMatchObject({content:'她抬起头，欢迎来到港城。',status:'completed',finishReason:'stop'});expect(sessionDb.prepare("SELECT count(*) AS n FROM messages WHERE role='user'").get()?.n).toBe(1);expect(sessionDb.prepare("SELECT count(*) AS n FROM messages WHERE role='assistant' AND ordinal=2").get()?.n).toBe(2);
 const args=aiRun.mock.calls[1][0].query as {messages:{content:string}[]};expect(args.messages.some(m=>m.content==='她抬起头，')).toBe(true);
});
it('exposes failed regeneration even when a previous completed version exists',async()=>{
 const {s}=await seed();await(await call('/api/sessions/'+s.id+'/generate','POST',{requestId:crypto.randomUUID(),content:'你好'})).text();await Promise.all(work);aiRun.mockRejectedValue(new Error('private'));
 await(await call('/api/sessions/'+s.id+'/generate','POST',{requestId:crypto.randomUUID(),regenerate:true})).text();await Promise.all(work);
 const saved=await(await call('/api/sessions/'+s.id)).json() as {messages:{status:string;finishReason:string}[]};expect(saved.messages.at(-1)).toMatchObject({status:'error',finishReason:'upstream'});
});
it('renews a slow generation beyond the old deadline until the user stops',async()=>{
 vi.useFakeTimers();try{const {s}=await seed();aiRun.mockImplementation(async()=>new ReadableStream());const r=await call('/api/sessions/'+s.id+'/generate','POST',{requestId:crypto.randomUUID(),content:'slow'});const reader=r.body!.getReader();await reader.read();const tail=(async()=>{while(!(await reader.read()).done){}})();await vi.advanceTimersByTimeAsync(240000);const state=sessionDb.prepare('SELECT generation_id,generation_until FROM sessions WHERE id=?').get(s.id)!;expect(state.generation_until).toBeGreaterThan(Date.now());expect(sessionDb.prepare("SELECT status FROM messages WHERE id=?").get(state.generation_id as string)?.status).toBe('pending');await call('/api/sessions/'+s.id+'/stop','POST',{generationId:state.generation_id});await vi.advanceTimersByTimeAsync(1000);await tail;await Promise.all(work);expect(sessionDb.prepare("SELECT status,finish_reason FROM messages WHERE request_id IS NOT NULL AND role='assistant'").get()).toMatchObject({status:'aborted',finish_reason:'stopped'});}finally{vi.useRealTimers();}
});
it('filters malformed public names and rejects their direct installation',async()=>{
 const revision='b'.repeat(40);db.prepare('INSERT INTO source_catalog VALUES(?,?,?,?,?,?,?,?,?)').run('theatrelm',revision,'2921','x'.repeat(459),'bad','G-reen','[]','https://huggingface.co/source',JSON.stringify(card));db.prepare('INSERT INTO source_releases VALUES(?,?,?,?)').run('theatrelm',revision,1,Date.now());const r=await(await call('/api/discover?source=theatrelm')).json() as {results:unknown[];total:number};expect(r.results).toEqual([]);expect(r.total).toBe(0);expect((await call('/api/install','POST',{source:'theatrelm',id:revision+':2921'})).status).toBe(422);
});
it('passes supported ranking and tag filters to Chub and validates pagination',async()=>{
 const fetcher=vi.fn(async(_url:RequestInfo|URL)=>Response.json({data:{count:30,nodes:[{fullPath:'author/role',name:'Role',tagline:'Story',topics:['Fantasy'],starCount:42,createdAt:'2026-10-01T00:00:00Z'}]}}));vi.stubGlobal('fetch',fetcher);try{
 for(const [sort,upstream]of[['popular','star_count'],['newest','created_at'],['updated','last_activity_at'],['trending','trending']]){const r=await(await call('/api/discover?source=chub&sort='+sort+'&tags=Fantasy,OC&page=2')).json() as {hasMore:boolean;total:number;results:{popularity:number}[]};expect(r.hasMore).toBe(true);expect(r.total).toBe(30);expect(r.results[0].popularity).toBe(42);const u=new URL(String(fetcher.mock.calls.at(-1)![0]));expect(u.searchParams.get('sort')).toBe(upstream);expect(u.searchParams.get('topics')).toBe('Fantasy,OC');expect(u.searchParams.get('page')).toBe('2');}
 expect((await call('/api/discover?sort=invalid')).status).toBe(400);expect((await call('/api/discover?source=theatrelm&sort=newest')).status).toBe(400);
 }finally{vi.unstubAllGlobals();}
});

it('uses the authenticated account name for every generation mode, ignoring client attribution and persona',async()=>{
 const {s}=await seed();
 for(const regenerate of [false,true]){
  const requestId=crypto.randomUUID();
  const response=await call('/api/sessions/'+s.id+'/generate','POST',{requestId,content:'你好',regenerate,username:'伪造',metadata:{app:'fake',task:'fake',username:'fake'}});
  expect(response.status).toBe(200);await response.text();await Promise.all(work);
  expect(aiRun.mock.calls.at(-1)?.[1]).toEqual(expect.objectContaining({gateway:expect.objectContaining({collectLog:true,eventId:requestId,retries:{maxAttempts:1},metadata:{app:'tavern',task:'roleplay',username:'月石'}})}));
 }
});
it('refuses generation before acquiring a lock when the authenticated name cannot be resolved',async()=>{
 const {s}=await seed();vi.mocked(identity).mockResolvedValue({sub:'auth0|owner',email:'owner',username:undefined,admin:true});
 const response=await call('/api/sessions/'+s.id+'/generate','POST',{requestId:crypto.randomUUID(),content:'你好',username:'伪造'});
 expect(response.status).toBe(401);expect(aiRun).not.toHaveBeenCalled();expect(sessionDb.prepare('SELECT generation_id FROM sessions WHERE id=?').get(s.id)?.generation_id).toBeNull();
});

it.each([{status:502,reason:'upstream'},{status:200,reason:'unsupported'}])('classifies raw Gateway $status failures and preserves their log ID without exposing bodies',async({status,reason})=>{
 const {s}=await seed(),requestId=crypto.randomUUID(),info=vi.spyOn(console,'info');
 let cancelled=false;const stream=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('private provider failure'));},cancel(){cancelled=true;}});
 aiRun.mockResolvedValue(new Response(stream,{status,headers:{'Content-Type':'application/json','cf-aig-log-id':'failed-gateway-log'}}));
 const response=await call('/api/sessions/'+s.id+'/generate','POST',{requestId,content:'你好'});
 const text=await response.text();await Promise.all(work);expect(text).not.toContain('private provider failure');expect(aiRun).toHaveBeenCalledTimes(1);expect(cancelled).toBe(true);
 expect(sessionDb.prepare('SELECT generation_id FROM sessions WHERE id=?').get(s.id)?.generation_id).toBeNull();
 expect(sessionDb.prepare("SELECT finish_reason FROM messages WHERE request_id=? AND role='assistant'").get(requestId)?.finish_reason).toBe(reason);
 expect(info).toHaveBeenCalledWith('tavern-generation-outcome',expect.objectContaining({gatewayLogId:'failed-gateway-log',requestId,finishReason:reason}));info.mockRestore();
});

it('normalizes legacy session/settings JSON and rejects unknown logical model before inference',async()=>{
 const {s}=await seed();const old={userName:'旧名',persona:'旧设定',systemPrompt:'旧提示',temperature:0.3,maxTokens:2048};
 sessionDb.prepare('UPDATE sessions SET settings_json=? WHERE id=?').run(JSON.stringify(old),s.id);
 const session=await(await call('/api/sessions/'+s.id)).json() as {session:{settings:typeof DEFAULT_SETTINGS}};expect(session.session.settings).toEqual({...DEFAULT_SETTINGS,userName:old.userName,persona:old.persona,systemPrompt:old.systemPrompt,temperature:old.temperature});
 expect((await call('/api/settings','PUT',{...DEFAULT_SETTINGS,modelId:'dynamic/saki'})).status).toBe(400);
 await(await call('/api/sessions/'+s.id+'/generate','POST',{requestId:crypto.randomUUID(),content:'出发'})).text();await Promise.all(work);
 expect(aiRun.mock.calls[0][0].query).toMatchObject({temperature:0.3,top_p:1,chat_template_kwargs:{enable_thinking:false},frequency_penalty:0,presence_penalty:0});expect(aiRun.mock.calls[0][0].query).not.toHaveProperty('top_k');expect(aiRun.mock.calls[0][0].query).not.toHaveProperty('max_tokens');
});
it('generates, persists and replays candidates in one inference without including tail in next prompt',async()=>{
 const {s}=await seed(),requestId=crypto.randomUUID();
 const marker='\n[TAVERN_NEXT]\n';
 aiRun.mockImplementationOnce(async()=>new ReadableStream({start(c){for(const content of ['正文。',marker.slice(0,7),marker.slice(7),'往港口走。\n问问来路。\n往港口走。\n坐下喝茶。\n第四条'])c.enqueue(new TextEncoder().encode('data: '+JSON.stringify({choices:[{delta:{content}}]})+'\n\n'));c.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'));c.close();}}));
 const stream=await(await call('/api/sessions/'+s.id+'/generate','POST',{requestId,content:'你好'})).text();await Promise.all(work);expect(stream).toContain('candidates_pending');expect(stream).not.toContain('[TAVERN_NEXT]');
 const saved=await(await call('/api/sessions/'+s.id)).json() as {messages:Message[]};expect(saved.messages.at(-1)).toMatchObject({content:'正文。',status:'completed',candidates:['往港口走。','问问来路。','坐下喝茶。']});
 const replay=await(await call('/api/sessions/'+s.id+'/generate','POST',{requestId})).json() as {message:Message};expect(replay.message.candidates).toEqual(saved.messages.at(-1)?.candidates);expect(aiRun).toHaveBeenCalledTimes(1);expect(JSON.stringify(aiRun.mock.calls[0][0].query)).not.toContain(requestId);
 await(await call('/api/sessions/'+s.id+'/generate','POST',{requestId:crypto.randomUUID(),content:'往港口走。'})).text();await Promise.all(work);
 const prompt=aiRun.mock.calls[1][0].query as {messages:{content:string}[]};expect(prompt.messages.map(m=>m.content).join('')).not.toContain('问问来路。');
 const fork=await(await call('/api/sessions/'+s.id+'/fork','POST',{messageId:saved.messages.at(-1)!.id,content:'新正文'})).json() as {id:string};expect(sessionDb.prepare('SELECT candidates_json FROM messages WHERE session_id=?').all(fork.id).every(m=>!m.candidates_json)).toBe(true);
});
it.each(['normal','regenerate','continue'])('reminds the %s request once without changing saved user text',async mode=>{
 const {s}=await seed();
 await(await call('/api/sessions/'+s.id+'/generate','POST',{requestId:crypto.randomUUID(),content:'原输入'})).text();await Promise.all(work);
 if(mode==='continue')sessionDb.prepare("UPDATE messages SET status='aborted',finish_reason='stopped' WHERE session_id=? AND request_id IS NOT NULL AND role='assistant'").run(s.id);
 await(await call('/api/sessions/'+s.id+'/generate','POST',{requestId:crypto.randomUUID(),...(mode==='normal'?{content:'下一轮'}:mode==='regenerate'?{regenerate:true}:{continue:true})})).text();await Promise.all(work);
 const query=aiRun.mock.calls.at(-1)![0].query as {messages:{role:string;content:string}[]};
 expect(query.messages.filter(m=>m.role==='system')).toHaveLength(1);
 expect(query.messages.at(-1)?.content.endsWith('\n\n'+CANDIDATE_REMINDER)).toBe(true);
 expect(query.messages.map(m=>m.content).join('').split(CANDIDATE_REMINDER)).toHaveLength(2);
 expect(aiRun).toHaveBeenCalledTimes(2);
 expect(sessionDb.prepare("SELECT content FROM messages WHERE session_id=? AND role='user' ORDER BY ordinal").all(s.id).map(m=>m.content)).toEqual(mode==='normal'?['原输入','下一轮']:['原输入']);
});
it.each(['stop'])('keeps clean prose with invalid candidates on %s',async finish=>{
 const {s}=await seed(),requestId=crypto.randomUUID();aiRun.mockResolvedValueOnce(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('data: '+JSON.stringify({choices:[{delta:{content:'正文。\n[TAVERN_NEXT]\n{"candidates":'},finish_reason:finish}]})+'\n\ndata: [DONE]\n\n'));c.close();}}));
 aiRun.mockRejectedValueOnce(new Error('repair upstream'));await(await call('/api/sessions/'+s.id+'/generate','POST',{requestId,content:'你好'})).text();await Promise.all(work);const saved=sessionDb.prepare('SELECT * FROM messages WHERE request_id=? AND role=?').get(requestId,'assistant');expect(saved).toMatchObject({content:'正文。',candidates_json:null,status:'completed'});expect(aiRun).toHaveBeenCalledTimes(2);
});

function completion(content:string,finish='stop') {return new ReadableStream<Uint8Array>({start(c){c.enqueue(new TextEncoder().encode('data: '+JSON.stringify({choices:[{delta:{content},finish_reason:finish}]})+'\n\ndata: [DONE]\n\n'));c.close();}});}
it('automatically continues through more than three length finishes with one parser and UUID',async()=>{
 const {s}=await seed(),requestId=crypto.randomUUID();
 for(const content of ['她说：','你好。','\n[TAV','ERN_NEXT]\n去港口','。\n坐下喝茶。'])aiRun.mockResolvedValueOnce(completion(content,'length'));
 aiRun.mockResolvedValueOnce(completion('\n问问来路。'));
 const text=await(await call('/api/sessions/'+s.id+'/generate','POST',{requestId,content:'你好'})).text();await Promise.all(work);
 const saved=sessionDb.prepare('SELECT * FROM messages WHERE request_id=? AND role=?').get(requestId,'assistant');expect(saved).toMatchObject({content:'她说：你好。',status:'completed',finish_reason:'stop'});expect(JSON.parse(saved!.candidates_json as string)).toEqual(['去港口。','坐下喝茶。','问问来路。']);expect(text).not.toContain('[TAVERN_NEXT]');expect(aiRun).toHaveBeenCalledTimes(6);expect(sessionDb.prepare('SELECT count(*) n FROM messages WHERE request_id=? AND role=?').get(requestId,'assistant')?.n).toBe(1);
 for(const [,opts]of aiRun.mock.calls){expect(opts?.gateway).not.toHaveProperty('requestTimeoutMs');}for(const [request]of aiRun.mock.calls)expect(request.query).not.toHaveProperty('max_tokens');
});
it.each(['http','stream'])('keeps generated prefix and continuation across a %s context error, with persistent valid summary',async mode=>{
 const {s}=await seed();sessionDb.prepare("INSERT INTO messages(id,session_id,role,content,status,ordinal,created_at) VALUES(?,?,'user',?,'completed',1,?)").run(crypto.randomUUID(),s.id,'旧问题'.repeat(800),Date.now());sessionDb.prepare("INSERT INTO messages(id,session_id,role,content,status,ordinal,created_at) VALUES(?,?,'assistant',?,'completed',2,?)").run(crypto.randomUUID(),s.id,'旧回答'.repeat(800),Date.now()+1);
 let bodyCalls=0;aiRun.mockImplementation(async request=>{const q=request.query as {messages:{content:string}[]};if(q.messages[0].content.startsWith('压缩会话记忆'))return completion('旧事');bodyCalls++;
 if(bodyCalls===1&&mode==='http')return completion('她抬起头，','length');
 if((bodyCalls===1&&mode==='stream')||(bodyCalls===2&&mode==='http'))return mode==='http'?Response.json({error:{message:'maximum context length is 4096 tokens'}},{status:400}):new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"她抬起头，"}}]}\n\ndata: {"error":{"message":"maximum context length is 4096 tokens"}}\n\n'));c.close();}});
 expect(q.messages.at(-1)?.content).toContain('接着最后一条');expect(q.messages.some(m=>m.content==='她抬起头，')).toBe(true);return completion('把热茶递给你。');});
 await(await call('/api/sessions/'+s.id+'/generate','POST',{requestId:crypto.randomUUID(),content:'现在呢'})).text();await Promise.all(work);
 expect(sessionDb.prepare('SELECT content,status FROM messages WHERE session_id=? ORDER BY created_at DESC LIMIT 1').get(s.id)).toMatchObject({content:'她抬起头，把热茶递给你。',status:'completed'});expect(sessionDb.prepare('SELECT summary_json FROM sessions WHERE id=?').get(s.id)?.summary_json).toBeTruthy();expect(sessionDb.prepare('SELECT count(*) n FROM messages WHERE session_id=?').get(s.id)?.n).toBe(5);
});
it('rolls back the user and assistant together if the atomic insert fails',async()=>{
 const {s}=await seed();let inserts=0;beforeRun=sql=>{if(sql.startsWith('INSERT INTO messages')&&++inserts===2){beforeRun=undefined;throw new Error('disk fault');}};
 const r=await call('/api/sessions/'+s.id+'/generate','POST',{requestId:crypto.randomUUID(),content:'旧请求'});expect(r.status).toBe(500);expect(aiRun).not.toHaveBeenCalled();expect(sessionDb.prepare('SELECT count(*) n FROM messages WHERE session_id=?').get(s.id)?.n).toBe(1);expect(sessionDb.prepare('SELECT generation_id FROM sessions WHERE id=?').get(s.id)?.generation_id).toBeNull();
});
it('stops during summarization without changing the checkpoint or deleting source history',async()=>{
 const {s}=await seed();db.prepare('UPDATE model_capabilities SET value_json=?').run(JSON.stringify({contextTokens:1024,inputRatio:1.2,source:'llama.cpp:n_ctx'}));sessionDb.prepare("INSERT INTO messages(id,session_id,role,content,status,ordinal,created_at) VALUES(?,?,'user',?,'completed',1,?)").run(crypto.randomUUID(),s.id,'旧问题'.repeat(800),Date.now());sessionDb.prepare("INSERT INTO messages(id,session_id,role,content,status,ordinal,created_at) VALUES(?,?,'assistant',?,'completed',2,?)").run(crypto.randomUUID(),s.id,'旧回答'.repeat(800),Date.now()+1);
 const cancel=vi.fn();aiRun.mockImplementation(async request=>(request.query as {messages:{content:string}[]}).messages[0].content.startsWith('压缩会话记忆')?new ReadableStream({cancel}):completion('旧事'));
 const r=await call('/api/sessions/'+s.id+'/generate','POST',{requestId:crypto.randomUUID(),content:'现在呢'}),reader=r.body!.getReader();await reader.read();await vi.waitFor(()=>expect(aiRun).toHaveBeenCalled());const id=sessionDb.prepare('SELECT generation_id FROM sessions WHERE id=?').get(s.id)?.generation_id;
 await call('/api/sessions/'+s.id+'/stop','POST',{generationId:id});while(!(await reader.read()).done){}await Promise.all(work);expect(cancel).toHaveBeenCalled();expect(sessionDb.prepare('SELECT summary_json FROM sessions WHERE id=?').get(s.id)?.summary_json).toBeNull();expect(sessionDb.prepare('SELECT count(*) n FROM messages WHERE session_id=?').get(s.id)?.n).toBe(5);
});
it('allows output beyond the removed application character cap',async()=>{
 const {s}=await seed();aiRun.mockResolvedValueOnce(completion('字'.repeat(100001)));await(await call('/api/sessions/'+s.id+'/generate','POST',{requestId:crypto.randomUUID(),content:'继续'})).text();await Promise.all(work);expect(sessionDb.prepare('SELECT length(content) n,status FROM messages WHERE session_id=? ORDER BY created_at DESC LIMIT 1').get(s.id)).toMatchObject({n:100001,status:'completed'});
});
it('delivers one done event when an in-flight heartbeat returns after final persistence',async()=>{
 vi.useFakeTimers();try{
 const {s}=await seed();let controller:ReadableStreamDefaultController<Uint8Array>;aiRun.mockImplementation(async()=>new ReadableStream({start(c){controller=c;}}));
 const response=await call('/api/sessions/'+s.id+'/generate','POST',{requestId:crypto.randomUUID(),content:'出发'}),reader=response.body!.getReader();await reader.read();const tail=(async()=>{let value='';for(;;){const next=await reader.read();if(next.done)return value;value+=new TextDecoder().decode(next.value);}})();
 await vi.advanceTimersByTimeAsync(1000);controller!.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"出发了。\\n[TAVERN_NEXT]\\n去港口。\\n问问来路。\\n坐下喝茶。"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'));controller!.close();
 await vi.waitFor(()=>expect(sessionDb.prepare('SELECT generation_id FROM sessions WHERE id=?').get(s.id)?.generation_id).toBeNull());await Promise.resolve();expect((await tail).split('"type":"done"')).toHaveLength(2);await Promise.all(work);
 }finally{vi.useRealTimers();}
});
it('refuses checkpoint write when stop wins just after the summary returns',async()=>{
 const {s}=await seed();db.prepare('UPDATE model_capabilities SET value_json=?').run(JSON.stringify({contextTokens:1024,inputRatio:1.2,source:'llama.cpp:n_ctx'}));sessionDb.prepare("INSERT INTO messages(id,session_id,role,content,status,ordinal,created_at) VALUES(?,?,'user',?,'completed',1,?)").run(crypto.randomUUID(),s.id,'旧事'.repeat(800),Date.now());sessionDb.prepare("INSERT INTO messages(id,session_id,role,content,status,ordinal,created_at) VALUES(?,?,'assistant',?,'completed',2,?)").run(crypto.randomUUID(),s.id,'回复'.repeat(800),Date.now()+1);
 aiRun.mockImplementation(async()=>completion('旧事'));beforeRun=sql=>{if(!sql.startsWith('UPDATE sessions SET summary_json'))return;beforeRun=undefined;sessionDb.prepare("UPDATE messages SET status='aborted',finish_reason='stopped' WHERE session_id=? AND status='pending'").run(s.id);};
 const text=await(await call('/api/sessions/'+s.id+'/generate','POST',{requestId:crypto.randomUUID(),content:'后来'})).text();await Promise.all(work);expect(text).toContain('"type":"done"');expect(sessionDb.prepare('SELECT summary_json FROM sessions WHERE id=?').get(s.id)?.summary_json).toBeNull();expect(sessionDb.prepare('SELECT status,finish_reason FROM messages WHERE session_id=? ORDER BY created_at DESC LIMIT 1').get(s.id)).toMatchObject({status:'aborted',finish_reason:'stopped'});
});
it('compresses a large streamed prefix on context error without comparing against the old shorter request',async()=>{
 const {s}=await seed();let bodies=0;aiRun.mockImplementation(async request=>{
 if((request.query as {messages:{content:string}[]}).messages[0].content.startsWith('压缩会话记忆'))return completion('事实');
 if(++bodies===1)return new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('data: '+JSON.stringify({choices:[{delta:{content:'字'.repeat(8000)}}]})+'\n\ndata: {"error":{"message":"request (10000 tokens) exceeds the available context size (4096 tokens), try increasing it","n_ctx":4096}}\n\n'));c.close();}});
 return completion('结束。');});await(await call('/api/sessions/'+s.id+'/generate','POST',{requestId:crypto.randomUUID(),content:'开始'})).text();await Promise.all(work);expect(sessionDb.prepare('SELECT content,status FROM messages WHERE session_id=? ORDER BY created_at DESC LIMIT 1').get(s.id)).toMatchObject({content:'字'.repeat(8000)+'结束。',status:'completed'});
});
it('does not call the model if cancellation wins during capability preparation',async()=>{
 const {s}=await seed();const original=env.DB.prepare.bind(env.DB);let entered!:()=>void,release!:()=>void;const enteredPromise=new Promise<void>(r=>entered=r),blocked=new Promise<void>(r=>release=r);
 env.DB.prepare=(sql:string)=>{const stmt=original(sql);if(sql.includes('SELECT value_json,expires_at')){const first=stmt.first.bind(stmt);stmt.first=(async(...args:Parameters<typeof first>)=>{entered();await blocked;return first(...args);}) as typeof stmt.first;}return stmt;};
 const controller=new AbortController(),requestId=crypto.randomUUID();const response=worker.fetch(new Request('https://tavern.test/api/sessions/'+s.id+'/generate',{method:'POST',body:JSON.stringify({requestId,content:'出发'}),signal:controller.signal}),env,ctx);await enteredPromise;controller.abort();release();expect((await response).status).toBe(409);await Promise.all(work);expect(aiRun).not.toHaveBeenCalled();expect(sessionDb.prepare('SELECT generation_id FROM sessions WHERE id=?').get(s.id)?.generation_id).toBeNull();
});
it('sends done and permits another generation while the directory is stalled',async()=>{
 const {s}=await seed();const original=env.DB.prepare.bind(env.DB);let release!:()=>void;const blocked=new Promise<void>(r=>release=r);env.DB.prepare=(sql:string)=>{const stmt=original(sql);if(sql.startsWith('UPDATE sessions SET title')){const run=stmt.run.bind(stmt);stmt.run=(async(...args:Parameters<typeof run>)=>{await blocked;return run(...args);}) as typeof stmt.run;const bind=stmt.bind.bind(stmt);stmt.bind=(...values:unknown[])=>{const bound=bind(...values),boundRun=bound.run.bind(bound);bound.run=async()=>{await blocked;return boundRun();};return bound;};}return stmt;};
 try{const first=await(await call('/api/sessions/'+s.id+'/generate','POST',{requestId:crypto.randomUUID(),content:'你好'})).text();expect(first).toContain('"type":"done"');const second=await(await call('/api/sessions/'+s.id+'/generate','POST',{requestId:crypto.randomUUID(),content:'继续'})).text();expect(second).toContain('"type":"done"');expect(aiRun).toHaveBeenCalledTimes(2);}finally{release();await Promise.all(work);}
});

it.each([0,1,2])('repairs %i inline candidates without changing prose and replays persisted results',async count=>{
 const {s}=await seed(),requestId=crypto.randomUUID(),all=['我去港口。','我坐下喝茶。','我问问来路。'];
 aiRun.mockResolvedValueOnce(completion('正文。'+(count?'\n[TAVERN_NEXT]\n'+all.slice(0,count).join('\n'):'')));
 aiRun.mockResolvedValueOnce(completion(all.slice(count).join('\n')));
 const wire=await(await call('/api/sessions/'+s.id+'/generate','POST',{requestId,content:'下一步'})).text();await Promise.all(work);
 const events=wire.split('\n').filter(l=>l.startsWith('data: ')).map(l=>JSON.parse(l.slice(6)));
 expect(events.filter(e=>e.type==='delta').map(e=>e.text).join('')).toBe('正文。');expect(events.at(-1).message).toMatchObject({content:'正文。',candidates:all,status:'completed',finishReason:'stop'});
 const replay=await(await call('/api/sessions/'+s.id+'/generate','POST',{requestId})).json() as {message:Message};expect(replay.message.candidates).toEqual(all);expect(aiRun).toHaveBeenCalledTimes(2);
 expect((aiRun.mock.calls[1][0].query as {messages:{content:string}[]}).messages.at(-1)?.content).toContain('正文已完成');
});
it('does not impose a three-call cap while candidates make progress',async()=>{
 const {s}=await seed();aiRun.mockResolvedValueOnce(completion('正文。'));
 for(const candidate of ['我去港口。','我坐下喝茶。','我问问来路。'])aiRun.mockResolvedValueOnce(completion(candidate));
 const wire=await(await call('/api/sessions/'+s.id+'/generate','POST',{requestId:crypto.randomUUID(),content:'你好'})).text();await Promise.all(work);expect(aiRun).toHaveBeenCalledTimes(4);expect(JSON.parse(wire.trim().split('data: ').at(-1)!).message.candidates).toHaveLength(3);
});
it('stops candidate recovery on duplicate-only output and retains completed prose',async()=>{
 const {s}=await seed();aiRun.mockResolvedValueOnce(completion('正文。\n[TAVERN_NEXT]\n我去港口。'));aiRun.mockResolvedValueOnce(completion('我去港口。'));
 await(await call('/api/sessions/'+s.id+'/generate','POST',{requestId:crypto.randomUUID(),content:'你好'})).text();await Promise.all(work);expect(aiRun).toHaveBeenCalledTimes(2);expect(sessionDb.prepare("SELECT content,status,candidates_json FROM messages WHERE request_id IS NOT NULL AND role='assistant'").get()).toMatchObject({content:'正文。',status:'completed',candidates_json:'["我去港口。"]'});
});
it('continues a length-truncated candidate repair while isolating every byte from story',async()=>{
 const {s}=await seed();aiRun.mockResolvedValueOnce(completion('正文。'));aiRun.mockResolvedValueOnce(completion('我去港口。\n我坐','length'));aiRun.mockResolvedValueOnce(completion('下喝茶。\n我问问来路。'));
 const wire=await(await call('/api/sessions/'+s.id+'/generate','POST',{requestId:crypto.randomUUID(),content:'你好'})).text();await Promise.all(work);const done=JSON.parse(wire.trim().split('data: ').at(-1)!).message;expect(done).toMatchObject({content:'正文。',candidates:['我去港口。','我坐下喝茶。','我问问来路。']});expect(aiRun).toHaveBeenCalledTimes(3);
});
it('immediately cancels candidate recovery and retains the generated body',async()=>{
 const {s}=await seed();const cancelled=vi.fn();aiRun.mockResolvedValueOnce(completion('正文。'));aiRun.mockResolvedValueOnce(new ReadableStream({cancel:cancelled}));
 const reader=(await call('/api/sessions/'+s.id+'/generate','POST',{requestId:crypto.randomUUID(),content:'你好'})).body!.getReader();await reader.read();let wire='';const drain=(async()=>{for(;;){const next=await reader.read();if(next.done)return;wire+=new TextDecoder().decode(next.value);}})();await vi.waitFor(()=>expect(aiRun).toHaveBeenCalledTimes(2));const id=sessionDb.prepare('SELECT generation_id FROM sessions WHERE id=?').get(s.id)?.generation_id;await call('/api/sessions/'+s.id+'/stop','POST',{generationId:id});await drain;await Promise.all(work);expect(cancelled).toHaveBeenCalled();expect(sessionDb.prepare('SELECT content,status,finish_reason FROM messages WHERE id=?').get(id as string)).toMatchObject({content:'正文。',status:'aborted',finish_reason:'stopped'});expect(wire).not.toContain('我去港口');
});
it.each(['http','stream'])('compresses discovered context overflow during %s candidate repair without altering saved prose',async mode=>{
 const {s}=await seed();for(const [ordinal,role]of [[1,'user'],[2,'assistant']] as const)sessionDb.prepare('INSERT INTO messages(id,session_id,role,content,status,ordinal,created_at) VALUES(?,?,?,?,?,?,?)').run(crypto.randomUUID(),s.id,role,'旧会话'.repeat(1000),'completed',ordinal,Date.now()+ordinal);
 let repairs=0;aiRun.mockImplementation(async request=>{const messages=(request.query as {messages:{content:string}[]}).messages;
 if(messages[0].content.startsWith('压缩会话记忆'))return completion('旧事已记。');
 if(!messages[0].content.includes('当前任务仅输出用户续聊候选'))return completion('已完成正文。');
 expect(sessionDb.prepare("SELECT content FROM messages WHERE role='assistant' AND status='pending'").get()?.content).toBe('已完成正文。');
 expect(messages.at(-1)?.content).not.toContain(CANDIDATE_REMINDER);expect(messages[0].content).not.toContain('角色正文 + 用户续聊候选');
 if(++repairs===1)return mode==='http'?Response.json({error:{n_ctx:4096}},{status:400}):new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('data: '+JSON.stringify({choices:[{delta:{content:'我去'}}]})+'\n\ndata: {"error":{"n_ctx":4096}}\n\n'));c.close();}});
 if(mode==='stream')expect(messages.at(-1)?.content).toContain('仅从上次中断处');
 return completion(mode==='stream'?'港口。\n我坐下喝茶。\n我问问来路。':'我去港口。\n我坐下喝茶。\n我问问来路。');});
 const wire=await(await call('/api/sessions/'+s.id+'/generate','POST',{requestId:crypto.randomUUID(),content:'接下来呢'})).text();await Promise.all(work);const done=JSON.parse(wire.trim().split('data: ').at(-1)!).message;expect(done).toMatchObject({content:'已完成正文。',status:'completed',candidates:['我去港口。','我坐下喝茶。','我问问来路。']});expect(repairs).toBe(2);
});

it('ends recovery when compression makes no progress while preserving completed prose and releasing the turn',async()=>{
 const {ConversationContext}=await import('./context');const compress=vi.spyOn(ConversationContext.prototype,'compress').mockResolvedValue();
 try{const {s}=await seed();for(const [ordinal,role]of [[1,'user'],[2,'assistant']] as const)sessionDb.prepare('INSERT INTO messages(id,session_id,role,content,status,ordinal,created_at) VALUES(?,?,?,?,?,?,?)').run(crypto.randomUUID(),s.id,role,'旧会话'.repeat(1000),'completed',ordinal,Date.now()+ordinal);
 aiRun.mockResolvedValueOnce(completion('已完成正文。'));aiRun.mockResolvedValueOnce(Response.json({error:{n_ctx:4096}},{status:400}));
 const wire=await(await call('/api/sessions/'+s.id+'/generate','POST',{requestId:crypto.randomUUID(),content:'接下来呢'})).text();await Promise.all(work);const done=JSON.parse(wire.trim().split('data: ').at(-1)!).message;expect(done).toMatchObject({content:'已完成正文。',status:'completed',finishReason:'stop',candidates:[]});expect(sessionDb.prepare('SELECT generation_id FROM sessions WHERE id=?').get(s.id)?.generation_id).toBeNull();expect(aiRun).toHaveBeenCalledTimes(2);
 }finally{compress.mockRestore();}
});
