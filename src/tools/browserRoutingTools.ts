import { z } from "zod";
import { MissingSessionIdError, ToolExecutionError } from "../infra/errors.js";
import type { ToolRegistry } from "../server/toolRegistry.js";
import type { SessionManager } from "../sessions/sessionManager.js";
import type { ChildToolInfo } from "../sessions/sessionTypes.js";
import { isBrowserClosedError, isBrowserClosedMessage, isSafeRetryTool } from "./retryPolicy.js";
import { withSessionId } from "./schemas.js";

function extractErrorText(result: unknown): string | undefined {
  const r = result as any;
  if (!Array.isArray(r?.content)) return undefined;
  return r.content
    .filter((c: any) => c?.type === "text" && typeof c.text === "string")
    .map((c: any) => c.text as string)
    .join("\n") || undefined;
}

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

    const tryRecover = async (): Promise<unknown> => {
      if (!isSafeRetryTool(toolName)) return undefined;
      const generationBefore = session.generation;
      await this.sessions.recoverSession(sessionId, "browser closed during tool call");
      if (session.generation > generationBefore) {
        return callOnce();
      }
      return undefined;
    };

    let result: unknown;
    try {
      result = await callOnce();
    } catch (err) {
      if (isBrowserClosedError(err)) {
        const retried = await tryRecover();
        if (retried !== undefined) {
          result = retried;
        } else {
          throw err;
        }
      } else {
        throw err;
      }
    }

    // MCP SDK returns errors as result objects with isError: true instead of throwing.
    // Inspect the result and attempt recovery for browser-closed errors on safe tools.
    if (result && typeof result === "object" && (result as any).isError === true) {
      const text = extractErrorText(result);
      if (text && isBrowserClosedMessage(text) && isSafeRetryTool(toolName)) {
        const retried = await tryRecover();
        if (retried !== undefined) {
          result = retried;
        }
      }
    }

    await this.registerFromCatalog(catalog);
    return formatResult(result);
  }
}
