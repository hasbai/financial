import { pageSlugSchema } from "$lib/content";
export function match(value: string) {
  return pageSlugSchema.safeParse(value).success;
}
