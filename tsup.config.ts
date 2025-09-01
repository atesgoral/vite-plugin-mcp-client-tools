import { defineConfig } from "tsup";

export default defineConfig({
  clean: true,
  entry: ["src/index.ts", "src/tools/*.ts"],
  format: ["esm", "cjs"],
  dts: true,
});
