import { it, expect } from 'vitest';
import { CandidateStream, candidateDelimiter, validateCandidates } from './candidates';
import { normalizeSettings } from './settings';
import { DEFAULT_SETTINGS } from './types';
import { buildPrompt } from './prompt';
import { parseBook } from './cards';
const card={name:'岚',description:'港城旅店主人',personality:'沉稳'};

it('adds generation defaults to historical snapshots and preserves identity and configured limits',()=>{
 const old={userName:'旧用户',persona:'北方人',systemPrompt:'继续故事',temperature:0.4,maxTokens:1024};
 expect(normalizeSettings(old)).toEqual({...DEFAULT_SETTINGS,...old});
 expect(normalizeSettings(old).thinkingEnabled).toBe(false);
});
it.each([{thinkingEnabled:'false'},{modelId:'dynamic/saki'},{topP:0},{topP:1.1},{topK:1.5},{frequencyPenalty:3},{presencePenalty:NaN},{maxTokens:128.2},{temperature:undefined}])('rejects explicit invalid settings %j', invalid=>{
 expect(()=>normalizeSettings({...DEFAULT_SETTINGS,...invalid})).toThrow();
});
it('holds delimiter across every possible chunk boundary and never emits the protocol',()=>{
 const marker=candidateDelimiter('nonce'); const wire='正文结束。'+marker+JSON.stringify({candidates:[' 去看看窗外。 ','问她叫什么？','去看看窗外。','坐下喝茶。','第五条']});
 for(let split=0;split<=wire.length;split++) {const parser=new CandidateStream(marker);const body=parser.push(wire.slice(0,split))+parser.push(wire.slice(split));const result=parser.finish();expect(body+result.body).toBe('正文结束。');expect(result.candidates).toEqual(['去看看窗外。','问她叫什么？','坐下喝茶。']);}
 const parser=new CandidateStream(marker);let body='';for(const c of wire)body+=parser.push(c);expect(body+parser.finish().body).toBe('正文结束。');
});
it('keeps story with no tail, rejects oversized or malformed tails and partial markers',()=>{
 for(const tail of ['{"candidates":',JSON.stringify({candidates:['中'.repeat(1000)]}),'null','[]']){const p=new CandidateStream(candidateDelimiter('n'));expect(p.push('正文'+candidateDelimiter('n')+tail)).toBe('正文');expect(p.finish().candidates).toEqual([]);}
 const p=new CandidateStream(candidateDelimiter('n'));expect(p.push('正文。\n')).toBe('正文。');expect(p.finish().body).toBe('\n');
 for(let n=2;n<candidateDelimiter('n').length;n++){const p=new CandidateStream(candidateDelimiter('n'));expect(p.push('正文'+candidateDelimiter('n').slice(0,n))).toBe('正文');expect(p.finish()).toEqual({body:'',candidates:[]});}
});
it('validates Unicode length, rejects controls, deduplicates and caps candidates',()=>{
 expect(validateCandidates([null,3,' ','😀'.repeat(121),'\u0000坏数据','😀'.repeat(120),'可以走走。','可以走走。','可以问问。','第四条'])).toEqual(['😀'.repeat(120),'可以走走。','可以问问。']);
});
it.each([16384,32768])('fits %i context and preserves latest complete turn before optional worldbook', window=>{
 const book=parseBook({name:'书',token_budget:window,entries:[{constant:true,content:'世'.repeat(window),enabled:true}]});
 const latest={id:'latest',role:'user' as const,content:'这轮不要丢',status:'completed' as const,ordinal:1,requestId:null,createdAt:0,candidates:['不进入prompt']};
 const previous=[{...latest,id:'earlier-user',content:'上一轮的问题',ordinal:0},{...latest,id:'earlier-reply',role:'assistant' as const,content:'上一轮的回答',ordinal:1}];
 const prompt=buildPrompt(card,[book],[...previous,latest],DEFAULT_SETTINGS,window,'',{protocol:'候选协议',inputRatio:1.2});
 expect(prompt.messages.some(m=>m.content==='这轮不要丢')).toBe(true);expect(prompt.messages.some(m=>m.content==='上一轮的问题')).toBe(true);expect(prompt.messages.some(m=>m.content==='上一轮的回答')).toBe(true);expect(prompt.estimatedTokens+4096+512).toBeLessThanOrEqual(window);expect(prompt.messages.map(m=>m.content).join('')).not.toContain('不进入prompt');
});
