import type { Handle } from "@sveltejs/kit";
export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Frame-Options", "DENY");
  if (
    event.url.pathname.startsWith("/studio") ||
    event.url.pathname.startsWith("/auth") ||
    event.url.pathname.startsWith("/api")
  )
    response.headers.set("Cache-Control", "private,no-store");
  return response;
};
