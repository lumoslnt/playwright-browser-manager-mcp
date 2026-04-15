export type SessionStatus =
  | "idle"
  | "launching"
  | "ready"
  | "closing"
  | "closed"
  | "error"
  | "recovering"
  | "broken"
  | "profile_locked";

export type ProfileMode = "persistent" | "isolated" | "fallback-isolated";

export type ProfileSourceRecord =
  | { type: "managed-empty" }
  | { type: "external-profile"; path: string }
  | { type: "external-profile"; browser: "chrome" | "msedge"; profile: "default" }
  | { type: "external-profile"; browser: "chrome" | "msedge"; profileName: string }
  | { type: "session"; sessionId: string }
  | { type: "live-browser-profile"; browser: "chrome"; profile: "default" }
  | { type: "live-browser-profile"; browser: "chrome"; profileName: string };

export interface LaunchConfig {
  browserType: "chrome" | "msedge" | "chromium";
  profileDir: string;
  headless?: boolean;
  executablePath?: string;
  profileMode?: ProfileMode;
}

export interface ChildToolInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface SessionRecord {
  id: string;
  name: string;
  browserType: "chrome" | "msedge" | "chromium";
  profileDir: string;
  originalProfileDir?: string;
  usingFallbackProfile?: boolean;
  status: SessionStatus;
  createdAt: string;
  lastUsedAt: string;
  launchConfig: LaunchConfig;
  childMcpProcess: unknown | null;
  childMcpClient: unknown | null;
  childToolCatalog: ChildToolInfo[] | null;
  launchPromise?: Promise<void>;
  lastError?: string;
  generation: number;
  recoveryPromise?: Promise<void>;
  profileMode: ProfileMode;
  profileSource: ProfileSourceRecord;
  managedProfile: boolean;
  supportsFork: boolean;
  seededFromSessionId?: string;
  seededFromExternalProfilePath?: string;
  materializedAt?: string;
}

export interface PersistedSession {
  id: string;
  name: string;
  browserType: "chrome" | "msedge" | "chromium";
  profileDir: string;
  originalProfileDir?: string;
  usingFallbackProfile?: boolean;
  status: Exclude<SessionStatus, "ready" | "launching" | "closing" | "recovering">;
  createdAt: string;
  lastUsedAt: string;
  launchConfig: LaunchConfig;
  lastError?: string;
  generation: number;
  profileMode: ProfileMode;
  profileSource: ProfileSourceRecord;
  managedProfile: boolean;
  supportsFork: boolean;
  seededFromSessionId?: string;
  seededFromExternalProfilePath?: string;
  materializedAt?: string;
}
