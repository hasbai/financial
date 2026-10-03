import { parseBook } from '../shared/cards';
import { buildPrompt } from '../shared/prompt';
import { sseData } from '../shared/sse';
import { generationNotice } from '../shared/outcomes';
import type { FinishReason, Message } from '../shared/types';
import { HttpError, json } from './http';
import { currentMessages, getMessages, getSession, message, ownedBooks, type MessageRow } from './store';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export async function generate(request:Request,env:Env,ctx:Pick<ExecutionContext,'waitUntil'>,owner:string,id:string,data:Record<string,unknown>) {
 const requestId=String(data.requestId??'');if(!UUID.test(requestId))throw new HttpError(400,'请求 ID 无效');
 const initial=await getSession(env,owner,id),now=Date.now();
 const existing=await env.DB.prepare("SELECT * FROM messages WHERE session_id=? AND request_id=? AND role='assistant'").bind(id,requestId).first<MessageRow>();
 if(existing)return json({message:message(existing),replayed:true});
 const regenerate=data.regenerate===true,continuing=data.continue===true;
 if(regenerate&&continuing)throw new HttpError(400,'生成模式无效');const text=typeof data.content==='string'?data.content.trim():'';
 if(!regenerate && !continuing && (!text || text.length>24000))throw new HttpError(400,'消息需为 1–24000 字符');
 const assistantId=crypto.randomUUID();
 const claim=await env.DB.batch([
  env.DB.prepare('UPDATE sessions SET generation_id=?,generation_until=?,updated_at=? WHERE id=? AND owner=? AND (generation_id IS NULL OR generation_until<=?)').bind(assistantId,now+180000,now,id,owner,now),
  env.DB.prepare("UPDATE messages SET status='aborted',finish_reason='expired' WHERE session_id=? AND status='pending' AND EXISTS(SELECT 1 FROM sessions WHERE id=? AND generation_id=?)").bind(id,id,assistantId)
 ]);
 if(!claim[0].meta.changes)throw new HttpError(409,'当前会话正在生成');
 let prefix='';let row=initial;let prompt:ReturnType<typeof buildPrompt>;
 try {
  row=await getSession(env,owner,id);
  const history=currentMessages(await getMessages(env,id));const messageTime=Math.max(now,...history.map(m=>m.createdAt+1));
  let ordinal=Math.max(-1,...history.map(m=>m.ordinal))+1;
  let base=history.filter(m=>m.status==='completed');
  if(continuing){const last=history.at(-1);if(last?.role!=='assistant'||last.status==='pending'||last.status==='completed'||!last.content.trim())throw new HttpError(400,'没有可继续的回复');prefix=last.content;ordinal=last.ordinal;base=[...base,{...last,status:'completed'}];}
  if(regenerate){const last=base.at(-1);if(last?.role==='assistant'){ordinal=last.ordinal;base=base.slice(0,-1);}else if(last?.role==='user'){ordinal=last.ordinal+1;}else throw new HttpError(400,'没有可重新生成的消息');}
  const userMessage:Message={id:crypto.randomUUID(),role:'user',content:text,status:'completed',ordinal,requestId,createdAt:messageTime};
  const assistantOrdinal=regenerate||continuing?ordinal:ordinal+1;
  const books=await ownedBooks(env,owner,JSON.parse(row.book_ids_json));
  prompt=buildPrompt(JSON.parse(row.character_json),books.filter(b=>b.enabled).map(b=>parseBook(JSON.parse(b.book_json),b.name)),[...base,...(regenerate||continuing?[]:[userMessage])],JSON.parse(row.settings_json),Number(env.CONTEXT_TOKENS),continuing?'继续上一条回复，从中断处接着写，不要重复已有内容。':'');
  const statements=[];
  if(!regenerate&&!continuing)statements.push(env.DB.prepare("INSERT INTO messages(id,session_id,role,content,status,ordinal,request_id,created_at) VALUES(?,?,'user',?,'completed',?,?,?)").bind(userMessage.id,id,text,ordinal,requestId,messageTime));
  statements.push(env.DB.prepare("INSERT INTO messages(id,session_id,role,content,status,ordinal,request_id,created_at) VALUES(?,?,'assistant',?,'pending',?,?,?)").bind(assistantId,id,prefix,assistantOrdinal,requestId,messageTime+1));
  await env.DB.batch(statements);
 }catch(error){await env.DB.prepare('UPDATE sessions SET generation_id=NULL,generation_until=NULL WHERE id=? AND generation_id=?').bind(id,assistantId).run();if(error instanceof Error&&error.message.includes('上下文上限'))throw new HttpError(400,error.message);throw error;}
 const abort=new AbortController(); let disconnected=false;let output=prefix;let finishReason:FinishReason='interrupted';let abortReason:FinishReason='stopped';let model='';let outputTokens:number|undefined;
 const started=Date.now();const timer=setTimeout(()=>{abortReason='timeout';abort.abort();},175000);
 let checking=false;
 const stopWatcher=setInterval(()=>{if(checking)return;checking=true;void env.DB.prepare('SELECT status FROM messages WHERE id=?').bind(assistantId).first<{status:string}>().then(state=>{if(state?.status!=='pending'){abortReason='stopped';abort.abort();}}).catch(()=>{abortReason='upstream';abort.abort();}).finally(()=>checking=false);},1000);
 const stream=new TransformStream<Uint8Array,Uint8Array>(); const writer=stream.writable.getWriter(),encoder=new TextEncoder();
 const send=async(event:unknown)=>{await writer.write(encoder.encode('data: '+JSON.stringify(event)+'\n\n'));};
 const onDisconnect=()=>{disconnected=true;abortReason='disconnected';abort.abort();};request.signal.addEventListener('abort',onDisconnect,{once:true});if(request.signal.aborted)onDisconnect();void writer.closed.catch(onDisconnect);
 const work=(async()=>{
  let status:Message['status']='completed';let failure='';
  try{
   await send({type:'start',messageId:assistantId,requestId});
   const opts=JSON.parse(row.settings_json);
   finishReason='upstream';const result=await env.AI.run('dynamic/rp',{messages:prompt.messages,stream:true,temperature:opts.temperature,max_tokens:opts.maxTokens},{gateway:{id:env.AIG_GATEWAY_ID,skipCache:true,collectLog:false},signal:abort.signal});
   if(!(result instanceof ReadableStream)){finishReason='unsupported';throw new Error('nonstream');}
   finishReason='interrupted';
   let lastSaved=Date.now(),lastSize=prefix.length;let upstreamReason:string|undefined;
   for await(const data of sseData(result,abort.signal)) {
    if(data==='[DONE]')break;
    const event=JSON.parse(data);if(event.error){finishReason='upstream';throw new Error('upstream');}
    if(typeof event.model==='string')model=event.model;
    if(typeof event.usage?.completion_tokens==='number')outputTokens=event.usage.completion_tokens;
    const choice=event.choices?.[0];if(typeof choice?.finish_reason==='string'&&choice.finish_reason){if(upstreamReason&&upstreamReason!==choice.finish_reason){finishReason='interrupted';throw new Error('conflicting finish');}upstreamReason=choice.finish_reason;}
    const delta=choice?.delta?.content;
    if(typeof delta==='string') {output+=delta;if(output.length>100000){finishReason='output_limit';throw new Error('output limit');}await send({type:'delta',text:delta});}
    if(Date.now()-lastSaved>800 || output.length-lastSize>1000){
     const state=await env.DB.prepare('SELECT status FROM messages WHERE id=?').bind(assistantId).first<{status:string}>();if(state?.status!=='pending')throw new Error('生成已停止');
     await env.DB.prepare("UPDATE messages SET content=? WHERE id=? AND status='pending'").bind(output,assistantId).run();lastSaved=Date.now();lastSize=output.length;
    }
   }
   if(abort.signal.aborted)throw new Error('aborted');
   finishReason=upstreamReason==='stop'?'stop':upstreamReason==='length'?'length':upstreamReason==='content_filter'?'content_filter':upstreamReason?'unsupported':'interrupted';
   if(finishReason!=='stop')throw new Error('incomplete');
   if(!output.slice(prefix.length).trim()){finishReason='empty';throw new Error('empty');}
  }catch{if(abort.signal.aborted)finishReason=abortReason;else if(finishReason==='stop')finishReason='upstream';status=['stopped','disconnected','timeout'].includes(finishReason)?'aborted':'error';failure=generationNotice(finishReason);}
  finally{
   clearTimeout(timer);clearInterval(stopWatcher);request.signal.removeEventListener('abort',onDisconnect);
   try{
    await env.DB.batch([env.DB.prepare("UPDATE messages SET content=?,finish_reason=CASE WHEN status='aborted' AND finish_reason IS NOT NULL THEN finish_reason ELSE ? END,status=CASE WHEN status='aborted' THEN 'aborted' ELSE ? END WHERE id=?").bind(output,finishReason,status,assistantId),env.DB.prepare('UPDATE sessions SET generation_id=NULL,generation_until=NULL,updated_at=? WHERE id=? AND generation_id=?').bind(Date.now(),id,assistantId)]);
    const saved=await env.DB.prepare('SELECT * FROM messages WHERE id=?').bind(assistantId).first<MessageRow>();
    console.info('tavern-generation-outcome',{messageId:assistantId,finishReason:saved?.finish_reason,status:saved?.status,model,outputTokens,chars:output.length,elapsedMs:Date.now()-started});
    if(!disconnected){if(failure)await send({type:'error',message:failure});await send({type:'done',message:message(saved!)});}
   }finally{await writer.close().catch(()=>{});}
  }
 })();
 ctx.waitUntil(work.catch(()=>{console.error('tavern-generation-persist-failed',{messageId:assistantId});abort.abort();}));
 return new Response(stream.readable,{headers:{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-store','X-Content-Type-Options':'nosniff'}});
}
