import {it,expect,vi} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {parseBook} from '../shared/cards';
import {LoreIndex,loreChunks,cosine,embeddings} from './lore';
function source(text:string,id='b'){return {id,book:parseBook({entries:[{uid:1,key:['灯塔'],content:text,enabled:true},{uid:2,content:'私密无效条目',enabled:false},{uid:3,content:'@@script forbidden',enabled:true}]})};}
function sqlStorage(db:DatabaseSync){return {exec:(query:string,...values:SqlStorageValue[])=>{if(query.includes(';')){db.exec(query);return {toArray:()=>[]};}return {toArray:()=>db.prepare(query).all(...values as never[])};}} as SqlStorage;}
it('chunks only enabled declarative entries and binds immutable source versions',async()=>{const old=await loreChunks([source('灯塔坐落在东岸')]),next=await loreChunks([source('灯塔迁移到西岸')]);expect(old).toHaveLength(1);expect(old[0].revision).not.toBe(next[0].revision);expect(old[0].bookId).toBe('b');expect(old[0].entryId).toBeTruthy();});
it('retrieves Chinese keyword sources when vector service fails and removes old/unbound sources',async()=>{
 const db=new DatabaseSync(':memory:');try{const embed=vi.fn(async()=>{throw Error('unavailable');}),sql=sqlStorage(db);const first=new LoreIndex(sql,[source('灯塔只有东岸入口')],embed);expect((await first.search('灯塔入口'))[0]).toMatchObject({text:'灯塔只有东岸入口',source:{bookId:'b',revision:expect.any(String)}});
 const next=new LoreIndex(sql,[source('灯塔入口改为西岸','b2')],embed);expect((await next.search('灯塔'))[0].source.bookId).toBe('b2');expect(db.prepare("SELECT count(*) n FROM lore_chunks WHERE book_id='b'").get()?.n).toBe(0);expect(await next.search('完全无关的南极企鹅')).toEqual([]);
 }finally{db.close();}
});
it('bounds hung embedding requests and immediately respects outer cancellation',async()=>{
 vi.useFakeTimers();try{const env={AIG_GATEWAY_ID:'default',AI:{run:vi.fn(()=>new Promise(()=>{}))}} as unknown as Env;const pending=embeddings(env,['灯塔'],'test','r',new AbortController().signal);const rejected=expect(pending).rejects.toThrow('停止');await vi.advanceTimersByTimeAsync(10000);await rejected;
 const abort=new AbortController();const cancelled=embeddings(env,['灯塔'],'test','r',abort.signal);const checked=expect(cancelled).rejects.toThrow('停止');abort.abort();await checked;
 }finally{vi.useRealTimers();}
});
it('caches vectors per version, computes bounded semantic recall and refreshes only changed chunks',async()=>{
 const db=new DatabaseSync(':memory:');try{const embed=vi.fn(async(texts:string[])=>texts.map(()=>[1,0])),sql=sqlStorage(db),index=new LoreIndex(sql,[source('旧灯塔位于港口东岸')],embed);expect((await index.search('航标建筑'))).toHaveLength(1);expect(embed).toHaveBeenCalledTimes(2);await index.search('灯塔');expect(embed).toHaveBeenCalledTimes(3);expect(cosine([1,0],[1,0])).toBe(1);expect(cosine([1,0],[0,1])).toBe(0);
 }finally{db.close();}
});
it('limits one indexing batch and cleans the last unbound book',async()=>{const db=new DatabaseSync(':memory:');try{const embed=vi.fn(async(texts:string[])=>texts.map(()=>[1,0])),sql=sqlStorage(db),index=new LoreIndex(sql,[source('长文'.repeat(12000))],embed);await index.search('航标');expect(embed.mock.calls[0][0]).toHaveLength(8);expect(embed).toHaveBeenCalledTimes(2);const empty=new LoreIndex(sql,[],embed);expect(await empty.search('航标')).toEqual([]);expect(db.prepare('SELECT count(*) n FROM lore_chunks').get()?.n).toBe(0);}finally{db.close();}});
