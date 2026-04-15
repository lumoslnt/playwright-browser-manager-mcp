import fs from "node:fs/promises";
import path from "node:path";
import type { PersistedSession, ProfileSourceRecord, SessionRecord } from "./sessionTypes.js";

export class SessionStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<PersistedSession[]> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      const sessions: unknown[] = Array.isArray(parsed.sessions) ? parsed.sessions : [];
      return sessions.map((s: any) => ({
        ...s,
        generation: s.generation ?? 0,
        profileMode: s.profileMode ?? "persistent",
        profileSource: (s.profileSource as ProfileSourceRecord | undefined) ?? { type: "managed-empty" },
        managedProfile: s.managedProfile ?? true,
        supportsFork: s.supportsFork ?? true,
      })) as PersistedSession[];
    } catch {
      return [];
    }
  }

  async save(records: Iterable<SessionRecord>): Promise<void> {
    const sessions: PersistedSession[] = [];
    for (const s of records) {
      const persistedStatus =
        s.status === "ready" ||
        s.status === "launching" ||
        s.status === "closing" ||
        s.status === "recovering"
          ? "closed"
          : s.status;
      sessions.push({
        id: s.id,
        name: s.name,
        browserType: s.browserType,
        profileDir: s.profileDir,
        originalProfileDir: s.originalProfileDir,
        usingFallbackProfile: s.usingFallbackProfile,
        status: persistedStatus,
        createdAt: s.createdAt,
        lastUsedAt: s.lastUsedAt,
        launchConfig: s.launchConfig,
        lastError: s.lastError,
        generation: s.generation,
        profileMode: s.profileMode,
        profileSource: s.profileSource,
        seededFromSessionId: s.seededFromSessionId,
        seededFromExternalProfilePath: s.seededFromExternalProfilePath,
        materializedAt: s.materializedAt,
        managedProfile: s.managedProfile,
        supportsFork: s.supportsFork,
      });
    }

    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(
      this.filePath,
      JSON.stringify({ version: 1, sessions }, null, 2),
      "utf8",
    );
  }
}
