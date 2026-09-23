import { json, error } from "@sveltejs/kit";
import { repository } from "$lib/api";
import { boundedImage, imageType } from "$lib/images";
import type { ImageRecord } from "$lib/content";
import type { RequestHandler } from "./$types";
export const POST: RequestHandler = async ({ request, platform }) => {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) error(401, "请登录");
  const token = authorization.slice(7);
  const db = repository(async () => token).db;
  if (!platform?.env.IMAGES) error(503, "图片存储暂时不可用");
  // Authorize with an actual PostgREST write before touching R2; no duplicate JWT parser.
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = await boundedImage(request);
  } catch (e) {
    error(413, e instanceof Error ? e.message : "图片无效");
  }
  const type = imageType(bytes);
  if (!type) error(415, "支持 PNG、JPEG、WebP 和 GIF 图片");
  let name: string;
  try {
    name =
      decodeURIComponent(request.headers.get("x-image-name") || "图片")
        .trim()
        .slice(0, 240) || "图片";
  } catch {
    error(400, "图片名称无效");
  }
  const sha256 = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const { data: rows, error: insertError } = await db
    .from("image")
    .upsert(
      { name, sha256, content_type: type, size: bytes.length },
      { onConflict: "sha256", ignoreDuplicates: true },
    )
    .select("*");
  if (insertError) error(403, "无上传权限");
  let record = rows?.[0] as ImageRecord | undefined;
  if (!record) {
    const found = await db
      .from("image")
      .select("*")
      .eq("sha256", sha256)
      .single();
    if (found.error) error(409, "图片记录暂时不可用，请重试");
    record = found.data as ImageRecord;
  }
  if (!record.ready) {
    await platform.env.IMAGES.put(record.id, bytes, {
      httpMetadata: {
        contentType: type,
        cacheControl: "public, max-age=31536000, immutable",
      },
      customMetadata: { sha256 },
    });
    const updated = await db
      .from("image")
      .update({ ready: true })
      .eq("id", record.id);
    if (updated.error) error(503, "图片信息保存失败，请重试");
  }
  return json(
    { id: record.id, name: record.name },
    { headers: { "Cache-Control": "no-store" } },
  );
};
