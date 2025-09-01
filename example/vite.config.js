import { defineConfig } from "vite";
import { viteMcpPlugin } from "vite-plugin-mcp";
import { readConsole } from "vite-plugin-mcp/tools/read-console";
import { takeScreenshot } from "vite-plugin-mcp/tools/take-screenshot";

export default defineConfig({
  plugins: [
    viteMcpPlugin({
      endpoint: "/mcp",
      name: "Vite MCP Example Server",
      version: "1.0.0",
      tools: [readConsole, takeScreenshot],
    }),
  ],
  server: {
    port: 3000,
  },
});
