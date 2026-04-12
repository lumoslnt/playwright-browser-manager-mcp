import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { ChildProcessManager } from "../child/childProcessManager.js";
import type { AppConfig } from "../infra/config.js";
import { AppError } from "../infra/errors.js";
import { logger } from "../infra/logger.js";
import { ProfileManager } from "../profiles/profileManager.js";
import { SessionManager } from "../sessions/sessionManager.js";
import { SessionStore } from "../sessions/sessionStore.js";
import { ToolRegistry } from "./toolRegistry.js";
import { BrowserRoutingTools } from "../tools/browserRoutingTools.js";
import { registerSessionTools } from "../tools/sessionTools.js";

function errorResult(err: unknown) {
  if (err instanceof AppError) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              code: err.code,
              message: err.message,
              details: err.details,
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            code: "UnhandledError",
            message: err instanceof Error ? err.message : String(err),
          },
          null,
          2,
        ),
      },
    ],
  };
}

export async function startMcpServer(config: AppConfig): Promise<void> {
  const server = new Server(
    { name: "playwright-browser-manager-mcp", version: "0.1.0" },
    { capabilities: { tools: { listChanged: true } } },
  );

  const toolRegistry = new ToolRegistry(server);
  const sessionStore = new SessionStore(config.sessionsFile);
  const profiles = new ProfileManager(config.profilesDir);
  const childManager = new ChildProcessManager(config, profiles);
  const sessions = new SessionManager(sessionStore, profiles, childManager);
  await sessions.init();

  const browserTools = new BrowserRoutingTools(toolRegistry, sessions);
  registerSessionTools(toolRegistry, sessions, profiles);

  const baselineTools = await childManager.probeTools();
  await browserTools.registerFromCatalog(baselineTools);

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: toolRegistry.list(),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = toolRegistry.get(request.params.name);
    if (!tool) {
      return {
        isError: true,
        content: [
          { type: "text" as const, text: `Unknown tool: ${request.params.name}` },
        ],
      };
    }

    try {
      return await tool.handler((request.params.arguments as Record<string, unknown>) ?? {});
    } catch (err) {
      logger.error({ err, tool: tool.name }, "Tool execution failed");
      return errorResult(err);
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("playwright-browser-manager-mcp started");
}
