import { z } from "zod";

const inputSchema = {
  level: z.enum(["log", "warn", "error", "info"]),
};

type ConsoleLevel = z.infer<typeof inputSchema.level>;

interface ReadConsoleInput {
  level: ConsoleLevel;
}

interface ToolResponse {
  content: Array<{
    type: "text";
    text: string;
  }>;
}

export const readConsoleTool = {
  name: "read-console",
  description: "Read the console log",
  inputSchema,
  handler: async ({ level }: ReadConsoleInput): Promise<ToolResponse> => {
    return {
      content: [
        {
          type: "text" as const,
          text: "Not implemented!",
        },
      ],
    };
  },
};
