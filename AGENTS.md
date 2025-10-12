# Guide for AI Coding Agents

This document contains important context for AI coding agents working on this project.

## Project Overview

This is a Vite plugin that enables browser-based MCP (Model Context Protocol) tools. Tools run in the browser and communicate with MCP clients (like Claude Code, Cursor) via the Vite dev server.

## Development Workflow

### Setting Up for Development

1. **Add this MCP server to your configuration** - The coding agent should have access to the example app's MCP server to test tools during development:
   - Server endpoint: `http://localhost:3000/mcp` (when dev server is running)
   - This gives you live access to test the tools you're building

2. **Working Directory**: Always work from the repository root

3. **Example App**: The `example/` folder contains a minimal Vite app for testing tools

### Development Cycle

```bash
# 1. Build the plugin (from root)
npm run build

# 2. Start the example dev server (from root)
cd example && npm run dev

# 3. Test tools via MCP
# The tools are now available as MCP tools for the coding agent to call
# Example: mcp__example-vite-client-tools__take-screenshot
```

### Important: HMR Limitations

**Plugin code does NOT hot-reload!** When you modify:
- Tool definitions (`src/tools/*.ts`)
- Plugin code (`src/index.ts`, `src/bridge.ts`)

You must:
1. Run `npm run build`
2. **Restart the Vite dev server** (kill and restart `cd example && npm run dev`)
3. **Reload the browser page** at `http://localhost:3000`

Only then will the serialized tool component code be updated in the browser.

### Testing Tools

1. Start the dev server: `cd example && npm run dev`
2. Use the MCP tools directly from your coding agent session
3. For screenshot tool: You'll need to interact with browser modals
4. For console tool: Check the browser console at `http://localhost:3000`

## Architecture

### Tool Structure

Each tool can have three parts:

1. **Handler** (required): Server-side logic that executes when tool is called
2. **Component** (optional): Browser web component for UI (if tool needs UI)
3. **Server methods** (optional): Node.js methods the browser component can call

### Tool Components

- Tools manage their own UI visibility and lifecycle
- Components are injected directly into `<body>`
- Non-visual tools should set `display: none` (see `read-console.ts`)
- Visual tools should manage their visibility via attributes (see `take-screenshot.ts`)

### Current Tools

1. **take-screenshot**: Captures browser tab via screen sharing
   - Shows modal when screen capture not active
   - Modal waits for user interaction (async)
   - 2s delay after starting capture to avoid browser overlays

2. **read-console**: Reads browser console logs
   - No visual UI (display: none)
   - Intercepts console.log/warn/error/info
   - Returns formatted logs with timestamps

## TODO List

### Screenshot Tool Enhancements

- [ ] Add JPEG quality option to modal
  - Slider or input field
  - Default: 0.2 (current hardcoded value)
  - Range: 0.0 to 1.0

- [ ] Add "Save to disk" checkbox to modal
  - Default: OFF (unchecked)
  - When enabled, save via server.saveScreenshot()
  - Show saved file path in tool response
  - Currently server code exists but is unused

### General Improvements

- [ ] Consider making the 2s overlay delay configurable
- [ ] Add tests for tool handlers
- [ ] Document how to create new tools in README

## Common Pitfalls

1. **Forgetting to rebuild**: Plugin changes require `npm run build`
2. **Not restarting server**: Vite dev server must restart after plugin rebuild
3. **Not reloading browser**: Browser page must reload to get new component code
4. **File paths in tools**: Remember tools run in browser, not Node.js (use server methods for file operations)

## Tips for AI Agents

- When working on tools, always test incrementally
- Use the read-console tool to debug browser-side code
- Use the take-screenshot tool to see the actual UI state
- Modern coding agents prefer base64 image data over file paths
- The modal UX pattern is reusable for other tools that need user interaction
