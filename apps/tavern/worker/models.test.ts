import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { capabilities, modelInput, recordFeedback, verifiedRoute, modelOptions, type Capability } from './models';
import { DEFAULT_SETTINGS } from '../shared/types';
import { explicitContextLimit } from './generation';
const model='@cf/google/gemma-4-26b-a4b-it';
function route(version='v1',retries=0) { return {name:'rp',deployment:{version_id:version},version:{version_id:version,data:[{id:'START',type:'start',outputs:{next:{elementId:'m'}}},{id:'m',type:'model',outputs:{success:{elementId:'END'},fallback:{elementId:'END'}},properties:{provider:'workers-ai',model,retries,timeout:170000}},{id:'END',type:'end',outputs:{}}]}}; }
const schema={input:{oneOf:[{properties:{chat_template_kwargs:{properties:{enable_thinking:{type:'boolean'}}},top_p:{type:'number'},frequency_penalty:{type:'number'},presence_penalty:{type:'number'}}}]}};
let db:DatabaseSync,env:Env & {TAVERN_AI_CAPABILITIES_TOKEN:string},window:number,version:string;
function stmt(sql:string,values:unknown[]=[]):D1PreparedStatement {return {bind:(...v:unknown[])=>stmt(sql,v),first:async()=>db.prepare(sql).get(...values as never[])??null,run:async()=>{db.prepare(sql).run(...values as never[]);return {meta:{changes:1}};}} as D1PreparedStatement;}
beforeEach(()=>{db=new DatabaseSync(':memory:');db.exec('CREATE TABLE model_capabilities(id TEXT PRIMARY KEY,value_json TEXT,expires_at INTEGER)');window=16384;version='v1';env=Object.assign({} as Env,{DB:{prepare:stmt},AI:{models:vi.fn(async()=>[{name:model,properties:[{property_id:'context_window',value:String(window)}]}])},AIG_GATEWAY_ID:'default',TAVERN_AI_CAPABILITIES_TOKEN:'fake-test-token'});vi.stubGlobal('fetch',vi.fn(async(input:unknown)=>Response.json({success:true,result:String(input).includes('/routes/')?route(version):schema})));});
afterEach(()=>{db.close();vi.unstubAllGlobals();});
it('reads authoritative 16K/32K limits, caches and invalidates on route version change',async()=>{
 expect((await capabilities(env)).contextTokens).toBe(16384);expect(fetch).toHaveBeenCalledTimes(2);await capabilities(env);expect(fetch).toHaveBeenCalledTimes(2);
 window=32768;version='v2';db.exec('UPDATE model_capabilities SET expires_at=0');const c=await capabilities(env);expect(c).toMatchObject({version:'v2',contextTokens:32768,source:'workers-ai:context_window',thinking:true,topK:false});
});
it('maps default thinking off and enabled thinking explicitly; omits unsupported Top K',async()=>{
 const c=await capabilities(env);expect(modelInput(DEFAULT_SETTINGS,c)).toMatchObject({top_p:1,chat_template_kwargs:{enable_thinking:false},frequency_penalty:0,presence_penalty:0});expect(modelInput({...DEFAULT_SETTINGS,thinkingEnabled:true},c).chat_template_kwargs.enable_thinking).toBe(true);expect(modelInput(DEFAULT_SETTINGS,c)).not.toHaveProperty('top_k');expect(()=>modelInput({...DEFAULT_SETTINGS,topK:20},c)).toThrow('Top K');
});
it('returns unknown rather than inventing capacity when capabilities cannot be read',async()=>{
 vi.mocked(fetch).mockResolvedValue(new Response('',{status:403}));expect(await modelOptions(env)).toMatchObject([{available:false,contextTokens:null}]);expect(await capabilities(env).catch(e=>e.status)).toBe(503);
});
it('fails closed on changed provider, retries, undeployed versions or unverified thinking schema',async()=>{
 expect(()=>verifiedRoute(route('v1',3))).toThrow('单次');const changed=route();changed.version.data[1].properties!.model='unknown';expect(()=>verifiedRoute(changed)).toThrow('变更');const stale=route();stale.deployment.version_id='old';expect(()=>verifiedRoute(stale)).toThrow();
 vi.mocked(fetch).mockImplementation(async(input:unknown)=>Response.json({success:true,result:String(input).includes('/routes/')?route():{input:{properties:{chat_template_kwargs:{type:'object'},top_p:{type:'number'}}}}}));await expect(capabilities(env)).rejects.toThrow('参数能力');
});
it('accepts only explicit lower limits and model-attributed usage; late feedback preserves newer caps',async()=>{
 const c=await capabilities(env);expect(explicitContextLimit('maximum context length is 8192 tokens')).toBe(8192);expect(explicitContextLimit('you used 8192 prompt tokens')).toBeUndefined();expect(explicitContextLimit('max_model_len: 16384')).toBe(16384);
 await recordFeedback(env,c,{model:'wrong',contextLimit:4096});expect((await capabilities(env)).contextTokens).toBe(16384);
 await recordFeedback(env,c,{model,contextLimit:8192});await recordFeedback(env,c,{model,contextLimit:12000});expect((await capabilities(env)).contextTokens).toBe(8192);
 await recordFeedback(env,c,{model,promptTokens:200,estimatedTokens:100});expect((await capabilities(env)).inputRatio).toBe(2.2);expect((await capabilities(env)).contextTokens).toBe(8192);
 version='v2';db.exec('UPDATE model_capabilities SET expires_at=0');await capabilities(env);await recordFeedback(env,c,{model,contextLimit:4096});expect((await capabilities(env)).contextTokens).toBe(16384);
});
it('validity expiry rechecks upstream without allowing larger usage to infer a window',async()=>{
 const c=await capabilities(env);await recordFeedback(env,c,{model,contextLimit:8192});db.exec('UPDATE model_capabilities SET expires_at=0');expect((await capabilities(env)).contextTokens).toBe(8192);
 window=0;db.exec('UPDATE model_capabilities SET expires_at=0');await expect(capabilities(env)).rejects.toThrow('上下文');
});
it('late capability refresh cannot replace a newer route version',async()=>{
 let release:()=>void=()=>{},reached:()=>void=()=>{};const waiting=new Promise<void>(r=>release=r),started=new Promise<void>(r=>reached=r);let count=0;
 vi.mocked(env.AI.models).mockImplementation(async()=>{if(++count===1){reached();await waiting;}return [{id:'test',source:1,name:model,description:'test',task:{id:'test',name:'Text Generation',description:''},tags:[],properties:[{property_id:'context_window',value:'16384'}]}];});
 const old=capabilities(env);await started;version='v2';expect((await capabilities(env)).version).toBe('v2');release();expect((await old).version).toBe('v2');expect((await capabilities(env)).version).toBe('v2');
});
it('structured error feedback requires an actual matching model in HTTP or SSE errors',async()=>{
 const {errorFeedback}=await import('./generation');const c=await capabilities(env);
 await errorFeedback(env,c,{error:{message:'maximum context length is 8192'}});expect((await capabilities(env)).contextTokens).toBe(16384);
 await errorFeedback(env,c,{model:'other',error:{message:'maximum context length is 8192'}});expect((await capabilities(env)).contextTokens).toBe(16384);
 await errorFeedback(env,c,{error:{model,message:'maximum context length is 8192'}});expect((await capabilities(env)).contextTokens).toBe(8192);
});
