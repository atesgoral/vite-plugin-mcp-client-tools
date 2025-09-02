import type { ViteHotContext } from "vite/types/hot.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { Deferred as DeferredClass } from "./deferred.js";
import type { Handler, ServerMethods } from "./index.js";

interface Tool {
  handler: Handler;
}

export function mcpBridge(
  hot: ViteHotContext,
  tools: Map<string, Tool>,
  Deferred: typeof DeferredClass
) {
  if (hot) {
    console.log("🔌 MCP Bridge ready!");

    hot.send("mcp:bridge-ready");

    const pendingServerMethodCalls = new Map<
      string,
      DeferredClass<CallToolResult>
    >();

    function handleServerMethodResult({
      id,
      result,
      error,
    }: {
      id: string;
      result: CallToolResult;
      error: unknown;
    }) {
      const deferred = pendingServerMethodCalls.get(id);

      if (!deferred) {
        console.log(`Ignoring tool result for invocation ${id}`);
        return;
      }

      pendingServerMethodCalls.delete(id);

      if (error) {
        deferred.reject(error);
      } else {
        deferred.resolve(result);
      }
    }

    function handleToolCall({
      id,
      name: toolName,
      params,
    }: {
      id: string;
      name: string;
      params?: { [key: string]: unknown };
    }) {
      try {
        const tool = tools.get(toolName);

        if (!tool) throw new Error(`Tool not found: ${toolName}`);

        const component =
          document.querySelector<HTMLElement>(`${toolName}-element`) ??
          undefined;

        const server = new Proxy<ServerMethods>(
          {},
          {
            get(_target, methodName) {
              return (params: { [key: string]: unknown }) => {
                if (typeof methodName !== "string") return;

                const id = `${Date.now()}${Math.random()}`;
                const name = `${toolName}:${methodName}`;
                const deferred = new Deferred<CallToolResult>();

                pendingServerMethodCalls.set(id, deferred);
                hot.send("mcp:tool-server-call", { id, name, params });

                return deferred.promise;
              };
            },
          }
        );

        tool.handler
          .call({ component, server }, params)
          .then((result: CallToolResult) => {
            hot.send("mcp:tool-result", { id, result });
          })
          .catch((error: unknown) => {
            console.error("Error calling tool", error);

            hot.send("mcp:tool-result", {
              id,
              error: error instanceof Error ? error.message : String(error),
            });
          });
      } catch (error) {
        console.error("Error calling tool", error);

        hot.send("mcp:tool-result", {
          id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    hot.on("mcp:tool-call", handleToolCall);
    hot.on("mcp:tool-server-result", handleServerMethodResult);
  } else {
    console.log("MCP bridge not ready because HMR not available.");
  }
}
