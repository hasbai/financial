import { identity, authenticatedUsername, AuthError } from './auth';
import { body, boundedBody, HttpError, json } from './http';
import { discover, download } from './discovery';
import { generate } from './generation';
import { character, currentMessages, getMessages, getSession, installCard, jsonFile, ownedBooks, session, settings, userSettings, worldbook, type BookRow, type CharacterRow } from './store';
import { MAX_FILE_BYTES, object, parseBook, parseCard, string } from '../shared/cards';
import { macros } from '../shared/prompt';
import type { Message } from '../shared/types';
export default {
 async fetch(request:Request,env:Env,ctx:Pick<ExecutionContext,'waitUntil'>):Promise<Response> {
  const url=new URL(request.url),p=url.pathname,method=request.method;
  try {
   if(p==='/health')return json({ok:true,service:'tavern',version:env.VERSION.id});
   if(!p.startsWith('/api/'))return env.ASSETS.fetch(request);
   const user=await identity(request,env),owner=user.sub;
   if(method!=='GET' && request.headers.has('Origin') && request.headers.get('Origin')!==url.origin)throw new HttpError(403,'请求来源无效');
   if(p==='/api/settings'){
    if(method==='GET')return json(await userSettings(env,owner));
    if(method==='PUT'){const data=settings(await body(request));await env.DB.prepare('INSERT INTO settings(owner,settings_json) VALUES(?,?) ON CONFLICT(owner) DO UPDATE SET settings_json=excluded.settings_json').bind(owner,JSON.stringify(data)).run();return json(data);}
   }
   if(p==='/api/discover' && method==='GET'){
    const query=(url.searchParams.get('q')??'').trim();const page=Number(url.searchParams.get('page')??'1');
    if(query.length>150 || !Number.isInteger(page) || page<1 || page>10000)throw new HttpError(400,'搜索条件无效');
    const source=url.searchParams.get('source')??'chub',sort=url.searchParams.get('sort')??(source==='theatrelm'?'catalog':'popular');
    const tags=(url.searchParams.get('tags')??'').split(',').map(t=>t.trim()).filter(Boolean);
    if(tags.length>6||tags.some(t=>t.length>60))throw new HttpError(400,'分类条件无效');
    return json(await discover(env,source,query,page,sort,tags));
   }
   if(p==='/api/install' && method==='POST'){
    const d=await body(request),source=string(d.source),id=string(d.id),card=await download(env,source,id);
    return json(await installCard(env,owner,card.bytes,card.filename,source,card.sourceUrl,id),201);
   }
   if(p==='/api/characters'){
    if(method==='GET'){const rows=await env.DB.prepare('SELECT * FROM characters WHERE owner=? ORDER BY created_at DESC').bind(owner).all<CharacterRow>();return json({characters:rows.results.map(r=>character(r))});}
    if(method==='POST'){
     const bytes=await boundedBody(request,MAX_FILE_BYTES),filename=decodeURIComponent(request.headers.get('X-Filename')??'character.json');
     return json(await installCard(env,owner,bytes,filename),201);
    }
   }
   const char=p.match(/^\/api\/characters\/([^/]+)(?:\/(export|avatar))?$/);
   if(char){
    const row=await env.DB.prepare('SELECT * FROM characters WHERE owner=? AND id=?').bind(owner,char[1]).first<CharacterRow>();if(!row)throw new HttpError(404,'角色不存在');
    if(method==='GET'&&char[2]==='export'){
     if(url.searchParams.get('original')==='true'){const file=await env.FILES.get(row.original_key);if(!file)throw new HttpError(404,'原卡不存在');return new Response(file.body,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(row.original_filename)}`,'Cache-Control':'no-store'}});}
     return jsonFile(JSON.parse(row.card_json),row.name+'.json');
    }
    if(method==='GET'&&char[2]==='avatar'){
     if(!row.avatar_key)throw new HttpError(404,'头像不存在');const file=await env.FILES.get(row.avatar_key);if(!file)throw new HttpError(404,'头像不存在');return new Response(file.body,{headers:{'Content-Type':row.avatar_type??'image/png','Cache-Control':'private,max-age=300','X-Content-Type-Options':'nosniff'}});
    }
    if(!char[2]&&method==='GET')return json(character(row,true));
    if(!char[2]&&method==='PATCH'){
     const raw=object((await body(request)).card),c=parseCard(raw);const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(raw))))).map(n=>n.toString(16).padStart(2,'0')).join('');
     await env.DB.prepare('UPDATE characters SET name=?,description=?,creator=?,tags_json=?,card_json=?,format=?,content_hash=? WHERE owner=? AND id=?').bind(c.data.name,c.data.description.slice(0,350),c.data.creator,JSON.stringify(c.data.tags),JSON.stringify(raw),c.format,hash,owner,row.id).run();return json({...character(row,true),name:c.data.name,card:raw});
    }
    if(!char[2]&&method==='DELETE'){await env.DB.prepare('DELETE FROM characters WHERE owner=? AND id=?').bind(owner,row.id).run();await env.FILES.delete([row.original_key,...(row.avatar_key?[row.avatar_key]:[])]);return json({ok:true});}
   }
   if(p==='/api/worldbooks'){
    if(method==='GET'){const rows=await env.DB.prepare('SELECT * FROM worldbooks WHERE owner=? ORDER BY created_at DESC').bind(owner).all<BookRow>();return json({worldbooks:rows.results.map(worldbook)});}
    if(method==='POST'){const raw=object((await body(request)).raw),b=parseBook(raw),id=crypto.randomUUID();await env.DB.prepare('INSERT INTO worldbooks(id,owner,name,book_json,created_at) VALUES(?,?,?,?,?)').bind(id,owner,b.name,JSON.stringify(raw),Date.now()).run();return json({id,name:b.name,enabled:true,count:b.entries.length,raw,unsupported:b.unsupported},201);}
   }
   const book=p.match(/^\/api\/worldbooks\/([^/]+)(?:\/(export))?$/);
   if(book){
    const row=await env.DB.prepare('SELECT * FROM worldbooks WHERE owner=? AND id=?').bind(owner,book[1]).first<BookRow>();if(!row)throw new HttpError(404,'世界书不存在');
    if(method==='GET'&&book[2])return jsonFile(JSON.parse(row.book_json),row.name+'.json');
    if(!book[2]&&method==='PATCH'){const data=await body(request);if(data.enabled!==undefined&&typeof data.enabled!=='boolean')throw new HttpError(400,'状态无效');const raw=data.raw?object(data.raw):JSON.parse(row.book_json),b=parseBook(raw,row.name);await env.DB.prepare('UPDATE worldbooks SET name=?,book_json=?,enabled=? WHERE id=? AND owner=?').bind(b.name,JSON.stringify(raw),data.enabled===undefined?row.enabled:data.enabled?1:0,row.id,owner).run();return json(worldbook({...row,name:b.name,book_json:JSON.stringify(raw),enabled:data.enabled===undefined?row.enabled:data.enabled?1:0}));}
    if(!book[2]&&method==='DELETE'){const removed=await env.DB.prepare("DELETE FROM worldbooks WHERE id=? AND owner=? AND NOT EXISTS(SELECT 1 FROM sessions WHERE owner=? AND EXISTS(SELECT 1 FROM json_each(sessions.book_ids_json) WHERE value=?))").bind(row.id,owner,owner,row.id).run();if(!removed.meta.changes)throw new HttpError(409,'世界书仍有会话绑定');return json({ok:true});}
   }
   if(p==='/api/sessions'){
    if(method==='GET'){const rows=await env.DB.prepare('SELECT * FROM sessions WHERE owner=? ORDER BY updated_at DESC LIMIT 200').bind(owner).all<Parameters<typeof session>[0]>();return json({sessions:rows.results.map(r=>session(r))});}
    if(method==='POST'){
     const data=await body(request),c=await env.DB.prepare('SELECT * FROM characters WHERE id=? AND owner=?').bind(string(data.characterId),owner).first<CharacterRow>();if(!c)throw new HttpError(404,'角色不存在');
     const opts=await userSettings(env,owner),card=parseCard(JSON.parse(c.card_json)),greetings=[card.data.first_mes,...card.data.alternate_greetings];
     const greeting=Number(data.greeting??0);if(!Number.isInteger(greeting)||greeting<0||greeting>=greetings.length)throw new HttpError(400,'开场白无效');
     const id=crypto.randomUUID(),now=Date.now();
     await env.DB.batch([env.DB.prepare('INSERT INTO sessions(id,owner,title,character_json,character_name,settings_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').bind(id,owner,c.name,JSON.stringify(card.raw),c.name,JSON.stringify(opts),now,now),...(greetings[greeting]?[env.DB.prepare("INSERT INTO messages(id,session_id,role,content,status,ordinal,created_at) VALUES(?,?,'assistant',?,'completed',0,?)").bind(crypto.randomUUID(),id,macros(greetings[greeting],card.data.nickname||c.name,opts.userName),now)]:[])]);
     return json(session(await getSession(env,owner,id),true),201);
    }
   }
   const chat=p.match(/^\/api\/sessions\/([^/]+)(?:\/(generate|stop|fork|export))?$/);
   if(chat){
    const row=await getSession(env,owner,chat[1]);
    if(method==='POST'&&chat[2]==='generate'){const data=await body(request),username=authenticatedUsername(user);return await generate(request,env,ctx,owner,row.id,data,username);}
    if(method==='POST'&&chat[2]==='stop'){
     const data=await body(request);if(string(data.generationId)!==row.generation_id)throw new HttpError(409,'生成状态已改变');
     await env.DB.prepare("UPDATE messages SET status='aborted',finish_reason='stopped' WHERE session_id=? AND id=? AND status='pending'").bind(row.id,row.generation_id).run();return json({ok:true});
    }
    if(method==='GET'&&chat[2]==='export'){
     const messages=await getMessages(env,row.id);const lines=[{user_name:JSON.parse(row.settings_json).userName,character_name:row.character_name,create_date:new Date(row.created_at).toISOString()},...messages.map(m=>({name:m.role==='user'?JSON.parse(row.settings_json).userName:row.character_name,is_user:m.role==='user',is_system:false,send_date:new Date(m.createdAt).toISOString(),mes:m.content,extra:{tavern_status:m.status,tavern_finish_reason:m.finishReason??null,ordinal:m.ordinal}}))];
     return new Response(lines.map(l=>JSON.stringify(l)).join('\n')+'\n',{headers:{'Content-Type':'application/x-ndjson','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(row.title+'.jsonl')}`,'Cache-Control':'no-store'}});
    }
    if(method==='POST'&&chat[2]==='fork'){
     if(row.generation_id&&(row.generation_until??0)>Date.now())throw new HttpError(409,'请先停止生成');
     const data=await body(request),text=string(data.content).trim();if(!text||text.length>24000)throw new HttpError(400,'消息需为 1–24000 字符');
     const all=currentMessages(await getMessages(env,row.id)),index=all.findIndex(m=>m.id===data.messageId);if(index<0)throw new HttpError(404,'消息不存在');
     const id=crypto.randomUUID(),now=Date.now(),copied=[...all.slice(0,index),{...all[index],content:text,status:'completed' as const}];
     const result=await env.DB.batch([env.DB.prepare("INSERT INTO sessions(id,owner,title,character_json,character_name,settings_json,book_ids_json,created_at,updated_at) SELECT ?,owner,title||' · 分支',character_json,character_name,settings_json,book_ids_json,?,? FROM sessions WHERE id=? AND owner=? AND (generation_id IS NULL OR generation_until<=?) AND (SELECT count(*) FROM worldbooks WHERE owner=? AND id IN(SELECT value FROM json_each(sessions.book_ids_json)))=json_array_length(book_ids_json)").bind(id,now,now,row.id,owner,now,owner),...copied.map((m,i)=>env.DB.prepare('INSERT INTO messages(id,session_id,role,content,status,ordinal,created_at,finish_reason) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM sessions WHERE id=?)').bind(crypto.randomUUID(),id,m.role,m.content,m.status,i,now+i,m.finishReason??null,id))]);if(!result[0].meta.changes)throw new HttpError(409,'会话状态已改变，请重试');return json(session(await getSession(env,owner,id),true),201);
    }
    if(!chat[2]&&method==='GET'){
     if(row.generation_id&&(row.generation_until??0)<=Date.now()){await env.DB.batch([env.DB.prepare("UPDATE messages SET status='aborted',finish_reason='expired' WHERE session_id=? AND id=? AND status='pending' AND EXISTS(SELECT 1 FROM sessions WHERE id=? AND generation_id=? AND generation_until<=?)").bind(row.id,row.generation_id,row.id,row.generation_id,Date.now()),env.DB.prepare('UPDATE sessions SET generation_id=NULL,generation_until=NULL WHERE id=? AND generation_id=? AND generation_until<=?').bind(row.id,row.generation_id,Date.now())]);}
     return json({session:session(await getSession(env,owner,row.id),true),messages:currentMessages(await getMessages(env,row.id))});
    }
    if(!chat[2]&&method==='PATCH'){
     const data=await body(request);if(row.generation_id&&(row.generation_until??0)>Date.now())throw new HttpError(409,'请先停止生成');
     const opts=data.settings?settings(data.settings):JSON.parse(row.settings_json),ids=data.bookIds??JSON.parse(row.book_ids_json);await ownedBooks(env,owner,ids);const title=data.title===undefined?row.title:string(data.title).trim();if(!title||title.length>120)throw new HttpError(400,'会话名称无效');
     const result=await env.DB.prepare('UPDATE sessions SET settings_json=?,book_ids_json=?,title=? WHERE id=? AND owner=? AND (generation_id IS NULL OR generation_until<=?) AND (SELECT count(*) FROM worldbooks WHERE owner=? AND id IN(SELECT value FROM json_each(?)))=?').bind(JSON.stringify(opts),JSON.stringify(ids),title,row.id,owner,Date.now(),owner,JSON.stringify(ids),(ids as string[]).length).run();if(!result.meta.changes)throw new HttpError(409,'请先停止生成');return json(session(await getSession(env,owner,row.id),true));
    }
    if(!chat[2]&&method==='DELETE'){if(row.generation_id&&(row.generation_until??0)>Date.now())throw new HttpError(409,'请先停止生成');const result=await env.DB.prepare('DELETE FROM sessions WHERE id=? AND owner=? AND (generation_id IS NULL OR generation_until<=?)').bind(row.id,owner,Date.now()).run();if(!result.meta.changes)throw new HttpError(409,'会话状态已改变，请重试');return json({ok:true});}
   }
   throw new HttpError(404,'接口不存在');
  }catch(error){
   if(error instanceof HttpError||error instanceof AuthError)return json({message:error.message},error.status);
   if(error instanceof Error&&/UNIQUE constraint/i.test(error.message))return json({message:'内容已存在'},409);
   if(error instanceof Error&&/^(文件|角色|世界书|JSON|PNG|CHARX|不支持)/.test(error.message))return json({message:error.message},400);
   console.error(JSON.stringify({level:'error',event:'tavern_request_failed',path:p}));return json({message:'服务暂时不可用，请重试'},500);
  }
 }
} satisfies ExportedHandler<Env>;
