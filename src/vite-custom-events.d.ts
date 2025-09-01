declare module "vite/types/customEvent" {
  interface CustomEventMap {
    "mcp:tool-call": McpBridgeToolCallPayload;
  }
}

interface McpBridgeToolCallPayload {
  id: string;
  name: string;
  params: unknown;
}
