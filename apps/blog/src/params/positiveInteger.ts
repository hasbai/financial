import type { ParamMatcher } from "@sveltejs/kit";

export const match = ((value: string) =>
  /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value))) satisfies ParamMatcher;
