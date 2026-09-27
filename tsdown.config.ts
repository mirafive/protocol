import { defineConfig } from "tsdown"

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/types.ts",
    "src/limits.ts",
    "src/key.ts",
    "src/hash.ts",
    "src/evaluate.ts",
    "src/batch-id.ts",
    "src/clean-url.ts"
  ],
  format: "esm",
  platform: "neutral",
  target: "es2022",
  dts: true,
  sourcemap: false,
  clean: true,
  hash: false,
  fixedExtension: false
})
