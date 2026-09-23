import { error } from "@sveltejs/kit";
import { publicRepository } from "$lib/public-api";
import type { RequestHandler } from "./$types";
export const GET: RequestHandler = async ({ params, platform, request }) => {
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) error(404);
  const { data, error: dbError } = await publicRepository()
    .db.from("image")
    .select("id,name,content_type,ready")
    .eq("id", params.id)
    .eq("ready", true)
    .maybeSingle();
  if (dbError) error(503, "图片暂时不可用");
  if (!data) error(404);
  const images = platform?.env?.IMAGES;
  if (!images) error(503, "图片存储暂时不可用");
  const object = await images.get(params.id);
  if (!object) error(404);
  const headers = new Headers({
    "Content-Type": data.content_type,
    "Cache-Control": "public,max-age=31536000,immutable",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'",
    ETag: object.httpEtag,
  });
  if (request.headers.get("if-none-match") === object.httpEtag)
    return new Response(null, { status: 304, headers });
  return new Response(object.body, { headers });
};
