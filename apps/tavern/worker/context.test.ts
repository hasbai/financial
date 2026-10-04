import { expect, it, vi } from 'vitest';
import { ConversationContext, SummaryRetry, validSummary, summarizeWithModel } from './context';
import { DEFAULT_SETTINGS, type Message } from '../shared/types';
import type {PromptMessage} from '../shared/prompt';
const card={name:'岚',description:'旅店主人'};
const message=(id:string,role:Message['role'],content:string):Message=>({id,role,content,status:'completed',ordinal:0,requestId:null,createdAt:0});
const options={protocol:'',formatReminder:'',inputRatio:1.2};
it('compresses explicitly marked story fragments without ever summarizing long candidate actions',async()=>{
 const infer=vi.fn(async()=> '已确认抵达港口。');const c=new ConversationContext([message('u','user','出发')],card,[],DEFAULT_SETTINGS,2048,options,infer);c.appendOutput(message('out','assistant',''),'正文'.repeat(3000),false);
 const story=c.storyFragment('正文'.repeat(3000)),candidate='未来候选行动'.repeat(2000),suffix:PromptMessage[]=[{role:'tool',tool_call_id:'call',content:'{"ok":true}'},story,{role:'assistant',content:candidate}];
 await c.compressProjection(suffix);expect(story.content).toContain('已发生正文摘要');expect(suffix.at(-1)?.content).toBe(candidate);expect(infer.mock.calls.every(args=>!JSON.stringify(args).includes('未来候选行动'))).toBe(true);
});
it('does not summarize below discovered capacity or when unknown, and checkpoints overflow without editing source',async()=>{
 const history=[message('u','user','中'.repeat(1800)),message('a','assistant','未承诺出发。'.repeat(400)),message('new','user','现在呢？')],before=JSON.stringify(history);
 const infer=vi.fn(async()=>'此前未承诺出发。');const c=new ConversationContext(structuredClone(history),card,[],DEFAULT_SETTINGS,null,options,infer);
 await c.fit();expect(infer).not.toHaveBeenCalled();c.contextTokens=65536;await c.fit();expect(infer).not.toHaveBeenCalled();c.contextTokens=4096;await c.fit();expect(infer).toHaveBeenCalled();expect(c.prompt().needsCompression).toBe(false);expect(c.prompt().messages.at(-1)?.content).toBe('现在呢？');expect(JSON.stringify(history)).toBe(before);
 expect(await validSummary(JSON.stringify(c.summary),history)).toEqual(c.summary);
 expect(await validSummary(JSON.stringify(c.summary),[{...history[0],id:'different'},...history.slice(1)])).toBeNull();expect(await validSummary(JSON.stringify(c.summary),[{...history[0],content:'更正'},...history.slice(1)])).toBeNull();
 const next=new ConversationContext([...history,message('later','assistant','新回复')],card,[],DEFAULT_SETTINGS,4096,options,infer);await next.restore(JSON.stringify(c.summary));infer.mockClear();await next.fit();expect(infer).not.toHaveBeenCalled();
});
it('splits summary sources on their own context feedback and length, without unchanged retry',async()=>{
 const infer=vi.fn(async(messages:{content:string}[])=>{const chars=messages.slice(1).reduce((n,m)=>n+m.content.length,0);if(chars>600)throw new SummaryRetry(1024);return '事实';});
 const c=new ConversationContext([message('u','user','中'.repeat(2400)),message('a','assistant','否定'.repeat(1000)),message('n','user','后来')],card,[],DEFAULT_SETTINGS,4096,options,infer);
 await c.fit();expect(c.prompt().needsCompression).toBe(false);expect(c.contextTokens).toBe(1024);expect(infer).toHaveBeenCalled();
 expect(infer.mock.calls.filter(([m])=>m.slice(1).reduce((n,x)=>n+x.content.length,0)>600).length).toBeGreaterThan(0);
});
it('compresses generated projection while keeping the full reply outside persistent checkpoints',async()=>{
 const c=new ConversationContext([message('u','user','开始')],card,[],DEFAULT_SETTINGS,1024,options,async()=>'已发生事实');c.appendOutput(message('out','assistant',''),'中'.repeat(2000),false);
 await c.fit('继续');expect(c.summary).toBeNull();expect(c.prompt('继续').needsCompression).toBe(false);c.appendOutput(message('out','assistant',''),'接着写',false);expect(c.history.at(-1)?.content.endsWith('接着写')).toBe(true);
});
it('keeps a previous checkpoint intact when summarization fails',async()=>{
 const c=new ConversationContext([message('u','user','中'.repeat(2000)),message('a','assistant','答'.repeat(2000)),message('n','user','后来')],card,[],DEFAULT_SETTINGS,4096,options,async()=>{throw new Error('failed');});const original=JSON.stringify(c.history);await expect(c.fit()).rejects.toThrow('failed');expect(c.summary).toBeNull();expect(JSON.stringify(c.history)).toBe(original);
});
it('propagates upstream capacity and length to the summary compressor and cancels on stop',async()=>{
 const run=vi.fn();const env={AI:{gateway:()=>({run})},AIG_GATEWAY_ID:'default'} as unknown as Env;const signal=new AbortController();
 run.mockResolvedValueOnce(Response.json({error:{message:'maximum context length is 2048 tokens'}},{status:400}));await expect(summarizeWithModel(env,'用户名','request',DEFAULT_SETTINGS,[],signal.signal)).rejects.toMatchObject({contextTokens:2048});
 run.mockResolvedValueOnce(new Response('data: {"choices":[{"delta":{"content":"摘要"},"finish_reason":"length"}]}\n\ndata: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}}));await expect(summarizeWithModel(env,'用户名','request',DEFAULT_SETTINGS,[],signal.signal)).rejects.toBeInstanceOf(SummaryRetry);
 const cancel=vi.fn();run.mockResolvedValueOnce(new Response(new ReadableStream({cancel}),{headers:{'Content-Type':'text/event-stream'}}));const pending=summarizeWithModel(env,'用户名','request',DEFAULT_SETTINGS,[],signal.signal);await Promise.resolve();signal.abort();await expect(pending).rejects.toThrow();expect(cancel).toHaveBeenCalled();
});
it('shrinks existing memory when a single-character addition still cannot complete a summary',async()=>{
 const infer=vi.fn(async(messages:{content:string}[])=>{const previous=messages.find(m=>m.content.startsWith('已有记忆：'))?.content??'';if(previous.length>60)throw new SummaryRetry();return '事实';});
 const c=new ConversationContext([message('u','user','长历史'.repeat(600)),message('a','assistant','旧回复'.repeat(600)),message('n','user','后来')],card,[],DEFAULT_SETTINGS,1024,options,infer);
 // A valid existing source checkpoint near the summary model's actual completion boundary.
 const seedContext=new ConversationContext([message('s','user','源'.repeat(1000)),message('n','user','新')],card,[],DEFAULT_SETTINGS,1024,options,async()=>'记忆'.repeat(100));await seedContext.compress();
 c.summary={...seedContext.summary!,covered:[],text:'记忆'.repeat(100)};await c.compress();expect(c.summary?.text).toBe('事实');expect(infer).toHaveBeenCalled();
});

it('presents assistant history as source data in a user message instead of continuing that assistant',async()=>{
 const infer=vi.fn(async(_messages:{role:string;content:string}[])=> '尚未出港。');const c=new ConversationContext([message('g','assistant','旧角色正文'.repeat(900)),message('u','user','后来呢')],card,[],DEFAULT_SETTINGS,1024,options,infer);await c.fit();
 const messages=infer.mock.calls[0]?.[0] as {role:string;content:string}[]|undefined;expect(messages?.map(m=>m.role)).toEqual(['system','user']);expect(messages?.at(-1)?.content).toContain('角色：旧角色正文');expect(messages?.at(-1)?.content).toContain('请压缩以上会话。');
});

it('estimates temporary candidate suffixes while excluding them from summary facts',async()=>{
 const sources:string[]=[];const c=new ConversationContext([message('old','user','旧问题'.repeat(1200)),message('reply','assistant','旧事实'.repeat(1200)),message('current','user','现在')],card,[],DEFAULT_SETTINGS,16384,{protocol:'',formatReminder:'只写正文',inputRatio:1.2},async messages=>{sources.push(JSON.stringify(messages));return '旧事';});
 const first=await c.fit();const before=JSON.stringify(first.messages);c.appendOutput(message('body','assistant',''),'正文已经完成。',false);const suffix=[{role:'user' as const,content:'给候选'},{role:'assistant' as const,content:'将来我乘船离开。'},{role:'user' as const,content:'接着给候选'}];const frozen=c.extend(first,[{role:'assistant',content:'正文已经完成。'},...suffix]);expect(JSON.stringify(first.messages)).toBe(before);expect(frozen.messages.slice(0,first.messages.length)).toEqual(first.messages);c.contextTokens=4096;const fitted=await c.fit('',{protocol:'',formatReminder:''},suffix);expect(fitted.needsCompression).toBe(false);expect(fitted.messages.slice(-3)).toEqual(suffix);expect(sources.length).toBeGreaterThan(0);expect(sources.join('')).not.toContain('将来我乘船离开');expect(c.history.at(-1)?.content).toBe('正文已经完成。');
});
