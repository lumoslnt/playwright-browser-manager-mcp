import { test, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ProfileManager } from "../profiles/profileManager.js";
import { SessionStore } from "./sessionStore.js";
import { SessionManager } from "./sessionManager.js";

// Minimal stub for ChildProcessManager
const noopChildManager = {
  ensureSessionReady: async () => {},
  closeSession: async () => {},
  recoverSession: async () => {},
} as any;

async function makeEnv() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sm-test-"));
  const profilesRoot = path.join(root, "profiles");
  const storeFile = path.join(root, "sessions.json");
  const profiles = new ProfileManager(profilesRoot);
  const store = new SessionStore(storeFile);
  const manager = new SessionManager(store, profiles, noopChildManager);
  await manager.init();
  return { root, profilesRoot, profiles, store, manager };
}

async function cleanup(root: string) {
  await fs.rm(root, { recursive: true, force: true });
}

test("createSession with no profileSource defaults to managed-empty", async () => {
  const { root, manager } = await makeEnv();
  const session = await manager.createSession({ name: "s1", browserType: "chrome" });
  expect(session.profileSource).toEqual({ type: "managed-empty" });
  expect(session.materializedAt).toBeUndefined();
  await cleanup(root);
});


test("createSession with session source forks the source profileDir", async () => {
  const { root, profilesRoot, manager } = await makeEnv();

  // Create source session first
  const src = await manager.createSession({ name: "src", browserType: "chrome" });
  // Put a file in its profileDir so we can verify the fork
  await fs.mkdir(src.profileDir, { recursive: true });
  await fs.writeFile(path.join(src.profileDir, "session-state"), "logged-in");

  const forked = await manager.createSession({
    name: "forked",
    browserType: "chrome",
    profileSource: { type: "session", sessionId: src.id },
  });

  expect(forked.profileSource).toEqual({ type: "session", sessionId: src.id });
  expect(forked.seededFromSessionId).toBe(src.id);
  expect(forked.materializedAt).toBeTruthy();
  expect(forked.profileDir).not.toBe(src.profileDir);
  expect(forked.profileDir.startsWith(profilesRoot)).toBe(true);
  const copied = await fs.readFile(path.join(forked.profileDir, "session-state"), "utf8");
  expect(copied).toBe("logged-in");
  await cleanup(root);
});

test("forkSession is sugar for createSession with session source", async () => {
  const { root, manager } = await makeEnv();
  const src = await manager.createSession({ name: "src2", browserType: "chrome" });
  await fs.mkdir(src.profileDir, { recursive: true });

  const forked = await manager.forkSession({
    sourceSessionId: src.id,
    name: "fork2",
    profileMode: "isolated",
  });

  expect(forked.profileSource).toEqual({ type: "session", sessionId: src.id });
  expect(forked.seededFromSessionId).toBe(src.id);
  expect(forked.profileMode).toBe("isolated");
  await cleanup(root);
});


test("createSession with session source throws SessionNotFoundError for unknown session", async () => {
  const { root, manager } = await makeEnv();
  await expect(
    manager.createSession({
      name: "bad2",
      browserType: "chrome",
      profileSource: { type: "session", sessionId: "no-such-id" },
    }),
  ).rejects.toMatchObject({ code: "SessionNotFoundError" });
  await cleanup(root);
});

test("UnsupportedOperationError class exists with correct code and message", async () => {
  const { UnsupportedOperationError } = await import("../infra/errors.js");
  const err = new UnsupportedOperationError("fork_session", "some reason");
  expect(err.code).toBe("UnsupportedOperationError");
  expect(err.message).toContain("fork_session");
});
