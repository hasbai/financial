import { expect, it } from 'vitest';
import { buildPrompt, INPUT_TARGET_TOKENS } from './prompt';
import { DEFAULT_SETTINGS, type Message } from './types';
const card={name:'岚',description:'港城旅店主人',personality:'沉稳'};
const base:Message={id:'0',role:'user',content:'',status:'completed',ordinal:0,requestId:null,createdAt:0};

it.each([null, 16384, 32768, 65536])('bounds long input at %s, preserves recent complete turns and originals', window => {
 const history:Message[]=Array.from({length:60},(_,i)=>({...base,id:String(i),role:i%2?'assistant':'user',content:String(i)+'中'.repeat(500),ordinal:i}));
 history.push({...base,id:'current',ordinal:60,content:'当前输入'});const originals=JSON.stringify(history);
 const prompt=buildPrompt(card,[],history,DEFAULT_SETTINGS,window,'',{inputRatio:1.2});
 expect(prompt.estimatedTokens).toBeLessThanOrEqual(INPUT_TARGET_TOKENS);expect(prompt.budget.omittedMessages).toBeGreaterThan(0);
 expect(prompt.budget.planningContextTokens).toBe(Math.min(window??32768,32768));
 expect(prompt.budget.contextSource).toBe(window!==null&&window<=32768?'runtime':'user-declared');expect(prompt.budget.detectedContextTokens).toBe(window);
 expect(prompt.messages.slice(-3).map(m=>m.content)).toEqual(history.slice(-3).map(m=>m.content));expect(JSON.stringify(history)).toBe(originals);
 expect(prompt.budget.coreTokens+prompt.budget.worldbookTokens+prompt.budget.historyTokens+prompt.budget.requestTokens).toBe(prompt.estimatedTokens);
});
it('keeps the history block start stable between compactions, without orphaned replies', () => {
 const history:Message[]=Array.from({length:140},(_,i)=>({...base,id:String(i),role:i%2?'assistant':'user',content:String(i)+'中'.repeat(95),ordinal:i}));
 const start=(n:number)=>buildPrompt(card,[],history.slice(0,n),DEFAULT_SETTINGS,null).messages[1].content;
 const starts=Array.from({length:8},(_,i)=>start(121+i*2));
 expect(starts.slice(0,7)).toEqual(Array(7).fill(history[18].content));expect(starts[7]).toBe(history[36].content);
 const result=buildPrompt(card,[],history,DEFAULT_SETTINGS,null);expect(result.messages[1].role).toBe('user');
});
it('treats a turn larger than a history block as indivisible', () => {
 const h:Message[]=[{...base,content:'最早'}, {...base,role:'assistant',content:'早期回复'},
  {...base,content:'长问题'+'中'.repeat(6500)}, {...base,role:'assistant',content:'长回复'+'中'.repeat(6500)},
  {...base,content:'上一问'}, {...base,role:'assistant',content:'上一答'}, {...base,content:'当前问'}];
 const p=buildPrompt(card,[],h,DEFAULT_SETTINGS,null);
 expect(p.messages.slice(1).map(m=>m.content)).toEqual(['上一问','上一答','当前问']);
 expect(p.budget.omittedMessages).toBe(4);
});
it('lets required context exceed the soft target, rejects it above the declared or smaller runtime window', () => {
 const m={...base,content:'中'.repeat(13000)};const p=buildPrompt(card,[],[m],DEFAULT_SETTINGS,null);
 expect(p.estimatedTokens).toBeGreaterThan(INPUT_TARGET_TOKENS);expect(p.messages[1].content).toBe(m.content);
 expect(()=>buildPrompt(card,[],[m],DEFAULT_SETTINGS,8192)).toThrow('最新对话');
 expect(()=>buildPrompt(card,[],[{...m,content:'中'.repeat(32768)}],DEFAULT_SETTINGS,null)).toThrow('最新对话');
});
