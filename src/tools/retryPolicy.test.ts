import { describe, it, expect } from "vitest";
import { isSafeRetryTool, isBrowserClosedError } from "./retryPolicy.js";

describe("isSafeRetryTool", () => {
  it("returns true for safe tools", () => {
    expect(isSafeRetryTool("browser_navigate")).toBe(true);
    expect(isSafeRetryTool("browser_snapshot")).toBe(true);
    expect(isSafeRetryTool("browser_take_screenshot")).toBe(true);
    expect(isSafeRetryTool("browser_console_messages")).toBe(true);
    expect(isSafeRetryTool("browser_network_requests")).toBe(true);
    expect(isSafeRetryTool("browser_wait_for")).toBe(true);
  });

  it("returns false for mutating tools", () => {
    expect(isSafeRetryTool("browser_click")).toBe(false);
    expect(isSafeRetryTool("browser_type")).toBe(false);
    expect(isSafeRetryTool("browser_fill_form")).toBe(false);
    expect(isSafeRetryTool("browser_press_key")).toBe(false);
  });

  it("returns false for unknown tools", () => {
    expect(isSafeRetryTool("unknown_tool")).toBe(false);
    expect(isSafeRetryTool("")).toBe(false);
  });
});

describe("isBrowserClosedError", () => {
  it("returns true for Target page closed", () => {
    expect(isBrowserClosedError(new Error("Target page, color closed"))).toBe(true);
  });

  it("returns true for context closed", () => {
    expect(isBrowserClosedError(new Error("context closed unexpectedly"))).toBe(true);
  });

  it("returns true for browser closed", () => {
    expect(isBrowserClosedError(new Error("browser closed"))).toBe(true);
  });

  it("returns true for Target closed", () => {
    expect(isBrowserClosedError(new Error("Target closed"))).toBe(true);
  });

  it("returns true for Page closed", () => {
    expect(isBrowserClosedError(new Error("Page closed"))).toBe(true);
  });

  it("returns false for non-browser-closed errors", () => {
    expect(isBrowserClosedError(new Error("network timeout"))).toBe(false);
    expect(isBrowserClosedError(new Error("element not found"))).toBe(false);
  });

  it("returns false for non-Error values", () => {
    expect(isBrowserClosedError("browser closed")).toBe(false);
    expect(isBrowserClosedError(null)).toBe(false);
    expect(isBrowserClosedError(42)).toBe(false);
  });
});
