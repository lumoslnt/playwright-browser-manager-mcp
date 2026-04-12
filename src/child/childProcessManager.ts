import type { AppConfig } from "../infra/config.js";
import {
  BrokenSessionError,
  ChildHandshakeError,
  ProfileLockedError,
  mapKnownError,
} from "../infra/errors.js";
import { logger } from "../infra/logger.js";
import type { ProfileManager } from "../profiles/profileManager.js";
import type { SessionRecord } from "../sessions/sessionTypes.js";
import { connectChild } from "./childConnection.js";
import { toChildToolCatalog } from "./childToolCatalog.js";

export class ChildProcessManager {
  constructor(
    private readonly config: AppConfig,
    // profiles is used in Task 10 for fallback-isolated profile dir creation
    private readonly _profiles: ProfileManager,
  ) {}

  private childArgs(session: SessionRecord): string[] {
    const args = [...this.config.commandArgs];
    args.push("--user-data-dir", session.profileDir);
    args.push("--browser", session.browserType);
    if (session.launchConfig.headless) args.push("--headless");
    if (session.launchConfig.executablePath) {
      args.push("--executable-path", session.launchConfig.executablePath);
    }
    return args;
  }

  async probeTools(): Promise<ReturnType<typeof toChildToolCatalog>> {
    try {
      const { client, transport } = await connectChild(
        this.config.command,
        this.config.commandArgs,
      );
      const list = await client.listTools();
      const tools = toChildToolCatalog(list.tools ?? []);
      await client.close();
      await transport.close();
      return tools;
    } catch (err) {
      throw new ChildHandshakeError("Startup probe discovery failed", {
        rawError: err,
      });
    }
  }

  async ensureSessionReady(session: SessionRecord): Promise<void> {
    if (session.status === "ready") return;

    if (session.status === "launching") {
      await session.launchPromise;
      if ((session.status as string) !== "ready") {
        throw new BrokenSessionError(session.id, { lastError: session.lastError });
      }
      return;
    }

    if (session.status === "recovering") {
      await session.recoveryPromise;
      if ((session.status as string) !== "ready") {
        throw new BrokenSessionError(session.id, { lastError: session.lastError });
      }
      return;
    }

    if (session.status === "broken") {
      throw new BrokenSessionError(session.id, { lastError: session.lastError });
    }

    if (session.status === "profile_locked") {
      throw new ProfileLockedError(
        `Session ${session.id} profile is locked`,
        { lastError: session.lastError },
      );
    }

    if (session.status === "closing") {
      throw new BrokenSessionError(session.id, { status: session.status });
    }

    // idle, closed, error → launch / relaunch
    const recoveringFromFailure =
      session.status === "closed" || session.status === "error";

    session.status = recoveringFromFailure ? "recovering" : "launching";
    session.lastUsedAt = new Date().toISOString();

    const launchWork = async () => {
      try {
        const { client, transport } = await connectChild(
          this.config.command,
          this.childArgs(session),
        );
        const list = await client.listTools();
        session.childMcpClient = client;
        session.childMcpProcess = transport;
        session.childToolCatalog = toChildToolCatalog(list.tools ?? []);
        session.generation += 1;
        session.status = "ready";
        session.lastError = undefined;
      } catch (err) {
        const mapped = mapKnownError(err);
        session.lastError = mapped.message;
        if (mapped instanceof ProfileLockedError) {
          if (session.profileMode === "fallback-isolated") {
            // Fallback: switch to a fresh isolated profile dir and retry once
            const isolatedDir = await this._profiles.createIsolatedProfileDir();
            session.originalProfileDir = session.originalProfileDir ?? session.profileDir;
            session.usingFallbackProfile = true;
            session.profileDir = isolatedDir;
            session.launchConfig = { ...session.launchConfig, profileDir: isolatedDir };
            try {
              const { client: c2, transport: t2 } = await connectChild(
                this.config.command,
                this.childArgs(session),
              );
              const list2 = await c2.listTools();
              session.childMcpClient = c2;
              session.childMcpProcess = t2;
              session.childToolCatalog = toChildToolCatalog(list2.tools ?? []);
              session.generation += 1;
              session.status = "ready";
              session.lastError = undefined;
              return;
            } catch (err2) {
              const mapped2 = mapKnownError(err2);
              session.lastError = mapped2.message;
              session.status = "broken";
              throw mapped2;
            }
          }
          session.status = "profile_locked";
        } else {
          session.status = "broken";
        }
        throw mapped;
      } finally {
        session.recoveryPromise = undefined;
      }
    };

    if (recoveringFromFailure) {
      session.recoveryPromise = launchWork();
      try {
        await session.recoveryPromise;
      } catch {
        // status already set inside launchWork
      }
      if ((session.status as string) !== "ready") {
        throw new BrokenSessionError(session.id, { lastError: session.lastError });
      }
    } else {
      session.launchPromise = launchWork();
      try {
        await session.launchPromise;
      } finally {
        session.launchPromise = undefined;
      }
    }
  }

  async recoverSession(session: SessionRecord, reason: string): Promise<void> {
    logger.warn({ sessionId: session.id, reason }, "Recovering session after browser closed error");

    // Close stale handles
    const client = session.childMcpClient as any;
    const transport = session.childMcpProcess as any;
    if (client?.close) {
      await client.close().catch(() => {});
    }
    if (transport?.close) {
      await transport.close().catch(() => {});
    }

    session.childMcpClient = null;
    session.childMcpProcess = null;
    session.childToolCatalog = null;
    session.status = "error";

    await this.ensureSessionReady(session);
  }

  async closeSession(session: SessionRecord): Promise<void> {
    if (session.status === "idle") {
      session.status = "closed";
      return;
    }

    session.status = "closing";
    const client = session.childMcpClient as any;
    const transport = session.childMcpProcess as any;

    if (client?.close) {
      await client.close().catch((err: unknown) => {
        logger.warn({ err }, "Failed to close child MCP client cleanly");
      });
    }
    if (transport?.close) {
      await transport.close().catch((err: unknown) => {
        logger.warn({ err }, "Failed to close child MCP transport cleanly");
      });
    }

    session.childMcpClient = null;
    session.childMcpProcess = null;
    session.childToolCatalog = null;
    session.status = "closed";
  }
}
