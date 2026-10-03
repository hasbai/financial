const MAX_TAIL_BYTES = 2048;
export const CANDIDATE_REMINDER = '【应用输出格式】本轮正文后必须另起一行输出 [TAVERN_NEXT]，再逐行给出三条用户可直接发送的台词或行动；不要只输出正文，不用JSON。';
export function candidateDelimiter() { return '\n[TAVERN_NEXT]\n'; }
export function candidateInstruction() {
 return `每轮（含续写、重新生成）必须输出正文和三条续聊候选，不能在正文后结束。格式如下，替换占位内容：
<角色正文>
[TAVERN_NEXT]
<一条用户可直接发送的台词或行动>
<另一条方向不同的用户台词或行动>
<第三条方向不同的用户台词或行动>
候选各占一行，不加序号、JSON、围栏或说明。每条15–60字、最多120字；用用户视角的完整台词或行动，承接本轮且方向不同，不预设选择、虚构已发生事件或代角色回答。正文与候选共用输出上限，留约384 tokens给候选。`;
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
 private buffer = ''; private tail = ''; private overflow = false; private pendingCR = false;
 inTail = false;
 constructor(private readonly marker: string = candidateDelimiter()) {}
 push(text: string): string {
  const joined = (this.pendingCR ? '\r' : '') + text;
  this.pendingCR = joined.endsWith('\r');
  text = (this.pendingCR ? joined.slice(0, -1) : joined).replace(/\r\n?/g, '\n');
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
  const flushed = this.pendingCR ? this.push('\n') : '';
  const body = flushed + (!this.inTail && !(this.buffer.length > 1 && this.marker.startsWith(this.buffer)) ? this.buffer : '');
  this.buffer = '';
  if (!this.inTail || this.overflow) return { body, candidates: [] };
  const lines = this.tail.split('\n').map(line => line.trim()).filter(Boolean);
  if (lines.some(line => /^(?:```|[{}\[\]])/.test(line))) return { body, candidates: [] };
  return { body, candidates: validateCandidates(lines.map(line => line.replace(/^(?:[-*•]\s+|\d+[.)、]\s*)/u, ''))) };
 }
}
