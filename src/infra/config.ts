import os from "node:os";
import path from "node:path";

export interface AppConfig {
  command: string;
  commandArgs: string[];
  defaultBrowser: "chrome" | "msedge" | "chromium";
  defaultHeadless?: boolean;
  browserExecutable?: string;
  rootDir: string;
  profilesDir: string;
  sessionsFile: string;
}

function platformDefaultRoot(): string {
  if (process.platform === "win32") {
    return path.join(process.env.LOCALAPPDATA ?? os.homedir(), "playwright-browser-manager-mcp");
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "playwright-browser-manager-mcp");
  }
  return path.join(os.homedir(), ".local", "share", "playwright-browser-manager-mcp");
}

export function loadConfig(): AppConfig {
  const rootDir = process.env.PSMCP_PROFILE_ROOT || platformDefaultRoot();
  return {
    command: process.env.PSMCP_PLAYWRIGHT_MCP_COMMAND || "npx",
    commandArgs: (process.env.PSMCP_PLAYWRIGHT_MCP_ARGS || "-y @playwright/mcp@latest")
      .split(" ")
      .filter(Boolean),
    defaultBrowser: (process.env.PSMCP_DEFAULT_BROWSER as AppConfig["defaultBrowser"]) || "chrome",
    defaultHeadless: process.env.PSMCP_HEADLESS_DEFAULT === "true",
    browserExecutable: process.env.PSMCP_BROWSER_EXECUTABLE,
    rootDir,
    profilesDir: path.join(rootDir, "profiles"),
    sessionsFile: path.join(rootDir, "sessions.json"),
  };
}
