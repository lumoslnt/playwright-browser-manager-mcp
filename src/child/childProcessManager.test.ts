import { test, expect } from "vitest";
import { ChildProcessManager } from "./childProcessManager.js";
import type { SessionRecord } from "../sessions/sessionTypes.js";

function makeConfig() {
  return {
    command: "npx",
    commandArgs: ["-y", "@playwright/mcp@latest"],
    defaultBrowser: "chrome" as const,
    rootDir: "/tmp/psmcp",
    profilesDir: "/tmp/psmcp/profiles",
    sessionsFile: "/tmp/psmcp/sessions.json",
  };
}

function makeRecord(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: "test-id",
    name: "test",
    browserType: "chrome",
    profileDir: "/tmp/profiles/test-profile",
    status: "idle",
    createdAt: "2026-01-01T00:00:00Z",
    lastUsedAt: "2026-01-01T00:00:00Z",
    launchConfig: { browserType: "chrome", profileDir: "/tmp/profiles/test-profile" },
    childMcpProcess: null,
    childMcpClient: null,
    childToolCatalog: null,
    generation: 0,
    profileMode: "persistent",
    profileSource: { type: "managed-empty" },
    ...overrides,
  };
}

function childArgs(session: SessionRecord): string[] {
  const mgr = new ChildProcessManager(makeConfig(), null as any);
  return (mgr as any).childArgs(session);
}

// --- Windows path normalization ---

test("childArgs normalizes backslashes in --user-data-dir to forward slashes", () => {
  const winPath = "C:\\Users\\alice\\AppData\\Local\\Google\\Chrome\\User Data";
  const session = makeRecord({
    profileDir: winPath,
    launchConfig: { browserType: "chrome", profileDir: winPath },
  });

  const args = childArgs(session);
  expect(args).toContain("--user-data-dir");
  expect(args).toContain("C:/Users/alice/AppData/Local/Google/Chrome/User Data");
  expect(args).not.toContain(winPath); // backslash form must NOT appear
});

test("--user-data-dir is immediately followed by the normalized path", () => {
  const winPath = "C:\\Users\\alice\\AppData\\Local\\Google\\Chrome\\User Data";
  const session = makeRecord({
    profileDir: winPath,
    launchConfig: { browserType: "chrome", profileDir: winPath },
  });

  const args = childArgs(session);
  const udIdx = args.indexOf("--user-data-dir");
  expect(udIdx).toBeGreaterThanOrEqual(0);
  expect(args[udIdx + 1]).toBe("C:/Users/alice/AppData/Local/Google/Chrome/User Data");
});

// --- managed session launch args ---

test("managed session: childArgs does NOT include --profile-directory", () => {
  const session = makeRecord({
    profileSource: { type: "managed-empty" },
    profileDir: "/tmp/profiles/managed-profile",
    launchConfig: {
      browserType: "chrome",
      profileDir: "/tmp/profiles/managed-profile",
    },
  });

  const args = childArgs(session);
  expect(args).toContain("--user-data-dir");
  expect(args).not.toContain("--profile-directory");
  expect(args).not.toContain("--executable-path");
});

test("managed session with headless: childArgs includes --headless", () => {
  const session = makeRecord({
    launchConfig: {
      browserType: "chrome",
      profileDir: "/tmp/profiles/managed-profile",
      headless: true,
    },
  });

  const args = childArgs(session);
  expect(args).toContain("--headless");
});
