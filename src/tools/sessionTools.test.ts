import { describe, test, expect } from "vitest";
import { z } from "zod";

// We test the Zod schemas independently — no need to spin up the full MCP server.

const profileSourceSchema = z.union([
  z.object({ type: z.literal("managed-empty") }).strict(),
  z.object({ type: z.literal("session"), sessionId: z.string().min(1) }).strict(),
]);

const createSessionSchema = z.object({
  name: z.string().min(1),
  browserType: z.enum(["chrome", "msedge", "chromium"]).default("chrome"),
  profile: z.string().optional(),
  headless: z.boolean().optional(),
  executablePath: z.string().optional(),
  profileMode: z.enum(["persistent", "isolated", "fallback-isolated"]).optional(),
  profileSource: profileSourceSchema.optional(),
});

const forkSessionSchema = z.object({
  sourceSessionId: z.string().min(1),
  name: z.string().min(1),
  browserType: z.enum(["chrome", "msedge", "chromium"]).optional(),
  profileMode: z.enum(["persistent", "isolated", "fallback-isolated"]).optional(),
  headless: z.boolean().optional(),
  executablePath: z.string().optional(),
});

test("createSessionSchema accepts no profileSource (backward compat)", () => {
  const r = createSessionSchema.parse({ name: "s" });
  expect(r.profileSource).toBeUndefined();
});

test("createSessionSchema accepts session source", () => {
  const r = createSessionSchema.parse({
    name: "s",
    profileSource: { type: "session", sessionId: "abc" },
  });
  expect(r.profileSource).toEqual({ type: "session", sessionId: "abc" });
});

test("createSessionSchema rejects unknown type", () => {
  expect(() =>
    createSessionSchema.parse({ name: "s", profileSource: { type: "external-profile", path: "/x" } }),
  ).toThrow();
});

test("createSessionSchema rejects live-browser-profile (removed)", () => {
  expect(() =>
    createSessionSchema.parse({
      name: "s",
      profileSource: { type: "live-browser-profile", browser: "chrome", profile: "default" },
    }),
  ).toThrow();
});

test("forkSessionSchema requires sourceSessionId and name", () => {
  const r = forkSessionSchema.parse({ sourceSessionId: "src", name: "fork" });
  expect(r.sourceSessionId).toBe("src");
  expect(r.name).toBe("fork");
});

test("forkSessionSchema rejects missing sourceSessionId", () => {
  expect(() => forkSessionSchema.parse({ name: "fork" })).toThrow();
});
