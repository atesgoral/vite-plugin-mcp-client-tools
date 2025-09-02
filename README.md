# vite-plugin-mcp

Pluggable Vite MCP plugin

In very early stages of development. Still trying to bang out the API.

But it already comes with a very useful screenshot tool!

## Use

```sh
npm install vite-plugin-mcp
```

Then in your vite.config.js:

```ts
import { viteMcpPlugin } from "vite-plugin-mcp";
import { readConsoleTool } from "vite-plugin-mcp/tools/read-console";
import { takeScreenshotTool } from "vite-plugin-mcp/tools/take-screenshot";

export default defineConfig({
  plugins: [
    viteMcpPlugin({
      tools: [readConsoleTool, takeScreenshotTool],
    }),
  ],
});
```

## Example

See the README.md in the example directory for more details.

## Build

```sh
npm install
npm run build
```
