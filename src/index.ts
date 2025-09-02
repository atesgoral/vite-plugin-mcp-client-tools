import { IncomingMessage, ServerResponse } from "node:http";

import type { Plugin, ViteDevServer } from "vite";
import {
  McpServer,
  type ToolCallback,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

import { mcpBridge } from "./bridge.js";
import { Deferred } from "./deferred.js";

export interface McpTool<
  Input extends z.ZodRawShape | undefined = undefined,
  Output extends z.ZodRawShape | undefined = undefined
> {
  name: string;
  description: string;
  inputSchema?: Input;
  outputSchema?: Output;
  handler: ToolCallback<Input>;
  component?: (Base: typeof HTMLElement) => CustomElementConstructor;
  server?: {
    [method: string]: (args: {
      [key: string]: unknown;
    }) => Promise<{ [key: string]: unknown }>;
  };
}

interface ViteMcpPluginOptions {
  endpoint?: string;
  name?: string;
  version?: string;
  tools?: McpTool<z.ZodRawShape | undefined, z.ZodRawShape | undefined>[];
}

export function viteMcpPlugin({
  endpoint = "/mcp",
  name = "Vite MCP Server",
  version = "1.0.0",
  tools = [],
}: ViteMcpPluginOptions = {}): Plugin {
  let viteServer: ViteDevServer | null = null;

  const pendingToolCalls = new Map<string, Deferred<CallToolResult>>();

  async function dispatchToolCall(name: string, params: unknown) {
    const id = `${Date.now()}${Math.random()}`;
    const deferred = new Deferred<CallToolResult>();

    pendingToolCalls.set(id, deferred);
    viteServer?.ws.send("mcp:tool-call", { id, name, params });

    return deferred.promise;
  }

  const createMcpServer = () => {
    const server = new McpServer(
      {
        name,
        version,
      },
      { capabilities: { tools: {} } }
    );

    for (const { name, description, inputSchema, outputSchema } of tools) {
      server.registerTool(
        name,
        {
          title: name,
          description,
          ...(inputSchema && { inputSchema }),
          ...(outputSchema && { outputSchema }),
        },
        async (params: unknown) => {
          try {
            const result = await dispatchToolCall(name, params);
            return result;
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: error instanceof Error ? error.message : String(error),
                },
              ],
              isError: true,
            };
          }
        }
      );
    }

    return server;
  };

  const createOverlayContainer = (Base: typeof HTMLElement) => {
    class OverlayContainer extends Base {
      connectedCallback() {
        const shadow = this.attachShadow({ mode: "open" });

        const style = document.createElement("style");

        style.textContent = `
          #container {
            position: absolute;
            top: 0;
            right: 0;
            padding: 10px;
            background: rgba(0, 0, 0, 0.25);
            border-bottom: 1px solid rgba(255, 255, 255, 0.25);
            border-left: 1px solid rgba(255, 255, 255, 0.25);
            border-bottom-left-radius: 10px;
          }
        `;

        const div = document.createElement("div");
        div.setAttribute("id", "container");

        const slot = document.createElement("slot");
        div.appendChild(slot);

        shadow.appendChild(style);
        shadow.appendChild(div);
      }
    }

    return OverlayContainer;
  };

  return {
    name: "Model Context Protocol Plugin",
    configureServer(server: ViteDevServer) {
      viteServer = server;

      server.ws.on("mcp:bridge-ready", () => {
        console.log("🔌 MCP Bridge ready!");
      });

      server.ws.on("mcp:tool-result", (data) => {
        const { id, result, error } = data;
        const deferred = pendingToolCalls.get(id);

        if (!deferred) {
          console.log(`Ignoring tool result for invocation ${id}`);
          return;
        }

        pendingToolCalls.delete(id);

        if (error) {
          deferred.reject(error);
        } else {
          deferred.resolve(result);
        }
      });

      server.ws.on("mcp:tool-server-call", async ({ id, name, params }) => {
        const [toolName, methodName] = name.split(":");

        const tool = tools.find((tool) => tool.name === toolName);

        if (!tool) throw new Error(`Tool not found: ${toolName}`);

        const method = tool.server?.[methodName];

        if (!method) throw new Error(`Method not found: ${methodName}`);

        try {
          console.log("calling server method", { methodName });
          const result = await method(params);
          console.log("result", result);
          server.ws.send("mcp:tool-server-result", { id, result });
        } catch (error) {
          server.ws.send("mcp:tool-server-result", {
            id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });

      server.middlewares.use(
        endpoint,
        async (req: IncomingMessage, res: ServerResponse) => {
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader(
            "Access-Control-Allow-Methods",
            "GET, POST, DELETE, OPTIONS"
          );
          res.setHeader(
            "Access-Control-Allow-Headers",
            "Content-Type, Accept, Mcp-Session-Id, Last-Event-ID, Authorization"
          );
          res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

          // Handle preflight requests
          if (req.method === "OPTIONS") {
            res.statusCode = 200;
            res.end();
            return;
          }

          try {
            // Create a fresh MCP server and transport for each request (stateless)
            const mcpServer = createMcpServer();
            const transport = new StreamableHTTPServerTransport({
              sessionIdGenerator: undefined, // Stateless mode
              enableJsonResponse: false, // Allow SSE streams
            });

            await mcpServer.connect(transport);

            // Parse body for POST requests
            let body: unknown;
            if (req.method === "POST") {
              let rawBody = "";
              req.on("data", (chunk) => {
                rawBody += chunk.toString();
              });

              await new Promise<void>((resolve) => {
                req.on("end", () => {
                  try {
                    body = rawBody ? JSON.parse(rawBody) : undefined;
                  } catch (error) {
                    console.error("Failed to parse JSON body:", error);
                    console.error("Raw body:", rawBody);
                    body = undefined;
                  }
                  resolve();
                });
              });
            }

            await transport.handleRequest(req, res, body);

            // Clean up on connection close
            res.on("close", () => {
              transport.close();
              mcpServer.close();
            });
          } catch (error) {
            console.error("MCP request error:", error);
            if (!res.headersSent) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(
                JSON.stringify({
                  jsonrpc: "2.0",
                  error: {
                    code: -32603,
                    message: "Internal server error",
                    data:
                      error instanceof Error ? error.message : String(error),
                  },
                  id: null,
                })
              );
            }
          }
        }
      );

      console.log(
        `🔌 MCP Server plugin loaded - endpoint available at ${endpoint}`
      );
      console.log(`   Server: ${name} v${version}`);
    },
    resolveId(id) {
      if (id === "/virtual:mcp-bridge") {
        return "\0virtual:mcp-bridge";
      }
    },
    load(id) {
      if (id === "\0virtual:mcp-bridge") {
        const serializedToolHandlers = tools
          .map(
            ({ name, handler }) =>
              `[${JSON.stringify(name)}, {handler: ${handler.toString()}}]`
          )
          .join(",");

        return {
          code: `(${mcpBridge.toString()})(import.meta.hot, new Map([${serializedToolHandlers}]))`,
          map: null,
        };
      }
    },
    transformIndexHtml: {
      order: "post",
      handler() {
        const toolsWithComponents = tools.filter(
          ({ component }) => component instanceof Function
        );
        const webComponentFactories = [
          { name: "overlay-container", component: createOverlayContainer },
          ...toolsWithComponents,
        ];
        const webComponentRegistrations = webComponentFactories.map(
          ({ name, component }) => `
            customElements.define(
              ${JSON.stringify(name + "-element")},
              (${component})(HTMLElement),
            )
          `
        );

        return [
          {
            tag: "script",
            attrs: {
              type: "module",
              src: "/virtual:mcp-bridge",
            },
            injectTo: "head-prepend",
          },
          ...(toolsWithComponents.length
            ? [
                ...webComponentRegistrations.map((registration) => ({
                  tag: "script",
                  children: registration,
                  injectTo: "head-prepend" as const,
                })),
                {
                  tag: "overlay-container-element",
                  children: toolsWithComponents.map(({ name }) => ({
                    tag: name + "-element",
                  })),
                  injectTo: "body" as const,
                },
              ]
            : []),
        ];
      },
    },
  };
}
