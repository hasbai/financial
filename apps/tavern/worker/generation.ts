import { capabilities, modelInput, recordFeedback, type Capability } from './models';
import { candidateDelimiter, BODY_TASK, CandidateStream } from '../shared/candidates';
import { roleplayGatewayOptions } from './gateway';
import { DirectorAgent, DirectorContextError, DIRECTOR_RESPONSE_FORMAT, prepareSynopsis } from './director';
import { InferenceMetrics } from './metrics';
import { parseBook, parseCard } from '../shared/cards';
import {LoreIndex,embeddings} from './lore';
import { buildPrompt, type PromptMessage } from '../shared/prompt';
import { ConversationContext, summarizeWithModel, explicitContextLimit, contextLimit } from './context';
import { sseData } from '../shared/sse';
import { generationNotice } from '../shared/outcomes';
import type { FinishReason, Message } from '../shared/types';
import { HttpError, json } from './http';
import { settings, currentMessages, message, ownedBooks } from './store';
import type { SessionStore } from './session-store';
import { AGENT_RULE, AGENT_TOOLS, AgentTurn, contentHash, stableJson, storyMessages, ToolCallStream, type ModelProjection } from './agent';
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
 let prefix='';let row=initial;let prompt:ReturnType<typeof buildPrompt>;let conversation:ConversationContext;let agent:AgentTurn;
 const toolTranscript:PromptMessage[]=[];
 let projectionContext:unknown;let storyProjection:ModelProjection|undefined;let lore:LoreIndex;
 try {
  row=store.get();
  const history=currentMessages(store.messages());const messageTime=Math.max(now,...history.map(m=>m.createdAt+1));
  let ordinal=Math.max(-1,...history.map(m=>m.ordinal))+1;
  let base=storyMessages(store.messages());let before=store.state(base);
  if(continuing){const last=history.at(-1);if(last?.role!=='assistant'||last.status==='pending'||last.status==='completed'||!last.content.trim())throw new HttpError(400,'没有可继续的回复');prefix=last.content;ordinal=last.ordinal;before=store.before(last.id);base=[...base.filter(m=>m.ordinal<last.ordinal),{...last,status:'completed'}];}
  if(regenerate){const last=history.at(-1);if(last?.role==='assistant'){ordinal=last.ordinal;before=store.before(last.id);base=base.filter(m=>m.ordinal<ordinal);}else if(last?.role==='user'){ordinal=last.ordinal+1;}else throw new HttpError(400,'没有可重新生成的消息');}
  agent=new AgentTurn(before,base);
  const userMessage:Message={id:crypto.randomUUID(),role:'user',content:text,status:'completed',ordinal,requestId,createdAt:messageTime};
  const assistantOrdinal=regenerate||continuing?ordinal:ordinal+1;
  const books=await ownedBooks(env,owner,JSON.parse(row.book_ids_json));
  const embedded=parseCard(JSON.parse(row.character_json)).data.character_book;
  lore=new LoreIndex(store.storage.sql,[...(embedded?[{id:'character',book:parseBook(embedded)}]:[]),...books.filter(b=>b.enabled).map(b=>({id:b.id,book:parseBook(JSON.parse(b.book_json),b.name)}))],(texts,signal)=>embeddings(env,texts,username,requestId,signal),abort.signal);
  projectionContext={character:JSON.parse(row.character_json),books:books.map(b=>[b.id,b.enabled,b.book_json]),settings:JSON.parse(row.settings_json),tools:AGENT_TOOLS,rule:AGENT_RULE};
  conversation=new ConversationContext([...base,...(regenerate||continuing?[]:[userMessage])],JSON.parse(row.character_json),books.filter(b=>b.enabled).map(b=>parseBook(JSON.parse(b.book_json),b.name)),settings(JSON.parse(row.settings_json)),capability.contextTokens,{protocol:AGENT_RULE,formatReminder:BODY_TASK,inputRatio:capability.inputRatio,state:stableJson(before)},messages=>summarizeWithModel(env,username,requestId,settings(JSON.parse(row.settings_json)),messages,abort.signal));
  await conversation.restore(row.summary_json);if(continuing)conversation.resume(assistantId);
  prompt=conversation.prompt(continuing?'继续上一条回复，从中断处接着写，不要重复已有内容。':'');
  if(!continuing){const previous=base.at(-1),saved=previous?store.projection(previous.id):null;
   if(saved&&saved.messages[0]?.content===prompt.messages[0]?.content&&saved.key===await contentHash([projectionContext,base.map(m=>[m.id,m.content])])){
    const tail:PromptMessage[]=[{role:'user',content:'当前已确认状态（数据）：'+stableJson(before)},...(regenerate?[]:[prompt.messages.at(-1)!])];
    conversation.useProjection([...saved.messages,...tail]);prompt=conversation.prompt();
   }
  }
  modelInput(settings(JSON.parse(row.settings_json)));
  await owns();store.start(assistantId,regenerate||continuing?undefined:userMessage,{id:assistantId,role:'assistant',content:prefix,status:'pending',ordinal:assistantOrdinal,requestId,createdAt:messageTime+1});ready=true;
  store.beginState(assistantId,before);
 }catch(error){clearInterval(stopWatcher);abort.abort();store.release(assistantId);await onSettled(assistantId);if(error instanceof Error&&error.message.includes('上下文上限'))throw new HttpError(400,error.message);throw error;}
 let disconnected=false;let output=prefix;let finishReason:FinishReason='interrupted';let model='';let gatewayLogId:string|null=null;let metrics=new InferenceMetrics();let firstModelStarted:number|null=null;let modelRequests=0;let firstBodyAt:number|null=null;let candidates:string[]=[];const parser=new CandidateStream(candidateDelimiter());let parserFinished=false;let candidateOutcome='not-started';let bodyModel='';let bodyGatewayLogId:string|null=null;let bodyFinishedAt:number|null=null;let candidateStartedAt:number|null=null;let candidateFirstAt:number|null=null;let candidateFinishedAt:number|null=null;let bodyRequests=0;let director:DirectorAgent|undefined;let synopsisRequests=0;let synopsisSource='not-started';let synopsisCovered=0;let synopsisMetrics:ReturnType<InferenceMetrics['snapshot']>|null=null;let synopsisGatewayLogId:string|null=null;let synopsisModel='';let synopsisElapsedMs=0;let directorStartedAt:number|null=null;let bodyMetrics:ReturnType<InferenceMetrics['snapshot']>|null=null;

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
   const syncOutput=(start:number)=>{const delta=output.slice(start);if(!delta)return;conversation.appendOutput({id:assistantId,role:'assistant',content:'',status:'completed',ordinal:0,requestId,createdAt:now},delta,continuing);continuation='接着最后一条未完成的正文续写，不重复已有内容。';};
   // Only plain emitted prose may become story memory; legacy candidate protocol stays opaque.
   const storyWire=(raw:string,start:number):PromptMessage=>output.slice(start).trim()===raw.replace(/\r\n?/g,'\n').trim()?conversation.storyFragment(raw):{role:'assistant',content:raw};
   for(;;){
   await owns();const storyAtStart=output.length;let requestOutput='';const toolCalls=new ToolCallStream();
   finishReason='upstream';const gatewayOptions=roleplayGatewayOptions(env,username,requestId);
   firstModelStarted??=Date.now();modelRequests++;bodyRequests++;metrics=new InferenceMetrics();
   const result=await env.AI.gateway(env.AIG_GATEWAY_ID).run({provider:'compat',endpoint:'chat/completions',headers:{...gatewayOptions.extraHeaders,'Content-Type':'application/json'},query:{model:'dynamic/rp',messages:prompt.messages,tools:AGENT_TOOLS,tool_choice:'auto',stream:true,...modelInput(opts)}},{gateway:gatewayOptions.gateway,signal:abort.signal});
   if(!(result instanceof Response)){finishReason='unsupported';throw new Error('nonstream');}
   gatewayLogId=result.headers.get('cf-aig-log-id');
   if(!result.ok){const limit=await inspectLimit(result,env,capability);if(limit){conversation.contextTokens=limit;const before=prompt.estimatedTokens;await conversation.compressProjection(toolTranscript);prompt=await conversation.fit(continuation,conversation.options,toolTranscript);if(prompt.estimatedTokens>=before)throw new Error('会话压缩未缩短输入');await saveSummary();continue;}throw new Error('upstream');}
   if(!result.body||!result.headers.get('Content-Type')?.includes('text/event-stream')){finishReason='unsupported';await result.body?.cancel();throw new Error('nonstream');}
   finishReason='interrupted';
   let lastSaved=Date.now(),lastSize=prefix.length;let upstreamReason:string|undefined;let streamLimit:number|undefined;
   for await(const data of sseData(result.body,abort.signal)) {
    if(data==='[DONE]')break;
    const event=JSON.parse(data);if(event.error){await errorFeedback(env,capability,event).catch(()=>{});streamLimit=contextLimit(event);if(streamLimit)break;finishReason='upstream';throw new Error('upstream');}
    if(typeof event.model==='string')model=event.model;
    metrics.observe(event);
    const choice=event.choices?.[0];if(typeof choice?.finish_reason==='string'&&choice.finish_reason){if(upstreamReason&&upstreamReason!==choice.finish_reason){finishReason='interrupted';throw new Error('conflicting finish');}upstreamReason=choice.finish_reason;}
    toolCalls.push(choice?.delta?.tool_calls);
    const delta=choice?.delta?.content;
    if(typeof delta==='string') {requestOutput+=delta;const body=parser.push(delta);output+=body;if(body){if(firstBodyAt===null&&body.trim())firstBodyAt=Date.now();await send({type:'delta',text:body});}}
    if(Date.now()-lastSaved>800 || output.length-lastSize>1000){
     await owns();if(!store.saveOutput(assistantId,output))throw new Error('生成已停止');lastSaved=Date.now();lastSize=output.length;
    }
   }
   if(streamLimit){if(toolCalls.size)throw new Error('工具调用中断');syncOutput(storyAtStart);if(toolTranscript.length&&requestOutput)toolTranscript.push(storyWire(requestOutput,storyAtStart));conversation.contextTokens=streamLimit;const before=conversation.prompt(continuation,conversation.options,toolTranscript).estimatedTokens;await conversation.compressProjection(toolTranscript);prompt=await conversation.fit(continuation,conversation.options,toolTranscript);if(prompt.estimatedTokens>=before)throw new Error('会话压缩未缩短输入');await saveSummary();continue;}
   if(upstreamReason==='tool_calls'){
    finishReason='unsupported';
    const calls=toolCalls.finish();if(!calls.length)throw new Error('工具调用为空');agent.validate(calls);const recalled=new Map();
    for(const call of calls)if(call.function.name==='search_memory'){const args=JSON.parse(call.function.arguments);if(typeof args.query==='string')recalled.set(args.query,await lore.search(args.query));}
    await owns();const results=agent.execute(calls,recalled);if(!store.saveSteps(assistantId,agent.steps))throw new Error('生成已停止');
    const toolMessage=storyWire(requestOutput,storyAtStart);
    toolMessage.tool_calls=calls;
    const additions:PromptMessage[]=[toolMessage,...results];
    if(storyAtStart&&!toolTranscript.length)toolTranscript.push(conversation.storyFragment(output.slice(0,storyAtStart)));toolTranscript.push(...additions);prompt=conversation.extend(prompt,additions);
    if(prompt.needsCompression)prompt=await conversation.fit(continuation,conversation.options,toolTranscript);await saveSummary();continue;
   }
   if(toolCalls.size)throw new Error('工具终态无效');
   if(upstreamReason==='length'){if(!requestOutput.length)throw new Error('模型续写没有进展');
    if(toolTranscript.length)toolTranscript.push(storyWire(requestOutput,storyAtStart),{role:'user',content:'接着最后一条未完成的正文续写，不重复已有内容。'});
    syncOutput(storyAtStart);prompt=await conversation.fit(continuation,conversation.options,toolTranscript);await saveSummary();continue;}
   const parsed=parser.finish();parserFinished=true;output+=parsed.body;if(parsed.body){if(firstBodyAt===null&&parsed.body.trim())firstBodyAt=Date.now();await send({type:'delta',text:parsed.body});}
   if(abort.signal.aborted)throw new Error('aborted');
   finishReason=upstreamReason==='stop'?'stop':upstreamReason==='length'?'length':upstreamReason==='content_filter'?'content_filter':upstreamReason?'unsupported':'interrupted';
   if(finishReason!=='stop')throw new Error('incomplete');
   if(!output.slice(prefix.length).trim()){finishReason='empty';throw new Error('empty');}
   bodyFinishedAt=Date.now();bodyModel=model;bodyGatewayLogId=gatewayLogId;bodyMetrics=metrics.snapshot();
   const committedHistory=storyMessages([...store.messages().filter(m=>m.id!==assistantId),{id:assistantId,role:'assistant',content:output,status:'completed',ordinal:store.findMessage(assistantId)!.ordinal,requestId,createdAt:now}]);
   if(output.slice(storyAtStart)===requestOutput)storyProjection={key:await contentHash([projectionContext,committedHistory.map(m=>[m.id,m.content])]),messages:[...prompt.messages,{role:'assistant',content:requestOutput}]};
   await owns();if(!store.saveOutput(assistantId,output))throw new Error('生成已停止');
   await send({type:'candidates_pending',messageId:assistantId});
   candidateStartedAt=Date.now();candidateOutcome='generating';
   try{
    const synopsisOptions={contextTokens:conversation.contextTokens,inputRatio:capability.inputRatio,infer:async(messages:PromptMessage[])=>{
     await owns();synopsisRequests++;modelRequests++;synopsisGatewayLogId=null;const started=Date.now(),observations=new InferenceMetrics();
     try{const result=await summarizeWithModel(env,username,requestId,opts,messages,abort.signal,(event,logId)=>{observations.observe(event);synopsisGatewayLogId=logId;const value=event as {model?:unknown};if(typeof value.model==='string')synopsisModel=value.model;});await owns();return result;}finally{synopsisElapsedMs+=Date.now()-started;synopsisMetrics=observations.snapshot();}
    }};
    const overview=await prepareSynopsis(committedHistory,store.synopsis(),conversation.summary?JSON.stringify(conversation.summary):null,synopsisOptions);
    synopsisSource=overview.source;synopsisCovered=overview.summary?.covered.length??0;
    if(overview.summary){await owns();if(!store.saveSynopsis(assistantId,overview.summary))throw Error('生成已停止');}
    director=new DirectorAgent(JSON.parse(row.character_json),opts,agent.state,committedHistory,synopsisOptions.contextTokens,capability.inputRatio,overview.summary?.text??'');
    directorStartedAt=Date.now();candidates=await director.run(async messages=>{
     const options=roleplayGatewayOptions(env,username,requestId);modelRequests++;
     const response=await env.AI.gateway(env.AIG_GATEWAY_ID).run({provider:'compat',endpoint:'chat/completions',headers:{...options.extraHeaders,'Content-Type':'application/json'},query:{model:'dynamic/rp',messages,response_format:DIRECTOR_RESPONSE_FORMAT,stream:true,...modelInput({...opts,thinkingEnabled:false})}},{gateway:options.gateway,signal:abort.signal});
     if(!(response instanceof Response))throw Error('Director非响应');director!.gatewayLogId=response.headers.get('cf-aig-log-id');
     if(!response.ok){const limit=await inspectLimit(response,env,capability);if(limit)throw new DirectorContextError(limit);throw Error('Director上游错误');}
     return response;
    },abort.signal,owns,synopsisOptions);
    candidateOutcome=director.outcome;candidateFirstAt=director.firstAt;model=director.model||model;gatewayLogId=director.gatewayLogId;metrics=director.metrics;
   }catch(error){if(abort.signal.aborted)throw error;candidateOutcome='error';}
   candidateFinishedAt=Date.now();
   break;
   }
  }catch{if(candidateStartedAt!==null)candidateOutcome=abort.signal.aborted?abortReason:'error';if(abort.signal.aborted)finishReason=abortReason;else if(finishReason==='stop')finishReason='upstream';status=['stopped','disconnected','timeout'].includes(finishReason)?'aborted':'error';failure=generationNotice(finishReason);}
  finally{
   if(candidateStartedAt!==null)candidateFinishedAt??=Date.now();
   if(director)candidateFirstAt=director.firstAt;
   const phaseMetrics=director?.requests?director.metrics.snapshot():synopsisRequests?synopsisMetrics:metrics.snapshot();
   if(director?.requests){gatewayLogId=director.gatewayLogId;model=director.model;}else if(synopsisRequests){gatewayLogId=synopsisGatewayLogId;model=synopsisModel;}
   finishing=true;clearInterval(stopWatcher);
   if(!parserFinished)output+=parser.finish().body;
   request.signal.removeEventListener('abort',onDisconnect);
   try{
    const saved=store.finish(assistantId,output,status,finishReason,candidates,agent.state,storyProjection);await onSettled(assistantId);
    console.info('tavern-generation-outcome',{messageId:assistantId,requestId,gatewayLogId,finishReason:saved?.finish_reason,status:saved?.status,model,modelRequests,metricsScope:director?.requests?'last-candidate-request':synopsisRequests?'last-synopsis-request':'last-body-request',...phaseMetrics,firstBodyMs:firstBodyAt===null?null:firstBodyAt-started,modelFirstBodyMs:firstBodyAt===null||firstModelStarted===null?null:firstBodyAt-firstModelStarted,promptBudget:prompt.budget,estimatedInputTokens:prompt.estimatedTokens,chars:output.length,bodyModel,bodyGatewayLogId,bodyRequests,candidateRequests:director?.requests??0,synopsisRequests,synopsisSource,synopsisCovered,synopsisMetricsScope:'last-synopsis-request',synopsisMetrics,synopsisGatewayLogId,synopsisElapsedMs,directorFirstMs:candidateFirstAt===null||directorStartedAt===null?null:candidateFirstAt-directorStartedAt,bodyMetricsScope:'last-body-request',bodyMetrics,bodyCompleteMs:bodyFinishedAt===null?null:bodyFinishedAt-started,candidateFirstMs:candidateFirstAt===null||candidateStartedAt===null?null:candidateFirstAt-candidateStartedAt,candidateElapsedMs:candidateFinishedAt===null||candidateStartedAt===null?null:candidateFinishedAt-candidateStartedAt,directorContextRebuilds:director?.rebuilds??0,directorEstimatedInputTokens:director?.prompt().estimatedTokens??null,directorIncludedMessages:director?.prompt().includedMessages??null,directorStoryCondensed:director?.prompt().condensed??false,candidateOutcome,candidateCount:saved?.candidates_json?JSON.parse(saved.candidates_json).length:0,elapsedMs:Date.now()-started});
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
