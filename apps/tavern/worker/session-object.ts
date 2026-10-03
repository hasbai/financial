import { DurableObject } from 'cloudflare:workers';
import { SessionStore, SESSION_SCHEMA } from './session-store';
import { body, HttpError, json } from './http';
import { currentMessages, getSession, message, ownedBooks, session, settings, type MessageRow, type SessionRow } from './store';
import { generate } from './generation';
import { modelInput } from './models';
import { string } from '../shared/cards';

export const sessionName=(owner:string,id:string)=>JSON.stringify([owner,id]);
export const sessionStub=(env:Env,owner:string,id:string)=>(env.SESSIONS as DurableObjectNamespace<TavernSession>).getByName(sessionName(owner,id));
export class TavernSession extends DurableObject<Env> {
 private store?:SessionStore;
 private loading?:Promise<SessionStore>;
 private syncing?:Promise<void>;
 private mutating=false;
 private active?:{requestId:string;id:string;abort:AbortController};
 constructor(ctx:DurableObjectState,env:Env){super(ctx,env);this.ctx.storage.sql.exec(SESSION_SCHEMA);}
 private async load(owner:string,id:string):Promise<SessionStore>{
  if(this.store){if(this.store.id!==id||this.store.directory()?.owner!==owner)throw new HttpError(404,'会话不存在');return this.store;}
  if(this.loading){await this.loading;return this.load(owner,id);}
  this.loading=(async()=>{
   const store=new SessionStore(this.ctx.storage,id);
   if(!store.exists()){
    // Frozen before reading messages: every old mutation checks this existing generation fence.
    const fence='do:'+id,now=Date.now();
    const frozen=await this.env.DB.prepare("UPDATE sessions SET storage_backend='do',generation_id=?,generation_until=? WHERE owner=? AND id=? AND deleted_at IS NULL AND (storage_backend='do' OR generation_id IS NULL OR generation_until<=?)").bind(fence,Number.MAX_SAFE_INTEGER,owner,id,now).run();
    if(!frozen.meta.changes){const old=await getSession(this.env,owner,id);if(old.deleted_at)throw new HttpError(404,'会话不存在');throw new HttpError(409,'请先停止生成');}
    await this.env.DB.prepare("UPDATE messages SET status='aborted',finish_reason='interrupted',candidates_json=NULL WHERE session_id=? AND status='pending'").bind(id).run();
    const row=await getSession(this.env,owner,id);
    const messages=(await this.env.DB.prepare('SELECT * FROM messages WHERE session_id=? ORDER BY ordinal,created_at,id').bind(id).all<MessageRow>()).results;
    store.import(row,messages);
   }
   if(store.directory()?.owner!==owner)throw new HttpError(404,'会话不存在');
   store.recover();this.store=store;await this.scheduleSync();return store;
  })();
  try{return await this.loading;}finally{this.loading=undefined;}
 }
 private async scheduleSync(){await this.ctx.storage.setAlarm(Date.now()+1000);}
 /** Directory writes are serialized, and their revision stays durable until D1 acknowledges it. */
 private async sync(){
  if(this.mutating){await this.scheduleSync();return;}
  if(this.syncing)return this.syncing;
  this.syncing=(async()=>{
   const store=this.store;if(!store)return;
   for(;;){const meta=store.syncState();if(meta.revision===meta.synced_revision)return;const row=store.directory();
    const result=await this.env.DB.prepare("UPDATE sessions SET title=?,settings_json=?,book_ids_json=?,updated_at=?,deleted_at=? WHERE id=? AND owner=? AND storage_backend='do'").bind(row.title,row.settings_json,meta.deleted?'[]':row.book_ids_json,row.updated_at,meta.deleted?Date.now():null,row.id,row.owner).run();
    if(!result.meta.changes)throw new Error('会话目录同步失败');store.synced(meta.revision);
   }
  })();
  try{await this.syncing;}finally{this.syncing=undefined;}
 }
 private async settled(id:string){if(this.active?.id===id)this.active=undefined;await this.scheduleSync();this.ctx.waitUntil(this.sync().catch(()=>{}));}
 async alarm(){
  if(!this.store){const row=this.ctx.storage.sql.exec<SessionRow & Record<string,SqlStorageValue>>('SELECT * FROM sessions LIMIT 1').toArray()[0];if(!row)return;await this.load(row.owner,row.id);}
  try{await this.sync();}catch{await this.ctx.storage.setAlarm(Date.now()+10000);}
 }
 private async read(owner:string,id:string){const store=await this.load(owner,id);return {session:session(store.get(),true),messages:currentMessages(store.messages())};}
 private async stop(owner:string,id:string,generationId:string){
  if(!this.store){
   const old=await getSession(this.env,owner,id);
   if(old.storage_backend==='d1'&&old.generation_id&&(old.generation_until??0)>Date.now()){
    if(old.generation_id!==generationId)throw new HttpError(409,'生成状态已改变');
    const stopped=await this.env.DB.prepare("UPDATE messages SET status='aborted',finish_reason='stopped' WHERE session_id=? AND id=? AND status='pending' AND EXISTS(SELECT 1 FROM sessions WHERE id=? AND owner=? AND storage_backend='d1' AND generation_id=?)").bind(id,generationId,id,owner,generationId).run();
    if(!stopped.meta.changes)throw new HttpError(409,'生成状态已改变');return {ok:true};
   }
  }
  const store=await this.load(owner,id);store.stop(generationId);if(this.active?.id===generationId)this.active.abort.abort();return {ok:true};
 }
 async cancel(owner:string,id:string,requestId:string){const store=await this.load(owner,id);store.cancelRequest(requestId);if(this.active?.requestId===requestId){store.stop(this.active.id,'disconnected');this.active.abort.abort();}}
 private async update(owner:string,id:string,data:Record<string,unknown>){
  const store=await this.load(owner,id),row=store.idle(),opts=data.settings?settings(data.settings):settings(JSON.parse(row.settings_json));
  const ids=data.bookIds??JSON.parse(row.book_ids_json);await ownedBooks(this.env,owner,ids);if(data.settings)modelInput(opts);
  const title=data.title===undefined?row.title:string(data.title).trim();if(!title||title.length>120)throw new HttpError(400,'会话名称无效');
  // Reserve old and new bindings before the DO commits; a failed sync never releases a live reference.
  const union=[...new Set([...JSON.parse(row.book_ids_json),...(ids as string[])])];
  store.dirty();await this.scheduleSync();
  const reserved=await this.env.DB.prepare("UPDATE sessions SET book_ids_json=? WHERE id=? AND owner=? AND deleted_at IS NULL AND (SELECT count(*) FROM worldbooks WHERE owner=? AND id IN(SELECT value FROM json_each(?)))=?").bind(JSON.stringify(union),id,owner,owner,JSON.stringify(ids),(ids as string[]).length).run();
  if(!reserved.meta.changes)throw new HttpError(409,'世界书状态已改变，请重试');
  store.update(JSON.stringify(opts),JSON.stringify(ids),title);await this.scheduleSync();return session(store.get(),true);
 }
 private async fork(owner:string,id:string,data:Record<string,unknown>){
  const store=await this.load(owner,id),row=store.idle();const text=string(data.content).trim();if(!text||text.length>24000)throw new HttpError(400,'消息需为 1–24000 字符');
  const all=currentMessages(store.messages()),index=all.findIndex(m=>m.id===data.messageId);if(index<0)throw new HttpError(404,'消息不存在');
  const next=crypto.randomUUID(),now=Date.now(),copied=[...all.slice(0,index),{...all[index],content:text,status:'completed' as const}];
  const result=await this.env.DB.batch([
   this.env.DB.prepare("INSERT INTO sessions(id,owner,title,character_json,character_name,settings_json,book_ids_json,created_at,updated_at,storage_backend,generation_id,generation_until) SELECT ?,?,?,?,?,?,?,?,?,'do',?,? WHERE (SELECT count(*) FROM worldbooks WHERE owner=? AND id IN(SELECT value FROM json_each(?)))=json_array_length(?)").bind(next,owner,row.title+' · 分支',row.character_json,row.character_name,row.settings_json,row.book_ids_json,now,now,'do:'+next,Number.MAX_SAFE_INTEGER,owner,row.book_ids_json,row.book_ids_json),
   ...copied.map((m,i)=>this.env.DB.prepare('INSERT INTO messages(id,session_id,role,content,status,ordinal,created_at,finish_reason) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM sessions WHERE id=?)').bind(crypto.randomUUID(),next,m.role,m.content,m.status,i,now+i,m.finishReason??null,next))
  ]);
  if(!result[0].meta.changes)throw new HttpError(409,'世界书状态已改变，请重试');
  const saved=await callSession(this.env,owner,next,'read');return saved.session;
 }
 private async remove(owner:string,id:string){const store=await this.load(owner,id);store.remove();await this.scheduleSync();return {ok:true};}
 private async export(owner:string,id:string){const store=await this.load(owner,id),row=store.get();return {row,messages:store.messages()};}
 async invoke(owner:string,id:string,method:SessionMethod,data:Record<string,unknown>={}){
  const mutation=['update','fork','remove'].includes(method);
  try{
   if(method!=='stop')await this.load(owner,id);
   if(mutation){if(this.mutating||this.syncing)throw new HttpError(409,'会话状态已改变，请重试');this.mutating=true;}
   let value!:SessionResults[SessionMethod];
   try{
    switch(method){
     case 'read':value=await this.read(owner,id);break;
     case 'stop':value=await this.stop(owner,id,string(data.generationId));break;
     case 'update':value=await this.update(owner,id,data);break;
     case 'fork':value=await this.fork(owner,id,data);break;
     case 'remove':value=await this.remove(owner,id);break;
     case 'export':value=await this.export(owner,id);break;
    }
   }finally{if(mutation)this.mutating=false;}
   if(mutation)await this.sync().catch(()=>{});
   return JSON.stringify({ok:true,value});
  }catch(e){if(e instanceof HttpError)return JSON.stringify({ok:false,status:e.status,message:e.message});throw e;}
 }
 async fetch(request:Request){
  try{
   const owner=request.headers.get('X-Tavern-Owner')??'',id=request.headers.get('X-Tavern-Session')??'',username=decodeURIComponent(request.headers.get('X-Tavern-Username')??'');
   const store=await this.load(owner,id),data=await body(request);if(this.mutating)throw new HttpError(409,'会话状态已改变，请重试');
   return await generate(request,this.env,this.ctx,owner,id,data,username,store,(id)=>this.settled(id),(assistantId,abort)=>{this.active={requestId:String(data.requestId),id:assistantId,abort};},()=>{if(this.mutating)throw new HttpError(409,'会话状态已改变，请重试');});
  }catch(e){if(e instanceof HttpError)return json({message:e.message},e.status);throw e;}
 }
}

export type SessionResults={
 read:{session:ReturnType<typeof session>;messages:ReturnType<typeof message>[]};
 stop:{ok:boolean};update:ReturnType<typeof session>;fork:ReturnType<typeof session>;remove:{ok:boolean};
 export:{row:SessionRow;messages:ReturnType<typeof message>[]};
};
export type SessionMethod=keyof SessionResults;
export async function callSession<K extends SessionMethod>(env:Env,owner:string,id:string,method:K,data:Record<string,unknown>={}):Promise<SessionResults[K]>{
 const result=JSON.parse(await sessionStub(env,owner,id).invoke(owner,id,method,data)) as {ok:boolean;status:number;message:string;value:unknown};
 if(!result.ok)throw new HttpError(result.status,result.message);return result.value as SessionResults[K];
}
