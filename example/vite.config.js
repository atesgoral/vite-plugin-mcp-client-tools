import { defineConfig } from "vite";
import { viteMcpPlugin } from "vite-plugin-mcp";
import { readConsoleTool } from "vite-plugin-mcp/tools/read-console";
import { takeScreenshotTool } from "vite-plugin-mcp/tools/take-screenshot";

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
