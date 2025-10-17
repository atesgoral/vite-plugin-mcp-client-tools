import { defineConfig } from "vite";
import { viteMcpPlugin } from "vite-plugin-mcp-client-tools";
import { readConsoleTool } from "vite-plugin-mcp-client-tools/tools/read-console";
import { takeScreenshotTool } from "vite-plugin-mcp-client-tools/tools/take-screenshot";

export default defineConfig({
  plugins: [
    viteMcpPlugin({
      // Uncommenting the below will put the plugin into "SSR mode",
      // allowing it to inject its scripts into the matching module
      // instead of index.html served by Vite.
      // transformModule: /src\/main\.js/,
      tools: [readConsoleTool, takeScreenshotTool],
    }),
  ],
  server: {
    port: 3000,
  },
});
