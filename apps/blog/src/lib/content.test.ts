import { expect, it } from "vitest";
import { articlePath, articleSchema } from "./content";
import { renderMarkdown } from "./markdown";
import { boundedImage, imageType, maxImageBytes } from "./images";
it("preserves public content structure while rejecting executable HTML and links", async () => {
  const html = await renderMarkdown(
    '# 标题\n\n<script>alert(1)</script>\n\n[bad](javascript:alert(1))\n\n|a|b|\n|-|-|\n|1|2|\n\n![图](/images/test "图")',
  );
  expect(html).toContain("<h1>标题</h1>");
  expect(html).toContain("<table>");
  expect(html).toContain("/images/test");
  expect(html).toContain("<figcaption>图</figcaption>");
  expect(html).not.toContain("<script");
  expect(html).not.toContain("javascript:");
});
it("uses a canonical category/title path and validates publication", () => {
  expect(
    articlePath({
      slug: "hello-world",
      category: { id: "a", name: "手记", slug: "notes" },
    }),
  ).toBe("/notes/hello-world");
  expect(articleSchema.safeParse({ title: "", slug: "x" }).success).toBe(false);
});
it("checks image bytes rather than trusting content type", () => {
  expect(imageType(new TextEncoder().encode('<svg onload="alert(1)">'))).toBe(
    null,
  );
  expect(imageType(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]))).toBe(
    "image/png",
  );
});
it("bounds chunked uploads even without a content-length header", async () => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(maxImageBytes));
      controller.enqueue(new Uint8Array(1));
      controller.close();
    },
  });
  await expect(
    boundedImage(
      new Request("https://test", {
        method: "POST",
        body: stream,
        duplex: "half",
      } as RequestInit),
    ),
  ).rejects.toThrow("10 MB");
});
