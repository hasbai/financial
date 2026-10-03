import type { ModelOption, Settings } from '../shared/types';
import { HttpError } from './http';

const ACCOUNT = '5cecc63c78acf8f5473f8745f4244448';
const ROUTE = '6bfa7d6f-1398-4cb1-97ac-09116a29be3a';
const GEMMA = '@cf/google/gemma-4-26b-a4b-it';
const TTL = 5 * 60 * 1000;
type CapabilityEnv = Env & { TAVERN_AI_CAPABILITIES_TOKEN?: string };
export type Capability = { version: string; model: string; contextTokens: number; source: string; checkedAt: number; topK: boolean; penalties: boolean; thinking: boolean; inputRatio: number };
type RouteElement = { id: string; type: string; outputs: Record<string, { elementId: string }>; properties?: { provider?: string; model?: string; retries?: number; timeout?: number } };
const unknownOption: ModelOption = { id: 'rp', name: 'RP 动态路由', available: false, contextTokens: null, parameters: { topK: false, penalties: false, thinking: false, topKMax: 0 } };

/** Read-only control plane, never used for identity and never exposes credentials or route internals. */
async function control(env: CapabilityEnv, path: string) {
 if (!env.TAVERN_AI_CAPABILITIES_TOKEN) throw new HttpError(503, '模型能力尚未配置');
 const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/${path}`, { headers: { Authorization: `Bearer ${env.TAVERN_AI_CAPABILITIES_TOKEN}` }, signal: AbortSignal.timeout(10000) });
 if (!r.ok || !r.body) { await r.body?.cancel(); throw new HttpError(503, '暂时无法核实模型能力'); }
 const reader = r.body.getReader(); let bytes = 0; const decoder = new TextDecoder(); let text = '';
 try { for (;;) { const { value, done } = await reader.read(); if (done) break; bytes += value.length; if (bytes > 65536) throw new HttpError(503, '模型能力响应超限'); text += decoder.decode(value, { stream: true }); } text += decoder.decode(); }
 finally { await reader.cancel().catch(() => {}); }
 const data = JSON.parse(text) as { success: boolean; result: unknown };
 if (!data.success) throw new HttpError(503, '暂时无法核实模型能力'); return data.result;
}
export function verifiedRoute(value: unknown): { version: string; model: string } {
 const r = value as { name?: string; deployment?: { version_id: string }; version?: { version_id: string; data: RouteElement[] } };
 if (r?.name !== 'rp' || !r.version || r.deployment?.version_id !== r.version.version_id || !Array.isArray(r.version.data)) throw new HttpError(503, '模型路由能力待核实');
 const elements = r.version.data, start = elements.find(e => e.type === 'start');
 const inference = elements.find(e => e.id === start?.outputs.next?.elementId);
 const end = elements.find(e => e.id === inference?.outputs.success?.elementId);
 if (elements.length !== 3 || inference?.type !== 'model' || end?.type !== 'end' || inference.outputs.fallback?.elementId !== end.id || inference.properties?.provider !== 'workers-ai' || inference.properties.model !== GEMMA) throw new HttpError(503, '模型路由已变更，请核实参数能力');
 if (inference.properties.retries !== 0 || (inference.properties.timeout ?? 0) < 170000) throw new HttpError(503, '模型路由需使用单次生成配置');
 return { version: r.version.version_id, model: GEMMA };
}
function hasInputProperty(schema: unknown, key: string): boolean {
 if (!schema || typeof schema !== 'object') return false;
 const s = schema as { properties?: Record<string, unknown>; anyOf?: unknown[]; oneOf?: unknown[] };
 return !!s.properties?.[key] || [...(s.anyOf ?? []), ...(s.oneOf ?? [])].some(branch => hasInputProperty(branch, key));
}
function hasBooleanThinking(schema: unknown): boolean {
 if (!schema || typeof schema !== 'object') return false;
 const s = schema as { properties?: { chat_template_kwargs?: { properties?: { enable_thinking?: { type?: string } } } }; anyOf?: unknown[]; oneOf?: unknown[] };
 return s.properties?.chat_template_kwargs?.properties?.enable_thinking?.type === 'boolean' || [...(s.anyOf ?? []), ...(s.oneOf ?? [])].some(hasBooleanThinking);
}
export async function capabilities(env: CapabilityEnv): Promise<Capability> {
 const cached = await env.DB.prepare('SELECT value_json,expires_at FROM model_capabilities WHERE id=?').bind('rp').first<{ value_json: string; expires_at: number }>();
 if (cached && cached.expires_at > Date.now()) return JSON.parse(cached.value_json) as Capability;
 const route = verifiedRoute(await control(env, `ai-gateway/gateways/${encodeURIComponent(env.AIG_GATEWAY_ID)}/routes/${ROUTE}`));
 const models = await env.AI.models({ search: route.model });
 const model = models.find(m => m.name === route.model);
 const contextTokens = Number(model?.properties.find(p => p.property_id === 'context_window')?.value);
 if (!Number.isSafeInteger(contextTokens) || contextTokens < 1024) throw new HttpError(503, '上游未提供上下文能力');
 const schema = await control(env, `ai/models/schema?model=${encodeURIComponent(route.model)}`) as { input: unknown };
 if (!hasInputProperty(schema.input, 'chat_template_kwargs') || !hasBooleanThinking(schema.input) || !hasInputProperty(schema.input, 'top_p')) throw new HttpError(503, '模型参数能力已变更');
 const previous = cached ? JSON.parse(cached.value_json) as Capability : undefined;
 const same = previous?.version === route.version && previous.model === route.model;
 const value: Capability = { ...route, contextTokens: same ? Math.min(contextTokens, previous.contextTokens) : contextTokens, source: 'workers-ai:context_window', checkedAt: Date.now(), topK: hasInputProperty(schema.input, 'top_k'), penalties: hasInputProperty(schema.input, 'frequency_penalty') && hasInputProperty(schema.input, 'presence_penalty'), thinking: true, inputRatio: same ? previous.inputRatio : 1.2 };
 await env.DB.prepare(`INSERT INTO model_capabilities(id,value_json,expires_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET value_json=CASE WHEN json_extract(value_json,'$.version')=json_extract(excluded.value_json,'$.version') AND json_extract(value_json,'$.model')=json_extract(excluded.value_json,'$.model') THEN json_set(excluded.value_json,'$.contextTokens',min(json_extract(value_json,'$.contextTokens'),json_extract(excluded.value_json,'$.contextTokens')),'$.inputRatio',max(json_extract(value_json,'$.inputRatio'),json_extract(excluded.value_json,'$.inputRatio'))) ELSE excluded.value_json END,expires_at=excluded.expires_at WHERE value_json=?`).bind('rp', JSON.stringify(value), Date.now() + TTL,cached?.value_json??null).run();
 const saved=await env.DB.prepare("SELECT value_json,expires_at FROM model_capabilities WHERE id='rp'").first<{value_json:string;expires_at:number}>();
 if(!saved||saved.expires_at<=Date.now())throw new HttpError(503,'模型能力已变更，请重试');
 return JSON.parse(saved.value_json) as Capability;
}
export async function modelOptions(env: CapabilityEnv): Promise<ModelOption[]> {
 try { const c = await capabilities(env); return [{ ...unknownOption, available: true, contextTokens: c.contextTokens, parameters: { topK: c.topK, penalties: c.penalties, thinking: c.thinking, topKMax: c.topK ? 1000 : 0 } }]; }
 catch { return [{ ...unknownOption }]; }
}
export function modelInput(settings: Settings, c: Capability) {
 if (settings.modelId !== 'rp') throw new HttpError(400, '模型不可用');
 if (settings.topK && !c.topK) throw new HttpError(400, '当前模型不支持 Top K');
 if ((settings.frequencyPenalty || settings.presencePenalty) && !c.penalties) throw new HttpError(400, '当前模型不支持惩罚参数');
 return { temperature: settings.temperature, top_p: settings.topP, max_tokens: settings.maxTokens, chat_template_kwargs: { enable_thinking: settings.thinkingEnabled }, ...(settings.topK ? { top_k: settings.topK } : {}), ...(c.penalties ? { frequency_penalty: settings.frequencyPenalty, presence_penalty: settings.presencePenalty } : {}), stream_options: { include_usage: true } };
}
/** Only explicit limits attributed to the sole verified model may reduce the cached capacity. */
export async function recordFeedback(env: Env, capability: Capability, feedback: { model?: string; contextLimit?: number; promptTokens?: number; estimatedTokens?: number }) {
 if (feedback.model !== capability.model) return;
 const limit = feedback.contextLimit;
 const ratio = feedback.promptTokens && feedback.estimatedTokens ? feedback.promptTokens / feedback.estimatedTokens : 0;
 const next = { ...capability, contextTokens: Number.isSafeInteger(limit) && limit! >= 1024 ? Math.min(capability.contextTokens, limit!) : capability.contextTokens, inputRatio: Math.min(4, Math.max(capability.inputRatio, ratio * 1.1)) };
 if (next.contextTokens === capability.contextTokens && next.inputRatio === capability.inputRatio) return;
 // A late request cannot replace a newer route's record.
 await env.DB.prepare("UPDATE model_capabilities SET value_json=json_set(value_json,'$.contextTokens',min(json_extract(value_json,'$.contextTokens'),?),'$.inputRatio',max(json_extract(value_json,'$.inputRatio'),?)) WHERE id='rp' AND json_extract(value_json,'$.version')=? AND json_extract(value_json,'$.model')=?").bind(next.contextTokens,next.inputRatio, capability.version, capability.model).run();
}
