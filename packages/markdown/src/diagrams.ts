// This module is only loaded after hydration. Engines are imported only for matching fences.
let mermaidQueue: Promise<unknown> = Promise.resolve();
let d2Queue: Promise<unknown> = Promise.resolve();
let d2Engine: Promise<import("@terrastruct/d2").D2> | undefined;
let sequence = 0;
function enqueue<T>(kind: "mermaid" | "d2", operation: () => Promise<T>): Promise<T> {
  const result = (kind === "mermaid" ? mermaidQueue : d2Queue).then(operation);
  if (kind === "mermaid") mermaidQueue = result.catch(() => {});
  else d2Queue = result.catch(() => {});
  return result;
}

export async function enhanceDiagrams(
  element: HTMLElement, dark: boolean, cancelled: () => boolean, cleanups: (() => void)[],
) {
  const fences = Array.from(element.querySelectorAll<HTMLElement>("pre > code"));
  await Promise.all(fences.map(async code => {
    const languages = [...code.classList].map(value => value.replace("language-", "").toLowerCase());
    const kind = (["mermaid", "d2", "markmap"] as const).find(value => languages.includes(value));
    if (!kind) return;
    const pre = code.parentElement!;
    const source = code.textContent ?? "";
    const frame = document.createElement("div");
    frame.className = "markdown-diagram";
    frame.dataset.diagram = kind;
    frame.setAttribute("aria-busy", "true");
    pre.before(frame);
    frame.append(pre);
    try {
      if (kind === "markmap") {
        const [{ Transformer }, { Markmap }, { default: purify }] = await Promise.all([
          import("markmap-lib"), import("markmap-view"), import("dompurify"),
        ]);
        if (cancelled()) return;
        const transformer = new Transformer([]); // No author scripts, CSS or CDN assets.
        transformer.md.set({ html: false });
        const { root } = transformer.transform(source);
        const sanitize = (node: typeof root) => {
          node.content = purify.sanitize(node.content, { USE_PROFILES: { html: true }, FORBID_TAGS: ["img", "style"], FORBID_ATTR: ["style", "id"] });
          node.children?.forEach(sanitize);
        };
        sanitize(root);
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("role", "img"); svg.setAttribute("aria-label", "Markmap 思维导图");
        const controls = document.createElement("div"); controls.className = "diagram-controls";
        frame.append(controls, svg);
        const map = Markmap.create(svg, { duration: 0, maxWidth: 240, zoom: true, pan: true }, root);
        cleanups.push(() => map.destroy());
        for (const [label, action] of [["放大", () => map.rescale(1.25)], ["缩小", () => map.rescale(.8)], ["适应", () => map.fit()]] as const) {
          const button = document.createElement("button"); button.type = "button"; button.textContent = label;
          button.addEventListener("click", () => { void action(); }); controls.append(button);
        }
        await map.fit();
        if (!cancelled()) pre.remove();
      } else {
        let svg = await enqueue(kind, async () => {
          if (cancelled()) return "";
          if (kind === "mermaid") {
            const { default: mermaid } = await import("mermaid");
            mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: dark ? "dark" : "default", suppressErrorRendering: true, htmlLabels: false, flowchart: { htmlLabels: false },
              secure: ["secure", "securityLevel", "startOnLoad", "maxTextSize", "suppressErrorRendering", "htmlLabels", "flowchart"],
            });
            const id = `markdown-diagram-${++sequence}`;
            const measure = document.createElement("div");
            measure.id = `${id}-measure`;
            measure.style.cssText = "position:fixed;inset:0;visibility:hidden;pointer-events:none";
            const style = document.createElement("style");
            // Site motion preferences must not animate SVG transforms while Mermaid measures them.
            style.textContent = `#${measure.id}, #${measure.id} * { transition: none !important; animation: none !important; }`;
            document.head.append(style); document.body.append(measure);
            try { return (await mermaid.render(id, source, measure)).svg; }
            finally { measure.remove(); style.remove(); }
          }
          // D2's message API has one pending resolver: serialize compile + render together.
          d2Engine ??= import("@terrastruct/d2").then(({ D2 }) => new D2());
          const engine = await d2Engine;
          const result = await engine.compile(source);
          return engine.render(result.diagram, { ...result.renderOptions, themeID: dark ? 200 : 0, pad: 24 });
        });
        if (cancelled() || !svg) return;
        // Percentage-only Mermaid SVGs have no reliable intrinsic image dimensions.
        if (kind === "mermaid") {
          const document = new DOMParser().parseFromString(svg, "image/svg+xml");
          const root = document.documentElement;
          const box = root.getAttribute("viewBox")?.split(/[ ,]+/).map(Number);
          if (box?.length === 4 && box[2] > 0 && box[3] > 0) {
            root.setAttribute("width", String(box[2])); root.setAttribute("height", String(box[3]));
            root.removeAttribute("style");
          }
          svg = new XMLSerializer().serializeToString(root);
        }
        // SVG in an image context cannot execute diagram scripts or access the page DOM.
        const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
        cleanups.push(() => URL.revokeObjectURL(url));
        const image = document.createElement("img");
        image.alt = kind === "d2" ? "D2 架构图" : "Mermaid 流程图";
        image.src = url;
        await image.decode();
        if (cancelled()) return;
        pre.replaceWith(image);
      }
      if (!cancelled()) frame.dataset.state = "ready";
    } catch {
      if (cancelled()) return;
      frame.dataset.state = "error";
      const error = document.createElement("p"); error.className = "diagram-error";
      error.setAttribute("role", "alert"); error.textContent = `${kind} 图表渲染失败`;
      frame.prepend(error);
    } finally {
      if (!cancelled()) frame.setAttribute("aria-busy", "false");
    }
  }));
}
