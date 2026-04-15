import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  ProfileSeedSourceNotFoundError,
  ProfileSeedCopyError,
} from "../infra/errors.js";

export class ProfileManager {
  constructor(private readonly profilesRoot: string) {}

  async ensureRoot(): Promise<void> {
    await fs.mkdir(this.profilesRoot, { recursive: true });
  }

  resolveProfileDir(profileName?: string): string {
    const profile = profileName && profileName.trim().length > 0 ? profileName : "default";
    return path.join(this.profilesRoot, profile);
  }

  async createIsolatedProfileDir(): Promise<string> {
    const dir = path.join(this.profilesRoot, `isolated-${randomUUID()}`);
    await fs.mkdir(dir, { recursive: true });
    return dir;
  }

  async deleteIsolatedProfileDir(dir: string): Promise<void> {
    await fs.rm(dir, { recursive: true, force: true });
  }

  async listProfiles(root?: string): Promise<Array<{ name: string; path: string }>> {
    const base = root ?? this.profilesRoot;
    await fs.mkdir(base, { recursive: true });
    const entries = await fs.readdir(base, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => ({ name: e.name, path: path.join(base, e.name) }));
  }

  async copyProfileDir(sourceDir: string, targetDir: string): Promise<void> {
    try {
      await fs.cp(sourceDir, targetDir, { recursive: true });
    } catch (err) {
      throw new ProfileSeedCopyError(sourceDir, targetDir, err);
    }
  }

  async materializeFromSessionProfile(
    sourceProfileDir: string,
    targetName?: string,
  ): Promise<string> {
    try {
      const stat = await fs.stat(sourceProfileDir);
      if (!stat.isDirectory()) throw new Error("not a directory");
    } catch {
      throw new ProfileSeedSourceNotFoundError("session", sourceProfileDir);
    }
    const name = targetName ? `clone-${targetName}-${randomUUID()}` : `clone-${randomUUID()}`;
    const targetDir = path.join(this.profilesRoot, name);
    await fs.mkdir(targetDir, { recursive: true });
    await this.copyProfileDir(sourceProfileDir, targetDir);
    return targetDir;
  }
}
