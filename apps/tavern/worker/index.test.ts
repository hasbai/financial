import {it,expect,vi,beforeEach,afterEach} from 'vitest';import {DatabaseSync} from 'node:sqlite';import {readFileSync} from 'node:fs';
import worker from './index';import {identity,AuthError} from './auth';import {DEFAULT_SETTINGS} from '../shared/types';
vi.mock('./auth',async(original)=>({...await original<typeof import('./auth')>(),identity:vi.fn()}));
const card={spec:'chara_card_v2',spec_version:'2.0',data:{name:'岚',description:'港城的旅店主人',personality:'沉稳',scenario:'港城',first_mes:'你好，{{user}}。',mes_example:'',system_prompt:'',post_history_instructions:'',alternate_greetings:['欢迎'],tags:[],creator:'测试',extensions:{}}};
let db:DatabaseSync,env:Env,work:Promise<unknown>[],files:Map<string,Uint8Array>;let aiRun:ReturnType<typeof vi.fn>;let beforeRun:((sql:string,values:unknown[])=>void)|undefined;
function statement(sql:string,values:unknown[]=[]):D1PreparedStatement {return {bind:(...v:unknown[])=>statement(sql,v),first:async()=>db.prepare(sql).get(...values as never[])??null,all:async()=>({results:db.prepare(sql).all(...values as never[])}),run:async()=>{beforeRun?.(sql,values);const r=db.prepare(sql).run(...values as never[]);return {meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};}} as D1PreparedStatement;}
const ctx={waitUntil:(promise:Promise<unknown>)=>{work.push(promise);}};
async function call(path:string,method='GET',data?:unknown){return worker.fetch(new Request('https://tavern.test'+path,{method,headers:data?{'Content-Type':'application/json'}:{},body:data===undefined?undefined:JSON.stringify(data)}),env,ctx);}
beforeEach(()=>{
 beforeRun=undefined;db=new DatabaseSync(':memory:');for(const name of ['0001_schema.sql','0002_source_catalog.sql'])db.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));files=new Map();work=[];
 aiRun=vi.fn(async()=>new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"reasoning_content":"private"}}]}\n\ndata: {"choices":[{"delta":{"content":"欢迎来到港城。"}}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'));c.close();}}));
 env=Object.assign({} as Env,{DB:{prepare:statement,batch:async(stmts:D1PreparedStatement[])=>{const result=[];db.exec('BEGIN');try{for(const s of stmts)result.push(await s.run());db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}},FILES:{put:async(key:string,bytes:Uint8Array)=>files.set(key,bytes),get:async(key:string)=>files.has(key)?{body:new Response(Uint8Array.from(files.get(key)!)).body}:null,delete:async(keys:string|string[])=>{for(const key of Array.isArray(keys)?keys:[keys])files.delete(key);}},AI:{run:aiRun},AUTH0_DOMAIN:'hasbai.eu.auth0.com',AUTH0_AUDIENCE:'https://tavern.hasbai.xyz/api',AIG_GATEWAY_ID:'default',CONTEXT_TOKENS:'16000',VERSION:{id:'test'},ASSETS:{fetch:async()=>new Response('assets')}});
 vi.mocked(identity).mockResolvedValue({sub:'auth0|owner',email:'owner',admin:true});
});
afterEach(async()=>{await Promise.allSettled(work);db.close();vi.clearAllMocks();});
async function seed(){const c=await(await call('/api/characters','POST',card)).json() as {id:string};const s=await(await call('/api/sessions','POST',{characterId:c.id})).json() as {id:string};return {c,s};}
it('installs/imports without duplicate private rows and preserves raw exports',async()=>{const a=await(await call('/api/characters','POST',card)).json() as {id:string};const b=await(await call('/api/characters','POST',card)).json() as {id:string};expect(a.id).toBe(b.id);expect(await(await call('/api/characters/'+a.id+'/export')).json()).toEqual(card);vi.mocked(identity).mockResolvedValue({sub:'auth0|other',email:'other',admin:true});expect((await call('/api/characters/'+a.id)).status).toBe(404);});
it('denies missing JWT and cross-origin writes',async()=>{vi.mocked(identity).mockRejectedValue(new AuthError(401,'请先登录'));expect((await call('/api/settings')).status).toBe(401);vi.mocked(identity).mockResolvedValue({sub:'owner',email:'owner',admin:true});const r=await worker.fetch(new Request('https://tavern.test/api/settings',{method:'PUT',headers:{Origin:'https://evil.test'}}),env,ctx);expect(r.status).toBe(403);});
it('snapshots role definitions and creates selected alternate greeting',async()=>{const {c,s}=await seed();await call('/api/characters/'+c.id,'DELETE');const history=await(await call('/api/sessions/'+s.id)).json() as {session:{character:unknown};messages:{content:string}[]};expect(history.session.character).toEqual(card);expect(history.messages[0].content).toBe('你好，旅人。');});
it('persists streamed output, fixed dynamic route, no reasoning leak and idempotent replay',async()=>{const {s}=await seed(),requestId=crypto.randomUUID();const r=await call('/api/sessions/'+s.id+'/generate','POST',{requestId,content:'你好',model:'override'});expect(r.headers.get('Content-Type')).toContain('event-stream');const text=await r.text();await Promise.all(work);expect(text).toContain('欢迎来到港城。');expect(text).not.toContain('private');expect(aiRun).toHaveBeenCalledWith('dynamic/rp',expect.objectContaining({stream:true}),expect.objectContaining({gateway:{id:'default',skipCache:true,collectLog:false}}));const duplicate=await call('/api/sessions/'+s.id+'/generate','POST',{requestId,content:'你好'});expect((await duplicate.json() as {replayed:boolean}).replayed).toBe(true);expect(aiRun).toHaveBeenCalledTimes(1);expect(db.prepare('SELECT generation_id FROM sessions WHERE id=?').get(s.id)?.generation_id).toBeNull();});
it('keeps user messages on model failure and never auto-retries',async()=>{const {s}=await seed();aiRun.mockRejectedValue(new Error('secret upstream error'));const r=await call('/api/sessions/'+s.id+'/generate','POST',{requestId:crypto.randomUUID(),content:'留下这句'});const text=await r.text();await Promise.all(work);expect(text).toContain('生成失败，请重试');expect(text).not.toContain('secret');expect(db.prepare("SELECT content FROM messages WHERE role='user'").get()?.content).toBe('留下这句');expect(db.prepare("SELECT status FROM messages WHERE role='assistant' AND request_id IS NOT NULL").get()?.status).toBe('error');});
it('aborts a stopped generation and refuses stale stop or concurrent send',async()=>{const {s}=await seed();let controller:ReadableStreamDefaultController<Uint8Array>;aiRun.mockResolvedValue(new ReadableStream({start(c){controller=c;}}));
 const response=await call('/api/sessions/'+s.id+'/generate','POST',{requestId:crypto.randomUUID(),content:'出发'});const reader=response.body!.getReader();await reader.read();const generationId=db.prepare('SELECT generation_id FROM sessions WHERE id=?').get(s.id)?.generation_id;
 expect((await call('/api/sessions/'+s.id+'/generate','POST',{requestId:crypto.randomUUID(),content:'重复'})).status).toBe(409);
 expect((await call('/api/sessions/'+s.id+'/stop','POST',{generationId:'wrong'})).status).toBe(409);
 expect((await call('/api/sessions/'+s.id+'/stop','POST',{generationId})).status).toBe(200);
 controller!.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"部分文本"}}]}\n\ndata: [DONE]\n\n'));controller!.close();while(!(await reader.read()).done){}await Promise.all(work);expect(db.prepare("SELECT status FROM messages WHERE id=?").get(generationId as string)?.status).toBe('aborted');
});
it('forks edited history without changing original messages',async()=>{const {s}=await seed();const data=await(await call('/api/sessions/'+s.id)).json() as {messages:{id:string}[]};const fork=await(await call('/api/sessions/'+s.id+'/fork','POST',{messageId:data.messages[0].id,content:'新的开场'})).json() as {id:string};expect(db.prepare('SELECT content FROM messages WHERE session_id=?').get(s.id)?.content).toBe('你好，旅人。');expect(db.prepare('SELECT content FROM messages WHERE session_id=?').get(fork.id)?.content).toBe('新的开场');});
it('validates worldbook ownership, settings and malformed imported files',async()=>{const {s}=await seed();expect((await call('/api/sessions/'+s.id,'PATCH',{bookIds:['missing']})).status).toBe(400);expect((await call('/api/settings','PUT',{...DEFAULT_SETTINGS,maxTokens:999999})).status).toBe(400);expect((await call('/api/worldbooks','POST',{raw:{name:'bad'}})).status).toBe(400);expect((await call('/api/characters','POST',{fake:true})).status).toBe(400);});
it('searches actual synchronized catalog rows and installs from server definitions',async()=>{const revision='a'.repeat(40);db.prepare('INSERT INTO source_catalog VALUES(?,?,?,?,?,?,?,?,?)').run('theatrelm',revision,'0','岚','旅店主人','G-reen','[]','https://huggingface.co/source',JSON.stringify(card));db.prepare('INSERT INTO source_releases VALUES(?,?,?,?)').run('theatrelm',revision,1,Date.now());const r=await(await call('/api/discover?q=岚')).json() as {results:{id:string}[]};expect(r.results[0].id).toBe(revision+':0');const installed=await(await call('/api/install','POST',{source:'theatrelm',id:r.results[0].id,card:{name:'fake'}})).json() as {name:string};expect(installed.name).toBe('岚');expect((await call('/api/install','POST',{source:'theatrelm',id:'../escape'})).status).toBe(400);});

it('refuses deletion of a book bound to sessions and allows explicit detachment',async()=>{const {s}=await seed();const b=await(await call('/api/worldbooks','POST',{raw:{name:'港',entries:[]}})).json() as {id:string};await call('/api/sessions/'+s.id,'PATCH',{bookIds:[b.id]});expect((await call('/api/worldbooks/'+b.id,'DELETE')).status).toBe(409);await call('/api/sessions/'+s.id,'PATCH',{bookIds:[]});expect((await call('/api/worldbooks/'+b.id,'DELETE')).status).toBe(200);});

it('reads history only after claiming generation when a previous turn finishes concurrently',async()=>{
 const {s}=await seed();beforeRun=(sql)=>{if(!sql.startsWith('UPDATE sessions SET generation_id=?'))return;beforeRun=undefined;
  db.prepare("INSERT INTO messages(id,session_id,role,content,status,ordinal,created_at) VALUES(?,?,'user','previous turn','completed',1,?)").run(crypto.randomUUID(),s.id,Date.now());
  db.prepare("INSERT INTO messages(id,session_id,role,content,status,ordinal,created_at) VALUES(?,?,'assistant','previous answer','completed',2,?)").run(crypto.randomUUID(),s.id,Date.now());
 };
 const response=await call('/api/sessions/'+s.id+'/generate','POST',{requestId:crypto.randomUUID(),content:'next turn'});await response.text();await Promise.all(work);
 const args=aiRun.mock.calls[0][1] as {messages:{content:string}[]};expect(args.messages.some(m=>m.content==='previous answer')).toBe(true);expect(db.prepare("SELECT ordinal FROM messages WHERE content='next turn'").get()?.ordinal).toBe(3);
});
it('does not abort a newly claimed generation during expired lock cleanup',async()=>{
 const {s}=await seed(),old=crypto.randomUUID(),fresh=crypto.randomUUID();db.prepare('UPDATE sessions SET generation_id=?,generation_until=? WHERE id=?').run(old,Date.now()-1,s.id);
 beforeRun=sql=>{if(!sql.startsWith("UPDATE messages SET status='aborted'"))return;beforeRun=undefined;db.prepare('UPDATE sessions SET generation_id=?,generation_until=? WHERE id=?').run(fresh,Date.now()+60000,s.id);db.prepare("INSERT INTO messages(id,session_id,role,content,status,ordinal,created_at) VALUES(?,?,'assistant','','pending',1,?)").run(fresh,s.id,Date.now());};
 expect((await call('/api/sessions/'+s.id)).status).toBe(200);expect(db.prepare('SELECT generation_id FROM sessions WHERE id=?').get(s.id)?.generation_id).toBe(fresh);expect(db.prepare('SELECT status FROM messages WHERE id=?').get(fresh)?.status).toBe('pending');
});
it('atomically refuses a book deletion when binding races with it',async()=>{
 const {s}=await seed();const b=await(await call('/api/worldbooks','POST',{raw:{name:'race',entries:[]}})).json() as {id:string};
 beforeRun=sql=>{if(!sql.startsWith('DELETE FROM worldbooks'))return;beforeRun=undefined;db.prepare('UPDATE sessions SET book_ids_json=? WHERE id=?').run(JSON.stringify([b.id]),s.id);};
 expect((await call('/api/worldbooks/'+b.id,'DELETE')).status).toBe(409);expect(db.prepare('SELECT id FROM worldbooks WHERE id=?').get(b.id)).toBeTruthy();
});
it('atomically refuses binding a book deleted after its ownership check',async()=>{
 const {s}=await seed();const b=await(await call('/api/worldbooks','POST',{raw:{name:'race',entries:[]}})).json() as {id:string};
 beforeRun=sql=>{if(!sql.startsWith('UPDATE sessions SET settings_json'))return;beforeRun=undefined;db.prepare('DELETE FROM worldbooks WHERE id=?').run(b.id);};
 expect((await call('/api/sessions/'+s.id,'PATCH',{bookIds:[b.id]})).status).toBe(409);expect(db.prepare('SELECT book_ids_json FROM sessions WHERE id=?').get(s.id)?.book_ids_json).toBe('[]');
});

it('forks the current book bindings after concurrent detach and deletion',async()=>{
 const {s}=await seed();const b=await(await call('/api/worldbooks','POST',{raw:{name:'race',entries:[]}})).json() as {id:string};await call('/api/sessions/'+s.id,'PATCH',{bookIds:[b.id]});const m=db.prepare('SELECT id FROM messages WHERE session_id=?').get(s.id)!;
 beforeRun=sql=>{if(!sql.startsWith('INSERT INTO sessions'))return;beforeRun=undefined;db.prepare('UPDATE sessions SET book_ids_json=? WHERE id=?').run('[]',s.id);db.prepare('DELETE FROM worldbooks WHERE id=?').run(b.id);};
 const r=await call('/api/sessions/'+s.id+'/fork','POST',{messageId:m.id,content:'fork'});expect(r.status).toBe(201);const fork=await r.json() as {id:string};expect(db.prepare('SELECT book_ids_json FROM sessions WHERE id=?').get(fork.id)?.book_ids_json).toBe('[]');
});
it('returns conflict when generation claims a session before deletion',async()=>{
 const {s}=await seed();beforeRun=sql=>{if(!sql.startsWith('DELETE FROM sessions'))return;beforeRun=undefined;db.prepare('UPDATE sessions SET generation_id=?,generation_until=? WHERE id=?').run(crypto.randomUUID(),Date.now()+60000,s.id);};
 expect((await call('/api/sessions/'+s.id,'DELETE')).status).toBe(409);expect(db.prepare('SELECT id FROM sessions WHERE id=?').get(s.id)).toBeTruthy();
});

it('cancels idle upstream when the response reader disconnects and releases the lock',async()=>{
 const {s}=await seed(),cancel=vi.fn();aiRun.mockImplementation(async()=>new ReadableStream({cancel}));
 const response=await call('/api/sessions/'+s.id+'/generate','POST',{requestId:crypto.randomUUID(),content:'idle'});const reader=response.body!.getReader();await reader.read();await reader.cancel();await Promise.all(work);
 expect(cancel).toHaveBeenCalled();expect(db.prepare('SELECT generation_id FROM sessions WHERE id=?').get(s.id)?.generation_id).toBeNull();expect(db.prepare("SELECT status FROM messages WHERE request_id IS NOT NULL AND role='assistant'").get()?.status).toBe('aborted');
});
it('stops an idle upstream without waiting for another model chunk',async()=>{
 const {s}=await seed(),cancel=vi.fn();aiRun.mockImplementation(async()=>new ReadableStream({cancel}));
 const response=await call('/api/sessions/'+s.id+'/generate','POST',{requestId:crypto.randomUUID(),content:'idle'});const reader=response.body!.getReader();await reader.read();const generationId=db.prepare('SELECT generation_id FROM sessions WHERE id=?').get(s.id)?.generation_id;
 expect((await call('/api/sessions/'+s.id+'/stop','POST',{generationId})).status).toBe(200);while(!(await reader.read()).done){}await Promise.all(work);expect(cancel).toHaveBeenCalled();expect(db.prepare('SELECT generation_id FROM sessions WHERE id=?').get(s.id)?.generation_id).toBeNull();
});

it('rejects non-stream model output and releases the generation lock without retrying',async()=>{
 const {s}=await seed();aiRun.mockResolvedValue({response:'unexpected non-stream'});const r=await call('/api/sessions/'+s.id+'/generate','POST',{requestId:crypto.randomUUID(),content:'stream required'});const text=await r.text();await Promise.all(work);expect(text).toContain('模型未返回流式响应');expect(aiRun).toHaveBeenCalledTimes(1);expect(db.prepare('SELECT generation_id FROM sessions WHERE id=?').get(s.id)?.generation_id).toBeNull();expect(db.prepare("SELECT status FROM messages WHERE request_id IS NOT NULL AND role='assistant'").get()?.status).toBe('error');
});
