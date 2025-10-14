# vite-plugin-mcp-client-tools

Pluggable Vite MCP plugin that brings client-side tools to your existing Vite setup.

Give your coding agent eyes and ears for your Vite app during development.

## Why This Plugin?

When developing a Vite app with HMR (Hot Module Replacement) using a coding agent, your agent is essentially working blind—it can't see what your app actually looks like in the browser or what's happening in the console. This leads to exchanges like:

**Agent:** "Perfect! Now the button looks more modern!"
**You:** "Actually, it's completely broken and there are errors in the console..."

This plugin solves that problem by bringing browser visibility directly into your agent's workflow as MCP (Model Context Protocol) tools. It's **not** a separate service or additional setup—it's just part of your regular Vite development server.

### Alternatives

- **Cursor** has a built-in browser control feature
- **Chrome DevTools** team released an MCP server for browser automation

Both require running additional services outside your Vite setup. The magic of this plugin is that it's **seamlessly integrated** into your existing Vite HMR workflow—just add it to your `vite.config.js` and you're done.

## Features

- **Screenshot Tool**: Capture the current browser tab with configurable quality
- **Console Reader**: Access all browser console logs (log, warn, error, info)
- **Integrated MCP Server**: Works with any MCP-compatible coding agent
- **Zero Additional Services**: No extra processes or servers to manage

## Installation

```sh
npm install vite-plugin-mcp-client-tools
```

## Usage

Add the plugin to your `vite.config.js`:

```ts
import { defineConfig } from 'vite';
import { viteMcpPlugin } from "vite-plugin-mcp-client-tools";
import { readConsoleTool } from "vite-plugin-mcp-client-tools/tools/read-console";
import { takeScreenshotTool } from "vite-plugin-mcp-client-tools/tools/take-screenshot";

export default defineConfig({
  plugins: [
    viteMcpPlugin({
      tools: [readConsoleTool, takeScreenshotTool],
    }),
  ],
});
```

Then configure your MCP client (e.g., Claude Code, Cursor) to connect to the Vite dev server's MCP endpoint at `http://localhost:5173/mcp` (or your configured Vite port).

## Available Tools

### `take-screenshot`

Captures a screenshot of the current browser tab.

**How It Works:**
- On first use, displays a modal asking for screen sharing permission
- Uses the browser's native screen capture API
- Subsequent screenshots are instant—no modal, no delay
- Waits 2 seconds after initial capture to let Chrome's dimension overlay fade

<img width="716" height="449" alt="Image" src="https://github.com/user-attachments/assets/ae4b1383-2243-4729-b273-8d87e7cd7209" />

**Options:**
- **JPEG Quality** (slider): 0.0 to 1.0 in 0.1 increments (default: 0.2)
  - Lower quality = smaller file sizes
  - Adjust based on your needs (detail vs. bandwidth)
- **Save to Disk** (checkbox): Optionally save screenshots to `tmp/screenshots/` (default: OFF)
  - When enabled, file path is included in the tool response
  - Useful for agents that want to reference saved files

**Returns:**
- Base64-encoded JPEG image
- Quality value used
- File path (if save-to-disk was enabled)

**Example Response:**
```
Screenshot of current browser tab captured (quality: 0.8, saved to: /path/to/screenshot.jpeg)
```

### `read-console`

Intercepts and returns browser console logs.

**Features:**
- Captures all log levels: `log`, `warn`, `error`, `info`
- Preserves log order and timestamps
- Non-visual component (no UI impact)
- Optional `tail` parameter to limit results (like `tail -n`)

**Parameters:**
- `tail` (optional): Number of most recent entries to return

**Returns:**
- Array of console entries with:
  - Timestamp (Swedish locale format: YYYY-MM-DD HH:mm:ss)
  - Log level (info/log/warn/error)
  - Message content

**Example:**
```json
[
  {"timestamp": "2025-10-12 16:45:23", "level": "info", "message": "App started successfully!"},
  {"timestamp": "2025-10-12 16:45:25", "level": "log", "message": "Counter incremented to: 1"},
  {"timestamp": "2025-10-12 16:45:30", "level": "warn", "message": "Counter reached milestone: 5"}
]
```

## Tool Architecture

Each tool consists of three optional parts:

1. **Handler** (server-side): Processes tool calls, coordinates between client and server
2. **Component** (client-side): Web component injected into the browser, provides UI and client-side logic
3. **Server methods**: Node.js-side utilities (e.g., file saving for screenshots)

Tools are registered with the plugin via the `tools` array. The plugin:
- Exposes an MCP server endpoint at `/mcp`
- Injects tool components into the page as custom web components
- Provides a bridge for communication between browser and MCP server

### Creating Custom Tools

See `AGENTS.md` for detailed information about the architecture and creating your own tools.

## Example Project

The `example/` directory contains a minimal Vite app demonstrating both tools:
- Counter app with console logging at different levels
- Pre-configured with this plugin and both tools
- Ready to test with your coding agent

See `example/README.md` for setup instructions.

## Development

```sh
# Install dependencies
npm install

# Build the plugin
npm run build

# Run the example (in a separate terminal)
cd example
npm install
npm run dev
```

**Important:** Vite plugin code does not support HMR. After making changes to the plugin source:
1. Run `npm run build`
2. Kill and restart the dev server
3. Reload the browser page

See `AGENTS.md` for more development tips.

## MCP Configuration

### Claude Code

Add to your Claude Code MCP configuration:

```json
{
  "mcpServers": {
    "vite-dev": {
      "url": "http://localhost:5173/mcp"
    }
  }
}
```

### Other Agents

Any MCP-compatible coding agent can connect to the `/mcp` endpoint on your Vite dev server. Check your agent's documentation for MCP server configuration.

## Requirements

- Node.js 16+
- Modern browser with Screen Capture API support (Chrome, Edge, etc.)
- Vite 4.0+

## License

MIT

## Contributing

Contributions welcome! Please feel free to submit issues or pull requests.
