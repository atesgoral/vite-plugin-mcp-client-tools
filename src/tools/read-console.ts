import { z } from "zod";

const inputSchema = {
  // Note: z.coerce.number() is used because the MCP client (Claude Code) currently
  // sends number parameters as strings. This may be temporary behavior.
  tail: z.coerce.number().min(1).optional().describe("Number (integer) of most recent console entries to return. If not specified, returns all entries."),
};

type ConsoleLevel = "log" | "warn" | "error" | "info";

interface ReadConsoleInput {
  tail?: number;
}

interface ToolResponse {
  content: Array<{
    type: "text";
    text: string;
  }>;
}

interface ConsoleEntry {
  level: ConsoleLevel;
  args: unknown[];
  timestamp: number;
}

interface GetConsoleLogsResult {
  logs: ConsoleEntry[];
}

interface GetConsoleLogsArgs {
  tail?: number | undefined;
}

interface ToolContext {
  component: {
    getConsoleLogs(args: GetConsoleLogsArgs): Promise<GetConsoleLogsResult>;
  };
}

type ConsoleInterceptorConstructor = new (...args: any[]) => HTMLElement & {
  getConsoleLogs(args: GetConsoleLogsArgs): Promise<GetConsoleLogsResult>;
};

export const readConsoleTool = {
  name: "read-console",
  description: "Read the console log",
  inputSchema,
  handler: async function (this: ToolContext, { tail }: ReadConsoleInput): Promise<ToolResponse> {
    const { logs } = await this.component.getConsoleLogs({ tail });

    const formatConsoleEntry = (entry: ConsoleEntry): string => {
      const date = new Date(entry.timestamp);
      const timestamp = date.toLocaleString('sv-SE', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3
      }).replace(',', '.');
      const argsString = entry.args
        .map(arg => {
          if (typeof arg === 'string') return arg;
          if (typeof arg === 'object') {
            try {
              return JSON.stringify(arg, null, 2);
            } catch {
              return String(arg);
            }
          }
          return String(arg);
        })
        .join(' ');

      return `[${timestamp}] [${entry.level.toUpperCase()}] ${argsString}`;
    };

    const logText = logs.length > 0
      ? logs.map(formatConsoleEntry).join('\n')
      : 'No console logs found.';

    return {
      content: [
        {
          type: "text" as const,
          text: logText,
        },
      ],
    };
  },
  component: <T extends new (...args: any[]) => HTMLElement>(
    Base: T
  ): T & ConsoleInterceptorConstructor => {
    class ConsoleInterceptor extends Base {
      #consoleEntries: ConsoleEntry[] = [];
      #isConsoleIntercepted = false;

      connectedCallback() {
        this.#interceptConsole();
      }

      #interceptConsole() {
        if (this.#isConsoleIntercepted) return;

        const originalMethods = {
          log: console.log,
          warn: console.warn,
          error: console.error,
          info: console.info,
        };

        (['log', 'warn', 'error', 'info'] as ConsoleLevel[]).forEach((level) => {
          const original = originalMethods[level];
          console[level] = (...args: unknown[]) => {
            this.#consoleEntries.push({
              level,
              args: [...args],
              timestamp: Date.now(),
            });

            original.apply(console, args);
          };
        });

        this.#isConsoleIntercepted = true;
      }

      async getConsoleLogs({ tail }: GetConsoleLogsArgs): Promise<GetConsoleLogsResult> {
        const logs = tail
          ? this.#consoleEntries.slice(-tail)
          : this.#consoleEntries;

        return { logs };
      }
    }

    return ConsoleInterceptor as T & ConsoleInterceptorConstructor;
  },
};
