# Vite MCP Example

A minimal Vite application demonstrating the `vite-plugin-mcp` plugin with Hot Module Replacement (HMR).

## Features

- **Minimal setup** - Bare-bones Vite project
- **HMR demonstration** - Edit files and see live updates
- **MCP plugin integration** - Shows how the plugin works
- **No framework overhead** - Pure vanilla JavaScript

## Getting Started

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Start development server:**

   ```bash
   npm run dev
   ```

3. **Open your browser** to `http://localhost:3000`

4. **Test HMR:** Edit `src/main.js` and watch the changes appear instantly!

## What to Try

- Change the counter logic in `src/main.js`
- Modify the HTML template
- Add new functions and see them work immediately
- Check the browser console for HMR messages

## Build for Production

```bash
npm run build
npm run preview
```

## MCP Endpoint

The MCP server is available at `/mcp` when running in development mode.

## Available MCP Tools

This example includes two MCP tools:

### read-console

- **Purpose**: Read console logs from the browser
- **Parameters**:
  - `level` (optional): Filter by log level (`log`, `info`, `warn`, `error`)

### take-screenshot

- **Purpose**: Take a screenshot of the current page
- **Parameters**:
  - `format` (optional): Image format (`png`, `jpeg`, `webp`) - defaults to `png`
  - `quality` (optional): Image quality from 0-1 - defaults to `0.8`

You can test these tools by connecting an MCP client to the `/mcp` endpoint.

```bash
curl \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"read-console","arguments":{"level":"info"}}}' \
  http://localhost:3000/mcp
```

Or use the `npm run test-read-console` or `npm run test-take-screenshot` commands.
