import { MAX_FILE_BYTES, object } from '../shared/cards';
export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export function json(data: unknown, status = 200) { return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } }); }
export async function boundedBody(response: Response | Request, limit = MAX_FILE_BYTES): Promise<Uint8Array> {
  const size = Number(response.headers.get('Content-Length'));
  if (size > limit) throw new HttpError(413, '文件大小超限');
  if (!response.body) throw new HttpError(400, '内容为空');
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  try { while (true) { const {done,value} = await reader.read(); if (done) break; total += value.length; if (total > limit) throw new HttpError(413, '文件大小超限'); chunks.push(value); } }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const bytes = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; } return bytes;
}
export async function body(request: Request) {
  try { return object(JSON.parse(new TextDecoder().decode(await boundedBody(request, 2 * 1024 * 1024)))); }
  catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(400, 'JSON 格式无效'); }
}
const ALLOWED = new Set(['datasets-server.huggingface.co', 'api.chub.ai', 'avatars.charhub.io']);
export async function sourceFetch(url: URL, limit = MAX_FILE_BYTES) {
  let current = url;
  const signal = AbortSignal.timeout(45000);
  for (let step = 0; step < 4; step++) {
    if (current.protocol !== 'https:' || current.port || current.username || current.password || !ALLOWED.has(current.hostname)) throw new HttpError(400, '不支持的角色来源');
    const response = await fetch(current, { redirect: 'manual', headers: { Accept: 'application/json,image/png', 'User-Agent': 'Hasbai-Tavern/1.0' }, signal });
    if (response.status >= 300 && response.status < 400 && response.headers.has('Location')) { current = new URL(response.headers.get('Location')!, current); continue; }
    if (!response.ok) { await response.body?.cancel(); throw new HttpError(502, `角色来源返回 ${response.status}`); }
    return await boundedBody(response, limit);
  }
  throw new HttpError(502, '角色来源重定向过多');
}
export async function sourceJson(url: URL) { try { return object(JSON.parse(new TextDecoder().decode(await sourceFetch(url, 4 * 1024 * 1024)))); } catch (e) { if (e instanceof HttpError) throw e; throw new HttpError(502, '角色来源响应无效'); } }
