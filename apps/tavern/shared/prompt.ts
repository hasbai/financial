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
export function buildPrompt(raw: JsonObject, books: Book[], history: Message[], settings: Settings, contextTokens: number | null, continuationInstruction = '', options: { protocol?: string; inputRatio?: number } = {}) {
  const card = parseCard(raw), c = card.data;
  const char = c.nickname || c.name, expand = (text: string, original = '') => macros(text, char, settings.userName, original);
  const activeHistory = history.filter(m => m.status === 'completed');
  const allBooks = c.character_book ? [parseBook(c.character_book), ...books] : books;
  const entries = allBooks.flatMap(b => activateBook(b, activeHistory, s => expand(s)));
  const systemText = (picked: Entry[]) => [expand(c.system_prompt || '{{original}}', settings.systemPrompt), settings.persona ? `${settings.userName}: ${settings.persona}` : '', ...picked.filter(e => e.position === 'before_char').map(e => expand(e.content)),
    expand(c.description), expand(c.personality), expand(c.scenario), ...picked.filter(e => e.position === 'after_char').map(e => expand(e.content)), c.mes_example ? `示例对白：\n${expand(c.mes_example)}` : ''].filter(Boolean).join('\n\n');
  const post = expand(c.post_history_instructions, '保持角色设定与故事连续性。');
  const count = (s: string) => Math.ceil(estimateTokens(s) * (options.inputRatio ?? 1));
  const budget = contextTokens === null ? Infinity : contextTokens - settings.maxTokens - 512;
  let used = count(systemText([])) + count(post) + (continuationInstruction ? count(continuationInstruction) + 8 : 0) + (options.protocol ? count(options.protocol) + 8 : 0) + 16;
  if (used > budget) throw new Error('角色与世界书设定超过上下文上限');
  const turns: Message[][] = [];
  for (const message of activeHistory) { if (message.role === 'user' || !turns.length) turns.push([]); turns.at(-1)!.push(message); }
  const turnCost = (turn: Message[]) => turn.reduce((sum,m) => sum + count(expand(m.content)) + 8, 0);
  const selected: Message[][] = [];
  if (turns.length) { const latest = turns.at(-1)!; const cost = turnCost(latest); if (used + cost > budget) throw new Error('最新对话超过上下文上限'); used += cost; selected.push(latest); }
  let oldestRequired = turns.length - 1;
  if (turns.length > 1 && turns.at(-1)?.at(-1)?.role === 'user' && turns.at(-2)?.at(-1)?.role === 'assistant') { const previous = turns.at(-2)!; const cost = turnCost(previous); if (used + cost > budget) throw new Error('最新对话超过上下文上限'); used += cost; selected.unshift(previous); oldestRequired--; }
  const picked: Entry[] = [];
  for (const entry of (contextTokens === null ? [] : [...entries]).sort((a,b) => b.priority-a.priority || a.order-b.order)) { const cost = count(expand(entry.content)) + 8; if (used + cost <= budget) { used += cost; picked.push(entry); } }
  picked.sort((a,b) => a.order-b.order);
  for (let i = contextTokens === null ? -1 : oldestRequired - 1; i >= 0; i--) { const cost = turnCost(turns[i]); if (cost + used > budget) break; used += cost; selected.unshift(turns[i]); }
  const system = [systemText(picked), post, options.protocol].filter(Boolean).join('\n\n');
  const messages: PromptMessage[] = [{ role: 'system', content: system }, ...selected.flat().map(m => ({ role: m.role, content: expand(m.content) }))];
  if (continuationInstruction) messages.push({role:'user',content:continuationInstruction});
  return { messages, estimatedTokens: used, activatedEntries: picked.map(e => e.id) };
}
