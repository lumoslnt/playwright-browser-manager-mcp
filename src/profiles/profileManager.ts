import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  ProfileSeedSourceNotFoundError,
  ProfileSeedCopyError,
  ChromeNotInstalledError,
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

  protected browserUserDataRoot(browser: "chrome" | "msedge"): string {
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

  protected chromeBinaryPath(): string {
    const { platform } = process;
    if (platform === "win32") {
      const programFiles = process.env["PROGRAMFILES"] ?? "C:\\Program Files";
      return `${programFiles}\\Google\\Chrome\\Application\\chrome.exe`;
    }
    if (platform === "darwin") {
      return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    }
    return "/usr/bin/google-chrome";
  }

  async resolveLiveBrowserProfile(
    input: { browser: "chrome"; profile: "default" } | { browser: "chrome"; profileName: string },
  ): Promise<{ profileDir: string; executablePath: string }> {
    const userDataRoot = this.browserUserDataRoot(input.browser);
    let profileDir: string;

    if ("profileName" in input) {
      const { profileName } = input;
      if (
        profileName.includes("..") ||
        profileName.includes("/") ||
        profileName.includes("\\")
      ) {
        throw new ProfileSeedSourceNotFoundError("live-browser-profile", profileName);
      }
      const userDataRootResolved = path.resolve(userDataRoot);
      const candidate = path.resolve(userDataRoot, profileName);
      if (
        !candidate.startsWith(userDataRootResolved + path.sep) &&
        candidate !== userDataRootResolved
      ) {
        throw new ProfileSeedSourceNotFoundError("live-browser-profile", profileName);
      }
      profileDir = candidate;
    } else {
      profileDir = path.join(userDataRoot, "Default");
    }

    try {
      const stat = await fs.stat(profileDir);
      if (!stat.isDirectory()) throw new Error("not a directory");
    } catch {
      throw new ProfileSeedSourceNotFoundError("live-browser-profile", profileDir);
    }

    const executablePath = this.chromeBinaryPath();
    try {
      await fs.access(executablePath);
    } catch {
      throw new ChromeNotInstalledError(executablePath);
    }

    return { profileDir, executablePath };
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
        // Prevent path traversal: profileName must be a single path segment with no separators
        if (
          profileSubdir.includes("..") ||
          profileSubdir.includes("/") ||
          profileSubdir.includes("\\")
        ) {
          throw new ProfileSeedSourceNotFoundError("external-profile", profileSubdir);
        }
        // Post-resolve boundary check: ensure resolved path stays within userDataRoot
        const userDataRootResolved = path.resolve(userDataRoot);
        const candidate = path.resolve(userDataRoot, profileSubdir);
        if (!candidate.startsWith(userDataRootResolved + path.sep) && candidate !== userDataRootResolved) {
          throw new ProfileSeedSourceNotFoundError("external-profile", profileSubdir);
        }
        resolvedPath = candidate;
      } else {
        // profile: "default"
        resolvedPath = path.join(userDataRoot, "Default");
      }
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
  ): Promise<{ targetDir: string; resolvedSourcePath: string }> {
    const resolvedSourcePath = await this.resolveExternalProfile(input);
    const targetDir = await this.createManagedCloneDir(targetName);

    if ("browser" in input) {
      // Browser-form: resolvedSourcePath is a profile subdirectory (e.g. Default/).
      // Chromium is launched with targetDir as --user-data-dir, so it expects:
      //   targetDir/Default/...   <- profile data
      //   targetDir/Local State   <- encryption key (from userDataRoot, not the profile subdir)
      const userDataRoot = this.browserUserDataRoot(input.browser);
      const profileDestDir = path.join(targetDir, "Default");
      await fs.mkdir(profileDestDir, { recursive: true });
      await this.copyProfileDir(resolvedSourcePath, profileDestDir);
      await this.copyLocalState(userDataRoot, targetDir);
    } else {
      // Path-form: caller provides an explicit path; copy verbatim into targetDir.
      await this.copyProfileDir(resolvedSourcePath, targetDir);
    }

    return { targetDir, resolvedSourcePath };
  }

  private async copyLocalState(userDataRoot: string, cloneDir: string): Promise<void> {
    const src = path.join(userDataRoot, "Local State");
    const dst = path.join(cloneDir, "Local State");
    try {
      await fs.copyFile(src, dst);
    } catch {
      // No Local State in userDataRoot — skip silently.
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
    const targetDir = await this.createManagedCloneDir(targetName);
    await this.copyProfileDir(sourceProfileDir, targetDir);
    return targetDir;
  }
}
