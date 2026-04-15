# Review: Live Chrome Profile Implementation (Round 1)

Date: 2026-04-15
Repo: `playwright-sessions-mcp`
Reviewer intent: evaluate the first implementation of `live-browser-profile` and provide a concrete next-round correction plan.

---

## Executive Summary

The first implementation is a **good start**, but it is **not yet a complete or fully correct implementation** of the intended design.

### What is good

- The new `live-browser-profile` source type exists.
- The implementation is reasonably contained and does not sprawl across unrelated modules.
- Tests were added and pass.
- `live-browser-profile` sessions are correctly marked as non-managed and non-forkable.
- `fork_session` is blocked for live-profile sessions.
- `close_session` does not attempt to delete a live user profile.

### What is not yet correct

There are still important gaps between the implementation and the intended design:

1. **Live profile launch semantics are likely wrong** because `Default`/`Profile 1` is being treated like `--user-data-dir`, instead of separating:
   - Chrome user-data root
   - Chrome profile directory name
2. **`external-profile` has not really been removed**. It still exists in schemas, types, implementation paths, tests, and README messaging.
3. **README/product messaging is now out of sync** with the intended direction.
4. **Chrome binary discovery is too naive** and will fail on many real Windows machines.
5. **API constraints are still too loose**, especially around `browserType` with `live-browser-profile`.
6. **Result metadata and warnings are incomplete** compared to the design goals.

### Recommendation

Do **not** treat the current branch as the final implementation.

Treat it as **Round 1 complete; Round 2 required**.

---

## Review Scope

This review focuses on:

- correctness of `live-browser-profile` behavior
- alignment with the intended design direction
- code cleanliness and abstraction quality
- migration/deprecation status of `external-profile`
- product-facing consistency (README, schema, tool outputs)

---

## What Was Implemented Well

## 1. Narrow and disciplined change surface

The implementation touched the expected layers:

- `sessionTypes`
- `profileManager`
- `sessionManager`
- `sessionTools`
- `errors`

This is a good sign. The work is reasonably scoped.

## 2. New capability skeleton is present

The following were added correctly in spirit:

- `live-browser-profile` schema support
- `ChromeNotInstalledError`
- `UnsupportedOperationError`
- `managedProfile`
- `supportsFork`
- fork rejection for live-profile sessions
- protection against deleting live profile directories

This means the overall feature direction is implemented, not just documented.

## 3. Tests were added for the new capability

The implementation includes useful unit tests for:

- `resolveLiveBrowserProfile`
- missing Chrome binary
- named profile resolution
- profileName traversal rejection
- non-managed / non-forkable live-profile sessions
- fork rejection
- close behavior for live-profile sessions

This is good engineering hygiene and should be preserved.

---

## Critical Issues To Fix

## P0-1. Live profile launch semantics are likely incorrect

### Problem

The current implementation appears to resolve:

- `profileDir = ...\User Data\Default`

and then launches child Playwright MCP with:

```ts
--user-data-dir <profileDir>
```

This is likely incorrect.

For Chrome, these are usually distinct concepts:

- **user data dir root** → e.g. `...\Google\Chrome\User Data`
- **profile directory** → e.g. `Default` or `Profile 1`

The current implementation appears to pass the profile subdirectory itself as `--user-data-dir`.

### Why this matters

This is the core semantic promise of the feature.

The new mode is supposed to mean:

> use the user’s real Chrome binary with the user’s real Chrome profile

If the launch parameters are wrong, the feature may appear implemented while actually not using the intended profile correctly.

### Required correction

The internal model for live-profile sessions must separate:

- `browserUserDataRoot`
- `profileDirectoryName`
- `browserBinary`

The launch path must then pass the correct values in a way compatible with the child Playwright/Chrome launch model.

### Acceptance criteria

- `Default` is **not** treated as the full `user-data-dir`
- the launch path clearly distinguishes user-data root from selected profile directory
- a live-profile session demonstrably uses the real intended Chrome profile

---

## P0-2. `external-profile` must be truly removed

### Problem

The current implementation still keeps `external-profile` as an active feature in many places:

- `ProfileSourceRecord`
- input schemas
- session manager resolution path
- tests
- README examples
- conceptual product messaging

This directly conflicts with the new product decision.

### Why this matters

The team decision is no longer:

> keep `external-profile` as a real auth-seeding path

The new direction is:

> remove `external-profile` clone and replace it with explicit `live-browser-profile`

Leaving `external-profile` in place keeps the product story muddy and preserves the very confusion this redesign is meant to eliminate.

### Required correction

`external-profile` should be **really removed**, not just overshadowed.

At minimum, remove it from:

- `ProfileSourceRecord`
- `create_session` schema
- resolution/materialization paths
- README and docs
- tests that imply it remains supported
- error messages that still present it as a valid first-class source

### Acceptance criteria

- callers cannot create new `external-profile` sessions
- docs no longer recommend or document `external-profile`
- code no longer treats `external-profile` as a normal supported source

---

## P0-3. `browserType` constraints are too loose for live-profile mode

### Problem

The implementation allows a mismatch like:

```json
{
  "browserType": "chromium",
  "profileSource": {
    "type": "live-browser-profile",
    "browser": "chrome",
    "profile": "default"
  }
}
```

while also injecting `chrome.exe` as the executable path.

### Why this matters

This creates a contradictory API contract:

- schema says one thing
- launch path does another
- caller can express nonsense combinations

### Required correction

For `live-browser-profile`, the API should enforce that the effective browser is Chrome.

Options:

- reject any non-`chrome` `browserType`
- ignore `browserType` and normalize it to Chrome internally, while documenting that behavior

Recommendation: **reject mismatched input explicitly**.

### Acceptance criteria

- `live-browser-profile` cannot be created with incompatible browser settings
- error message is clear and action-guiding

---

## P0-4. Chrome binary discovery is too naive

### Problem

The implementation currently relies on a single or overly simplistic Chrome executable path.

On Windows, Chrome may be installed in multiple common locations, including:

- `%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe`
- `%PROGRAMFILES%\Google\Chrome\Application\chrome.exe`
- `%PROGRAMFILES(X86)%\Google\Chrome\Application\chrome.exe`

### Why this matters

The current implementation may incorrectly report “Chrome not installed” on normal machines.

### Required correction

Implement a more robust Chrome discovery strategy.

Minimum Windows search order recommendation:

1. explicit configured path, if such override exists
2. `%LOCALAPPDATA%`
3. `%PROGRAMFILES%`
4. `%PROGRAMFILES(X86)%`

### Acceptance criteria

- typical Windows Chrome installations resolve correctly
- failures report all searched locations or at least the effective search strategy

---

## Important Product / UX Issues

## P1-1. README is still telling the old story

### Problem

The README still heavily describes:

- external profile cloning
- external profile examples
- clone-based seeding as a real path
- security model centered on cloning external profiles

This no longer matches the product direction.

### Why this matters

For most users, README is the product surface.
If README stays on the old model, users will continue to use and expect the wrong thing.

### Required correction

Rewrite README around these two modes:

#### Recommended default path

- managed sessions
- login once
- reuse/fork later

#### Explicit advanced path

- `live-browser-profile`
- use real local Chrome directly
- non-default
- non-isolated
- may require Chrome to be closed first
- not intended for multi-session parallel use

### Acceptance criteria

- README no longer presents `external-profile` as a supported auth path
- README prominently explains `live-browser-profile` semantics and tradeoffs

---

## P1-2. Result metadata is incomplete

### Problem

The implementation adds:

- `managedProfile`
- `supportsFork`

That is useful, but not enough to fully communicate mode semantics.

### Missing or incomplete metadata

Recommended additions:

- `sessionRef`
- `browserBinary`
- `isolation`
- `warnings`

### Why this matters

`live-browser-profile` is intentionally more explicit and more dangerous than a normal managed session.
That means outputs should make its mode obvious.

### Required correction

Add richer result metadata to `create_session` and `list_sessions` responses.

### Acceptance criteria

A caller can tell from the returned object that the session is:

- live-profile based
- non-isolated
- using a specific Chrome binary
- non-forkable
- potentially subject to warnings / lock conditions

---

## P1-3. Strong warnings are still missing

### Problem

The design intentionally called for strong signaling around live-profile mode.

Current implementation adds capability flags, but not enough explicit warning semantics.

### Required correction

Create and list responses should surface warnings such as:

- this session uses the user’s real local Chrome profile directly
- this session is not isolated
- this session may require Chrome to be closed before launch
- this session is not suitable for normal multi-session parallel use

### Acceptance criteria

- warnings are machine-readable and user-readable
- docs and tool results tell the same story

---

## Code Cleanliness Assessment

## What is clean

- The code changes are not sprawling.
- The added errors are appropriate.
- The new session metadata fields are conceptually useful.
- Tests are present and focused.

## What is not yet elegant

The current implementation still forces `live-browser-profile` into the old abstraction shape:

- one `profileDir`
- one launch path
- one managed-profile-oriented model

This is why the most important semantic bug appears: the feature is conceptually different, but the model was not quite separated enough.

### Conclusion on code quality

The code is **not messy**, but the abstraction is **not yet fully honest**.

This is not a “rewrite” problem. It is a “take the abstraction one level further” problem.

---

## Required Refactor Direction

The next round should make the session model more honest.

## For managed sessions

Keep:

- manager-owned `profileDir`
- clone/materialize logic
- forkability
- aggressive recovery

## For live-profile sessions

Represent explicitly:

- `browserUserDataRoot`
- `profileDirectoryName`
- `browserBinary`
- `managedProfile = false`
- `supportsFork = false`
- conservative launch/recovery policy

The implementation should stop pretending these are just two minor variants of the same profile model.

---

## Concrete Next-Round Work Items

## Must-do before calling the feature complete

1. **Fix live-profile launch semantics**
   - distinguish user-data root from profile directory
   - launch correctly

2. **Really remove `external-profile`**
   - types
   - schemas
   - implementation
   - README/docs
   - tests

3. **Tighten live-profile input validation**
   - reject incompatible `browserType`

4. **Improve Chrome binary resolution**
   - support real Windows install locations

5. **Update README and docs**
   - reflect the new product story

## Strongly recommended in the same round

6. Add `warnings`
7. Add `browserBinary`
8. Add `isolation`
9. Add `sessionRef`
10. Update stale error/help text

---

## Acceptance Checklist for Round 2

The implementation should not be considered complete until all of the following are true:

- [ ] `live-browser-profile` uses the real Chrome user-data root and correct profile directory semantics
- [ ] `external-profile` has been removed as a supported source type
- [ ] README no longer recommends or documents external-profile clone
- [ ] `live-browser-profile` clearly signals non-isolated behavior
- [ ] Chrome binary lookup works on typical Windows installs
- [ ] incompatible browser settings are rejected clearly
- [ ] create/list responses expose enough metadata to understand mode and limitations
- [ ] tests cover the new behavior model, not just the old shape with a new enum value

---

## Final Review Verdict

### Current verdict

**Not ready as final implementation.**

### Better framing

This branch is a **good first implementation pass** that proves the direction is viable.

However, it still needs a second pass to:

- make live-profile semantics correct
- remove `external-profile` for real
- align docs and API outputs with the intended product direction

### Recommended instruction for the next implementer

> Keep the current structure where possible, but do a second pass that makes the model honest:
> managed sessions are manager-owned profiles; live-browser-profile sessions are real local Chrome usage and must be represented and launched differently.
> Also remove `external-profile` completely rather than leaving it as a shadow feature.
