import { describe, test, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SessionStore } from "./sessionStore.js";
import type { SessionRecord } from "./sessionTypes.js";

function makeMinimalRecord(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: "id-1",
    name: "test",
    browserType: "chrome",
    profileDir: "/tmp/prof",
    status: "idle",
    createdAt: "2026-01-01T00:00:00Z",
    lastUsedAt: "2026-01-01T00:00:00Z",
    launchConfig: { browserType: "chrome", profileDir: "/tmp/prof" },
    childMcpProcess: null,
    childMcpClient: null,
    childToolCatalog: null,
    generation: 0,
    profileMode: "persistent",
    profileSource: { type: "managed-empty" },
    ...overrides,
  };
}

async function makeTempFile(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "store-test-"));
  return path.join(dir, "sessions.json");
}

test("saves and loads profileSource managed-empty", async () => {
  const file = await makeTempFile();
  const store = new SessionStore(file);
  const record = makeMinimalRecord({ profileSource: { type: "managed-empty" } });
  await store.save([record]);
  const loaded = await store.load();
  expect(loaded[0].profileSource).toEqual({ type: "managed-empty" });
});


test("saves and loads profileSource session", async () => {
  const file = await makeTempFile();
  const store = new SessionStore(file);
  const record = makeMinimalRecord({
    profileSource: { type: "session", sessionId: "src-id" },
    seededFromSessionId: "src-id",
    materializedAt: "2026-04-14T00:00:00Z",
  });
  await store.save([record]);
  const loaded = await store.load();
  expect(loaded[0].profileSource).toEqual({ type: "session", sessionId: "src-id" });
  expect(loaded[0].seededFromSessionId).toBe("src-id");
});

test("defaults profileSource to managed-empty for old records without it", async () => {
  const file = await makeTempFile();
  // Write a raw file without profileSource (old format)
  await fs.writeFile(
    file,
    JSON.stringify({
      version: 1,
      sessions: [
        {
          id: "old-id",
          name: "old",
          browserType: "chrome",
          profileDir: "/tmp/old",
          status: "idle",
          createdAt: "2026-01-01T00:00:00Z",
          lastUsedAt: "2026-01-01T00:00:00Z",
          launchConfig: { browserType: "chrome", profileDir: "/tmp/old" },
          generation: 0,
          profileMode: "persistent",
        },
      ],
    }),
    "utf8",
  );
  const store = new SessionStore(file);
  const loaded = await store.load();
  expect(loaded[0].profileSource).toEqual({ type: "managed-empty" });
});
