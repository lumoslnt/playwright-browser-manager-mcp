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
  const result = await pm.materializeFromExternalProfile({ type: "external-profile", path: srcProfile });

  expect(result.startsWith(root)).toBe(true);
  expect(await fs.readFile(path.join(result, "Cookies"), "utf8")).toBe("auth-data");
  await cleanup(root, externalRoot);
});

test("materializeFromExternalProfile throws ProfileSeedSourceNotFoundError when path missing", async () => {
  const root = await makeTempDir();
  const pm = new ProfileManager(root);
  await pm.ensureRoot();

  await expect(pm.materializeFromExternalProfile({ type: "external-profile", path: "/does/not/exist" })).rejects.toMatchObject({
    code: "ProfileSeedSourceNotFoundError",
  });
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
