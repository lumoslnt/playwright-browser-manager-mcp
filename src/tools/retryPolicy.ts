const SAFE_RETRY_TOOLS = new Set<string>([
  "browser_navigate",
  "browser_snapshot",
  "browser_take_screenshot",
  "browser_console_messages",
  "browser_network_requests",
  "browser_wait_for",
]);

export function isSafeRetryTool(toolName: string): boolean {
  return SAFE_RETRY_TOOLS.has(toolName);
}

const BROWSER_CLOSED_PATTERN =
  /Target page.*closed|context.*closed|browser.*closed|Target closed|Page.*closed/i;

export function isBrowserClosedError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return BROWSER_CLOSED_PATTERN.test(err.message);
}
