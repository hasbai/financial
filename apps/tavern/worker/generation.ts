import { capabilities, modelInput, recordFeedback, type Capability } from './models';
import { candidateDelimiter, candidateInstruction, CANDIDATE_REMINDER, CandidateStream } from '../shared/candidates';
import { roleplayGatewayOptions } from './gateway';
import { InferenceMetrics } from './metrics';
import { parseBook } from '../shared/cards';
import { buildPrompt } from '../shared/prompt';
import { ConversationContext, summarizeWithModel, explicitContextLimit, contextLimit } from './context';
import { sseData } from '../shared/sse';
import { generationNotice } from '../shared/outcomes';
import type { FinishReason, Message } from '../shared/types';
import { HttpError, json } from './http';
import { settings, currentMessages, getMessages, getSession, message, ownedBooks, type MessageRow } from './store';
export { explicitContextLimit } from './context';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export async function generate(request:Request,env:Env,ctx:Pick<ExecutionContext,'waitUntil'>,owner:string,id:string,data:Record<string,unknown>,username:string) {
 const started=Date.now();
 const requestId=String(data.requestId??'');if(!UUID.test(requestId))throw new HttpError(400,'请求 ID 无效');
 const initial=await getSession(env,owner,id);
 const existing=await env.DB.prepare("SELECT * FROM messages WHERE session_id=? AND request_id=? AND role='assistant'").bind(id,requestId).first<MessageRow>();
 if(existing)return json({message:message(existing),replayed:true});
 const capability=await capabilities(env,ctx);const now=Date.now();
 const regenerate=data.regenerate===true,continuing=data.continue===true;
 if(regenerate&&continuing)throw new HttpError(400,'生成模式无效');const text=typeof data.content==='string'?data.content.trim():'';
 if(!regenerate && !continuing && (!text || text.length>24000))throw new HttpError(400,'消息需为 1–24000 字符');
 const assistantId=crypto.randomUUID();
 const claim=await env.DB.batch([
  env.DB.prepare('UPDATE sessions SET generation_id=?,generation_until=?,updated_at=? WHERE id=? AND owner=? AND (generation_id IS NULL OR generation_until<=?)').bind(assistantId,now+180000,now,id,owner,now),
  env.DB.prepare("UPDATE messages SET status='aborted',finish_reason='expired' WHERE session_id=? AND status='pending' AND EXISTS(SELECT 1 FROM sessions WHERE id=? AND generation_id=?)").bind(id,id,assistantId)
 ]);
 if(!claim[0].meta.changes)throw new HttpError(409,'当前会话正在生成');
 const abort=new AbortController();let checking=false;let leaseLost=false;let ready=false;let finishing=false;let abortReason:FinishReason='stopped';
 const owns=async()=>{if(abort.signal.aborted)throw new Error('生成已停止');const state=await env.DB.prepare('SELECT generation_id FROM sessions WHERE id=?').bind(id).first<{generation_id:string|null}>();if(state?.generation_id!==assistantId){leaseLost=true;abort.abort();throw new Error('会话生成已接管');}};
 const stopWatcher=setInterval(()=>{if(checking||finishing)return;checking=true;void env.DB.batch([
  env.DB.prepare('UPDATE sessions SET generation_until=? WHERE id=? AND generation_id=?').bind(Date.now()+180000,id,assistantId),
 ]).then(async results=>{if(finishing)return;if(!results[0].meta.changes){leaseLost=true;abort.abort();return;}const state=await env.DB.prepare('SELECT status FROM messages WHERE id=?').bind(assistantId).first<{status:string}>();if(finishing)return;if(ready&&state?.status!=='pending'){abortReason='stopped';abort.abort();}}).catch(()=>{if(finishing)return;leaseLost=true;abortReason='upstream';abort.abort();}).finally(()=>checking=false);},1000);
 let prefix='';let row=initial;let prompt:ReturnType<typeof buildPrompt>;let conversation:ConversationContext;
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
  conversation=new ConversationContext([...base,...(regenerate||continuing?[]:[userMessage])],JSON.parse(row.character_json),books.filter(b=>b.enabled).map(b=>parseBook(JSON.parse(b.book_json),b.name)),settings(JSON.parse(row.settings_json)),capability.contextTokens,{protocol:candidateInstruction(),formatReminder:CANDIDATE_REMINDER,inputRatio:capability.inputRatio},messages=>summarizeWithModel(env,username,requestId,settings(JSON.parse(row.settings_json)),messages,abort.signal));
  await conversation.restore(row.summary_json);if(continuing)conversation.resume(assistantId);
  prompt=conversation.prompt(continuing?'继续上一条回复，从中断处接着写，不要重复已有内容。':'');
  modelInput(settings(JSON.parse(row.settings_json)));
  const statements=[];
  if(!regenerate&&!continuing)statements.push(env.DB.prepare("INSERT INTO messages(id,session_id,role,content,status,ordinal,request_id,created_at) SELECT ?,?,'user',?,'completed',?,?,? WHERE EXISTS(SELECT 1 FROM sessions WHERE id=? AND generation_id=?)").bind(userMessage.id,id,text,ordinal,requestId,messageTime,id,assistantId));
  statements.push(env.DB.prepare("INSERT INTO messages(id,session_id,role,content,status,ordinal,request_id,created_at) SELECT ?,?,'assistant',?,'pending',?,?,? WHERE EXISTS(SELECT 1 FROM sessions WHERE id=? AND generation_id=?)").bind(assistantId,id,prefix,assistantOrdinal,requestId,messageTime+1,id,assistantId));
  await owns();const inserted=await env.DB.batch(statements);if(inserted.some(r=>!r.meta.changes))throw new HttpError(409,'会话生成已接管');ready=true;
 }catch(error){clearInterval(stopWatcher);abort.abort();await env.DB.prepare('UPDATE sessions SET generation_id=NULL,generation_until=NULL WHERE id=? AND generation_id=?').bind(id,assistantId).run();if(error instanceof Error&&error.message.includes('上下文上限'))throw new HttpError(400,error.message);throw error;}
 let disconnected=false;let output=prefix;let finishReason:FinishReason='interrupted';let model='';let gatewayLogId:string|null=null;let metrics=new InferenceMetrics();let firstModelStarted:number|null=null;let modelRequests=0;let firstBodyAt:number|null=null;let candidates:string[]=[];const parser=new CandidateStream(candidateDelimiter());let tailAnnounced=false;let parserFinished=false;

 const stream=new TransformStream<Uint8Array,Uint8Array>(); const writer=stream.writable.getWriter(),encoder=new TextEncoder();
 const send=async(event:unknown)=>{await writer.write(encoder.encode('data: '+JSON.stringify(event)+'\n\n'));};
 const onDisconnect=()=>{disconnected=true;abortReason='disconnected';abort.abort();};request.signal.addEventListener('abort',onDisconnect,{once:true});if(request.signal.aborted)onDisconnect();void writer.closed.catch(onDisconnect);
 const work=(async()=>{
  let status:Message['status']='completed';let failure='';
  try{
   await send({type:'start',messageId:assistantId,requestId});
   const opts=settings(JSON.parse(row.settings_json));
   let continuation=continuing?'继续上一条回复，从中断处接着写，不要重复已有内容。':'';
   prompt=await conversation.fit(continuation);
   const saveSummary=async()=>{await owns();const saved=await env.DB.prepare("UPDATE sessions SET summary_json=? WHERE id=? AND generation_id=? AND EXISTS(SELECT 1 FROM messages WHERE id=? AND status='pending')").bind(conversation.summary?JSON.stringify(conversation.summary):null,id,assistantId,assistantId).run();if(!saved.meta.changes){abort.abort();throw new Error('生成已停止');}if(conversation.contextTokens!==null)await recordFeedback(env,capability,{contextLimit:conversation.contextTokens});};
   await saveSummary();
   let wireOutput=prefix;
   const syncOutput=(start:number)=>{const delta=wireOutput.slice(start);if(!delta)return;conversation.appendOutput({id:assistantId,role:'assistant',content:'',status:'completed',ordinal:0,requestId,createdAt:now},delta,continuing);continuation='接着最后一条未完成的输出续写，不重复已有内容，完成正文与候选。';};
   for(;;){
   await owns();const wireAtStart=wireOutput.length;
   finishReason='upstream';const gatewayOptions=roleplayGatewayOptions(env,username,requestId);
   firstModelStarted??=Date.now();modelRequests++;metrics=new InferenceMetrics();
   const result=await env.AI.gateway(env.AIG_GATEWAY_ID).run({provider:'compat',endpoint:'chat/completions',headers:{...gatewayOptions.extraHeaders,'Content-Type':'application/json'},query:{model:'dynamic/rp',messages:prompt.messages,stream:true,...modelInput(opts)}},{gateway:gatewayOptions.gateway,signal:abort.signal});
   if(!(result instanceof Response)){finishReason='unsupported';throw new Error('nonstream');}
   gatewayLogId=result.headers.get('cf-aig-log-id');
   if(!result.ok){const limit=await inspectLimit(result,env,capability);if(limit){conversation.contextTokens=limit;const before=prompt.estimatedTokens;await conversation.compress();prompt=await conversation.fit(continuation);if(prompt.estimatedTokens>=before)throw new Error('会话压缩未缩短输入');await saveSummary();continue;}throw new Error('upstream');}
   if(!result.body||!result.headers.get('Content-Type')?.includes('text/event-stream')){finishReason='unsupported';await result.body?.cancel();throw new Error('nonstream');}
   finishReason='interrupted';
   let lastSaved=Date.now(),lastSize=prefix.length;let upstreamReason:string|undefined;let streamLimit:number|undefined;
   for await(const data of sseData(result.body,abort.signal)) {
    if(data==='[DONE]')break;
    const event=JSON.parse(data);if(event.error){await errorFeedback(env,capability,event).catch(()=>{});streamLimit=contextLimit(event);if(streamLimit)break;finishReason='upstream';throw new Error('upstream');}
    if(typeof event.model==='string')model=event.model;
    metrics.observe(event);
    const choice=event.choices?.[0];if(typeof choice?.finish_reason==='string'&&choice.finish_reason){if(upstreamReason&&upstreamReason!==choice.finish_reason){finishReason='interrupted';throw new Error('conflicting finish');}upstreamReason=choice.finish_reason;}
    const delta=choice?.delta?.content;
    if(typeof delta==='string') {wireOutput+=delta;const body=parser.push(delta);output+=body;if(body){if(firstBodyAt===null&&body.trim())firstBodyAt=Date.now();await send({type:'delta',text:body});}if(parser.inTail&&!tailAnnounced){tailAnnounced=true;await send({type:'candidates_pending',messageId:assistantId});}}
    if(Date.now()-lastSaved>800 || output.length-lastSize>1000){
     const state=await env.DB.prepare('SELECT status FROM messages WHERE id=?').bind(assistantId).first<{status:string}>();if(state?.status!=='pending')throw new Error('生成已停止');
     await owns();await env.DB.prepare("UPDATE messages SET content=? WHERE id=? AND status='pending' AND EXISTS(SELECT 1 FROM sessions WHERE id=? AND generation_id=?)").bind(output,assistantId,id,assistantId).run();lastSaved=Date.now();lastSize=output.length;
    }
   }
   if(streamLimit){syncOutput(wireAtStart);conversation.contextTokens=streamLimit;const before=conversation.prompt(continuation).estimatedTokens;await conversation.compress();prompt=await conversation.fit(continuation);if(prompt.estimatedTokens>=before)throw new Error('会话压缩未缩短输入');await saveSummary();continue;}
   if(upstreamReason==='length'){if(wireOutput.length<=wireAtStart)throw new Error('模型续写没有进展');
    syncOutput(wireAtStart);prompt=await conversation.fit(continuation);await saveSummary();continue;}
   const parsed=parser.finish();parserFinished=true;output+=parsed.body;if(parsed.body){if(firstBodyAt===null&&parsed.body.trim())firstBodyAt=Date.now();await send({type:'delta',text:parsed.body});}
   if(abort.signal.aborted)throw new Error('aborted');
   finishReason=upstreamReason==='stop'?'stop':upstreamReason==='length'?'length':upstreamReason==='content_filter'?'content_filter':upstreamReason?'unsupported':'interrupted';
   if(finishReason!=='stop')throw new Error('incomplete');
   if(!output.slice(prefix.length).trim()){finishReason='empty';throw new Error('empty');}
   candidates=parsed.candidates;break;
   }
  }catch{if(abort.signal.aborted)finishReason=abortReason;else if(finishReason==='stop')finishReason='upstream';status=['stopped','disconnected','timeout'].includes(finishReason)?'aborted':'error';failure=generationNotice(finishReason);}
  finally{
   finishing=true;clearInterval(stopWatcher);
   if(!parserFinished)output+=parser.finish().body;
   request.signal.removeEventListener('abort',onDisconnect);
   try{
    await env.DB.batch([env.DB.prepare("UPDATE messages SET content=?,candidates_json=CASE WHEN status='aborted' OR ?<>'completed' THEN NULL ELSE ? END,finish_reason=CASE WHEN status='aborted' AND finish_reason IS NOT NULL THEN finish_reason ELSE ? END,status=CASE WHEN status='aborted' THEN 'aborted' ELSE ? END WHERE id=? AND EXISTS(SELECT 1 FROM sessions WHERE id=? AND generation_id=?)").bind(output,status,candidates.length?JSON.stringify(candidates):null,finishReason,status,assistantId,id,assistantId),env.DB.prepare('UPDATE sessions SET generation_id=NULL,generation_until=NULL,updated_at=? WHERE id=? AND generation_id=?').bind(Date.now(),id,assistantId)]);
    const saved=await env.DB.prepare('SELECT * FROM messages WHERE id=?').bind(assistantId).first<MessageRow>();
    console.info('tavern-generation-outcome',{messageId:assistantId,requestId,gatewayLogId,finishReason:saved?.finish_reason,status:saved?.status,model,modelRequests,metricsScope:'last-model-request',...metrics.snapshot(),firstBodyMs:firstBodyAt===null?null:firstBodyAt-started,modelFirstBodyMs:firstBodyAt===null||firstModelStarted===null?null:firstBodyAt-firstModelStarted,promptBudget:prompt.budget,estimatedInputTokens:prompt.estimatedTokens,chars:output.length,candidateCount:saved?.candidates_json?JSON.parse(saved.candidates_json).length:0,elapsedMs:Date.now()-started});
    if(!disconnected&&!leaseLost){if(failure)await send({type:'error',message:failure});await send({type:'done',message:message(saved!)});}
   }finally{clearInterval(stopWatcher);await writer.close().catch(()=>{});}
  }
 })();
 ctx.waitUntil(work.catch(()=>{console.error('tavern-generation-persist-failed',{messageId:assistantId});abort.abort();}));
 return new Response(stream.readable,{headers:{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-store','X-Content-Type-Options':'nosniff'}});
}

async function inspectLimit(response:Response,env:Env,capability:Capability):Promise<number|undefined> {
 if(!response.body)return;const reader=response.body.getReader(),decoder=new TextDecoder();let text='',bytes=0;const timer=setTimeout(()=>{void reader.cancel().catch(()=>{});},1000);
 try{for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.length;if(bytes>16384)break;text+=decoder.decode(value,{stream:true});}text+=decoder.decode();
  try{const value=JSON.parse(text);await errorFeedback(env,capability,value);return contextLimit(value);}catch{}
 }catch{}finally{clearTimeout(timer);await reader.cancel().catch(()=>{});}
}

export async function errorFeedback(env:Env,capability:Capability,value:unknown) {
 if(!value||typeof value!=='object')return;const v=value as {model?:unknown;error?:{model?:unknown;message?:unknown};message?:unknown};
 const actualModel=typeof v.model==='string'?v.model:typeof v.error?.model==='string'?v.error.model:undefined;
 const text=typeof v.error?.message==='string'?v.error.message:typeof v.message==='string'?v.message:'';
 const limit=contextLimit(value);if(limit)await recordFeedback(env,capability,{model:actualModel,contextLimit:limit});
}
