import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { buildPwa } from "./scripts/build-pwa.mjs";
export default defineConfig(({ mode }) => ({
  plugins: [
    tailwindcss(),
    svelte(),
    {
      name: "financial-pwa",
      apply: "build",
      async closeBundle() {
        if (mode === "e2e") return;
        await buildPwa(fileURLToPath(new URL("./dist", import.meta.url)));
      },
    },
  ],
  resolve: {
    alias: { $lib: fileURLToPath(new URL("./src/lib", import.meta.url)) },
    conditions: ["browser"],
  },
  server: { port: 5173, strictPort: true },
  build:
    mode === "e2e"
      ? {
          outDir: "dist-e2e",
          rollupOptions: {
            input: fileURLToPath(new URL("./e2e/index.html", import.meta.url)),
          },
        }
      : undefined,
  test: {
    include: ["src/**/*.test.ts"],
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,svelte}"],
      exclude: [
        "src/**/*.test.ts",
        "src/test/**",
        "src/lib/components/ui/**",
        "src/lib/types.ts",
        "src/vite-env.d.ts",
      ],
      reporter: ["text", "html", "json-summary"],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 78,
        lines: 83,
        "src/lib/{api,finance,business-entries,cashflow,editor}.ts": {
          statements: 88,
          branches: 74,
          functions: 90,
          lines: 90,
        },
      },
    },
  },
}));
