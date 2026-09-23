import { publicRepository } from "$lib/public-api";
export async function load() {
  try {
    return { categories: await publicRepository().categories() };
  } catch {
    return { categories: [] };
  }
}
