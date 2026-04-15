# Design Doc: Explicit Live Chrome Profile Mode

Date: 2026-04-15
Repo: `playwright-sessions-mcp`
Status: Proposed
Audience: implementers of `playwright-browser-manager-mcp`

---

## 1. Summary

This document proposes a product and API change for `playwright-browser-manager-mcp`:

- **remove `external-profile` clone as a recommended auth-seeding path**
- **introduce a new explicit profile source type for using the user’s real local Chrome profile**
- keep **managed sessions** (`managed-empty`, `session` fork) as the default and recommended model

This change is motivated by modern Windows Chrome behavior:

- Chrome 127+ uses App-Bound Encryption (ABE) for many cookies (`v20`)
- cloned external Chrome profiles do not reliably preserve authenticated session state
- external-profile cloning therefore creates misleading expectations, especially when the caller wants “my real logged-in default Chrome” rather than “a best-effort copy of browser files”

The new design makes that intent explicit.

---

## 2. Goal

The goal is to reduce user friction and align the package with real browser behavior.

In particular, when a user says things like:

- “use my default Chrome profile”
- “use my current logged-in Chrome”
- “use the browser/profile I already use manually”

we should not translate that into “copy some files and hope auth survives.”

Instead, we should expose an explicit mode that means:

> use the real installed Chrome binary with the user’s real local profile

This mode must be:

- **explicit**
- **non-default**
- **strongly signaled in results and docs**
- **guarded against surprising disruption**

---

## 3. Non-Goals

This design does **not** aim to:

- bypass Chrome security boundaries
- decrypt App-Bound cookies out of band
- guarantee multi-session parallelism on a live user profile
- silently take over a user’s running Chrome instance
- make live-profile mode the default happy path

This package remains a **browser session manager**, not a browser security bypass toolkit.

---

## 4. Product Direction

## Keep as primary model

The primary and recommended model remains:

1. create a managed session
2. log in once inside that managed session
3. reuse or fork that managed session later

Supported primary sources:

- `managed-empty`
- `session`

## Remove as primary model

We should deprecate and then remove this source type:

- `external-profile`

Reason:

- as an auth-seeding story, it is unreliable on modern Windows Chrome
- it creates a misleading user expectation that “clone profile” means “clone login”
- it distracts from the stronger managed-session model

## Add new explicit mode

Add a new source type for live local profile usage, for example:

```json
{
  "type": "live-browser-profile",
  "browser": "chrome",
  "profile": "default"
}
```

This means:

- launch using the real installed Chrome binary
- point Chrome at the user’s real local profile directory
- do not clone the profile
- do not pretend this is isolated

This is not a general multi-session substrate. It is an explicit convenience mode for “use my real Chrome.”

---

## 5. Why `external-profile` Clone Should Be Removed

## Problem with the old mental model

The old source type:

```json
{
  "type": "external-profile",
  "browser": "chrome",
  "profile": "default"
}
```

suggests:

- use the user’s real profile as a source
- safely clone it into a managed location
- preserve the user’s authenticated state

On Windows Chrome 127+, that auth-preservation implication is often false because:

- cookie values may be protected with App-Bound Encryption (`v20`)
- Playwright/Chromium does not necessarily have the same decryption ability as the real Chrome app identity
- a file-level clone can therefore preserve structure but still fail to preserve usable login state

## Product mismatch

Users who ask for “default profile” usually want:

- their actual browser identity
- their current login state
- their current browsing persona

They do **not** usually mean:

- make a file copy that may look right but fail to load auth

Therefore, clone is the wrong semantic translation for that request.

## Package clarity

Removing `external-profile` simplifies the package story:

- **managed sessions** for reliable multi-session automation
- **live profile mode** for explicit use of the user’s real browser/profile

This is clearer than keeping a best-effort clone path that implies more than it can deliver.

---

## 6. Proposed New Source Type

## Name

Recommended name:

```json
{ "type": "live-browser-profile", ... }
```

Other possible names:

- `attached-profile`
- `installed-browser-profile`
- `use-local-profile`

Recommendation: use `live-browser-profile` because it clearly signals:

- this is a live local browser identity
- this is not a clone
- this may not be isolated

---

## 7. Proposed API Shape

## `create_session`

### New `profileSource`

```json
{
  "type": "live-browser-profile",
  "browser": "chrome",
  "profile": "default"
}
```

Future extension could support named Chrome profiles:

```json
{
  "type": "live-browser-profile",
  "browser": "chrome",
  "profileName": "Profile 1"
}
```

For the first version, it is acceptable to support only:

```json
{
  "type": "live-browser-profile",
  "browser": "chrome",
  "profile": "default"
}
```

## Allowed browsers

For the first implementation:

- support `chrome`
- optionally leave room for `msedge` later

## Session creation example

```json
create_session({
  "name": "my-real-chrome",
  "profileSource": {
    "type": "live-browser-profile",
    "browser": "chrome",
    "profile": "default"
  }
})
```

## Result shape example

```json
{
  "sessionId": "abc123",
  "name": "my-real-chrome",
  "sessionRef": "my-real-chrome",
  "status": "ready",
  "profileSource": {
    "type": "live-browser-profile",
    "browser": "chrome",
    "profile": "default"
  },
  "browserBinary": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "isolation": "live-user-profile",
  "warnings": [
    {
      "code": "LiveProfileMode",
      "message": "This session uses the user’s real Chrome profile directly. It is not isolated and may require Chrome to be closed first."
    }
  ]
}
```

---

## 8. Semantics of Live Profile Mode

When `profileSource.type === "live-browser-profile"`, the manager must behave differently from managed sessions.

## What it means

It means:

- use the real installed Chrome binary
- use the user’s real local profile directory
- launch against that profile directly
- preserve the user’s real Chrome auth state if Chrome itself can access it

## What it does not mean

It does not mean:

- clone the profile
- isolate the profile
- support multiple independent parallel sessions against the same profile
- silently close or hijack the user’s running Chrome

## Recommended internal representation

The session record should clearly track this distinction, e.g.:

- `profileSource.type = "live-browser-profile"`
- `isolationMode = "live-user-profile"`
- `managedProfile = false`
- `ownsProfileLifecycle = false`

This makes it easier to keep behavior honest across the system.

---

## 9. Required Guardrails

This mode must be heavily guarded because it touches a live user profile.

## Guardrail 1: Not default

This source type must never be silently selected by default.

It should only be used when the caller explicitly requests something equivalent to:

- use default profile
- use my local Chrome
- use my current Chrome login

At the API layer, that means:

- the caller must explicitly pass `profileSource.type = "live-browser-profile"`

## Guardrail 2: Use real Chrome binary only

If this mode is requested, the manager must not silently fall back to bundled Chromium.

Instead, it should:

- discover Chrome install path
- use that Chrome executable explicitly
- fail clearly if Chrome is not installed or cannot be found

## Guardrail 3: Strong warnings

The create result and logs should include warnings that this mode:

- is not isolated
- may require Chrome to be closed first
- may interfere with current local browser workflow
- is not intended for multi-session parallel automation

## Guardrail 4: No silent disruption

The manager must not silently:

- kill the user’s running Chrome
- restart the user’s running Chrome
- close arbitrary Chrome windows without explicit policy

If the profile is locked because Chrome is running, the system should fail with a clear actionable error unless the user explicitly opted into a disruption policy.

---

## 10. Lock Handling Strategy

## Core principle

Live profile mode is fundamentally different from managed session mode.

For managed sessions, the manager can coordinate lifecycle aggressively because it owns the profile and browser process.

For live profile mode, the manager does **not** own the user’s browser environment.

## Default behavior

If the target live profile is currently in use and Chrome cannot launch with it safely:

- return a `ProfileLockedError`
- do not attempt to close user Chrome automatically

### Example error

```json
{
  "code": "ProfileLockedError",
  "message": "The requested live Chrome profile is currently in use.",
  "details": {
    "profileSource": {
      "type": "live-browser-profile",
      "browser": "chrome",
      "profile": "default"
    },
    "recommendedAction": "Close Chrome and retry, or use a managed session instead."
  }
}
```

## Optional future extension

In the future, if desired, a separate explicit opt-in policy could be added, for example:

- `liveProfilePolicy: "fail-if-open" | "allow-disrupt"`

For the first implementation, recommend supporting only:

- `fail-if-open`

This keeps the initial version much safer and easier to reason about.

---

## 11. Session Capability Model

Live profile mode should not expose exactly the same assumptions as managed sessions.

Recommended capability semantics:

### Managed sessions

- isolated or manager-owned persistent profile
- reusable
- forkable
- good for multi-session orchestration
- manager can restart/recover aggressively

### Live profile sessions

- direct local-user-profile usage
- not isolated
- not forkable by default
- not safe for parallel duplication
- restart/recover should be conservative

## Suggested capability flags

Return fields like:

- `supportsFork: false`
- `supportsIsolation: false`
- `supportsAutoRecovery: limited`
- `supportsParallelUse: false`

These can be explicit metadata or just documented behavior.

---

## 12. Fork and Recovery Rules

## Forking

Default rule:

- sessions created from `live-browser-profile` are **not forkable**

Reason:

- fork semantics assume the manager owns a safe source profile lifecycle
- live profile mode does not meet that assumption

If a caller attempts `fork_session` from a live-profile session, return a clear error such as:

```json
{
  "code": "UnsupportedOperationError",
  "message": "fork_session is not supported for live-browser-profile sessions",
  "details": {
    "recommendedAction": "Use a managed persistent session and log in there if you need reusable or forkable auth state."
  }
}
```

## Recovery

Auto-recovery for live-profile sessions should be conservative.

Recommendation:

- allow restart/reconnect logic only when it does not require disruptive profile lifecycle actions
- if relaunch fails due to lock/profile state, surface the failure clearly
- do not apply the same aggressive reseed or fallback behavior used for managed sessions

---

## 13. Recommended User Flows

## Flow A: Default / recommended path

For reliable authenticated automation:

1. `create_session(name="main", profileMode="persistent")`
2. user logs in once inside the managed session
3. later:
   - reuse `main`
   - or `fork_session(sourceSession="main", ...)`

This remains the official best-practice path.

## Flow B: Explicit live Chrome usage

When the user explicitly wants current local Chrome identity:

```json
create_session({
  "name": "use-my-real-chrome",
  "profileSource": {
    "type": "live-browser-profile",
    "browser": "chrome",
    "profile": "default"
  }
})
```

Expected behavior:

- real Chrome binary is used
- local default profile is used directly
- auth can work because real Chrome is using its own real profile
- if Chrome is already running and the profile is locked, fail clearly

---

## 14. User-Facing Messaging

## README messaging

The README should stop positioning external profile cloning as the answer for auth portability.

Recommended messaging:

### Managed sessions

Use this for:

- reliable long-lived browser automation
- sessions that should stay isolated from your main browser
- reusable authenticated automation after logging in once
- session forking and recovery

### Live Chrome profile mode

Use this when:

- you explicitly want to use your real local Chrome identity
- you understand this is not isolated
- you are okay with the possibility that Chrome must be closed first

### Explicit warning

Live Chrome profile mode:

- is not the default
- is not suitable for normal multi-session parallel use
- may be blocked if Chrome is already running
- should be treated as a convenience bridge, not the core session model

---

## 15. Migration Plan

## Phase 1: Introduce new source type

Add `live-browser-profile` while keeping `external-profile` temporarily present but deprecated.

At this phase:

- docs stop recommending `external-profile`
- create warnings when `external-profile` is used with Chrome on Windows
- steer users toward managed sessions or live profile mode

## Phase 2: Deprecate `external-profile`

Deprecation behavior:

- warning in docs
- warning in tool results
- warning in logs

Example deprecation warning:

```json
{
  "code": "DeprecatedProfileSource",
  "message": "external-profile is deprecated for auth seeding. Use managed sessions or live-browser-profile instead."
}
```

## Phase 3: Remove `external-profile`

Eventually remove it from:

- tool schema
- docs
- implementation
- tests

If keeping path-based seeding for non-auth experiments is still valuable, it should return later as a separate deliberately-labeled experimental feature, not as the auth story.

---

## 16. Schema Changes

## Current conceptual schema

Today:

```ts
ProfileSourceRecord =
  | { type: "managed-empty" }
  | { type: "external-profile"; path: string }
  | { type: "external-profile"; browser: "chrome" | "msedge"; profile: "default" }
  | { type: "external-profile"; browser: "chrome" | "msedge"; profileName: string }
  | { type: "session"; sessionId: string }
```

## Proposed schema

Near-term transition state:

```ts
ProfileSourceRecord =
  | { type: "managed-empty" }
  | { type: "session"; sessionId: string }
  | { type: "live-browser-profile"; browser: "chrome"; profile: "default" }
  | { type: "live-browser-profile"; browser: "chrome"; profileName: string }
  | { type: "external-profile"; ...deprecated... }
```

Final target state:

```ts
ProfileSourceRecord =
  | { type: "managed-empty" }
  | { type: "session"; sessionId: string }
  | { type: "live-browser-profile"; browser: "chrome"; profile: "default" }
  | { type: "live-browser-profile"; browser: "chrome"; profileName: string }
```

## `create_session` schema example

```json
{
  "name": "my-real-chrome",
  "profileSource": {
    "type": "live-browser-profile",
    "browser": "chrome",
    "profile": "default"
  }
}
```

---

## 17. Implementation Notes

## SessionManager

Add support for a non-managed live-profile source.

Likely needs:

- source validation
- explicit session metadata for ownership/isolation semantics
- restrictions on fork/recovery behavior

## ProfileManager

No clone materialization for `live-browser-profile`.

Instead it should resolve:

- installed Chrome binary path
- local Chrome user data root
- chosen live profile directory

This is resolution, not materialization.

## ChildProcessManager

When launching a live-profile session:

- use `chrome.exe`
- pass the correct user-data-dir / profile targeting args according to Chrome/Playwright expectations
- keep launch semantics conservative
- do not apply clone/fallback logic intended for managed profiles

## Error handling

Add explicit errors and messages for:

- Chrome not installed
- live profile locked/in use
- live profile mode unsupported on current platform
- unsupported operations on live-profile sessions

---

## 18. Suggested Result Metadata

To reduce confusion, create and session-list results should include explicit mode metadata.

Recommended fields:

- `sessionRef`
- `profileSource`
- `browserBinary`
- `isolation`
- `managedProfile`
- `supportsFork`
- `warnings`

Example:

```json
{
  "sessionId": "abc123",
  "name": "my-real-chrome",
  "sessionRef": "my-real-chrome",
  "status": "ready",
  "profileSource": {
    "type": "live-browser-profile",
    "browser": "chrome",
    "profile": "default"
  },
  "browserBinary": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "isolation": "live-user-profile",
  "managedProfile": false,
  "supportsFork": false,
  "warnings": [
    {
      "code": "LiveProfileMode",
      "message": "This session uses the real local Chrome profile directly and is not isolated."
    }
  ]
}
```

---

## 19. Testing Plan

Add tests for:

1. schema accepts `live-browser-profile`
2. Chrome binary resolution succeeds/fails clearly
3. live-profile session does not attempt clone materialization
4. live-profile session marks metadata as non-isolated / non-managed
5. create fails clearly when Chrome profile is locked/in use
6. create does not silently kill or restart user Chrome
7. `fork_session` is rejected for live-profile sessions
8. session list includes mode metadata and `sessionRef`
9. README/docs examples align with new semantics
10. deprecated `external-profile` produces warnings during transition

---

## 20. Recommended Rollout Order

1. Add `live-browser-profile` type and schema
2. Add Chrome binary/profile resolution helpers
3. Add guarded create path for live-profile sessions
4. Add explicit metadata and warnings
5. Update docs/README to recommend managed sessions and explain live-profile mode
6. Deprecate `external-profile`
7. Remove `external-profile` after transition period

---

## 21. Final Recommendation

This package should move from:

> “clone external browser profiles and hope auth carries over”

to:

> “manage reliable browser sessions, and explicitly support live local Chrome only when the user really means to use their real browser identity.”

That gives the package a cleaner story, a more honest UX, and a more maintainable architecture.
