const MAX_TAIL_BYTES = 2048;
export function candidateDelimiter(requestId: string) { return `\n<|tavern_next_${requestId}|>\n`; }
export function candidateInstruction(requestId: string) {
 return `先完成角色的正文回复。正文结束后，原样输出以下分隔符：${candidateDelimiter(requestId)}随后只输出一个 JSON 对象：{"candidates":["用户可直接发送的完整行动或台词"]}。给出 1–3 个承接本轮故事、方向不同的候选，每条 15–60 字且不超过 120 字。以用户视角写，不替用户作决定，不把尚未发生的事写成事实，不写角色的回答或抽象标签。候选尾部控制在约 384 tokens 内，与正文共用本轮输出上限；正文留出尾部空间。不要代码围栏或额外说明。`;
}
export function validateCandidates(value: unknown): string[] {
 if (!Array.isArray(value)) return [];
 const found = new Set<string>();
 for (const item of value) {
  if (typeof item !== 'string') continue;
  const text = item.trim();
  if (!text || [...text].length > 120 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) continue;
  found.add(text); if (found.size === 3) break;
 }
 return [...found];
}
/** A bounded delimiter parser. Potential marker prefixes are held until disambiguated. */
export class CandidateStream {
 private buffer = ''; private tail = ''; private overflow = false;
 inTail = false;
 constructor(private readonly marker: string) {}
 push(text: string): string {
  if (this.inTail) { this.appendTail(text); return ''; }
  this.buffer += text;
  const start = this.buffer.indexOf(this.marker);
  if (start >= 0) {
   const body = this.buffer.slice(0, start); this.inTail = true;
   this.appendTail(this.buffer.slice(start + this.marker.length)); this.buffer = ''; return body;
  }
  let hold = Math.min(this.buffer.length, this.marker.length - 1);
  while (hold && !this.marker.startsWith(this.buffer.slice(-hold))) hold--;
  const body = this.buffer.slice(0, this.buffer.length - hold);
  this.buffer = hold ? this.buffer.slice(-hold) : ''; return body;
 }
 private appendTail(text: string) {
  if (this.overflow) return;
  this.tail += text;
  if (new TextEncoder().encode(this.tail).length > MAX_TAIL_BYTES) { this.overflow = true; this.tail = ''; }
 }
 finish(): { body: string; candidates: string[] } {
  // An incomplete delimiter is protocol, never persisted as story text.
  const body = !this.inTail && !(this.buffer.length > 1 && this.marker.startsWith(this.buffer)) ? this.buffer : '';
  this.buffer = '';
  if (!this.inTail || this.overflow) return { body, candidates: [] };
  try { const parsed = JSON.parse(this.tail); return { body, candidates: validateCandidates(parsed?.candidates) }; }
  catch { return { body, candidates: [] }; }
 }
}
