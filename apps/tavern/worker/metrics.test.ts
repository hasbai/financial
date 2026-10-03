import { expect, it } from 'vitest';
import { InferenceMetrics } from './metrics';

it('keeps absent and invalid observations unknown', () => {
 const m = new InferenceMetrics(); m.observe({});
 m.observe({ usage: { prompt_tokens: -1, completion_tokens: '400' }, timings: { cache_n: NaN, prompt_ms: Infinity } });
 expect(m.snapshot()).toEqual({ promptTokens: null, outputTokens: null, cachedTokens: null, prefillTokens: null, prefillMs: null, decodeMs: null });
});
it('accepts streamed usage and llama timings without inventing a cache hit rate', () => {
 const m = new InferenceMetrics();
 m.observe({ timings: { cache_n: 800, prompt_n: 200, prompt_ms: 700, predicted_ms: 4000 } });
 expect(m.snapshot().cachedTokens).toBe(800);
 m.observe({ usage: { prompt_tokens: 1000, completion_tokens: 300, prompt_tokens_details: { cached_tokens: 0 } } }); m.observe({});
 expect(m.snapshot()).toEqual({ promptTokens: 1000, outputTokens: 300, cachedTokens: 0, prefillTokens: 200, prefillMs: 700, decodeMs: 4000 });
});
