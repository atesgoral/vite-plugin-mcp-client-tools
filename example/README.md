# Vite MCP Example

A minimal Vite application demonstrating the `vite-plugin-mcp-client-tools` plugin with Hot Module Replacement (HMR).

## Features

- **Minimal setup** - Bare-bones Vite project
- **HMR demonstration** - Edit files and see live updates
- **MCP plugin integration** - Shows how the plugin works
- **No framework overhead** - Pure vanilla JavaScript

## Getting Started

1. **Build the plugin:**

   (At the root of the project)

   ```sh
   npm run build
   ```

2. **Install dependencies:**

   (In the example directory)

   ```sh
   npm install
   ```

3. **Start development server:**

   ```sh
   npm run dev
   ```

4. **Open your browser** to http://localhost:3000

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

### Take the tools for a spin

You can test these tools by pointing an MCP client to http://localhost:3000/mcp.

```sh
curl \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"read-console","arguments":{"level":"info"}}}' \
  http://localhost:3000/mcp
```

Or use the `npm run test-read-console` or `npm run test-take-screenshot` commands.
