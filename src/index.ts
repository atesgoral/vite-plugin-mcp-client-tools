import { IncomingMessage, ServerResponse } from "node:http";

import type { Plugin, ViteDevServer } from "vite";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

import { mcpBridge } from "./bridge.js";
import { Deferred } from "./deferred.js";

const MCP_BRIDGE_VIRTUAL_MODULE_URL = "/virtual:mcp-bridge";

export type Handler = (
  this: { component?: HTMLElement | undefined; server: ServerMethods },
  input?: {
    [key: string]: unknown;
  }
) => Promise<CallToolResult>;

type ComponentFactory = (Base: typeof HTMLElement) => CustomElementConstructor;

export type ServerMethods = {
  [method: string]: (args?: {
    [key: string]: unknown;
  }) => Promise<{ [key: string]: unknown } | undefined>;
};

export interface McpTool {
  name: string;
  description: string;
  inputSchema?: z.ZodRawShape;
  outputSchema?: z.ZodRawShape;
  handler: Handler;
  component?: ComponentFactory;
  server?: ServerMethods;
}

interface ViteMcpPluginOptions {
  endpoint?: string;
  name?: string;
  version?: string;
  tools?: McpTool[];
  transformModule?: RegExp;
}

export function viteMcpPlugin({
  endpoint = "/mcp",
  name = "Vite MCP Server",
  version = "1.0.0",
  tools = [],
  transformModule,
}: ViteMcpPluginOptions = {}): Plugin {
  let viteServer: ViteDevServer | null = null;

  const pendingToolCalls = new Map<string, Deferred<CallToolResult>>();

  async function dispatchToolCall(
    name: string,
    params?: { [key: string]: unknown }
  ) {
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
        async (input: { [key: string]: unknown }) => {
          try {
            const result = await dispatchToolCall(name, input);
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

  const toolsWithComponents = tools.filter(
    ({ component }) => component instanceof Function
  );

  const webComponentRegistrations = toolsWithComponents.map(
    ({ name, component }) => `(${registerAndAppendWebComponent})(${JSON.stringify(name)}, ${component});`
  );

  return {
    name: "Model Context Protocol Plugin",
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      viteServer = server;

      server.ws.on("mcp:bridge-ready", () => {
        log("🔌 MCP Bridge ready!");
      });

      server.ws.on("mcp:tool-result", (data) => {
        const { id, result, error } = data;
        const deferred = pendingToolCalls.get(id);

        if (!deferred) {
          log(`Ignoring tool result for invocation ${id}`);
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
          log("calling server method", { methodName });
          const result = await method(params);
          log("result", result);
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

          if (req.method === "OPTIONS") {
            res.statusCode = 200;
            res.end();
            return;
          }

          try {
            const mcpServer = createMcpServer();
            const transport = new StreamableHTTPServerTransport({
              sessionIdGenerator: undefined,
              enableJsonResponse: false,
            });

            await mcpServer.connect(transport);

            let parsedBody: unknown;

            if (req.method === "POST") {
              let rawBody = "";

              req.on("data", (chunk) => (rawBody += chunk.toString()));

              await new Promise<void>((resolve) => {
                req.on("end", () => {
                  try {
                    parsedBody = rawBody ? JSON.parse(rawBody) : undefined;
                  } catch (error) {
                    console.error("Failed to parse JSON body:", error);
                    console.error("Raw body:", rawBody);
                    parsedBody = undefined;
                  }
                  resolve();
                });
              });
            }

            await transport.handleRequest(req, res, parsedBody);

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

      log(
        `🔌 MCP Server plugin loaded - endpoint available at ${endpoint}`
      );
      log(`   Server: ${name} v${version}`);
    },
    resolveId(id) {
      if (id === MCP_BRIDGE_VIRTUAL_MODULE_URL) {
        return `\0${MCP_BRIDGE_VIRTUAL_MODULE_URL}`;
      }
    },
    load(id) {
      if (id === `\0${MCP_BRIDGE_VIRTUAL_MODULE_URL}`) {
        const serializedToolHandlers = tools
          .map(
            ({ name, handler }) =>
              `[${JSON.stringify(name)}, {handler: ${handler}}]`
          )
          .join(",");

        return {
          code: `(${mcpBridge})(import.meta.hot, new Map([${serializedToolHandlers}]), ${Deferred});`,
          map: null,
        };
      }
    },
    ...(transformModule && {
      transform: function (code, id, _options) {
        if (!transformModule.test(id)) return;

        log(`Transforming module ${id}`);

        const prependedCode = webComponentRegistrations.join('\n') + code;
        
        return {code: prependedCode};
      },
    }),
    transformIndexHtml: {
      order: "post",
      handler() {
        if (transformModule) return [];

        log('Transforming index.html');

        return [
          {
            tag: "script",
            attrs: {
              type: "module",
              src: MCP_BRIDGE_VIRTUAL_MODULE_URL,
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
              ]
            : []),
        ];
      },
    },
  };
}

function log(...args: unknown[]) {
  console.log('[MCP Client Tools Plugin]', ...args);
}

function registerAndAppendWebComponent(name: string, componentFactory: ComponentFactory) {
  const elementName = name + "-element";

  customElements.define(
    elementName,
    componentFactory(HTMLElement),
  );

  window.addEventListener('load', () => {
    const node = document.createElement(elementName);
    document.body.appendChild(node);
  }, {once: true});
}
