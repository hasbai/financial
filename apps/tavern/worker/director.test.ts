import { it, expect, vi } from 'vitest';
import { DirectorAgent, directorChoices, DirectorContextError, DIRECTOR_RESPONSE_FORMAT, prepareSynopsis, validSynopsis } from './director';
import { DEFAULT_SETTINGS, type Message } from '../shared/types';
import { emptyState } from './agent';
const story=(ordinal:number,content:string,role:Message['role']='assistant'):Message=>({id:String(ordinal),role,content,ordinal,status:'completed',requestId:null,createdAt:ordinal});
const reply=(chunks:string[],reason='stop',extra:Record<string,unknown>={})=>new Response(chunks.map(content=>'data: '+JSON.stringify({choices:[{delta:{content,...extra}}]})+'\n\n').join('')+'data: '+JSON.stringify({choices:[{delta:{},finish_reason:reason}]})+'\n\ndata: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}});
it('uses only core card data, persona, current state and four recent story messages',()=>{
 const state=emptyState();state.scene='北港';const agent=new DirectorAgent({name:'岚',description:'{{char}}迎接{{user}}',personality:'沉稳',scenario:'港城',mes_example:'EXAMPLE_SENTINEL',first_mes:'FIRST_SENTINEL',creator_notes:'NOTES_SENTINEL',extensions:{script:'SCRIPT_SENTINEL'},character_book:{entries:[]}}, {...DEFAULT_SETTINGS,userName:'旅人',persona:'旅行者'},state,Array.from({length:20},(_,i)=>story(i,i<16?'OLD_SENTINEL':'新情节'+i)),32768);
 state.scene='未来';const prompt=agent.prompt();expect(prompt.messages.map(m=>m.role)).toEqual(['system','user']);const data=JSON.parse(prompt.messages[1].content);expect(data.state.scene).toBe('北港');expect(data.recentStory.map((m:{content:string})=>m.content)).toEqual(['新情节16','新情节17','新情节18','新情节19']);expect(data.character.description).toBe('岚迎接旅人');expect(data.user.persona).toBe('旅行者');expect(JSON.stringify(prompt)).not.toContain('SENTINEL');
});
it('keeps a long recent story intact until discovered capacity requires summarization',()=>{
 const history=[story(0,'旧'.repeat(1000)),story(1,'😀'.repeat(7000)+'结尾')],agent=new DirectorAgent({name:'岚'},DEFAULT_SETTINGS,emptyState(),history,null);const data=JSON.parse(agent.prompt().messages[1].content);expect(data.recentStory).toHaveLength(2);expect([...data.recentStory[1].content]).toHaveLength(7002);expect(agent.prompt().condensed).toBe(false);
});
it.each(['{"choices":["一","二"]}','{"choices":["一","二","三","四"]}','{"choices":["一"," 一 ","三"]}','{"choices":["","二","三"]}','{"choices":[1,"二","三"]}','{"choices":["一","二","三"],"extra":true}','```json\n{"choices":["一","二","三"]}\n```','一\n二\n三',JSON.stringify({choices:['😀'.repeat(121),'二','三']}),JSON.stringify({choices:['一\n段','二','三']})])('rejects invalid structured response: %s',text=>expect(()=>directorChoices(text)).toThrow());
it('accepts exactly three distinct bounded Unicode strings and trims whitespace',()=>{
 expect(directorChoices(JSON.stringify({choices:[' 一 ','😀'.repeat(120),'三']}))).toEqual(['一','😀'.repeat(120),'三']);expect(DIRECTOR_RESPONSE_FORMAT.json_schema.schema.properties.choices).toMatchObject({minItems:3,maxItems:3});
});
it('parses arbitrarily split JSON only after reliable stop, without exposing partial choices',async()=>{
 const agent=new DirectorAgent({name:'岚'},DEFAULT_SETTINGS,emptyState(),[story(0,'正文')],null),text=JSON.stringify({choices:['去港口。','坐下喝茶。','问问来路。']});expect(await agent.run(async()=>reply([...text]),new AbortController().signal,async()=>{})).toEqual(['去港口。','坐下喝茶。','问问来路。']);expect(agent.outcome).toBe('completed');
});
it.each(['length','tool_calls','content_filter',''])('discards all choices on %s',async reason=>{
 const agent=new DirectorAgent({name:'岚'},DEFAULT_SETTINGS,emptyState(),[story(0,'正文')],null),infer=vi.fn(async()=>reply([JSON.stringify({choices:['一','二','三']})],reason));expect(await agent.run(infer,new AbortController().signal,async()=>{})).toEqual([]);expect(infer).toHaveBeenCalledTimes(1);
});
it('shrinks only its own recent story on an explicit capacity error',async()=>{
 const history=[story(0,'过去的重要情节'),story(1,'最近'),story(2,'当前')],agent=new DirectorAgent({name:'岚'},DEFAULT_SETTINGS,emptyState(),history,null);let calls=0;const infer=vi.fn(async()=>{if(++calls===1)throw new DirectorContextError(4096);return reply(['{"choices":["一","二","三"]}']);});expect(await agent.run(infer,new AbortController().signal,async()=>{},{contextTokens:4096,inputRatio:1.2,infer:async()=> '旧事'})).toHaveLength(3);expect(agent.prompt().includedMessages).toBe(2);expect(history).toHaveLength(3);
});
it('never truncates core character data or state to hide a capacity failure',async()=>{
 const agent=new DirectorAgent({name:'岚',description:'设定'.repeat(3000)},DEFAULT_SETTINGS,emptyState(),[story(0,'情节')],1024),infer=vi.fn();expect(await agent.run(infer,new AbortController().signal,async()=>{})).toEqual([]);expect(infer).not.toHaveBeenCalled();expect(JSON.parse(agent.prompt().messages[1].content).character.description).toHaveLength(6000);
});
it('does not accept tool calls or refusal alongside valid JSON',async()=>{
 for(const extra of [{tool_calls:[{index:0}]},{refusal:'refused'}]){const agent=new DirectorAgent({name:'岚'},DEFAULT_SETTINGS,emptyState(),[story(0,'正文')],null);expect(await agent.run(async()=>reply(['{"choices":["一","二","三"]}'],'stop',extra),new AbortController().signal,async()=>{})).toEqual([]);}
});

it('builds overall synopsis without a body checkpoint and incrementally reuses verified source versions',async()=>{
 const history=Array.from({length:8},(_,i)=>story(i,'已发生情节第'+i+'，留下一个未决线索。'));
 const infer=vi.fn(async()=> '初期事件与未决线索。'),options={contextTokens:32768,inputRatio:1.2,infer};
 const initial=await prepareSynopsis(history,null,null,options);expect(initial.source).toBe('generated');expect(initial.summary?.covered).toEqual(['0','1','2','3']);expect(infer).toHaveBeenCalledTimes(1);
 infer.mockClear();const cached=await prepareSynopsis(history,JSON.stringify(initial.summary),null,options);expect(cached.source).toBe('cache');expect(infer).not.toHaveBeenCalled();
 const extended=await prepareSynopsis([...history,story(8,'继续发生情节'),story(9,'新的回应')],JSON.stringify(initial.summary),null,options);expect(extended.summary?.covered).toHaveLength(6);expect(infer).toHaveBeenCalledTimes(1);expect(JSON.stringify(infer.mock.calls)).not.toContain('已发生情节第0');
 const changed=structuredClone(history);changed[0].content='编辑后不同的剧情';expect(await validSynopsis(JSON.stringify(initial.summary),changed)).toBeNull();changed[0]=history[0];changed[0]={...changed[0],role:'user'};expect(await validSynopsis(JSON.stringify(initial.summary),changed)).toBeNull();
});
it('does not summarize a short conversation or include future recent content in synopsis',async()=>{
 const infer=vi.fn(async()=> '旧梗概');expect(await prepareSynopsis([story(0,'开始'),story(1,'继续')],null,null,{contextTokens:null,inputRatio:1.2,infer})).toEqual({summary:null,source:'recent-only'});expect(infer).not.toHaveBeenCalled();
});
it('builds a longer valid synopsis from a short old source without leaking permissive validation into compression',async()=>{
 const history=[story(0,'雨'),...Array.from({length:4},(_,i)=>story(i+1,'当前剧情'+i))],infer=vi.fn(async()=> '岚与旅人在雨夜相遇。'),options={contextTokens:null as number|null,inputRatio:1.2,infer};
 const prepared=await prepareSynopsis(history,null,null,options);expect(prepared.summary?.text).toBe('岚与旅人在雨夜相遇。');expect(options).not.toHaveProperty('requireReduction');
 const agent=new DirectorAgent({name:'岚'},DEFAULT_SETTINGS,emptyState(),history,null,1.2,prepared.summary?.text);expect(await agent.run(async()=>reply(['{"choices":["一","二","三"]}']),new AbortController().signal,async()=>{},options)).toHaveLength(3);
 infer.mockClear();expect((await prepareSynopsis(history,JSON.stringify(prepared.summary),null,options)).source).toBe('cache');expect(infer).not.toHaveBeenCalled();
});
it('preserves long recent facts via local synopsis compression instead of slicing away the opening',async()=>{
 const agent=new DirectorAgent({name:'岚'},{...DEFAULT_SETTINGS,systemPrompt:'保持剧情'},emptyState(),[story(0,'开头的重要约定。'+ '情节'.repeat(2000))],2048);const summarize=vi.fn(async()=> '开头的重要约定。简洁记忆。');expect(await agent.run(async()=>reply(['{"choices":["一","二","三"]}']),new AbortController().signal,async()=>{},{contextTokens:2048,inputRatio:1.2,infer:summarize})).toHaveLength(3);expect(agent.prompt().condensed).toBe(true);expect(JSON.stringify(agent.prompt())).toContain('开头的重要约定');expect(summarize).toHaveBeenCalled();
});
it('reuses a valid body checkpoint but refuses a checkpoint covering recent or changed versions',async()=>{
 const {fingerprint}=await import('./context');const history=Array.from({length:8},(_,i)=>story(i,'已发生的重要情节'+i));const body={text:'初期剧情。',covered:history.slice(0,4).map(m=>m.id),fingerprint:await fingerprint(history.slice(0,4))},infer=vi.fn(async()=> '重建梗概。');
 const seeded=await prepareSynopsis(history,null,JSON.stringify(body),{contextTokens:null,inputRatio:1.2,infer});expect(seeded.source).toBe('body-checkpoint');expect(infer).not.toHaveBeenCalled();expect(await validSynopsis(JSON.stringify(seeded.summary),history)).toMatchObject({text:'初期剧情。',version:1});
 const tooFar={...body,covered:history.slice(0,5).map(m=>m.id),fingerprint:await fingerprint(history.slice(0,5))};await prepareSynopsis(history,null,JSON.stringify(tooFar),{contextTokens:null,inputRatio:1.2,infer});expect(infer).toHaveBeenCalledTimes(1);
});

it('compresses a large existing synopsis before discarding the latest short story',async()=>{
 const agent=new DirectorAgent({name:'岚'},{...DEFAULT_SETTINGS,systemPrompt:'保持剧情'},emptyState(),[story(0,'最新的重要一句话。')],2048,1.2,'旧事件'.repeat(3000));const infer=vi.fn(async()=> '重要转折与未决线索。');expect(await agent.run(async()=>reply(['{"choices":["一","二","三"]}']),new AbortController().signal,async()=>{},{contextTokens:2048,inputRatio:1.2,infer})).toHaveLength(3);const data=JSON.parse(agent.prompt().messages[1].content);expect(data.synopsis).toBe('重要转折与未决线索。');expect(data.recentStory[0].content).toBe('最新的重要一句话。');
});
it('retains capacity learned while building synopsis for the following Director request',async()=>{
 const {SummaryRetry}=await import('./context');const history=Array.from({length:8},(_,i)=>story(i,'已发生重要情节'.repeat(20))),options={contextTokens:null as number|null,inputRatio:1.2,infer:vi.fn(async()=> '过去已发生约定。')};options.infer.mockRejectedValueOnce(new SummaryRetry(2048));const overview=await prepareSynopsis(history,null,null,options);expect(options.contextTokens).toBe(2048);const agent=new DirectorAgent({name:'岚'},DEFAULT_SETTINGS,emptyState(),history,options.contextTokens,1.2,overview.summary?.text);expect(agent.contextTokens).toBe(2048);
});
