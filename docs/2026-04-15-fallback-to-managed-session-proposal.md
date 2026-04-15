# Fallback Proposal: Drop Live Default-Profile Integration and Return to Managed Session Auth Baseline

Date: 2026-04-15
Repo: `playwright-sessions-mcp`
Audience: Claude Code follow-up implementation
Status: Proposed fallback plan

---

## 1. Decision

We are falling back to **Option 3**:

> Do **not** continue shipping or refining direct integration with the user’s real default Chrome profile.
> Re-center the product on **managed persistent sessions** as the official authenticated-browser workflow.

In practical terms:

- stop treating `live-browser-profile` as a viable product direction for default-profile auth reuse
- prefer:
  - create a managed persistent session
  - log in manually once inside that managed session
  - reuse or fork that managed session afterward

This is the stable path that fits the package architecture.

---

## 2. Why We Are Falling Back

## Summary

We explored two variants of “use the user’s real Chrome login state”:

1. **launch mode** against the real default Chrome profile
2. **CDP/attach mode** against the real default Chrome profile

Both directions ran into serious platform/browser constraints.

---

## 3. What We Confirmed About Launch Mode

The attempted `live-browser-profile` launch mode uses Playwright / `@playwright/mcp` to launch Chrome against the user’s real Chrome profile data.

### Problems observed

- browser opens to a blank / unusable page
- navigation times out
- expected authenticated state does not behave reliably
- profile handling is unstable when pointed at real daily-use Chrome state

### Root issue

Even after narrowing the implementation to Chrome + `profile: "default"`, this launch pattern remains unreliable when used with a real, existing Chrome profile.

This appears to be an upstream/browser interaction problem rather than a small local implementation bug.

### Product conclusion

Launch-based reuse of a user’s real default Chrome profile is not reliable enough to keep as a supported feature.

---

## 4. What We Confirmed About CDP / Attach Mode

We then tested whether CDP attach could be the cleaner replacement.

### What was tested

A real Chrome process was launched with:

- `--remote-debugging-port=<port>`
- `--user-data-dir=<real Chrome User Data root>`

against the user’s real default Chrome data directory.

### Result

Chrome refused to expose DevTools remote debugging for the default data directory.

Observed stderr included:

> DevTools remote debugging requires a non-default data directory. Specify this using --user-data-dir.

Even though `--user-data-dir` was passed, the browser still treated the real default Chrome user-data root as the protected/default data directory and did not open the CDP endpoint.

### Product conclusion

Direct CDP attach to the user’s real default Chrome profile is also not a viable default-profile integration strategy for this package.

---

## 5. Final Product Conclusion

The package should stop pursuing:

- launch against the real default Chrome profile
- attach/CDP against the real default Chrome profile

These paths are too constrained and too brittle.

Instead, the package should return to the model it is best at:

- manager-owned browser sessions
- persistent session state
- explicit lifecycle control
- auth established inside managed sessions
- session reuse / forking after login

---

## 6. Recommended Product Direction

## Official supported auth workflow

The official workflow should now be:

1. `create_session(name="main", profileMode="persistent")`
2. user logs in once inside that managed session
3. later:
   - reuse `main`
   - or `fork_session(sourceSessionId="...", ...)`

This becomes the primary and documented answer for:

- authenticated automation
- login reuse
- multiple automation sessions with the same account state

---

## 7. What To Do With `live-browser-profile`

## Recommendation

Remove it as a supported feature from the runtime surface.

### Why

It no longer has a stable product story:

- launch mode is unreliable
- default-profile CDP attach is blocked by Chrome
- keeping the feature exposed would over-promise and create user confusion

### Acceptable alternatives

Either:

#### Option A — remove immediately

Remove `live-browser-profile` from:

- runtime types
- tool schemas
- docs
- tests
- README examples

#### Option B — temporary internal deprecation

If you want a softer transition, keep it only as an explicitly deprecated/internal experiment and remove it soon after.

However, the cleaner product path is **Option A: remove it**.

---

## 8. Concrete Implementation Proposal

## A. Runtime surface

Remove `live-browser-profile` from:

- `ProfileSourceRecord`
- `create_session` Zod schema
- JSON schema tool descriptions
- any launch-path resolution code
- warnings/metadata associated only with live-profile mode

After this change, `profileSource` should again support only:

- `managed-empty`
- `session`

---

## B. Session model

Simplify the session model back toward the managed-session design.

### Keep

- `managedProfile`
- `supportsFork`

These are still useful, even if all current sessions become manager-owned again.

### Remove if they become dead weight

If fields only exist because of `live-browser-profile` and become meaningless after removal, simplify them.

Examples to review:

- live-profile-specific warnings
- live-profile-specific isolation values
- launch fields that only existed for default-profile integration attempts

---

## C. Tool output / metadata

Recenter tool outputs around managed sessions.

Recommended behavior:

- `create_session` should describe creating a browser/managed session
- `list_sessions` should describe normal managed sessions again
- `isolation` should truthfully expose:
  - `persistent`
  - `isolated`
  - `fallback-isolated`

If `displayRef` is still useful, it can remain.

---

## D. README and docs

Update README to remove live-profile/default-profile guidance.

### Replace with

A clearer auth story:

- create a persistent managed session
- log in once
- reuse or fork that session

### Explicitly avoid suggesting

- direct use of default Chrome profile
- real-profile attach
- any promise that the package reuses the user’s existing browser identity directly

---

## E. Tests

Remove tests that validate now-abandoned behavior:

- live-browser-profile schema tests
- live-profile launch-arg tests
- live-profile session behavior tests

Replace them with tests that strengthen the supported path:

- persistent managed session creation
- session-based seeding/forking
- metadata/output behavior for managed sessions
- `fallback-isolated` output correctness

---

## 9. Suggested New Messaging

## Recommended package positioning

This package should be positioned as:

> A browser session manager for Playwright MCP that provides manager-owned persistent and isolated sessions, plus reliable session reuse and forking.

## Recommended auth messaging

> If you need authenticated automation, create a persistent managed session, log in once, and reuse or fork it later.

This is much more honest and much more stable than trying to attach to a user’s real default Chrome profile.

---

## 10. What Not To Do Next

To keep scope under control, do **not** reopen these directions in the next pass:

- do not continue trying to fix launch against real default profile
- do not continue trying to force CDP attach to real default profile
- do not add more complexity around `live-browser-profile`
- do not build product promises around real-profile reuse

The next pass should be about simplification, not another experiment.

---

## 11. Suggested Work Order for Claude Code

1. Remove `live-browser-profile` from runtime types and schemas
2. Remove or simplify runtime code that only supported live-profile mode
3. Remove live-profile-related tests
4. Update README and user-facing descriptions to the managed-session auth story
5. Re-check response metadata (`isolation`, descriptions, labels) for consistency
6. Run tests and ensure the package tells one coherent story again

---

## 12. Acceptance Checklist

The fallback is complete when all of the following are true:

- [ ] `live-browser-profile` is no longer part of the supported runtime API
- [ ] README no longer mentions direct default-profile integration as a supported path
- [ ] the documented auth story is “log in once in a persistent managed session, then reuse/fork”
- [ ] no tests remain for abandoned live-profile behavior
- [ ] tool descriptions and metadata match the simplified managed-session model

---

## 13. Final Recommendation

The package should stop chasing direct reuse of the user’s real default Chrome identity.

That path is blocked or unreliable both in:

- launch mode
- default-profile CDP attach mode

The clean fallback is to embrace the package’s strongest model:

> **Managed persistent sessions as the official auth baseline.**

That is the most stable, honest, and maintainable product direction.
