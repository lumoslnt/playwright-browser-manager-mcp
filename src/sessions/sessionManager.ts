import { randomUUID } from "node:crypto";
import type { ChildProcessManager } from "../child/childProcessManager.js";
import { SessionNotFoundError } from "../infra/errors.js";
import type { ProfileManager } from "../profiles/profileManager.js";
import type { SessionStore } from "./sessionStore.js";
import type { PersistedSession, ProfileMode, SessionRecord } from "./sessionTypes.js";

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
    };
  }

  async createSession(input: {
    name: string;
    browserType: "chrome" | "msedge" | "chromium";
    profile?: string;
    headless?: boolean;
    executablePath?: string;
    profileMode?: ProfileMode;
  }): Promise<SessionRecord> {
    for (const s of this.sessions.values()) {
      if (s.name === input.name) {
        throw new Error(`Session name ${input.name} already exists`);
      }
    }

    const profileMode: ProfileMode = input.profileMode ?? "persistent";
    const profileDir =
      profileMode === "isolated"
        ? await this.profiles.createIsolatedProfileDir()
        : this.profiles.resolveProfileDir(input.profile ?? input.name);

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
        executablePath: input.executablePath,
        profileMode,
      },
      childMcpClient: null,
      childMcpProcess: null,
      childToolCatalog: null,
      generation: 0,
      profileMode,
    };

    this.sessions.set(session.id, session);
    await this.persist();
    return session;
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
    if (session.profileMode === "isolated") {
      await this.profiles.deleteIsolatedProfileDir(session.profileDir);
    } else if (session.usingFallbackProfile && session.profileDir !== session.originalProfileDir) {
      // Clean up the temporary fallback-isolated dir too
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
