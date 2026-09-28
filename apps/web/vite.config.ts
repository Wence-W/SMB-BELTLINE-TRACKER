import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: import.meta.dirname,
  envDir: import.meta.dirname,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@convex": fileURLToPath(new URL("../../convex", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
