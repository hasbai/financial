/** Public discovery only. Never rewrite or remove a user's private imported cards. */
export function catalogIssue(name: unknown, definition: unknown): string | null {
  if (typeof name !== 'string' || !name.trim()) return 'missing_name';
  if (name.trim().length > 160 || /[\u0000-\u001f]/.test(name)) return 'invalid_name';
  if (typeof definition !== 'string' || !definition.trim()) return 'missing_definition';
  return null;
}
export const CHUB_SORTS = {
  popular: 'star_count', trending: 'trending', newest: 'created_at', updated: 'last_activity_at', rating: 'rating',
} as const;
