import { defineConfig } from "vite";
import { viteMcpPlugin } from "vite-plugin-mcp-client-tools";
import { readConsoleTool } from "vite-plugin-mcp-client-tools/tools/read-console";
import { takeScreenshotTool } from "vite-plugin-mcp-client-tools/tools/take-screenshot";

export default defineConfig({
  plugins: [
    viteMcpPlugin({
      tools: [readConsoleTool, takeScreenshotTool],
    }),
  ],
  server: {
    port: 3000,
  },
});
