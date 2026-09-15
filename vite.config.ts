import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { buildPwa } from "./scripts/build-pwa.mjs";
export default defineConfig({
  plugins: [
    tailwindcss(),
    svelte(),
    {
      name: "financial-pwa",
      apply: "build",
      async closeBundle() {
        await buildPwa(fileURLToPath(new URL("./dist", import.meta.url)));
      },
    },
  ],
  resolve: {
    alias: { $lib: fileURLToPath(new URL("./src/lib", import.meta.url)) },
    conditions: ["browser"],
  },
  server: { port: 5173, strictPort: true },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
