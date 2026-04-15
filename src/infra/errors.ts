export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super("ValidationError", message, details);
  }
}

export class MissingSessionIdError extends AppError {
  constructor() {
    super("MissingSessionIdError", "sessionId is required");
  }
}

export class SessionNotFoundError extends AppError {
  constructor(sessionId: string) {
    super("SessionNotFoundError", `Session ${sessionId} was not found`);
  }
}

export class SessionNotReadyError extends AppError {
  constructor(sessionId: string, status: string) {
    super(
      "SessionNotReadyError",
      `Session ${sessionId} is not ready (status=${status})`,
    );
  }
}

export class BrowserLaunchError extends AppError {
  constructor(message: string, details?: unknown) {
    super("BrowserLaunchError", message, details);
  }
}

export class ChildHandshakeError extends AppError {
  constructor(message: string, details?: unknown) {
    super("ChildHandshakeError", message, details);
  }
}

export class ToolExecutionError extends AppError {
  constructor(message: string, details?: unknown) {
    super("ToolExecutionError", message, details);
  }
}

export class BrowserClosedError extends AppError {
  constructor(message: string, details?: unknown) {
    super("BrowserClosedError", message, details);
  }
}

export class BrokenSessionError extends AppError {
  constructor(sessionId: string, details?: unknown) {
    super(
      "BrokenSessionError",
      `Session ${sessionId} is broken and could not be recovered automatically`,
      { recommendedAction: "restart_session", ...(details as object | undefined) },
    );
  }
}

export class ProfileLockedError extends AppError {
  constructor(message: string, details?: unknown) {
    super("ProfileLockedError", message, {
      recommendedAction: "create_session with profileMode=fallback-isolated",
      ...(details as object | undefined),
    });
  }
}

export class ProfileSeedSourceNotFoundError extends AppError {
  constructor(sourceType: string, identifier: string) {
    super(
      "ProfileSeedSourceNotFoundError",
      `Profile seed source not found: ${sourceType} '${identifier}'`,
      { sourceType, identifier, recommendedAction: "Verify the source exists and is accessible" },
    );
  }
}

export class ProfileSeedCopyError extends AppError {
  constructor(sourceDir: string, targetDir: string, cause?: unknown) {
    super(
      "ProfileSeedCopyError",
      `Failed to materialize seeded profile from '${sourceDir}' to '${targetDir}'`,
      {
        sourceDir,
        targetDir,
        recommendedAction: "Verify the source is readable and the profiles root is writable",
        rawError: cause,
      },
    );
  }
}

export class InvalidProfileSourceError extends AppError {
  constructor(type: string) {
    super(
      "InvalidProfileSourceError",
      `Unsupported profileSource type: '${type}'`,
      { type, recommendedAction: "Use one of: managed-empty, external-profile, session" },
    );
  }
}

export class ChromeNotInstalledError extends AppError {
  constructor(searchedPaths: string | string[]) {
    const paths = Array.isArray(searchedPaths) ? searchedPaths : [searchedPaths];
    super(
      "ChromeNotInstalledError",
      `Chrome executable not found. Searched: ${paths.join(", ")}`,
      {
        searchedPaths: paths,
        recommendedAction:
          "Install Google Chrome or use a managed session with browserType=chromium instead.",
      },
    );
  }
}

export class UnsupportedOperationError extends AppError {
  constructor(operation: string, reason: string, details?: unknown) {
    super(
      "UnsupportedOperationError",
      `${operation} is not supported: ${reason}`,
      {
        operation,
        reason,
        recommendedAction:
          "Use a managed persistent session and log in there if you need reusable or forkable auth state.",
        ...(details as object | undefined),
      },
    );
  }
}

export function mapKnownError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  const message = err instanceof Error ? err.message : String(err);
  if (/profile|user-data-dir|in use|locked/i.test(message)) {
    return new ProfileLockedError(message, { rawError: err });
  }
  if (/Target page.*closed|context.*closed|browser.*closed|Target closed|Page.*closed/i.test(message)) {
    return new BrowserClosedError(message, { rawError: err });
  }
  return new BrowserLaunchError(message, { rawError: err });
}
