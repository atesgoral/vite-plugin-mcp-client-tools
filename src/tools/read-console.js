import { z } from "zod";

const inputSchema = {
  level: z.enum(["log", "warn", "error", "info"]),
};

export const readConsoleTool = {
  name: "read-console",
  description: "Read the console log",
  inputSchema,
  handler: async ({ level }) => {
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
