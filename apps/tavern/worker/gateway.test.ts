import {it,expect,vi} from 'vitest';
import {runRoleplay} from './gateway';
it.each([200,400])('retains the raw %i response, body and headers with the complete native request',async status=>{
 const response=new Response(status===200?'data: [DONE]\n\n':'{"error":{"n_ctx":2048}}',{status,headers:{'Content-Type':status===200?'text/event-stream':'application/json','cf-aig-log-id':'phase-log'}});
 const run=vi.fn().mockResolvedValue(response),env={AI:{run},AIG_GATEWAY_ID:'default'} as unknown as Env,signal=new AbortController().signal;
 const input={messages:[{role:'user',content:'你好'}],tools:[{type:'function',function:{name:'tool',parameters:{type:'object'}}}],tool_choice:'auto',stream:true,temperature:.9,top_k:100,chat_template_kwargs:{enable_thinking:false},reasoning_effort:'none',reasoning_format:'deepseek',cache_prompt:true};
 expect(await runRoleplay(env,'用户名','request-id',input,signal)).toBe(response);expect(response.bodyUsed).toBe(false);
 expect(run).toHaveBeenCalledExactlyOnceWith('dynamic/rp',input,{returnRawResponse:true,signal,gateway:{id:'default',skipCache:true,collectLog:true,eventId:'request-id',retries:{maxAttempts:1},metadata:{app:'tavern',task:'roleplay',username:'用户名'}},extraHeaders:{'cf-aig-collect-log-payload':'true','cf-aig-event-id':'request-id','cf-aig-max-attempts':'1'}});
 expect(response.headers.get('cf-aig-log-id')).toBe('phase-log');
});
it('propagates binding rejection and cancellation without retry or a fallback route',async()=>{
 const abort=new AbortController(),run=vi.fn((_model:string,_input:unknown,options:AiOptions)=>new Promise((_,reject)=>options.signal!.addEventListener('abort',()=>reject(Error('aborted')),{once:true}))),env={AI:{run},AIG_GATEWAY_ID:'default'} as unknown as Env;
 const pending=runRoleplay(env,'用户名','request-id',{messages:[],stream:true},abort.signal);abort.abort();await expect(pending).rejects.toThrow('aborted');expect(run).toHaveBeenCalledTimes(1);
});
