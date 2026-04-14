import { z } from "zod";
import type { ProfileManager } from "../profiles/profileManager.js";
import type { ToolRegistry } from "../server/toolRegistry.js";
import type { SessionManager } from "../sessions/sessionManager.js";

function text(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

const profileSourceSchema = z.union([
  z.object({ type: z.literal("managed-empty") }),
  z.object({ type: z.literal("external-profile"), path: z.string().min(1) }),
  z.object({
    type: z.literal("external-profile"),
    browser: z.enum(["chrome", "msedge"]),
    profile: z.literal("default"),
  }),
  z.object({
    type: z.literal("external-profile"),
    browser: z.enum(["chrome", "msedge"]),
    profileName: z.string().min(1),
  }),
  z.object({ type: z.literal("session"), sessionId: z.string().min(1) }),
]);

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
        profileSource: {
          type: "object",
          description:
            "Where to initialize this session's browser state from. Omit for a fresh empty profile.",
          properties: {
            type: {
              type: "string",
              enum: ["managed-empty", "external-profile", "session"],
            },
            path: { type: "string", description: "Required when type=external-profile and using explicit path" },
            browser: { type: "string", enum: ["chrome", "msedge"], description: "When type=external-profile, pick which browser's profile to clone" },
            profile: { type: "string", enum: ["default"], description: "When browser is set, use 'default' for the default profile" },
            profileName: { type: "string", description: "When browser is set, use a named profile like 'Profile 1'" },
            sessionId: { type: "string", description: "Required when type=session" },
          },
          required: ["type"],
        },
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
          profileSource: profileSourceSchema.optional(),
        })
        .parse(args);
      const session = await sessions.createSession(parsed);
      return text({
        sessionId: session.id,
        status: session.status,
        profileDir: session.profileDir,
        profileSource: session.profileSource,
        seededFromSessionId: session.seededFromSessionId,
        seededFromExternalProfilePath: session.seededFromExternalProfilePath,
        materializedAt: session.materializedAt,
      });
    },
  });

  registry.upsert({
    name: "fork_session",
    description:
      "Fork an existing managed session into a new independent session that shares the same initial browser state (cookies, login, etc.).",
    inputSchema: {
      type: "object",
      properties: {
        sourceSessionId: {
          type: "string",
          description: "The session whose current browser profile will be cloned as the starting point.",
        },
        name: { type: "string", description: "Name for the new session." },
        profileMode: { type: "string", enum: ["persistent", "isolated", "fallback-isolated"] },
        browserType: { type: "string", enum: ["chrome", "msedge", "chromium"] },
        headless: { type: "boolean" },
        executablePath: { type: "string" },
      },
      required: ["sourceSessionId", "name"],
    },
    handler: async (args) => {
      const parsed = z
        .object({
          sourceSessionId: z.string().min(1),
          name: z.string().min(1),
          browserType: z.enum(["chrome", "msedge", "chromium"]).optional(),
          profileMode: z.enum(["persistent", "isolated", "fallback-isolated"]).optional(),
          headless: z.boolean().optional(),
          executablePath: z.string().optional(),
        })
        .parse(args);
      const session = await sessions.forkSession(parsed);
      return text({
        sessionId: session.id,
        status: session.status,
        profileDir: session.profileDir,
        profileSource: session.profileSource,
        seededFromSessionId: session.seededFromSessionId,
        materializedAt: session.materializedAt,
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
          profileSource: s.profileSource,
          seededFromSessionId: s.seededFromSessionId,
          seededFromExternalProfilePath: s.seededFromExternalProfilePath,
          materializedAt: s.materializedAt,
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
