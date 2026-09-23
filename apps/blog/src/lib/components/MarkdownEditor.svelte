<script lang="ts">
  import { onMount } from "svelte";
  import { Editor } from "@tiptap/core";
  import StarterKit from "@tiptap/starter-kit";
  import { Markdown } from "@tiptap/markdown";
  import Image from "@tiptap/extension-image";
  import { TableKit } from "@tiptap/extension-table";
  import { Button } from "@hasbai/ui/button";
  import { Input } from "@hasbai/ui/input";
  import {
    Bold,
    Italic,
    List,
    ListOrdered,
    Quote,
    Code,
    ImagePlus,
    Link,
    Undo,
    Redo,
    Table,
    Minus,
  } from "@lucide/svelte";
  let {
    value = $bindable(""),
    upload,
    disabled = false,
    busy = $bindable(false),
  }: {
    value: string;
    upload: (file: File) => Promise<{ src: string; name: string }>;
    disabled?: boolean;
    busy?: boolean;
  } = $props();
  let element: HTMLDivElement;
  let fileInput: HTMLInputElement;
  let editor = $state<Editor>();
  let revision = $state(0);
  let source = $state(false);
  let error = $state("");
  let linkOpen = $state(false);
  let linkUrl = $state("");
  onMount(() => {
    const instance = new Editor({
      element,
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
          underline: false,
          link: { openOnClick: false },
        }),
        Image.configure({ allowBase64: false }),
        TableKit.configure({ table: { resizable: false } }),
        Markdown.configure({ markedOptions: { gfm: true } }),
      ],
      content: value,
      contentType: "markdown",
      editorProps: {
        attributes: {
          role: "textbox",
          "aria-label": "文章正文",
          "aria-multiline": "true",
        },
      },
      onUpdate: ({ editor: current }) => {
        value = current.getMarkdown();
      },
      onTransaction: () => revision++,
    });
    editor = instance;
    return () => instance.destroy();
  });
  $effect(() => {
    editor?.setEditable(!disabled);
  });
  function toggleSource() {
    if (source && editor)
      editor.commands.setContent(value, { contentType: "markdown" });
    source = !source;
  }
  async function addImage(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    busy = true;
    error = "";
    try {
      const image = await upload(file);
      editor
        ?.chain()
        .focus()
        .setImage({ src: image.src, alt: image.name, title: image.name })
        .run();
    } catch (e) {
      error = e instanceof Error ? e.message : "上传失败";
    } finally {
      busy = false;
      fileInput.value = "";
    }
  }
  function addLink() {
    if (!editor) return;
    if (linkUrl && !/^https?:\/\//i.test(linkUrl)) {
      error = "请输入 http 或 https 链接";
      return;
    }
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: linkUrl })
      .run();
    linkOpen = false;
    error = "";
  }
</script>

<div
  class="editor-bar"
  role="toolbar"
  aria-label="正文格式"
  data-revision={revision}
>
  <Button
    variant="ghost"
    size="icon"
    aria-label="加粗"
    aria-pressed={editor?.isActive("bold") ?? false}
    disabled={disabled || source}
    onclick={() => editor?.chain().focus().toggleBold().run()}
    ><Bold size={16} /></Button
  >
  <Button
    variant="ghost"
    size="icon"
    aria-label="斜体"
    aria-pressed={editor?.isActive("italic") ?? false}
    disabled={disabled || source}
    onclick={() => editor?.chain().focus().toggleItalic().run()}
    ><Italic size={16} /></Button
  >
  <Button
    variant="ghost"
    disabled={disabled || source}
    aria-label="二级标题"
    onclick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
    >H2</Button
  >
  <Button
    variant="ghost"
    disabled={disabled || source}
    aria-label="三级标题"
    onclick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
    >H3</Button
  >
  <Button
    variant="ghost"
    size="icon"
    aria-label="无序列表"
    disabled={disabled || source}
    onclick={() => editor?.chain().focus().toggleBulletList().run()}
    ><List size={16} /></Button
  >
  <Button
    variant="ghost"
    size="icon"
    aria-label="有序列表"
    disabled={disabled || source}
    onclick={() => editor?.chain().focus().toggleOrderedList().run()}
    ><ListOrdered size={16} /></Button
  >
  <Button
    variant="ghost"
    size="icon"
    aria-label="引用"
    disabled={disabled || source}
    onclick={() => editor?.chain().focus().toggleBlockquote().run()}
    ><Quote size={16} /></Button
  >
  <Button
    variant="ghost"
    size="icon"
    aria-label="代码块"
    disabled={disabled || source}
    onclick={() => editor?.chain().focus().toggleCodeBlock().run()}
    ><Code size={16} /></Button
  >
  <Button
    variant="ghost"
    size="icon"
    aria-label="插入链接"
    disabled={disabled || source}
    onclick={() => {
      linkUrl = editor?.getAttributes("link").href ?? "";
      linkOpen = !linkOpen;
    }}><Link size={16} /></Button
  >
  <Button
    variant="ghost"
    size="icon"
    aria-label="插入表格"
    disabled={disabled || source}
    onclick={() =>
      editor
        ?.chain()
        .focus()
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run()}><Table size={16} /></Button
  >
  <Button
    variant="ghost"
    size="icon"
    aria-label="分隔线"
    disabled={disabled || source}
    onclick={() => editor?.chain().focus().setHorizontalRule().run()}
    ><Minus size={16} /></Button
  >
  <Button
    variant="ghost"
    size="icon"
    aria-label="上传图片"
    disabled={disabled || source || busy}
    onclick={() => fileInput.click()}><ImagePlus size={16} /></Button
  >
  <Button
    variant="ghost"
    size="icon"
    aria-label="撤销"
    disabled={disabled || source || !editor?.can().undo()}
    onclick={() => editor?.chain().focus().undo().run()}
    ><Undo size={16} /></Button
  >
  <Button
    variant="ghost"
    size="icon"
    aria-label="重做"
    disabled={disabled || source || !editor?.can().redo()}
    onclick={() => editor?.chain().focus().redo().run()}
    ><Redo size={16} /></Button
  >
  <Button
    class="ml-auto"
    variant={source ? "secondary" : "ghost"}
    aria-pressed={source}
    {disabled}
    onclick={toggleSource}>Markdown</Button
  >
</div>
<input
  bind:this={fileInput}
  type="file"
  accept="image/png,image/jpeg,image/webp,image/gif"
  class="hidden"
  aria-label="选择图片"
  onchange={addImage}
/>
{#if linkOpen}<div class="flex gap-2 py-3">
    <Input
      bind:value={linkUrl}
      aria-label="链接地址"
      type="url"
      placeholder="https://"
    /><Button onclick={addLink}>确定</Button><Button
      variant="ghost"
      onclick={() => (linkOpen = false)}>取消</Button
    >
  </div>{/if}
{#if error}<p class="error py-3" role="alert">{error}</p>{/if}{#if busy}<p
    class="meta py-3"
    role="status"
  >
    正在上传图片…
  </p>{/if}
{#if source}<textarea
    class="min-h-110 w-full resize-y rounded-lg border bg-background p-4 font-mono text-sm"
    aria-label="Markdown 源码"
    bind:value
    {disabled}></textarea>{/if}
<div bind:this={element} class:hidden={source}></div>
