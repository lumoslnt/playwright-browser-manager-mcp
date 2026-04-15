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
