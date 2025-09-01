import { z } from "zod";

import type { McpTool } from "../index.js";

export const readConsoleTool = {
  name: "read-console",
  description: "Read the console log",
  inputSchema: {
    level: z.enum(["log", "warn", "error", "info"]),
  },
  handler: async ({ level }: { level: string }) => {
    return {
      content: [
        {
          type: "text",
          text: "Not implemented!",
        },
      ],
    };
  },
} satisfies McpTool;
