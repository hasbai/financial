// Keep authentication fixtures out of dist while testing the exact shipping CSS.
import { readFile, writeFile, cp } from "node:fs/promises";

const production = await readFile("dist/index.html", "utf8");
const styles = [
  ...production.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g),
].map(([tag]) => tag);
if (!styles.length) throw new Error("Production stylesheet missing");
await cp("dist/assets", "dist-e2e/production-assets", { recursive: true });
const testHtml = await readFile("dist-e2e/e2e/index.html", "utf8");
await writeFile(
  "dist-e2e/e2e/index.html",
  testHtml
    .replace(/<link\b[^>]*rel="stylesheet"[^>]*>/g, "")
    .replace(
      "</head>",
      `${styles.join("\n").replaceAll("/assets/", "/production-assets/")}\n</head>`,
    ),
);
