import { unzipSync } from 'fflate';
import type { Book, Card, CardData, JsonObject, Entry } from './types';
export const MAX_FILE_BYTES = 12 * 1024 * 1024;
export const MAX_JSON_BYTES = 2 * 1024 * 1024;
export function object(value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('文件内容必须是 JSON 对象');
  return value as JsonObject;
}
export const string = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;
export const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
const num = (value: unknown, fallback: number, min: number, max: number) => typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
export function parseCard(value: unknown): Card {
  const raw = object(value);
  if (raw.spec !== undefined && !['chara_card_v2', 'chara_card_v3'].includes(string(raw.spec))) throw new Error('不支持的角色卡版本');
  const source = raw.spec ? object(raw.data) : raw;
  if (!string(source.name).trim()) throw new Error('角色卡缺少名称');
  const data = { ...source } as CardData;
  for (const key of ['name', 'description', 'personality', 'scenario', 'first_mes', 'mes_example', 'system_prompt', 'post_history_instructions', 'creator']) data[key] = string(source[key]);
  data.alternate_greetings = strings(source.alternate_greetings); data.tags = strings(source.tags);
  if (JSON.stringify(raw).length > MAX_JSON_BYTES) throw new Error('角色设定超过 2 MB');
  const unsupported: string[] = [];
  if (source.extensions && Object.keys(object(source.extensions)).length) unsupported.push('extensions');
  if (data.character_book) unsupported.push(...parseBook(data.character_book).unsupported);
  return { raw, data, format: raw.spec === 'chara_card_v3' ? 'V3' : raw.spec === 'chara_card_v2' ? 'V2' : 'V1', unsupported: [...new Set(unsupported)] };
}
export function parseBook(value: unknown, fallbackName = '世界书'): Book {
  const raw = object(value), source = raw.spec === 'lorebook_v3' ? object(raw.data) : raw;
  if (raw.spec !== undefined && raw.spec !== 'lorebook_v3') throw new Error('不支持的世界书版本');
  const all = source.entries;
  if (!all || typeof all !== 'object') throw new Error('世界书缺少 entries');
  const rows = Array.isArray(all) ? all : Object.values(all);
  if (rows.length > 1000) throw new Error('世界书条目超过 1000 条');
  const unsupported = new Set<string>();
  const entries: Entry[] = rows.map((v, i) => {
    const e = object(v), ext = e.extensions && typeof e.extensions === 'object' ? object(e.extensions) : {};
    const regex = e.use_regex === true || ext.use_regex === true;
    if (regex) unsupported.add('regex');
    const p = e.position ?? ext.position;
    if (p !== undefined && !['before_char', 'after_char', 0, 1].includes(p as string)) unsupported.add('position');
    if (/^\s*@@/m.test(string(e.content))) unsupported.add('decorators');
    return { id: String(e.id ?? e.uid ?? i), keys: strings(e.keys ?? e.key), secondary: strings(e.secondary_keys ?? e.keysecondary),
      content: string(e.content), enabled: e.enabled !== false && e.disable !== true,
      constant: e.constant === true, selective: e.selective === true, caseSensitive: e.case_sensitive === true || e.caseSensitive === true,
      order: num(e.insertion_order ?? e.order, i, -10000, 10000), priority: num(e.priority, 0, -10000, 10000),
      position: p === 'before_char' || p === 0 ? 'before_char' : 'after_char', regex, logic: num(e.selectiveLogic ?? ext.selectiveLogic, 0, 0, 3),
    };
  });
  if (JSON.stringify(raw).length > MAX_JSON_BYTES) throw new Error('世界书超过 2 MB');
  return { raw, name: string(source.name, fallbackName), entries, scanDepth: num(source.scan_depth, 4, 0, 100), budget: num(source.token_budget, 2048, 0, 8000), recursive: source.recursive_scanning === true, unsupported: [...unsupported] };
}
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) { c ^= byte; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return (c ^ 0xffffffff) >>> 0;
}
const decoder = new TextDecoder('utf-8', { fatal: true });
function json(bytes: Uint8Array): unknown {
  if (bytes.length > MAX_JSON_BYTES) throw new Error('JSON 超过 2 MB');
  try { return JSON.parse(decoder.decode(bytes)); } catch { throw new Error('JSON 格式无效'); }
}
export function isPng(b: Uint8Array) { return b.length >= 8 && [137,80,78,71,13,10,26,10].every((v,i) => b[i] === v); }
export function pngCard(bytes: Uint8Array): Card {
  if (!isPng(bytes)) throw new Error('PNG 文件签名无效');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); const cards = new Map<string, string>();
  let offset = 8, ended = false, chunks = 0;
  while (offset + 12 <= bytes.length) {
    if (++chunks > 5000) throw new Error('PNG 区块过多');
    const len = view.getUint32(offset), end = offset + 12 + len;
    if (end > bytes.length) throw new Error('PNG 区块截断');
    const type = decoder.decode(bytes.slice(offset + 4, offset + 8));
    if (crc32(bytes.subarray(offset + 4, offset + 8 + len)) !== view.getUint32(offset + 8 + len)) throw new Error('PNG 校验失败');
    if (type === 'tEXt') {
      const content = bytes.subarray(offset + 8, offset + 8 + len), zero = content.indexOf(0);
      if (zero >= 0) { const key = decoder.decode(content.subarray(0, zero)); if (key === 'chara' || key === 'ccv3') cards.set(key, decoder.decode(content.subarray(zero + 1))); }
    }
    offset = end;
    if (type === 'IEND') { ended = true; break; }
  }
  if (!ended) throw new Error('PNG 缺少结束区块');
  const payload = cards.get('ccv3') ?? cards.get('chara');
  if (!payload) throw new Error('PNG 中没有角色卡');
  if (payload.length > MAX_JSON_BYTES * 1.4) throw new Error('角色卡元数据过大');
  try { return parseCard(json(Uint8Array.from(atob(payload), c => c.charCodeAt(0)))); } catch (e) { throw new Error(e instanceof Error ? e.message : '角色卡元数据无效'); }
}
export type Imported = { card: Card; avatar?: Uint8Array; avatarType?: string; filename: string };
export function importCard(bytes: Uint8Array, filename: string): Imported {
  if (bytes.length > MAX_FILE_BYTES) throw new Error('文件超过 12 MB');
  if (isPng(bytes)) return { card: pngCard(bytes), avatar: bytes, avatarType: 'image/png', filename };
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    let total = 0, count = 0;
    const files = unzipSync(bytes, { filter: f => {
      if (++count > 256 || (total += f.originalSize) > 24 * 1024 * 1024 || f.originalSize > MAX_FILE_BYTES) throw new Error('CHARX 解压大小超限');
      if (f.name.startsWith('/') || f.name.includes('\\') || f.name.split('/').some(p => p === '..')) throw new Error('CHARX 路径无效');
      return f.name === 'card.json' || /\.(png|jpg|jpeg|webp)$/i.test(f.name);
    } });
    if (!files['card.json']) throw new Error('CHARX 缺少 card.json');
    const card = parseCard(json(files['card.json']));
    const assets = Array.isArray(card.data.assets) ? card.data.assets.map(object) : [];
    const main = assets.find(a => a.type === 'icon' && a.name === 'main');
    const uri = string(main?.uri).replace(/^embeded:\/\//, '');
    const avatar = files[uri]; const ext = uri.split('.').at(-1)?.toLowerCase();
    const avatarType = ext === 'webp' ? 'image/webp' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
    if (avatar && avatarType === 'image/png' && !isPng(avatar)) throw new Error('CHARX 头像签名无效');
    return { card, avatar, avatarType, filename };
  }
  return { card: parseCard(json(bytes)), filename };
}
