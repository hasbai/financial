import { object, string, strings } from '../shared/cards';
import type { Discovery } from '../shared/types';
import { HttpError, sourceFetch, sourceJson } from './http';
export const DATASET = 'G-reen/TheatreLM-v2.1-Characters';
export async function discover(env:Env, source: string, query: string, page: number): Promise<Discovery> {
  if (source === 'theatrelm') {
    const release=await env.DB.prepare('SELECT revision,count FROM source_releases WHERE source=?').bind(source).first<{revision:string;count:number}>();
    if(!release)throw new HttpError(503,'角色目录尚未同步');
    const pattern='%'+query.replace(/[\\%_]/g,c=>'\\'+c)+'%';
    const where="source=? AND revision=? AND (name LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')";
    const params=[source,release.revision,pattern,pattern];
    const total=await env.DB.prepare('SELECT COUNT(*) AS count FROM source_catalog WHERE '+where).bind(...params).first<{count:number}>();
    const data=await env.DB.prepare('SELECT source_id,name,description,creator,tags_json,source_url FROM source_catalog WHERE '+where+' ORDER BY name,source_id LIMIT 12 OFFSET ?').bind(...params,(page-1)*12).all<{source_id:string;name:string;description:string;creator:string;tags_json:string;source_url:string}>();
    return {source,page,hasMore:(total?.count??0)>page*12,results:data.results.map(r=>({id:release.revision+':'+r.source_id,name:r.name,description:r.description,creator:r.creator,tags:JSON.parse(r.tags_json),source,sourceUrl:r.source_url}))};
  }
  if (source === 'chub') {
    const u = new URL('https://api.chub.ai/search'); u.search = new URLSearchParams({search:query,first:'12',page:String(page),nsfw:'false',venus:'true',sort:'last_activity_at'}).toString();
    const data = await sourceJson(u), nested = data.data ? object(data.data) : data;
    if (!Array.isArray(nested.nodes)) throw new HttpError(502, 'Chub 响应格式已变化');
    return { source, page, hasMore: nested.nodes.length === 12, results: nested.nodes.map(v => { const n = object(v), x = n.node ? object(n.node) : n; const id = string(x.fullPath); return { id, name:string(x.name), description:string(x.tagline).slice(0,350), creator:id.split('/')[0], tags:strings(x.topics), source, sourceUrl:'https://chub.ai/characters/'+id }; }).filter(r => /^[\w.-]+\/[\w.-]+$/.test(r.id)) };
  }
  throw new HttpError(400, '不支持的角色来源');
}
export async function download(env:Env, source: string, id: string): Promise<{bytes:Uint8Array; filename:string; sourceUrl:string}> {
  if (source === 'theatrelm') {
    const match=id.match(/^([a-f0-9]{40}):(\d{1,6})$/);if(!match)throw new HttpError(400,'角色 ID 无效');
    const record=await env.DB.prepare('SELECT name,card_json,source_url FROM source_catalog WHERE source=? AND revision=? AND source_id=?').bind(source,match[1],match[2]).first<{name:string;card_json:string;source_url:string}>();
    if(!record)throw new HttpError(404,'角色不存在');
    return {bytes:new TextEncoder().encode(record.card_json),filename:record.name+'.json',sourceUrl:record.source_url};
  }
  if (source === 'chub') {
    if (!/^[\w.-]+\/[\w.-]+$/.test(id)) throw new HttpError(400, '角色 ID 无效');
    const path = id.split('/').map(encodeURIComponent).join('/');
    return { bytes:await sourceFetch(new URL(`https://avatars.charhub.io/avatars/${path}/chara_card_v2.png`)), filename:id.split('/')[1]+'.png', sourceUrl:'https://chub.ai/characters/'+id };
  }
  throw new HttpError(400, '不支持的角色来源');
}
