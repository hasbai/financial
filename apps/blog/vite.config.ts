import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig(({ mode }) => ({
  plugins: [tailwindcss(), sveltekit()],
  resolve: {
    alias:
      mode === "e2e"
        ? [
            {
              find: "@hasbai/auth",
              replacement: fileURLToPath(
                new URL("./e2e/auth.ts", import.meta.url),
              ),
            },
          ]
        : [],
  },
  test: { include: ["src/**/*.test.ts"], environment: "node" },
}));
