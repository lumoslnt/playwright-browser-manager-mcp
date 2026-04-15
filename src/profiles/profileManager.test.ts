import { test, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ProfileManager } from "./profileManager.js";

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "pm-test-"));
}

async function cleanup(...dirs: string[]) {
  for (const d of dirs) await fs.rm(d, { recursive: true, force: true });
}

// --- copyProfileDir ---

test("copyProfileDir copies files recursively", async () => {
  const root = await makeTempDir();
  const src = path.join(root, "src");
  const dst = path.join(root, "dst");
  await fs.mkdir(path.join(src, "sub"), { recursive: true });
  await fs.writeFile(path.join(src, "file.txt"), "hello");
  await fs.writeFile(path.join(src, "sub", "nested.txt"), "world");

  const pm = new ProfileManager(root);
  await pm.copyProfileDir(src, dst);

  expect(await fs.readFile(path.join(dst, "file.txt"), "utf8")).toBe("hello");
  expect(await fs.readFile(path.join(dst, "sub", "nested.txt"), "utf8")).toBe("world");
  await cleanup(root);
});

// --- materializeFromSessionProfile ---

test("materializeFromSessionProfile clones a given profileDir", async () => {
  const root = await makeTempDir();
  const srcProfile = path.join(root, "source-session");
  await fs.mkdir(srcProfile, { recursive: true });
  await fs.writeFile(path.join(srcProfile, "Local State"), "{}");

  const pm = new ProfileManager(root);
  await pm.ensureRoot();
  const result = await pm.materializeFromSessionProfile(srcProfile);

  expect(result.startsWith(root)).toBe(true);
  expect(result).not.toBe(srcProfile);
  expect(await fs.readFile(path.join(result, "Local State"), "utf8")).toBe("{}");
  await cleanup(root);
});

test("materializeFromSessionProfile throws ProfileSeedSourceNotFoundError when dir missing", async () => {
  const root = await makeTempDir();
  const pm = new ProfileManager(root);
  await pm.ensureRoot();

  await expect(pm.materializeFromSessionProfile("/no/such/dir")).rejects.toMatchObject({
    code: "ProfileSeedSourceNotFoundError",
  });
  await cleanup(root);
});

// --- resolveLiveBrowserProfile ---

test("resolveLiveBrowserProfile returns profileDir and executablePath when both exist", async () => {
  const root = await makeTempDir();
  const fakeUserData = await makeTempDir();
  const defaultProfile = path.join(fakeUserData, "Default");
  await fs.mkdir(defaultProfile, { recursive: true });

  const fakeBin = path.join(root, "chrome.exe");
  await fs.writeFile(fakeBin, "");

  class TestProfileManager extends ProfileManager {
    protected override browserUserDataRoot(_browser: "chrome" | "msedge"): string {
      return fakeUserData;
    }
    protected override chromeBinaryPath(): string {
      return fakeBin;
    }
  }

  const pm = new TestProfileManager(root);
  const result = await pm.resolveLiveBrowserProfile({ browser: "chrome", profile: "default" });

  expect(result.profileDir).toBe(fakeUserData);
  expect(result.profileDirectoryName).toBe("Default");
  expect(result.userDataRoot).toBe(fakeUserData);
  expect(result.executablePath).toBe(fakeBin);
  await cleanup(root, fakeUserData);
});

test("resolveLiveBrowserProfile throws ChromeNotInstalledError when binary missing", async () => {
  const root = await makeTempDir();
  const fakeUserData = await makeTempDir();
  const defaultProfile = path.join(fakeUserData, "Default");
  await fs.mkdir(defaultProfile, { recursive: true });

  class TestProfileManager extends ProfileManager {
    protected override browserUserDataRoot(_browser: "chrome" | "msedge"): string {
      return fakeUserData;
    }
    protected override chromeBinaryPath(): string {
      return "/does/not/exist/chrome.exe";
    }
  }

  const pm = new TestProfileManager(root);
  const { ChromeNotInstalledError } = await import("../infra/errors.js");
  await expect(
    pm.resolveLiveBrowserProfile({ browser: "chrome", profile: "default" })
  ).rejects.toBeInstanceOf(ChromeNotInstalledError);
  await cleanup(root, fakeUserData);
});

test("resolveLiveBrowserProfile throws ProfileSeedSourceNotFoundError when profile dir missing", async () => {
  const root = await makeTempDir();
  const fakeUserData = await makeTempDir();
  // No Default/ subdir created

  const fakeBin = path.join(root, "chrome.exe");
  await fs.writeFile(fakeBin, "");

  class TestProfileManager extends ProfileManager {
    protected override browserUserDataRoot(_browser: "chrome" | "msedge"): string {
      return fakeUserData;
    }
    protected override chromeBinaryPath(): string {
      return fakeBin;
    }
  }

  const pm = new TestProfileManager(root);
  await expect(
    pm.resolveLiveBrowserProfile({ browser: "chrome", profile: "default" })
  ).rejects.toMatchObject({ code: "ProfileSeedSourceNotFoundError" });
  await cleanup(root, fakeUserData);
});

test("resolveLiveBrowserProfile with profileName resolves named profile directory", async () => {
  const root = await makeTempDir();
  const fakeUserData = await makeTempDir();
  const namedProfile = path.join(fakeUserData, "Profile 1");
  await fs.mkdir(namedProfile, { recursive: true });

  const fakeBin = path.join(root, "chrome.exe");
  await fs.writeFile(fakeBin, "");

  class TestProfileManager extends ProfileManager {
    protected override browserUserDataRoot(_browser: "chrome" | "msedge"): string {
      return fakeUserData;
    }
    protected override chromeBinaryPath(): string {
      return fakeBin;
    }
  }

  const pm = new TestProfileManager(root);
  const result = await pm.resolveLiveBrowserProfile({ browser: "chrome", profileName: "Profile 1" });

  expect(result.profileDir).toBe(fakeUserData);
  expect(result.profileDirectoryName).toBe("Profile 1");
  await cleanup(root, fakeUserData);
});

test("resolveLiveBrowserProfile rejects profileName with path traversal", async () => {
  const root = await makeTempDir();
  const fakeUserData = await makeTempDir();
  const fakeBin = path.join(root, "chrome.exe");
  await fs.writeFile(fakeBin, "");

  class TestProfileManager extends ProfileManager {
    protected override browserUserDataRoot(_browser: "chrome" | "msedge"): string {
      return fakeUserData;
    }
    protected override chromeBinaryPath(): string {
      return fakeBin;
    }
  }

  const pm = new TestProfileManager(root);
  await expect(
    pm.resolveLiveBrowserProfile({ browser: "chrome", profileName: "../../evil" })
  ).rejects.toMatchObject({ code: "ProfileSeedSourceNotFoundError" });
  await cleanup(root, fakeUserData);
});
