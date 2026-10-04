import { capabilities, modelInput, recordFeedback, type Capability } from './models';
import { candidateDelimiter, candidateInstruction, CANDIDATE_REMINDER, CandidateStream, recoveryCandidates, validateCandidates } from '../shared/candidates';
import { roleplayGatewayOptions } from './gateway';
import { InferenceMetrics } from './metrics';
import { parseBook } from '../shared/cards';
import { buildPrompt } from '../shared/prompt';
import { ConversationContext, summarizeWithModel, explicitContextLimit, contextLimit } from './context';
import { sseData } from '../shared/sse';
import { generationNotice } from '../shared/outcomes';
import type { FinishReason, Message } from '../shared/types';
import { HttpError, json } from './http';
import { settings, currentMessages, message, ownedBooks } from './store';
import type { SessionStore } from './session-store';
export { explicitContextLimit } from './context';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export async function generate(request:Request,env:Env,ctx:Pick<ExecutionContext,'waitUntil'>,owner:string,id:string,data:Record<string,unknown>,username:string,store:SessionStore,onSettled:(id:string)=>Promise<void> = async()=>{},onClaim:(id:string,abort:AbortController)=>void = ()=>{},beforeClaim:()=>void=()=>{}) {
 const started=Date.now();
 const requestId=String(data.requestId??'');if(!UUID.test(requestId))throw new HttpError(400,'请求 ID 无效');
 const initial=store.get();
 const existing=store.findRequest(requestId);
 if(existing)return json({message:message(existing),replayed:true});
 const capability=await capabilities(env,ctx);beforeClaim();if(request.signal.aborted||store.cancelled(requestId))throw new HttpError(409,'生成已停止');const now=Date.now();
 const regenerate=data.regenerate===true,continuing=data.continue===true;
 if(regenerate&&continuing)throw new HttpError(400,'生成模式无效');const text=typeof data.content==='string'?data.content.trim():'';
 if(!regenerate && !continuing && (!text || text.length>24000))throw new HttpError(400,'消息需为 1–24000 字符');
 const assistantId=crypto.randomUUID();
 if(!store.claim(assistantId,now))throw new HttpError(409,'当前会话正在生成');
 const abort=new AbortController();let checking=false;let leaseLost=false;let ready=false;let finishing=false;let abortReason:FinishReason='stopped';onClaim(assistantId,abort);
 const owns=async()=>{if(abort.signal.aborted)throw new Error('生成已停止');if(!store.owns(assistantId)){leaseLost=true;abort.abort();throw new Error('会话生成已接管');}};
 const stopWatcher=setInterval(()=>{if(checking||finishing)return;checking=true;try{if(!store.renew(assistantId)){leaseLost=true;abort.abort();return;}if(ready&&!store.pending(assistantId)){abortReason='stopped';abort.abort();}}catch{leaseLost=true;abortReason='upstream';abort.abort();}finally{checking=false;}},1000);
 let prefix='';let row=initial;let prompt:ReturnType<typeof buildPrompt>;let conversation:ConversationContext;
 try {
  row=store.get();
  const history=currentMessages(store.messages());const messageTime=Math.max(now,...history.map(m=>m.createdAt+1));
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
  await owns();store.start(assistantId,regenerate||continuing?undefined:userMessage,{id:assistantId,role:'assistant',content:prefix,status:'pending',ordinal:assistantOrdinal,requestId,createdAt:messageTime+1});ready=true;
 }catch(error){clearInterval(stopWatcher);abort.abort();store.release(assistantId);await onSettled(assistantId);if(error instanceof Error&&error.message.includes('上下文上限'))throw new HttpError(400,error.message);throw error;}
 let disconnected=false;let output=prefix;let finishReason:FinishReason='interrupted';let model='';let gatewayLogId:string|null=null;let metrics=new InferenceMetrics();let firstModelStarted:number|null=null;let modelRequests=0;let firstBodyAt:number|null=null;let candidates:string[]=[];const parser=new CandidateStream(candidateDelimiter());let tailAnnounced=false;let parserFinished=false;let candidateOutcome='inline';let candidateMissingReason='';

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
   const saveSummary=async()=>{await owns();const saved=store.saveSummary(assistantId,conversation.summary?JSON.stringify(conversation.summary):null);if(!saved){abort.abort();throw new Error('生成已停止');}if(conversation.contextTokens!==null)await recordFeedback(env,capability,{contextLimit:conversation.contextTokens});};
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
     await owns();if(!store.saveOutput(assistantId,output))throw new Error('生成已停止');lastSaved=Date.now();lastSize=output.length;
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
   candidates=parsed.candidates;
   if(candidates.length<3){
    candidateMissingReason=parser.inTail?'invalid-or-incomplete-tail':'missing-marker';
    candidateOutcome='recovering';
    await owns();if(!store.saveOutput(assistantId,output))throw new Error('生成已停止');
    if(!tailAnnounced){tailAnnounced=true;await send({type:'candidates_pending',messageId:assistantId});}
    // Keep all candidate-only output away from story deltas and persisted prose.
    syncOutput(wireAtStart);
    try{
     while(candidates.length<3){
      const previousCount=candidates.length;
      let repairText='';
      continuation=`正文已完成，不再写正文。只补充${3-candidates.length}条不同的用户续聊台词或行动，每条一行且不超过120字；不输出说明、序号或JSON。承接正文，不写角色回答，不把未发生的事当事实。已有候选：${JSON.stringify(candidates)}`;
      for(;;){
       prompt=await conversation.fit(continuation,{protocol:'当前任务仅输出用户续聊候选，一条一行，不写正文或说明，候选互不重复且每条不超过120字。',formatReminder:''});await saveSummary();await owns();
       const options=roleplayGatewayOptions(env,username,requestId);modelRequests++;metrics=new InferenceMetrics();
       const response=await env.AI.gateway(env.AIG_GATEWAY_ID).run({provider:'compat',endpoint:'chat/completions',headers:{...options.extraHeaders,'Content-Type':'application/json'},query:{model:'dynamic/rp',messages:prompt.messages,stream:true,...modelInput(opts)}},{gateway:options.gateway,signal:abort.signal});
       if(!(response instanceof Response))throw new Error('nonstream');gatewayLogId=response.headers.get('cf-aig-log-id');
       if(!response.ok){const limit=await inspectLimit(response,env,capability);if(!limit)throw new Error('upstream');conversation.contextTokens=limit;await conversation.compress();continue;}
       if(!response.body||!response.headers.get('Content-Type')?.includes('text/event-stream')){await response.body?.cancel();throw new Error('nonstream');}
       let reason:string|undefined,chunk='',limit:number|undefined;
       for await(const data of sseData(response.body,abort.signal)){
        if(data==='[DONE]')break;const event=JSON.parse(data);metrics.observe(event);
        if(event.error){limit=contextLimit(event);if(limit)break;throw new Error('upstream');}
        const choice=event.choices?.[0];if(choice?.finish_reason){if(reason&&reason!==choice.finish_reason)throw new Error('conflicting finish');reason=choice.finish_reason;}
        if(typeof choice?.delta?.content==='string')chunk+=choice.delta.content;
       }
       await owns();repairText+=chunk;
       if(chunk)conversation.appendOutput({id:assistantId,role:'assistant',content:'',status:'completed',ordinal:0,requestId,createdAt:now},chunk,continuing);
       if(limit){conversation.contextTokens=limit;if(chunk)continuation+='\n仅从上次中断处接着输出候选，不重复已输出部分，不写正文。';await conversation.compress();continue;}
       if(reason==='length'){if(!chunk)throw new Error('no progress');continuation+='\n仅从上次中断处接着输出候选，不重复已输出部分，不写正文。';continue;}
       if(reason!=='stop')throw new Error('incomplete');break;
      }
      candidates=validateCandidates([...candidates,...recoveryCandidates(repairText)]);
      if(candidates.length===previousCount){candidateOutcome='no-progress';break;}
     }
     if(candidates.length===3)candidateOutcome='recovered';
    }catch(error){if(abort.signal.aborted)throw error;candidateOutcome='recovery-error';}
   }
   break;
   }
  }catch{if(abort.signal.aborted)finishReason=abortReason;else if(finishReason==='stop')finishReason='upstream';status=['stopped','disconnected','timeout'].includes(finishReason)?'aborted':'error';failure=generationNotice(finishReason);}
  finally{
   finishing=true;clearInterval(stopWatcher);
   if(!parserFinished)output+=parser.finish().body;
   request.signal.removeEventListener('abort',onDisconnect);
   try{
    const saved=store.finish(assistantId,output,status,finishReason,candidates);await onSettled(assistantId);
    console.info('tavern-generation-outcome',{messageId:assistantId,requestId,gatewayLogId,finishReason:saved?.finish_reason,status:saved?.status,model,modelRequests,metricsScope:'last-model-request',...metrics.snapshot(),firstBodyMs:firstBodyAt===null?null:firstBodyAt-started,modelFirstBodyMs:firstBodyAt===null||firstModelStarted===null?null:firstBodyAt-firstModelStarted,promptBudget:prompt.budget,estimatedInputTokens:prompt.estimatedTokens,chars:output.length,candidateOutcome,candidateMissingReason,candidateCount:saved?.candidates_json?JSON.parse(saved.candidates_json).length:0,elapsedMs:Date.now()-started});
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
