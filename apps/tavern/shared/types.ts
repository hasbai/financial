export type JsonObject = Record<string, unknown>;
export type CardData = JsonObject & {
  name: string; description: string; personality: string; scenario: string;
  first_mes: string; mes_example: string; system_prompt: string; post_history_instructions: string;
  alternate_greetings: string[]; tags: string[]; creator: string; nickname?: string;
  character_book?: unknown;
};
export type Card = { raw: JsonObject; data: CardData; format: string; unsupported: string[] };
export type Entry = {
  id: string; keys: string[]; secondary: string[]; content: string; enabled: boolean;
  constant: boolean; selective: boolean; caseSensitive: boolean; order: number; priority: number;
  position: 'before_char' | 'after_char'; regex: boolean; logic: number;
};
export type Book = { raw: JsonObject; name: string; entries: Entry[]; scanDepth: number; budget: number; recursive: boolean; unsupported: string[] };
export type Settings = { userName: string; persona: string; systemPrompt: string; modelId: string; thinkingEnabled: boolean; temperature: number; topP: number; topK: number; frequencyPenalty: number; presencePenalty: number; maxTokens: number };
export const GENERATION_DEFAULTS = { modelId: 'rp', thinkingEnabled: false, temperature: 0.9, topP: 1, topK: 0, frequencyPenalty: 0, presencePenalty: 0, maxTokens: 4096 };
export const DEFAULT_SETTINGS: Settings = { userName: '旅人', persona: '', systemPrompt: '以指定角色的身份参与虚构故事，保持角色、世界设定与对话连贯。由用户决定自己的行动与台词。', ...GENERATION_DEFAULTS };
export type ModelOption = { id: string; name: string; available: boolean; contextTokens: number | null; parameters: { topK: boolean; penalties: boolean; thinking: boolean; topKMax: number }; };
export type Character = { id: string; name: string; description: string; creator: string; tags: string[]; format: string; hasAvatar: boolean; originalFilename?: string; source: string; sourceUrl: string; card?: JsonObject; unsupported: string[] };
export type Worldbook = { id: string; name: string; enabled: boolean; count: number; raw: JsonObject; unsupported: string[] };
export type Session = { id: string; title: string; characterName: string; updatedAt: number; settings: Settings; bookIds: string[]; character?: JsonObject; generationId?: string | null };
export type FinishReason = 'stop' | 'length' | 'content_filter' | 'unsupported' | 'upstream' | 'interrupted' | 'timeout' | 'stopped' | 'disconnected' | 'empty' | 'output_limit' | 'expired';
export type Message = { id: string; role: 'user' | 'assistant'; content: string; status: 'pending' | 'completed' | 'aborted' | 'error'; ordinal: number; requestId: string | null; createdAt: number; finishReason?: FinishReason | null; candidates?: string[] };
export type SearchResult = { id: string; name: string; description: string; creator: string; tags: string[]; source: string; sourceUrl: string; avatarUrl?: string; popularity?: number; createdAt?: string; updatedAt?: string };
export type Discovery = { results: SearchResult[]; page: number; hasMore: boolean; source: string; total?: number; sort?: string };
export type StreamEvent = { type: 'start'; messageId: string; requestId: string } | { type: 'delta'; text: string } | { type: 'candidates_pending'; messageId: string } | { type: 'done'; message: Message } | { type: 'error'; message: string };
