import { z } from "zod";
import type { ProfileManager } from "../profiles/profileManager.js";
import type { ToolRegistry } from "../server/toolRegistry.js";
import type { SessionManager } from "../sessions/sessionManager.js";

function text(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

export function registerSessionTools(
  registry: ToolRegistry,
  sessions: SessionManager,
  profiles: ProfileManager,
): void {
  registry.upsert({
    name: "create_session",
    description: "Create a managed session. Browser launch is lazy.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        browserType: { type: "string", enum: ["chrome", "msedge", "chromium"] },
        profile: { type: "string" },
        headless: { type: "boolean" },
        executablePath: { type: "string" },
        profileMode: { type: "string", enum: ["persistent", "isolated", "fallback-isolated"] },
      },
      required: ["name"],
    },
    handler: async (args) => {
      const parsed = z
        .object({
          name: z.string().min(1),
          browserType: z.enum(["chrome", "msedge", "chromium"]).default("chrome"),
          profile: z.string().optional(),
          headless: z.boolean().optional(),
          executablePath: z.string().optional(),
          profileMode: z.enum(["persistent", "isolated", "fallback-isolated"]).optional(),
        })
        .parse(args);
      const session = await sessions.createSession(parsed);
      return text({
        sessionId: session.id,
        status: session.status,
        profileDir: session.profileDir,
      });
    },
  });

  registry.upsert({
    name: "list_sessions",
    description: "List managed sessions.",
    inputSchema: { type: "object", properties: {} },
    handler: async () =>
      text(
        sessions.listSessions().map((s) => ({
          id: s.id,
          name: s.name,
          browserType: s.browserType,
          profileDir: s.profileDir,
          status: s.status,
          profileMode: s.profileMode,
          generation: s.generation,
          createdAt: s.createdAt,
          lastUsedAt: s.lastUsedAt,
          lastError: s.lastError,
        })),
      ),
  });

  registry.upsert({
    name: "close_session",
    description: "Close a managed session and its child browser process.",
    inputSchema: {
      type: "object",
      properties: { sessionId: { type: "string" } },
      required: ["sessionId"],
    },
    handler: async (args) => {
      const { sessionId } = z.object({ sessionId: z.string() }).parse(args);
      await sessions.closeSession(sessionId);
      return text({ closedSessionId: sessionId, status: "closed" });
    },
  });

  registry.upsert({
    name: "restart_session",
    description: "Restart a managed session immediately.",
    inputSchema: {
      type: "object",
      properties: { sessionId: { type: "string" } },
      required: ["sessionId"],
    },
    handler: async (args) => {
      const { sessionId } = z.object({ sessionId: z.string() }).parse(args);
      const session = await sessions.restartSession(sessionId);
      return text({ restartedSessionId: session.id, status: session.status });
    },
  });

  registry.upsert({
    name: "list_local_profiles",
    description: "List local profile directories.",
    inputSchema: { type: "object", properties: { root: { type: "string" } } },
    handler: async (args) => {
      const parsed = z.object({ root: z.string().optional() }).parse(args);
      return text(await profiles.listProfiles(parsed.root));
    },
  });
}
