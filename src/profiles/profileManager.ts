import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  ProfileSeedSourceNotFoundError,
  ProfileSeedCopyError,
  ChromeNotInstalledError,
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

  protected chromeBinaryPaths(): string[] {
    const { platform } = process;
    if (platform === "win32") {
      const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");
      const programFiles = process.env["PROGRAMFILES"] ?? "C:\\Program Files";
      const programFilesX86 = process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)";
      const rel = "Google\\Chrome\\Application\\chrome.exe";
      return [
        path.join(localAppData, rel),
        path.join(programFiles, rel),
        path.join(programFilesX86, rel),
      ];
    }
    if (platform === "darwin") {
      return ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];
    }
    return ["/usr/bin/google-chrome"];
  }

  async resolveLiveBrowserProfile(
    input: { browser: "chrome"; profile: "default" } | { browser: "chrome"; profileName: string },
  ): Promise<{ profileDir: string; profileDirectoryName: string; userDataRoot: string; executablePath: string }> {
    const userDataRoot = this.browserUserDataRoot(input.browser);
    let profileDirectoryName: string;

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
      profileDirectoryName = profileName;
    } else {
      profileDirectoryName = "Default";
    }

    const profileDir = path.join(userDataRoot, profileDirectoryName);

    try {
      const stat = await fs.stat(profileDir);
      if (!stat.isDirectory()) throw new Error("not a directory");
    } catch {
      throw new ProfileSeedSourceNotFoundError("live-browser-profile", profileDir);
    }

    const searchedPaths = this.chromeBinaryPaths();
    let executablePath: string | undefined;
    for (const candidate of searchedPaths) {
      try {
        await fs.access(candidate);
        executablePath = candidate;
        break;
      } catch {
        // continue
      }
    }
    if (!executablePath) {
      throw new ChromeNotInstalledError(searchedPaths);
    }

    return { profileDir: userDataRoot, profileDirectoryName, userDataRoot, executablePath };
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
