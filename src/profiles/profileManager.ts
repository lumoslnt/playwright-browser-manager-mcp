import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

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
}
