import type { ViteHotContext } from "vite/types/hot.js";
import type { ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";

import { Deferred } from "./deferred.js";
import "./vite-custom-events.d.ts";

interface Tool {
  handler: ToolCallback;
}

export function mcpBridge(hot: ViteHotContext, tools: Map<string, Tool>) {
  if (hot) {
    console.log("🔌 MCP Bridge ready!");

    hot.send("mcp:bridge-ready");

    const pendingServerMethodCalls = new Map<
      string,
      Deferred<{ [key: string]: unknown }>
    >();

    function handleServerMethodResult({ id, result, error }) {
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

    function handleToolCall({ id, name: toolName, params }) {
      try {
        const tool = tools.get(toolName);

        if (!tool) throw new Error(`Tool not found: ${toolName}`);

        const component = document.querySelector(`${toolName}-element`);

        const server = new Proxy(
          {},
          {
            get(_target, methodName) {
              return (params: { [key: string]: unknown }) => {
                if (typeof methodName !== "string") return;

                const id = `${Date.now()}${Math.random()}`;
                const name = `${toolName}:${methodName}`;
                const deferred = new Deferred<{ [key: string]: unknown }>();

                pendingServerMethodCalls.set(id, deferred);
                hot.send("mcp:tool-server-call", { id, name, params });

                return deferred.promise;
              };
            },
          }
        );

        // const result = await tool.handler.call({ component, server }, params);
        tool.handler.call({ component, server }, params).then((result) => {
          hot.send("mcp:tool-result", { id, result });
        });
        // hot.send("mcp:tool-result", { id, result });
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
