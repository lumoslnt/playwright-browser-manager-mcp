import { z } from "zod";
import { MissingSessionIdError, ToolExecutionError } from "../infra/errors.js";
import type { ToolRegistry } from "../server/toolRegistry.js";
import type { SessionManager } from "../sessions/sessionManager.js";
import type { ChildToolInfo } from "../sessions/sessionTypes.js";
import { isBrowserClosedError, isSafeRetryTool } from "./retryPolicy.js";
import { withSessionId } from "./schemas.js";

function formatResult(result: unknown): any {
  if (result && typeof result === "object" && "content" in (result as Record<string, unknown>)) {
    return result;
  }
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
  };
}

export class BrowserRoutingTools {
  private readonly registered = new Set<string>();

  constructor(private readonly registry: ToolRegistry, private readonly sessions: SessionManager) {}

  async registerFromCatalog(catalog: ChildToolInfo[]): Promise<void> {
    for (const tool of catalog) {
      if (this.registered.has(tool.name)) {
        continue;
      }
      this.registered.add(tool.name);
      this.registry.upsert({
        name: tool.name,
        description: tool.description ?? `Routed browser tool: ${tool.name}`,
        inputSchema: withSessionId(tool.inputSchema),
        handler: async (args) => this.routeCall(tool.name, args),
      });
    }
    await this.registry.notifyChanged();
  }

  private async routeCall(toolName: string, args: Record<string, unknown>): Promise<any> {
    const parsed = z.object({ sessionId: z.string().min(1) }).safeParse(args);
    if (!parsed.success) throw new MissingSessionIdError();

    const { sessionId } = parsed.data;
    const session = await this.sessions.ensureReady(sessionId);

    const toolArgs = { ...args };
    delete toolArgs.sessionId;

    const catalog = session.childToolCatalog ?? [];
    if (!catalog.some((t) => t.name === toolName)) {
      throw new ToolExecutionError(
        `Tool ${toolName} is unavailable for session ${sessionId}`,
      );
    }

    const callOnce = async () => {
      const client = session.childMcpClient as any;
      if (!client?.callTool) {
        throw new ToolExecutionError(`Child client unavailable for session ${sessionId}`);
      }
      return client.callTool({ name: toolName, arguments: toolArgs });
    };

    let result: unknown;
    try {
      result = await callOnce();
    } catch (err) {
      if (isBrowserClosedError(err) && isSafeRetryTool(toolName)) {
        const generationBefore = session.generation;
        // Force recovery: close stale handles, set error status, relaunch
        await this.sessions.recoverSession(sessionId, "browser closed during tool call");
        // Only retry if recovery actually happened (generation bumped)
        if (session.generation > generationBefore) {
          result = await callOnce();
        } else {
          throw err;
        }
      } else {
        throw err;
      }
    }

    await this.registerFromCatalog(catalog);
    return formatResult(result);
  }
}
