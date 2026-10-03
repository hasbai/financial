import { parseBook, parseCard } from './cards';
import type { Book, Entry, JsonObject, Message, Settings } from './types';
export const estimateTokens = (text: string) => Math.ceil([...text].reduce((n, c) => n + (c.charCodeAt(0) > 127 ? 1 : 0.4), 0));
export function macros(text: string, char: string, user: string, original = '') {
  return text.replace(/\{\{original\}\}/gi, () => original).replace(/\{\{char\}\}|<char>|<bot>/gi, () => char).replace(/\{\{user\}\}|<user>/gi, () => user);
}
function matches(entry: Entry, corpus: string) {
  if (!entry.enabled || entry.regex || !entry.content || /^\s*@@/m.test(entry.content)) return false;
  if (entry.constant) return true;
  const hay = entry.caseSensitive ? corpus : corpus.toLowerCase();
  const has = (key: string) => !!key && hay.includes(entry.caseSensitive ? key : key.toLowerCase());
  if (!entry.keys.some(has)) return false;
  if (!entry.selective) return true;
  if (!entry.secondary.length) return false;
  switch (entry.logic) { case 1: return !entry.secondary.every(has); case 2: return !entry.secondary.some(has); case 3: return entry.secondary.every(has); default: return entry.secondary.some(has); }
}
export function activateBook(book: Book, history: Pick<Message, 'content'>[], expand: (s: string) => string) {
  const corpus = book.scanDepth === 0 ? '' : history.slice(-book.scanDepth).map(m => m.content).join('\n');
  let scan = corpus; const picked = new Map<number, Entry>();
  for (let pass = 0; pass < (book.recursive ? 8 : 1); pass++) {
    let added = false;
    book.entries.forEach((entry, i) => { if (!picked.has(i) && matches(entry, scan)) { picked.set(i, entry); added = true; } });
    if (!added || !book.recursive) break;
    scan = corpus + '\n' + [...picked.values()].map(e => expand(e.content)).join('\n');
  }
  let used = 0;
  return [...picked.values()].sort((a,b) => b.priority-a.priority || a.order-b.order).filter(e => {
    const cost = estimateTokens(expand(e.content)); if (used + cost > book.budget) return false; used += cost; return true;
  }).sort((a,b) => a.order-b.order);
}
export type PromptMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export function buildPrompt(raw: JsonObject, books: Book[], history: Message[], settings: Settings, contextTokens: number) {
  const card = parseCard(raw), c = card.data;
  const char = c.nickname || c.name, expand = (text: string, original = '') => macros(text, char, settings.userName, original);
  const activeHistory = history.filter(m => m.status === 'completed');
  const allBooks = c.character_book ? [parseBook(c.character_book), ...books] : books;
  const entries = allBooks.flatMap(b => activateBook(b, activeHistory, s => expand(s)));
  const before = entries.filter(e => e.position === 'before_char').map(e => expand(e.content));
  const after = entries.filter(e => e.position === 'after_char').map(e => expand(e.content));
  const system = [expand(c.system_prompt || '{{original}}', settings.systemPrompt), settings.persona ? `${settings.userName}: ${settings.persona}` : '', ...before,
    expand(c.description), expand(c.personality), expand(c.scenario), ...after, c.mes_example ? `示例对白：\n${expand(c.mes_example)}` : ''].filter(Boolean).join('\n\n');
  const post = expand(c.post_history_instructions, '保持角色设定与故事连续性。');
  const budget = contextTokens - settings.maxTokens - 256;
  let used = estimateTokens(system) + estimateTokens(post) + 16;
  if (used > budget) throw new Error('角色与世界书设定超过上下文上限');
  const turns: Message[][] = [];
  for (const message of activeHistory) { if (message.role === 'user' || !turns.length) turns.push([]); turns.at(-1)!.push(message); }
  const selected: Message[][] = [];
  for (let i = turns.length - 1; i >= 0; i--) {
    const cost = turns[i].reduce((sum,m) => sum + estimateTokens(expand(m.content)) + 8, 0);
    if (cost + used > budget) { if (!selected.length) throw new Error('最新对话超过上下文上限'); break; }
    used += cost; selected.unshift(turns[i]);
  }
  const messages: PromptMessage[] = [{ role: 'system', content: system }, ...selected.flat().map(m => ({ role: m.role, content: expand(m.content) }))];
  if (post) messages.push({role:'system',content:post});
  return { messages, estimatedTokens: used, activatedEntries: entries.map(e => e.id) };
}
