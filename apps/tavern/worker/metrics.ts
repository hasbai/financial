/** Provider observations only. Missing values remain unknown, not zero. */
export class InferenceMetrics {
 promptTokens: number | null = null;
 outputTokens: number | null = null;
 private usageCached: number | null = null;
 private timingCached: number | null = null;
 prefillTokens: number | null = null;
 prefillMs: number | null = null;
 decodeMs: number | null = null;
 observe(event: { usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; prompt_tokens_details?: { cached_tokens?: unknown } }; timings?: { cache_n?: unknown; prompt_n?: unknown; prompt_ms?: unknown; predicted_ms?: unknown } }) {
  const n = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
  this.promptTokens = n(event.usage?.prompt_tokens) ?? this.promptTokens;
  this.outputTokens = n(event.usage?.completion_tokens) ?? this.outputTokens;
  this.usageCached = n(event.usage?.prompt_tokens_details?.cached_tokens) ?? this.usageCached;
  this.timingCached = n(event.timings?.cache_n) ?? this.timingCached;
  this.prefillTokens = n(event.timings?.prompt_n) ?? this.prefillTokens;
  this.prefillMs = n(event.timings?.prompt_ms) ?? this.prefillMs;
  this.decodeMs = n(event.timings?.predicted_ms) ?? this.decodeMs;
 }
 snapshot() {
  return { promptTokens: this.promptTokens, outputTokens: this.outputTokens,
   cachedTokens: this.usageCached ?? this.timingCached,
   prefillTokens: this.prefillTokens, prefillMs: this.prefillMs, decodeMs: this.decodeMs };
 }
}
