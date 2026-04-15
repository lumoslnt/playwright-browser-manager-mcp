import { randomUUID } from "node:crypto";
import type { ChildProcessManager } from "../child/childProcessManager.js";
import { SessionNotFoundError, UnsupportedOperationError } from "../infra/errors.js";
import type { ProfileManager } from "../profiles/profileManager.js";
import type { SessionStore } from "./sessionStore.js";
import type {
  PersistedSession,
  ProfileMode,
  ProfileSourceRecord,
  SessionRecord,
} from "./sessionTypes.js";

export class SessionManager {
  private readonly sessions = new Map<string, SessionRecord>();

  constructor(
    private readonly store: SessionStore,
    private readonly profiles: ProfileManager,
    private readonly childManager: ChildProcessManager,
  ) {}

  async init(): Promise<void> {
    await this.profiles.ensureRoot();
    const persisted = await this.store.load();
    for (const s of persisted) {
      this.sessions.set(s.id, this.fromPersisted(s));
    }
  }

  private fromPersisted(s: PersistedSession): SessionRecord {
    return {
      ...s,
      status: s.status === "error" ? "error" : "closed",
      childMcpClient: null,
      childMcpProcess: null,
      childToolCatalog: null,
      managedProfile: s.managedProfile ?? true,
      supportsFork: s.supportsFork ?? true,
    };
  }

  async createSession(input: {
    name: string;
    browserType: "chrome" | "msedge" | "chromium";
    profile?: string;
    headless?: boolean;
    executablePath?: string;
    profileMode?: ProfileMode;
    profileSource?: ProfileSourceRecord;
  }): Promise<SessionRecord> {
    for (const s of this.sessions.values()) {
      if (s.name === input.name) {
        throw new Error(`Session name ${input.name} already exists`);
      }
    }

    const profileMode: ProfileMode = input.profileMode ?? "persistent";
    const profileSource: ProfileSourceRecord = input.profileSource ?? { type: "managed-empty" };

    const { profileDir, seededFromSessionId, seededFromExternalProfilePath, materializedAt, liveExecPath } =
      await this.resolveProfileDir(profileSource, profileMode, input.profile ?? input.name);

    const isLive = profileSource.type === "live-browser-profile";
    const now = new Date().toISOString();
    const session: SessionRecord = {
      id: randomUUID(),
      name: input.name,
      browserType: input.browserType,
      profileDir,
      status: "idle",
      createdAt: now,
      lastUsedAt: now,
      launchConfig: {
        browserType: input.browserType,
        profileDir,
        headless: input.headless,
        executablePath: liveExecPath ?? input.executablePath,
        profileMode,
      },
      childMcpClient: null,
      childMcpProcess: null,
      childToolCatalog: null,
      generation: 0,
      profileMode,
      profileSource,
      managedProfile: !isLive,
      supportsFork: !isLive,
      seededFromSessionId,
      seededFromExternalProfilePath,
      materializedAt,
    };

    this.sessions.set(session.id, session);
    await this.persist();
    return session;
  }

  private async resolveProfileDir(
    profileSource: ProfileSourceRecord,
    profileMode: ProfileMode,
    fallbackName: string,
  ): Promise<{
    profileDir: string;
    seededFromSessionId?: string;
    seededFromExternalProfilePath?: string;
    materializedAt?: string;
    liveExecPath?: string;
  }> {
    if (profileSource.type === "managed-empty") {
      const profileDir =
        profileMode === "isolated"
          ? await this.profiles.createIsolatedProfileDir()
          : this.profiles.resolveProfileDir(fallbackName);
      return { profileDir };
    }

    if (profileSource.type === "external-profile") {
      const { targetDir: profileDir, resolvedSourcePath } =
        await this.profiles.materializeFromExternalProfile(profileSource, fallbackName);
      return {
        profileDir,
        seededFromExternalProfilePath: resolvedSourcePath,
        materializedAt: new Date().toISOString(),
      };
    }

    if (profileSource.type === "session") {
      const sourceSession = this.getSession(profileSource.sessionId);
      const profileDir = await this.profiles.materializeFromSessionProfile(
        sourceSession.profileDir,
        fallbackName,
      );
      return {
        profileDir,
        seededFromSessionId: profileSource.sessionId,
        materializedAt: new Date().toISOString(),
      };
    }

    if (profileSource.type === "live-browser-profile") {
      const { profileDir, executablePath } = await this.profiles.resolveLiveBrowserProfile(profileSource);
      return { profileDir, liveExecPath: executablePath };
    }

    // TypeScript exhaustive check
    const _never: never = profileSource;
    throw new Error(`Unknown profileSource type: ${(_never as any).type}`);
  }

  async forkSession(input: {
    sourceSessionId: string;
    name: string;
    browserType?: "chrome" | "msedge" | "chromium";
    profileMode?: ProfileMode;
    headless?: boolean;
    executablePath?: string;
  }): Promise<SessionRecord> {
    const source = this.getSession(input.sourceSessionId);
    if (!source.supportsFork) {
      throw new UnsupportedOperationError(
        "fork_session",
        "live-browser-profile sessions are not forkable",
        {
          sourceSessionId: input.sourceSessionId,
          recommendedAction:
            "Use a managed persistent session and log in there if you need reusable or forkable auth state.",
        },
      );
    }
    return this.createSession({
      name: input.name,
      browserType: input.browserType ?? "chrome",
      profileMode: input.profileMode,
      headless: input.headless,
      executablePath: input.executablePath,
      profileSource: { type: "session", sessionId: input.sourceSessionId },
    });
  }

  listSessions(): SessionRecord[] {
    return [...this.sessions.values()];
  }

  getSession(sessionId: string): SessionRecord {
    const s = this.sessions.get(sessionId);
    if (!s) throw new SessionNotFoundError(sessionId);
    return s;
  }

  async ensureReady(sessionId: string): Promise<SessionRecord> {
    const session = this.getSession(sessionId);
    await this.childManager.ensureSessionReady(session);
    session.lastUsedAt = new Date().toISOString();
    await this.persist();
    return session;
  }

  async recoverSession(sessionId: string, reason: string): Promise<SessionRecord> {
    const session = this.getSession(sessionId);
    await this.childManager.recoverSession(session, reason);
    session.lastUsedAt = new Date().toISOString();
    await this.persist();
    return session;
  }

  async closeSession(sessionId: string): Promise<void> {
    const session = this.getSession(sessionId);
    await this.childManager.closeSession(session);
    if (session.managedProfile === false) {
      // Live profile — we don't own it, never delete it
    } else if (session.profileMode === "isolated") {
      await this.profiles.deleteIsolatedProfileDir(session.profileDir);
    } else if (session.usingFallbackProfile && session.profileDir !== session.originalProfileDir) {
      await this.profiles.deleteIsolatedProfileDir(session.profileDir);
    }
    session.lastUsedAt = new Date().toISOString();
    await this.persist();
  }

  async restartSession(sessionId: string): Promise<SessionRecord> {
    const session = this.getSession(sessionId);
    if (session.status === "ready" || session.status === "launching") {
      await this.childManager.closeSession(session);
    }
    session.status = "idle";
    await this.childManager.ensureSessionReady(session);
    await this.persist();
    return session;
  }

  async persist(): Promise<void> {
    await this.store.save(this.sessions.values());
  }
}
