import { describe, test, expect } from "vitest";
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

test("createSession with external-profile materializes a new dir and records metadata", async () => {
  const { root, profilesRoot, manager } = await makeEnv();

  // Create a fake external profile with a cookie file
  const extProfile = path.join(root, "ext-profile");
  await fs.mkdir(extProfile, { recursive: true });
  await fs.writeFile(path.join(extProfile, "Cookies"), "auth-cookie");

  const session = await manager.createSession({
    name: "s2",
    browserType: "chrome",
    profileSource: { type: "external-profile", path: extProfile },
  });

  expect(session.profileSource).toEqual({ type: "external-profile", path: extProfile });
  expect(session.seededFromExternalProfilePath).toBe(extProfile);
  expect(session.materializedAt).toBeTruthy();
  // The profileDir should be inside profilesRoot and contain the cookie file
  expect(session.profileDir.startsWith(profilesRoot)).toBe(true);
  const copied = await fs.readFile(path.join(session.profileDir, "Cookies"), "utf8");
  expect(copied).toBe("auth-cookie");
  await cleanup(root);
});

// --- Observability: seededFromExternalProfilePath always populated for all external-profile variants ---

test("createSession with browser+profileName always records resolved seededFromExternalProfilePath", async () => {
  const { root, profilesRoot, manager } = await makeEnv();

  // Create a fake browser user data dir that looks like a real profile
  const fakeUserDataRoot = path.join(root, "fake-browser-user-data");
  const fakeProfileDir = path.join(fakeUserDataRoot, "Profile 1");
  await fs.mkdir(fakeProfileDir, { recursive: true });
  await fs.writeFile(path.join(fakeProfileDir, "Cookies"), "cookie-data");

  // Patch ProfileManager to use our fake browser root
  const pm = (manager as any).profiles as import("../profiles/profileManager.js").ProfileManager;
  const origBrowserRoot = (pm as any).browserUserDataRoot.bind(pm);
  (pm as any).browserUserDataRoot = (_browser: string) => fakeUserDataRoot;

  const session = await manager.createSession({
    name: "obs-profileName",
    browserType: "chrome",
    profileSource: { type: "external-profile", browser: "chrome", profileName: "Profile 1" },
  });

  // Must always contain the resolved real path, not undefined
  expect(session.seededFromExternalProfilePath).toBe(fakeProfileDir);
  expect(session.profileDir.startsWith(profilesRoot)).toBe(true);
  const copied = await fs.readFile(path.join(session.profileDir, "Default", "Cookies"), "utf8");
  expect(copied).toBe("cookie-data");

  (pm as any).browserUserDataRoot = origBrowserRoot;
  await cleanup(root);
});

test("createSession with browser+default always records resolved seededFromExternalProfilePath", async () => {
  const { root, profilesRoot, manager } = await makeEnv();

  const fakeUserDataRoot = path.join(root, "fake-browser-user-data2");
  const fakeDefaultDir = path.join(fakeUserDataRoot, "Default");
  await fs.mkdir(fakeDefaultDir, { recursive: true });
  await fs.writeFile(path.join(fakeDefaultDir, "Cookies"), "default-cookie");

  const pm = (manager as any).profiles as import("../profiles/profileManager.js").ProfileManager;
  const origBrowserRoot = (pm as any).browserUserDataRoot.bind(pm);
  (pm as any).browserUserDataRoot = (_browser: string) => fakeUserDataRoot;

  const session = await manager.createSession({
    name: "obs-default",
    browserType: "chrome",
    profileSource: { type: "external-profile", browser: "chrome", profile: "default" },
  });

  expect(session.seededFromExternalProfilePath).toBe(fakeDefaultDir);
  expect(session.profileDir.startsWith(profilesRoot)).toBe(true);

  (pm as any).browserUserDataRoot = origBrowserRoot;
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

test("createSession with external-profile throws ProfileSeedSourceNotFoundError for missing path", async () => {
  const { root, manager } = await makeEnv();
  await expect(
    manager.createSession({
      name: "bad",
      browserType: "chrome",
      profileSource: { type: "external-profile", path: "/does/not/exist" },
    }),
  ).rejects.toMatchObject({ code: "ProfileSeedSourceNotFoundError" });
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
  const err = new UnsupportedOperationError("fork_session", "live-browser-profile");
  expect(err.code).toBe("UnsupportedOperationError");
  expect(err.message).toContain("fork_session");
});
