import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts", react: "src/react.tsx" },
  format: ["esm"],
  dts: true,
  splitting: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
  external: ["react"],
});
