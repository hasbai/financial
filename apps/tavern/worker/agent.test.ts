import {it,expect} from 'vitest';
import {AgentTurn,emptyState,patchState,searchMemory,stableJson,storyMessages,ToolCallStream} from './agent';
import type {Message} from '../shared/types';
const m=(id:string,ordinal:number,content:string,status:Message['status']='completed'):Message=>({id,ordinal,content,status,role:'assistant',requestId:null,createdAt:ordinal});
it('validates bounded state patches, preserves omissions and supports deletion without prototype writes',()=>{
 const state=patchState(emptyState(),{scene:'北港',facts:{钥匙:'岚持有'},inventory:{金币:'三枚'}});
 expect(patchState(state,{facts:{钥匙:null}})).toEqual({...state,facts:{}});expect(state.facts.钥匙).toBe('岚持有');
 for(const value of [{future:{}},{scene:1},{facts:{a:[]}},JSON.parse('{"facts":{"__proto__":"x"}}'),{scene:'字'.repeat(1001)}])expect(()=>patchState(state,value)).toThrow();
 expect(stableJson({z:1,a:{b:2,a:3}})).toBe('{"a":{"a":3,"b":2},"z":1}');
});
it('searches Chinese partial terms with version anchors, corrections and no invented hits',()=>{
 const history=[m('old',0,'钥匙在岚手中。'),m('stale',1,'我们去了灯塔。'),m('new',1,'更正：没有去灯塔，钥匙已经交给旅人。'),m('failed',2,'钥匙送给船长。','error')];
 expect(storyMessages(history).map(x=>x.id)).toEqual(['old','new']);
 const hits=searchMemory(history,'钥匙 灯塔');expect(hits.map(x=>x.id)).toEqual(['old','new']);expect(hits[1].text).toContain('更正：没有');expect(hits[1].source.messageId).toBe('new');expect(searchMemory(history,'南极企鹅')).toEqual([]);
 expect(searchMemory([m('c',0,'北境港城正在下雨')],'港城天气')[0].id).toBe('c');
});
it('assembles chunked tool calls, rejects malformed indices and incomplete identity',()=>{
 const stream=new ToolCallStream();stream.push([{index:0,id:'c',type:'function',function:{name:'update_',arguments:'{"patch":'}}]);stream.push([{index:0,function:{name:'state',arguments:'{"scene":"港口"}}'}}]);expect(stream.finish()[0].function).toEqual({name:'update_state',arguments:'{"patch":{"scene":"港口"}}'});
 expect(()=>new ToolCallStream().push([{index:9}])).toThrow();const partial=new ToolCallStream();partial.push([{index:0,function:{name:'update_state'}}]);expect(()=>partial.finish()).toThrow();
});
it('stages native state and memory results without changing the before snapshot or accepting repeated calls',()=>{
 const before=emptyState(),turn=new AgentTurn(before,[m('old',0,'铜钥匙还在岚手中')]);
 const update={id:'u',type:'function' as const,function:{name:'update_state',arguments:'{"patch":{"scene":"旅店"}}'}};
 expect(turn.execute([update])[0]).toMatchObject({role:'tool',tool_call_id:'u',content:'{"ok":true}'});expect(before.scene).toBeNull();expect(turn.state.scene).toBe('旅店');
 const result=turn.execute([{id:'s',type:'function',function:{name:'search_memory',arguments:'{"query":"钥匙"}'}}]);expect(result[0].content).toContain('"messageId":"old"');expect(()=>turn.execute([update])).toThrow('没有进展');
 expect(()=>new AgentTurn(emptyState(),[]).execute([{...update,function:{name:'update_state',arguments:'{"patch":{}}'}}])).toThrow('没有进展');
 expect(()=>turn.execute([{...update,function:{name:'fetch',arguments:'{"url":"https://example.com"}'}}])).toThrow('工具不存在');
});
it('allows one empty search result but stops consecutive different queries without new evidence',()=>{
 const turn=new AgentTurn(emptyState(),[]);const call=(query:string)=>({id:query,type:'function' as const,function:{name:'search_memory',arguments:JSON.stringify({query})}});
 expect(turn.execute([call('灯塔')])[0].content).toBe('[]');expect(()=>turn.execute([call('北港')])).toThrow('没有进展');
});
