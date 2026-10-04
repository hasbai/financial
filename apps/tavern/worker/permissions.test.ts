import { expect, it } from "vitest";
import { hasPermission, tokenHasPermission } from "@hasbai/auth/config";

it("requires an exact permission from an array and rejects malformed claims", () => {
  for (const claims of [null, undefined, "manage:tavern", {}, { permissions: "manage:tavern" },
    { permissions: { "manage:tavern": true } }, { permissions: ["manage:tavern:other"] }]) {
    expect(hasPermission(claims, "manage:tavern")).toBe(false);
  }
  expect(hasPermission({ permissions: ["manage:tavern"] }, "manage:tavern")).toBe(true);
  for (const token of [undefined, "", "invalid", "e30.bad.signature"]) {
    expect(tokenHasPermission(token, "manage:tavern")).toBe(false);
  }
});
