import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const src = (p: string) => fileURLToPath(new URL(`../src/${p}`, import.meta.url));

// The playground runs on the library's own source, so an edit to src/ shows at once.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: "./",
  plugins: [react()],
  resolve: { alias: [{ find: /^robo-avatar\/react$/, replacement: src("react.tsx") }, { find: /^robo-avatar$/, replacement: src("index.ts") }] },
  build: { outDir: "../playground-dist", emptyOutDir: true },
});
