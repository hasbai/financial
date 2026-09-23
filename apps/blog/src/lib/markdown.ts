import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
// Raw HTML is deliberately not enabled; sanitization also rejects unsafe URL schemes.
type Node = {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: Node[];
  value?: string;
};
function captions() {
  return (root: Node) => {
    const walk = (node: Node) => {
      if (!node.children) return;
      node.children = node.children.flatMap((child) => {
        if (child.type === "element" && child.tagName === "img") {
          const caption = String(
            child.properties?.title || child.properties?.alt || "",
          ).trim();
          if (caption)
            return [
              {
                type: "element",
                tagName: "figure",
                children: [
                  child,
                  {
                    type: "element",
                    tagName: "figcaption",
                    children: [{ type: "text", value: caption }],
                  },
                ],
              },
            ];
        }
        walk(child);
        return [child];
      });
    };
    walk(root);
  };
}
const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(captions)
  .use(rehypeSanitize, {
    ...defaultSchema,
    tagNames: [...(defaultSchema.tagNames || []), "figure", "figcaption"],
  })
  .use(rehypeStringify);
export async function renderMarkdown(markdown: string) {
  return String(await processor.process(markdown));
}
