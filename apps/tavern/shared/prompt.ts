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
// User-declared local window; runtime discovery remains separate and may lower it.
export const PLANNING_CONTEXT_TOKENS = 32768;
export const INPUT_TARGET_TOKENS = 12288;
export const HISTORY_BLOCK_TOKENS = 2048;
export const PROMPT_SAFETY_TOKENS = 512;
export function buildPrompt(raw: JsonObject, books: Book[], history: Message[], settings: Settings, contextTokens: number | null, continuationInstruction = '', options: { protocol?: string; formatReminder?: string; inputRatio?: number } = {}) {
  const card = parseCard(raw), c = card.data;
  const char = c.nickname || c.name, expand = (text: string, original = '') => macros(text, char, settings.userName, original);
  const activeHistory = history.filter(m => m.status === 'completed');
  const allBooks = c.character_book ? [parseBook(c.character_book), ...books] : books;
  const entries = allBooks.flatMap(b => activateBook(b, activeHistory, s => expand(s)));
  const systemText = (picked: Entry[]) => [expand(c.system_prompt ? (/\{\{original\}\}/i.test(c.system_prompt) ? c.system_prompt : '{{original}}\n\n' + c.system_prompt) : '{{original}}', settings.systemPrompt), settings.persona ? `${settings.userName}: ${settings.persona}` : '', ...picked.filter(e => e.position === 'before_char').map(e => expand(e.content)),
    expand(c.description), expand(c.personality), expand(c.scenario), ...picked.filter(e => e.position === 'after_char').map(e => expand(e.content)), c.mes_example ? `示例对白：\n${expand(c.mes_example)}` : ''].filter(Boolean).join('\n\n');
  const post = expand(c.post_history_instructions, '保持角色设定与故事连续性。');
  const count = (s: string) => Math.ceil(estimateTokens(s) * (options.inputRatio ?? 1));
  const planningWindow = Math.min(contextTokens ?? PLANNING_CONTEXT_TOKENS, PLANNING_CONTEXT_TOKENS);
  const budget = planningWindow - settings.maxTokens - PROMPT_SAFETY_TOKENS;
  const coreTokens = count(systemText([])) + count(post) + (options.protocol ? count(options.protocol) + 8 : 0) + 16;
  const requestTokens = (continuationInstruction ? count(continuationInstruction) + 8 : 0) + (options.formatReminder ? count(options.formatReminder) + 8 : 0);
  let used = coreTokens + requestTokens;
  if (used > budget) throw new Error('角色与世界书设定超过上下文上限');
  const turns: Message[][] = [];
  for (const message of activeHistory) { if (message.role === 'user' || !turns.length) turns.push([]); turns.at(-1)!.push(message); }
  const turnCost = (turn: Message[]) => turn.reduce((sum,m) => sum + count(expand(m.content)) + 8, 0);
  const selected = new Set<number>();
  const requireTurn = (index: number) => { const cost = turnCost(turns[index]); if (used + cost > budget) throw new Error('最新对话超过上下文上限'); used += cost; selected.add(index); };
  if (turns.length) requireTurn(turns.length - 1);
  if (turns.length > 1 && turns.at(-1)?.at(-1)?.role === 'user' && turns.at(-2)?.at(-1)?.role === 'assistant') requireTurn(turns.length - 2);
  // Mandatory context can exceed the soft target; never slice a user message.
  const target = Math.max(used, Math.min(INPUT_TARGET_TOKENS, budget));
  const picked: Entry[] = [];
  let worldbookTokens = 0;
  for (const entry of [...entries].sort((a,b) => b.priority-a.priority || a.order-b.order)) { const cost = count(expand(entry.content)) + 8; if (used + cost <= target) { used += cost; worldbookTokens += cost; picked.push(entry); } }
  picked.sort((a,b) => a.order-b.order);
  // Boundaries are anchored at the beginning, not recomputed from the newest turn.
  const blocks: number[][] = []; let block: number[] = [], blockTokens = 0;
  turns.forEach((turn, index) => {
    const cost = turnCost(turn);
    if (block.length && blockTokens + cost > HISTORY_BLOCK_TOKENS) { blocks.push(block); block = []; blockTokens = 0; }
    block.push(index); blockTokens += cost;
  });
  if (block.length) blocks.push(block);
  for (let i = blocks.length - 1; i >= 0; i--) {
    const optional = blocks[i].filter(index => !selected.has(index));
    const cost = optional.reduce((sum, index) => sum + turnCost(turns[index]), 0);
    if (cost + used > target) break;
    used += cost; optional.forEach(index => selected.add(index));
  }
  const selectedHistory = [...selected].sort((a,b) => a-b).flatMap(index => turns[index]);
  const system = [systemText(picked), post, options.protocol].filter(Boolean).join('\n\n');
  const messages: PromptMessage[] = [{ role: 'system', content: system }, ...selectedHistory.map(m => ({ role: m.role, content: expand(m.content) }))];
  if (continuationInstruction) messages.push({role:'user',content:continuationInstruction});
  const latest = messages.at(-1);
  if (options.formatReminder && latest?.role === 'user') latest.content += '\n\n' + options.formatReminder;
  return { messages, estimatedTokens: used, activatedEntries: picked.map(e => e.id), budget: {
    coreTokens, worldbookTokens, historyTokens: used - coreTokens - requestTokens - worldbookTokens, requestTokens,
    inputTargetTokens: Math.min(INPUT_TARGET_TOKENS, budget), hardInputTokens: budget,
    outputTokens: settings.maxTokens, safetyTokens: PROMPT_SAFETY_TOKENS,
    planningContextTokens: planningWindow, detectedContextTokens: contextTokens,
    contextSource: contextTokens !== null && contextTokens <= PLANNING_CONTEXT_TOKENS ? 'runtime' : 'user-declared',
    includedMessages: selectedHistory.length, omittedMessages: activeHistory.length - selectedHistory.length,
  } };
}
