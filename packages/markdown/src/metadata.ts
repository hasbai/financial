import { parseDocument } from "yaml";

function frontmatter(markdown: string) {
  return /^(?:\uFEFF)?---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(markdown);
}

export function stripFrontmatter(markdown: string): string {
  const match = frontmatter(markdown);
  return match ? markdown.slice(match[0].length).trimStart() : markdown;
}

export function markdownMetadata(markdown: string): Record<string, unknown> {
  const match = frontmatter(markdown);
  if (!match) return {};
  try {
    const document = parseDocument(match[1], { uniqueKeys: true });
    if (document.errors.length) return {};
    const value = document.toJS({ maxAliasCount: 50 });
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}
