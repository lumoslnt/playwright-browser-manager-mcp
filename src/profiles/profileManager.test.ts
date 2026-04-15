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

// --- resolveExternalProfile ---

test("resolveExternalProfile returns explicit path unchanged when directory exists", async () => {
  const root = await makeTempDir();
  const extProfile = path.join(root, "ext-profile");
  await fs.mkdir(extProfile, { recursive: true });

  const pm = new ProfileManager(root);
  const resolved = await pm.resolveExternalProfile({ type: "external-profile", path: extProfile });
  expect(resolved).toBe(extProfile);
  await cleanup(root);
});

test("resolveExternalProfile throws ProfileSeedSourceNotFoundError when explicit path missing", async () => {
  const root = await makeTempDir();
  const pm = new ProfileManager(root);

  await expect(pm.resolveExternalProfile({ type: "external-profile", path: "/does/not/exist" })).rejects.toMatchObject({
    code: "ProfileSeedSourceNotFoundError",
  });
  await cleanup(root);
});

test("resolveExternalProfile throws ProfileSeedSourceNotFoundError for missing default browser profile", async () => {
  const root = await makeTempDir();
  const pm = new ProfileManager(root);
  // On any CI machine, there will be no Chrome user data at the default path
  // with a "Profile 999" — so this should throw.
  await expect(
    pm.resolveExternalProfile({ type: "external-profile", browser: "chrome", profileName: "Profile 999" }),
  ).rejects.toMatchObject({ code: "ProfileSeedSourceNotFoundError" });
  await cleanup(root);
});

// --- materializeFromExternalProfile ---

test("materializeFromExternalProfile clones external dir into profilesRoot", async () => {
  const root = await makeTempDir();
  const externalRoot = await makeTempDir();
  const srcProfile = path.join(externalRoot, "myprofile");
  await fs.mkdir(srcProfile, { recursive: true });
  await fs.writeFile(path.join(srcProfile, "Cookies"), "auth-data");

  const pm = new ProfileManager(root);
  await pm.ensureRoot();
  const { targetDir, resolvedSourcePath } = await pm.materializeFromExternalProfile({
    type: "external-profile",
    path: srcProfile,
  });

  expect(targetDir.startsWith(root)).toBe(true);
  expect(resolvedSourcePath).toBe(srcProfile);
  expect(await fs.readFile(path.join(targetDir, "Cookies"), "utf8")).toBe("auth-data");
  await cleanup(root, externalRoot);
});

test("materializeFromExternalProfile throws ProfileSeedSourceNotFoundError when path missing", async () => {
  const root = await makeTempDir();
  const pm = new ProfileManager(root);
  await pm.ensureRoot();

  await expect(
    pm.materializeFromExternalProfile({ type: "external-profile", path: "/does/not/exist" }),
  ).rejects.toMatchObject({
    code: "ProfileSeedSourceNotFoundError",
  });
  await cleanup(root);
});

// --- Security boundary tests ---

test("resolveExternalProfile rejects profileName containing '..'", async () => {
  const root = await makeTempDir();
  const pm = new ProfileManager(root);
  await expect(
    pm.resolveExternalProfile({ type: "external-profile", browser: "chrome", profileName: "../../evil" }),
  ).rejects.toMatchObject({ code: "ProfileSeedSourceNotFoundError" });
  await cleanup(root);
});

test("resolveExternalProfile rejects profileName containing forward slash", async () => {
  const root = await makeTempDir();
  const pm = new ProfileManager(root);
  await expect(
    pm.resolveExternalProfile({ type: "external-profile", browser: "chrome", profileName: "sub/dir" }),
  ).rejects.toMatchObject({ code: "ProfileSeedSourceNotFoundError" });
  await cleanup(root);
});

test("resolveExternalProfile rejects profileName containing backslash", async () => {
  const root = await makeTempDir();
  const pm = new ProfileManager(root);
  await expect(
    pm.resolveExternalProfile({ type: "external-profile", browser: "chrome", profileName: "sub\\dir" }),
  ).rejects.toMatchObject({ code: "ProfileSeedSourceNotFoundError" });
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

// --- Local State os_crypt key patching ---

test("materializeFromExternalProfile with browser form produces user-data-dir layout on win32", async () => {
  if (process.platform !== "win32") return;

  // Simulate Chrome User Data root:
  //   fakeUserData/Local State          <- has the real AES key (top-level)
  //   fakeUserData/Default/Network/Cookies  <- cookies encrypted with that key
  const fakeUserData = await makeTempDir();
  const defaultProfile = path.join(fakeUserData, "Default");
  const networkDir = path.join(defaultProfile, "Network");
  await fs.mkdir(networkDir, { recursive: true });

  const realKey = "REAL_DPAPI_WRAPPED_KEY_BASE64";
  await fs.writeFile(
    path.join(fakeUserData, "Local State"),
    JSON.stringify({ os_crypt: { encrypted_key: realKey }, other: "preserved" }),
  );
  await fs.writeFile(path.join(networkDir, "Cookies"), "encrypted-cookie-data");

  const root = await makeTempDir();

  class TestProfileManager extends ProfileManager {
    override browserUserDataRoot(_browser: "chrome" | "msedge"): string {
      return fakeUserData;
    }
  }

  const pm = new TestProfileManager(root);
  await pm.ensureRoot();

  const { targetDir } = await pm.materializeFromExternalProfile({
    type: "external-profile",
    browser: "chrome",
    profile: "default",
  });

  // Clone must be a user-data-dir: Local State at root, profile data under Default/
  const clonedLS = JSON.parse(await fs.readFile(path.join(targetDir, "Local State"), "utf8"));
  expect(clonedLS.os_crypt.encrypted_key).toBe(realKey);
  expect(await fs.readFile(path.join(targetDir, "Default", "Network", "Cookies"), "utf8")).toBe("encrypted-cookie-data");

  await cleanup(root, fakeUserData);
});

test("materializeFromExternalProfile with path form does not patch Local State", async () => {
  if (process.platform !== "win32") return;

  const root = await makeTempDir();
  const externalRoot = await makeTempDir();
  const srcProfile = path.join(externalRoot, "myprofile");
  await fs.mkdir(srcProfile, { recursive: true });
  const originalKey = "ORIGINAL_WRONG_KEY";
  await fs.writeFile(
    path.join(srcProfile, "Local State"),
    JSON.stringify({ os_crypt: { encrypted_key: originalKey } }),
  );

  const pm = new ProfileManager(root);
  await pm.ensureRoot();

  const { targetDir } = await pm.materializeFromExternalProfile({
    type: "external-profile",
    path: srcProfile,
  });

  // path-form: no patching, Local State copied verbatim
  const clonedLS = JSON.parse(await fs.readFile(path.join(targetDir, "Local State"), "utf8"));
  expect(clonedLS.os_crypt.encrypted_key).toBe(originalKey);

  await cleanup(root, externalRoot);
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

  expect(result.profileDir).toBe(defaultProfile);
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

  expect(result.profileDir).toBe(namedProfile);
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
