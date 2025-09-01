import { z } from "zod";

import type { McpTool } from "../index.js";

const inputSchema = {
  level: z.enum(["log", "warn", "error", "info"]),
};

export const readConsoleTool: McpTool<typeof inputSchema> = {
  name: "read-console",
  description: "Read the console log",
  inputSchema,
  handler: async (args) => {
    return {
      content: [
        {
          type: "text",
          text: "Not implemented!",
        },
      ],
    };
  },
};
