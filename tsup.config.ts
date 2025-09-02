import { defineConfig } from "tsup";

// https://www.jsdocs.io/package/tsup
export default defineConfig({
  entry: ["src/index.ts", "src/tools/*.js"],
  clean: true,
  format: ["esm", "cjs"],
  external: ["zod", "@modelcontextprotocol/sdk"],
  splitting: false,
  sourcemap: true,
  dts: {
    entry: ["src/index.ts"],
  },
});
