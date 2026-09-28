import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Lets the parity oracles import the ORIGINAL source unchanged: its files
    // use the "@/..." alias for reference/original/src.
    alias: { "@": fileURLToPath(new URL("./reference/original/src", import.meta.url)) },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    // Parity runs pin the timezone; per-timezone runs override TZ explicitly.
    env: { TZ: process.env.TZ ?? "UTC" },
    // Convex function tests opt into the edge runtime (like Convex itself)
    // with a `// @vitest-environment edge-runtime` header.
    server: { deps: { inline: ["convex-test"] } },
  },
});
