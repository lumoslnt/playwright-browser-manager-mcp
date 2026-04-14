import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  ProfileSeedSourceNotFoundError,
  ProfileSeedCopyError,
} from "../infra/errors.js";
import type { ProfileSourceRecord } from "../sessions/sessionTypes.js";

type ExternalProfileInput = Extract<ProfileSourceRecord, { type: "external-profile" }>;

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

  private browserUserDataRoot(browser: "chrome" | "msedge"): string {
    const { platform } = process;
    if (platform === "win32") {
      const localAppData =
        process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");
      return browser === "chrome"
        ? path.join(localAppData, "Google", "Chrome", "User Data")
        : path.join(localAppData, "Microsoft", "Edge", "User Data");
    }
    if (platform === "darwin") {
      return browser === "chrome"
        ? path.join(os.homedir(), "Library", "Application Support", "Google", "Chrome")
        : path.join(os.homedir(), "Library", "Application Support", "Microsoft Edge");
    }
    // Linux
    return browser === "chrome"
      ? path.join(os.homedir(), ".config", "google-chrome")
      : path.join(os.homedir(), ".config", "microsoft-edge");
  }

  async resolveExternalProfile(input: ExternalProfileInput): Promise<string> {
    let resolvedPath: string;

    if ("path" in input) {
      resolvedPath = input.path;
    } else {
      const userDataRoot = this.browserUserDataRoot(input.browser);
      let profileSubdir: string;
      if ("profileName" in input) {
        profileSubdir = input.profileName;
      } else {
        // profile: "default"
        profileSubdir = "Default";
      }
      resolvedPath = path.join(userDataRoot, profileSubdir);
    }

    try {
      const stat = await fs.stat(resolvedPath);
      if (!stat.isDirectory()) throw new Error("not a directory");
    } catch {
      throw new ProfileSeedSourceNotFoundError("external-profile", resolvedPath);
    }
    return resolvedPath;
  }

  private async createManagedCloneDir(baseName?: string): Promise<string> {
    const name = baseName ? `clone-${baseName}-${randomUUID()}` : `clone-${randomUUID()}`;
    const dir = path.join(this.profilesRoot, name);
    await fs.mkdir(dir, { recursive: true });
    return dir;
  }

  async materializeFromExternalProfile(
    input: ExternalProfileInput,
    targetName?: string,
  ): Promise<string> {
    const sourcePath = await this.resolveExternalProfile(input);
    const targetDir = await this.createManagedCloneDir(targetName);
    await this.copyProfileDir(sourcePath, targetDir);
    return targetDir;
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
    const targetDir = await this.createManagedCloneDir(targetName);
    await this.copyProfileDir(sourceProfileDir, targetDir);
    return targetDir;
  }
}
