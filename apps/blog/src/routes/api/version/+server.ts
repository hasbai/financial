import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
export const GET: RequestHandler = ({ platform }) =>
  json(
    {
      id: platform?.env.VERSION.id ?? "local",
      tag: platform?.env.VERSION.tag ?? "",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
