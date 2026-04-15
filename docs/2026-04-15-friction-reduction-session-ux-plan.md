# Friction Reduction Plan for Session UX

Date: 2026-04-15
Repo: `playwright-sessions-mcp`

## Goal

This document proposes a concrete set of changes to reduce user and agent friction in `playwright-browser-manager-mcp`, especially around:

- session addressing by `id` vs `name`
- false-positive `ready` state before the browser/profile is actually usable
- brittle forking from a currently running source session
- `list_sessions` output that is technically correct but not optimized for follow-up tool calls
- seeded-session recovery when profile locks happen

The design goal is not to add more surface area for its own sake. The goal is to make the common path require fewer corrective turns, fewer retries, and less agent-side branching.

---

## Product Direction

### Keep both `id` and `name`

We will **keep internal stable `id`** and **keep user-facing `name`**.

Design principle:

- `id` remains the immutable internal identity
- `name` remains the human-friendly handle
- external tool UX should become **name-first**, while internals remain **id-backed**

This avoids forcing agents to remember UUIDs while preserving a stable internal identity for:

- persistence
- recovery
- lineage
- logging
- restart/reseed flows

---

## Summary of Proposed Changes

1. **Support both `id` and unique `name` when selecting a session**
2. **Expose a `sessionRef` field in `list_sessions` optimized for follow-up calls**
3. **Use a name-first tool UX while retaining internal IDs**
4. **Make `ready` mean real browser/profile readiness (warm launch), not just child MCP connectivity**
5. **Improve `fork_session` when the source session is running: gracefully close source, clone, optionally restore source**
6. **Improve seeded-session recovery by re-materializing a fresh clone when profile locks happen**
7. **Improve error messages so they guide automatic correction**
8. **Optionally add idempotent create behavior for named sessions (`ifExists`)**

Even if item 8 is implemented later, items 1-7 should be treated as the core friction-reduction package.

---

## 1. Session Addressing: Support Both `id` and `name`

## Problem

Today, browser-routed tools require `sessionId`, and `SessionManager.getSession()` only resolves by exact internal `id`.

This creates a common failure pattern:

1. agent calls `list_sessions`
2. agent sees a session `name`
3. agent naturally reuses the name in the next tool call
4. the tool expects a UUID-like id and fails with `SessionNotFoundError`
5. agent tries to recreate the session using the same `name`
6. creation fails because the name already exists

This is unnecessary friction caused by the API boundary, not by user intent.

## Decision

Introduce a name-aware resolver and allow session selection by either:

- internal `id`
- unique `name`

## API Direction

Tool UX should move toward accepting a neutral field such as:

- `session`

instead of forcing callers to think in terms of `sessionId` only.

For backward compatibility:

- existing `sessionId` input may continue to work
- new `session` input should be preferred in docs/examples

### Resolution order

When resolving a session reference:

1. if the reference exactly matches an existing `id`, use it
2. otherwise, if it exactly matches a unique `name`, use it
3. if multiple sessions match by name, throw an ambiguity error
4. if nothing matches, throw a `SessionNotFoundError` with correction hints

## Proposed implementation

Add a resolver in `SessionManager`, e.g.:

- `resolveSession(ref: string): SessionRecord`
- optionally `resolveSessionRef(refOrIdOrName: string): SessionRecord`

This resolver should be used by:

- browser-routed tools
- `restart_session`
- `close_session`
- future tools that take a session selector

## Notes

We are **not** removing `id`. We are reducing the amount of times callers must care about it.

---

## 2. `list_sessions`: Add `sessionRef` for Better Callability

## Problem

`list_sessions` currently returns both `id` and `name`, but does not clearly optimize for the next tool call.

This makes the output easy for humans to understand but easy for agents to misuse.

## Decision

Add a `sessionRef` field designed specifically for follow-up calls.

### Recommended semantics

`sessionRef` should be the preferred value to pass to later tools.

Suggested value:

- use `name` as `sessionRef` when names are guaranteed unique
- otherwise fall back to `id`

Given the current design goal and name-first UX, the default recommendation is:

- `sessionRef = name`

as long as name uniqueness remains enforced.

## Output shape example

```json
[
  {
    "id": "9c624080-fe1d-463f-9398-9d60eaaaac9d",
    "name": "flightreview-admin-2",
    "sessionRef": "flightreview-admin-2",
    "status": "ready",
    "browserType": "chrome"
  }
]
```

## Why this helps

This makes `list_sessions` more actionable:

- humans can still inspect `id`
- agents can reuse `sessionRef` directly
- fewer chances to accidentally pass `name` into an id-only API

---

## 3. Name-First UX, ID-Backed Internals

## Decision

The product should present a name-first UX without abandoning internal stable identity.

### UX guidance

Docs and examples should prefer:

```json
{
  "session": "flightreview-admin-2"
}
```

instead of:

```json
{
  "sessionId": "9c624080-fe1d-463f-9398-9d60eaaaac9d"
}
```

### Internal guidance

Internally continue to store and use:

- immutable `id`
- mutable/human-friendly `name`
- lineage metadata via ids when needed

This preserves correctness while significantly lowering agent friction.

---

## 4. Make `ready` Mean Real Readiness (Option B)

## Problem

Current `ready` does not necessarily mean the browser/profile is actually usable.

Today, `ensureSessionReady()` marks a session `ready` after:

- connecting to the child MCP server
- listing its tools

But for the underlying browser stack, that is not equivalent to:

- browser launched successfully
- `profileDir` accepted by the browser
- no profile lock errors

This creates a misleading state where:

- `restart_session` returns `ready`
- the first real browser call later fails with `Browser is already in use`

## Decision

Adopt **Option B**: `ready` should mean **real browser/profile readiness**, not merely child MCP readiness.

## Design

During session launch or restart, after child MCP connection succeeds, run a **lightweight browser warmup** that forces the underlying browser to actually launch using the target profile.

### Warmup goals

The warmup should:

- cause the underlying browser to allocate/use the configured `profileDir`
- surface profile lock problems early
- fail the create/restart path immediately if the browser cannot truly start

### Warmup constraints

The warmup should be:

- lightweight
- deterministic
- minimally side-effecting
- internal to the session manager / child process manager

Potential approaches include a minimal read-only Playwright MCP tool call that forces browser launch.

The specific warmup tool can be selected during implementation based on the underlying Playwright MCP behavior, but the important requirement is:

> A session must not be marked `ready` until the target browser has successfully started against the target profile.

## State semantics after change

After this change:

- `idle`: session exists but browser has not yet been launched
- `launching`: child MCP and browser warmup in progress
- `ready`: child MCP connected and browser/profile confirmed usable
- `profile_locked`: warmup failed due to profile lock
- `broken`: warmup failed for another unrecoverable reason

This makes the state machine much more honest and much easier for agents to reason about.

---

## 5. `fork_session`: Safer Behavior When Source Session Is Running

## Problem

Forking from a currently running source session is brittle because the implementation currently clones the source profile directory at the filesystem level, even if that source profile may still be in active use.

On Windows especially, this can lead to:

- lock conflicts
- partial or inconsistent copies
- clone success followed by launch failure
- misleading "created" results that fail on first use

## Important scope boundary

This section applies to:

- **managed-session source**: a source session already owned by `playwright-browser-manager-mcp`

This section does **not** apply to:

- **external-profile source**: a user’s own Chrome/Edge profile such as `Default`

That distinction is critical.

For a managed-session source, the tool can safely coordinate browser lifecycle because it owns that browser process.

For an external-profile source, the tool must **not** close or restart the user’s own browser window just to make cloning easier.

## Decision

Adopt the lower-friction behavior:

> If the source session is currently running, gracefully close it, clone the profile, and optionally restore the source session afterward.

## Desired behavior

When `fork_session` is called:

1. resolve the source session
2. detect whether the source session is running/active
3. if active:
   - gracefully close the source session
   - clone its profile directory
   - if the close was tool-initiated for forking, optionally restore the source session to its prior ready state after cloning
4. create the forked session from the clone
5. warm-launch the forked session so `ready` is real

## User-visible semantics

If the source session is a live managed browser session, the browser window for that managed source session may be temporarily closed and then reopened as part of the fork flow.

This is acceptable because the manager owns that browser process.

However, this must be documented clearly so callers understand that "low friction" here means:

- no manual pre-close step is required from the caller
- but the source managed session may experience a short interruption

The fork flow must **not** claim to be non-disruptive to the managed source session.

## Why this is lower friction

The user intent is:

- “make me another usable session based on this one”

The current behavior implicitly asks the caller to think about:

- browser lock timing
- filesystem consistency
- whether the source must be manually closed first

That complexity should be absorbed by the tool implementation.

## Design notes

### Detect active source states

Treat the source session as active if it is in a state like:

- `ready`
- `launching`
- `recovering`

Potentially also if it still has a child process or transport attached.

### Restoration strategy

If the source session was active before fork:

- store a flag such as `wasSourceActive`
- after clone succeeds, attempt to restore the source session
- if source restoration fails, return the fork result successfully but include source restoration failure in warnings/logs/details

Rationale:

- the fork itself is the user’s requested primary action
- failure to restore the original session is secondary and should not necessarily invalidate the fork if the fork succeeded

### Suggested result metadata

To make the side effects observable, `fork_session` should consider returning metadata such as:

- `sourceWasActive: boolean`
- `sourceWasTemporarilyClosed: boolean`
- `sourceRestored: boolean`
- `warnings: []`

This helps callers distinguish between:

- source never needed coordination
- source was coordinated successfully
- fork succeeded but source restoration failed

### New metadata (optional)

Optionally track whether a session was:

- forked from another session while that source was hot/active
- restored after forking

This may help with debugging but is not required for the first pass.

---

## 6. Better Recovery for Seeded Sessions When Profile Locks Happen

## Problem

For seeded sessions (`external-profile` and `session`), profile locks often indicate that the current materialized clone is not safely reusable.

## Important source distinction

The recovery path must behave differently depending on the seed source.

### `external-profile`

This means a user-owned browser profile, such as Chrome `Default`.

For this source type, the manager must:

- never close the user’s own browser window
- never restart the user’s own browser process
- treat cloning from a live external profile as best-effort

The risk in this path is not user disruption; the risk is clone consistency when the external browser is still running.

### `session`

This means another managed session already owned by the manager.

For this source type, the manager may coordinate lifecycle by:

- temporarily closing the managed source session
- cloning safely
- attempting restoration afterward

Current fallback logic only becomes helpful if `profileMode === "fallback-isolated"`, which is not always aligned with the user’s real intent.

For seeded sessions, the real intent is usually:

- preserve/log into something based on the seeded state
- get another usable copy if the current clone is blocked

## Decision

When a seeded session hits a profile lock during launch/warmup, prefer to **re-materialize a fresh clone and retry**, rather than only surfacing the lock or falling back to an empty isolated profile.

## Recovery strategy

If launch/warmup fails with a profile lock and the session is seeded:

### For `external-profile`

1. resolve the original external profile source again
2. materialize a fresh managed clone directory
3. update `session.profileDir`
4. update `session.launchConfig.profileDir`
5. retry launch/warmup once

Important constraint:

- do not close or restart the user’s own Chrome/Edge window as part of this retry

If the live external profile is too inconsistent to clone reliably while open, the system may surface a best-effort warning or recommend a user-guided cold retry, but it must not silently disrupt the user’s browser.

### For `session`

1. resolve the original source session (or its last known source profile)
2. if the source is active, apply the same safe-close clone strategy used by `fork_session`
3. materialize a fresh clone directory
4. update `session.profileDir`
5. update `session.launchConfig.profileDir`
6. retry launch/warmup once

## Why this matters

For seeded sessions, the user usually wants:

- a usable copy of an existing authenticated state

They do **not** want to be pushed into a fresh empty fallback profile unless they explicitly asked for that.

This change aligns recovery with actual user intent.

---

## 7. Error Messages Should Actively Correct the Caller

## Problem

Current errors are readable, but many of them do not provide enough guidance for automatic correction.

## Decision

Errors should become more action-guiding and more reference-aware.

## Examples

### Session not found by id but name exists

Current:

```json
{
  "code": "SessionNotFoundError",
  "message": "Session flightreview-admin-2 was not found"
}
```

Preferred:

```json
{
  "code": "SessionNotFoundError",
  "message": "Session 'flightreview-admin-2' was not found by id",
  "details": {
    "hint": "A session with name 'flightreview-admin-2' exists",
    "existingSessionId": "9c624080-fe1d-463f-9398-9d60eaaaac9d",
    "recommendedAction": "Use session/name-aware selector or pass the existing id"
  }
}
```

### Name already exists

Preferred:

```json
{
  "code": "SessionAlreadyExistsError",
  "message": "Session name 'flightreview-admin-2' already exists",
  "details": {
    "existingSessionId": "9c624080-fe1d-463f-9398-9d60eaaaac9d",
    "recommendedAction": "Reuse existing session or set ifExists=replace/reuse"
  }
}
```

### Profile lock

Preferred details should distinguish between:

- generic managed-empty session
- seeded external-profile session
- seeded session-from-session

and guide the user or agent toward the intended lower-friction path.

---

## 8. Optional but Strongly Recommended: Idempotent Create with `ifExists`

## Problem

A common user/agent intent is:

- “use this named session if it already exists; otherwise create it”

Currently this often requires multiple turns and a race-prone `list` + conditional `create` pattern.

## Decision

Add:

- `ifExists: "reuse" | "replace" | "error"`

Recommended default:

- `reuse`

## Semantics

### `reuse`

If a session with the same name exists:

- return it directly
- optionally ensure/warm it depending on tool semantics

### `replace`

If a session with the same name exists:

- gracefully close it
- create a new one with the requested settings

### `error`

Preserve current behavior.

## Why it helps

This allows the most common session management behavior to be expressed in one call.

---

## Detailed Implementation Plan

## A. SessionManager changes

Add methods such as:

- `getSessionById(id: string)`
- `getSessionByName(name: string)`
- `resolveSession(ref: string)`
- optional: `findSessionByName(name: string)`

Update callers so user-facing tools use `resolveSession()` rather than direct id-only lookup.

Potential additions:

- `createSession(..., ifExists?)`
- helper for seeded-session re-materialization

---

## B. Session tool schema changes

### Create/update selectors

Where practical, tool schemas should prefer:

- `session`

while still accepting:

- `sessionId`

for backward compatibility.

### `list_sessions`

Add:

- `sessionRef`

Output should remain backward compatible.

### `fork_session`

Keep `sourceSessionId` initially for compatibility if needed, but consider eventually supporting:

- `sourceSession`

with the same id-or-name resolution behavior.

---

## C. ChildProcessManager changes

### Real readiness

Extend `ensureSessionReady()` so that after child MCP connection:

1. tools are listed
2. a browser warmup is performed
3. only then is status set to `ready`

### Seeded-session profile-lock recovery

When profile lock occurs:

- if `profileSource.type === "external-profile"`, re-materialize and retry once
- if `profileSource.type === "session"`, safely clone from source again and retry once
- otherwise preserve existing fallback behavior

### Fork-safe coordination

If fork implementation needs child-process coordination, centralize helper routines so the same safe-close / restore behavior can be reused.

---

## D. ProfileManager changes

Potential additions:

- helper to re-materialize from an existing `ProfileSourceRecord`
- helper to materialize from a source session with explicit source lifecycle coordination

This keeps clone/reseed logic from being duplicated in multiple layers.

---

## E. Error model changes

Add or improve errors such as:

- `SessionAlreadyExistsError`
- `AmbiguousSessionReferenceError`
- enhanced `SessionNotFoundError`

Error details should include:

- original selector value
- whether lookup was attempted by id/name
- matched candidates when safe
- recommended next action

---

## Behavior Examples After Change

## Example 1: create or reuse by name

```json
create_session({
  "name": "flightreview-admin-2",
  "profileSource": {
    "type": "external-profile",
    "browser": "chrome",
    "profile": "default"
  },
  "ifExists": "reuse"
})
```

Possible result:

```json
{
  "sessionId": "9c624080-fe1d-463f-9398-9d60eaaaac9d",
  "name": "flightreview-admin-2",
  "sessionRef": "flightreview-admin-2",
  "status": "ready"
}
```

---

## Example 2: route a browser call by name

```json
browser_navigate({
  "session": "flightreview-admin-2",
  "url": "https://example.com"
})
```

The caller does not need to remember a UUID.

---

## Example 3: fork from a running managed source session

```json
fork_session({
  "sourceSessionId": "9c624080-fe1d-463f-9398-9d60eaaaac9d",
  "name": "flightreview-admin-2-copy"
})
```

Expected internal behavior:

1. detect source is active
2. gracefully close source
3. clone source profile
4. restore source if it was active before
5. warm-launch fork
6. return a truly usable `ready` fork

Possible result shape:

```json
{
  "sessionId": "new-fork-id",
  "name": "flightreview-admin-2-copy",
  "sessionRef": "flightreview-admin-2-copy",
  "status": "ready",
  "sourceWasActive": true,
  "sourceWasTemporarilyClosed": true,
  "sourceRestored": true,
  "warnings": []
}
```

---

## Example 4: create from a live external Chrome profile

```json
create_session({
  "name": "flightreview-admin-2",
  "profileSource": {
    "type": "external-profile",
    "browser": "chrome",
    "profile": "default"
  }
})
```

Expected semantics:

1. resolve the user’s external Chrome profile
2. clone it into a managed profile directory
3. never close or restart the user’s own Chrome window
4. warm-launch the managed session against the clone

Possible warning semantics when cloning from a live profile:

```json
{
  "sessionId": "9c624080-fe1d-463f-9398-9d60eaaaac9d",
  "name": "flightreview-admin-2",
  "sessionRef": "flightreview-admin-2",
  "status": "ready",
  "warnings": [
    {
      "code": "LiveExternalProfileClone",
      "message": "The session was seeded from a live external browser profile. Clone consistency is best-effort while the source browser remains open."
    }
  ]
}
```

---

## Migration and Compatibility Notes

## Backward compatibility

The initial implementation should try to remain backward compatible by:

- keeping `sessionId` accepted where already supported
- keeping `id` in `list_sessions`
- adding `sessionRef` as a new field rather than replacing existing fields

## Documentation updates

Update examples and README copy to prefer:

- `name` / `session` / `sessionRef`

over raw UUID usage in common flows.

## Testing impact

Add tests for:

1. resolving by id
2. resolving by unique name
3. ambiguous name handling (if duplicate names ever become allowed later)
4. `list_sessions` includes `sessionRef`
5. `ready` requires warm launch success
6. seeded external-profile launch retries with fresh materialization
7. fork from running source closes/clones/restores correctly
8. source restore failure does not necessarily invalidate successful fork
9. profile lock moves seeded sessions toward re-materialization rather than empty fallback
10. external-profile creation never attempts to close or restart the user’s own browser
11. `fork_session` result metadata reports whether source coordination/restoration occurred

---

## Recommended Delivery Order

1. **Session resolution by id or name**
2. **`list_sessions` adds `sessionRef`**
3. **Real `ready` via warm launch**
4. **Safer fork from running source**
5. **Seeded-session re-materialization on profile lock**
6. **Improved error messages**
7. **Optional `ifExists` support**

This order gets most of the friction reduction early without requiring every enhancement to land at once.

---

## Final Design Principle

The guiding principle for this work is:

> Complexity that the tool can reliably absorb should not be pushed onto the user or the agent.

In practice, that means this MCP server should absorb:

- id vs name resolution
- session reuse affordances
- honest readiness semantics
- safe forking from active sessions
- seeded-profile lock recovery

instead of requiring callers to manually orchestrate them through repeated trial-and-error.
