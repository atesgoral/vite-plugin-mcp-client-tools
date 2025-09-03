import { defineConfig } from "tsup";

// https://www.jsdocs.io/package/tsup
export default defineConfig({
  entry: ["src/index.ts", "src/tools/*.ts"],
  clean: true,
  format: ["esm", "cjs"],
  external: ["zod", "@modelcontextprotocol/sdk"],
  splitting: false,
  sourcemap: true,
  dts: true,
});
