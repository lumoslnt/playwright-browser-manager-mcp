# Live Profile Default-Only Fix Note

Date: 2026-04-15
Repo: `playwright-sessions-mcp`
Audience: Claude Code follow-up implementation pass

---

## Goal

Finish the final cleanup after the recent `live-browser-profile` change.

The product direction is now:

- `external-profile` is gone
- `live-browser-profile` supports **Chrome + `profile: "default"` only**
- `@playwright/mcp` should receive the Chrome **User Data root** as `--user-data-dir`
- we should **not** support `profileName` for live-profile mode right now

The remaining work is mostly consistency cleanup across:

- code comments
- tool schema descriptions
- tests
- README/examples
- small response metadata polish

---

## Required Fixes

## 1. Fix the `SessionRecord.profileDir` comment

### Problem

`src/sessions/sessionTypes.ts` still describes live-profile `profileDir` incorrectly.

It currently implies that live-profile uses the full `...User Data\Default` subdirectory as `--user-data-dir`.

That is no longer true.

### Correct behavior

For `live-browser-profile`, `profileDir` now means the Chrome **User Data root**, for example:

```text
C:\Users\alice\AppData\Local\Google\Chrome\User Data
```

That root is passed as `--user-data-dir`, and Chrome loads the `Default` profile inside it automatically.

### Required change

Update the comment so it says the truth.

### Acceptance criteria

The comment clearly distinguishes:

- managed session `profileDir` = manager-owned profile root
- live-profile `profileDir` = Chrome User Data root

---

## 2. Remove stale `profileName` references from the public schema description

### Problem

`src/tools/sessionTools.ts` no longer supports `profileName` in the actual Zod schema, but the JSON schema description still includes a `profileName` field.

This is misleading.

### Required change

Remove `profileName` from the `create_session` `profileSource.properties` description block.

After this change, the only supported live-profile input shape should be:

```json
{
  "type": "live-browser-profile",
  "browser": "chrome",
  "profile": "default"
}
```

### Acceptance criteria

- no `profileName` property remains in the tool input schema for `live-browser-profile`
- docs/tool descriptions do not imply support for named profiles

---

## 3. Remove stale `profileName` references from tests

### Problem

`src/tools/sessionTools.test.ts` still contains a test for:

- `live-browser-profile` with `profileName`

But the real runtime schema no longer supports that.

This test is now stale and misleading.

### Required change

Delete the `profileName` test and update the local test schema so it matches the real production schema.

### Important note

This file currently duplicates the schema locally instead of importing the real one. That makes drift easy.

### Minimum fix for now

- remove the stale `profileName` case
- ensure the local test schema exactly matches the current real schema

### Nice-to-have (optional)

If practical, refactor so tests can share/import the real schema definition instead of mirroring it manually.

### Acceptance criteria

- test file does not claim `profileName` support
- tests reflect the real current runtime behavior

---

## 4. Remove stale `profileName` examples from README

### Problem

`README.md` still includes a named-profile live mode example such as:

```json
{
  "name": "my-profile-1-session",
  "profileSource": { "type": "live-browser-profile", "browser": "chrome", "profileName": "Profile 1" }
}
```

That is no longer supported.

### Required change

Remove the named-profile example.

The README should only document:

```json
{
  "name": "my-chrome-session",
  "profileSource": { "type": "live-browser-profile", "browser": "chrome", "profile": "default" }
}
```

### Acceptance criteria

- README no longer suggests `profileName` support for live-profile mode
- README accurately reflects “default-only” support

---

## 5. Fix tool descriptions

### Problem

Some tool descriptions still imply managed-only behavior.

Current examples:

- `create_session`: `"Create a managed session. Browser launch is lazy."`
- `list_sessions`: `"List managed sessions."`

But live-profile sessions also exist now.

### Required change

Update descriptions to something like:

- `create_session`: `"Create a browser session. Browser launch is lazy."`
- `list_sessions`: `"List sessions."`

### Acceptance criteria

No user-facing description implies that only managed sessions exist.

---

## 6. Fix `isolation` output so it reflects the true mode

### Problem

In `src/tools/sessionTools.ts`, `sessionMeta()` currently collapses `fallback-isolated` into `persistent`.

That loses information and is misleading.

### Required change

Make `isolation` report the real session mode:

- live-profile → `"none"`
- managed persistent → `"persistent"`
- managed isolated → `"isolated"`
- managed fallback-isolated → `"fallback-isolated"`

### Acceptance criteria

The `isolation` field preserves the real underlying mode instead of flattening it.

---

## Optional Cleanup

These are optional if you want to keep this pass small, but they would improve maintainability.

### A. Keep `displayRef` naming

The recent rename from `sessionRef` to `displayRef` is good. Keep it.

Reason:

- the current field is a display label, not a true stable reusable session reference

### B. Keep structured warnings

The recent move to structured warnings is also good. Keep it.

Reason:

- better for clients/agents than plain strings

### C. Consider shared schema export later

Do not block this pass on it, but consider a future refactor so tests can import the real schema instead of hand-copying it.

---

## Suggested Acceptance Checklist

The pass is done when all of the following are true:

- [ ] `SessionRecord.profileDir` comment matches the real live-profile semantics
- [ ] `sessionTools.ts` input schema description no longer exposes `profileName`
- [ ] `sessionTools.test.ts` no longer tests `profileName`
- [ ] README no longer shows a named-profile live mode example
- [ ] tool descriptions no longer say “managed session(s)” when they mean all sessions
- [ ] `isolation` returns `fallback-isolated` when appropriate instead of flattening it to `persistent`

---

## Final Note

This is a cleanup/polish pass, not a redesign.

Do not re-open the larger architecture. The main feature direction is already correct.

The job here is simply to make the code, docs, tests, and user-facing schema all say the same thing:

> `live-browser-profile` currently supports **Chrome default profile only**, using the Chrome **User Data root** as `--user-data-dir`.
