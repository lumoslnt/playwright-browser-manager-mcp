# Review: Live Chrome Profile Implementation (Round 2)

Date: 2026-04-15
Repo: `playwright-sessions-mcp`
Purpose: summarize the second implementation review and define the remaining cleanup/polish work for the next Claude Code pass.

---

## Executive Summary

This round is **substantially better** than the first implementation.

The feature has moved from:

- “good direction, but core semantics still wrong”

into:

- “core behavior is mostly correct; remaining work is polish, cleanup, and product-surface consistency”

## Current verdict

**The core live-profile feature is now basically implemented.**

However, it is still worth doing **one more cleanup pass** before treating the feature as fully finished and polished.

---

## What Is Now Correct / Good

## 1. Live profile launch semantics are now much closer to correct

The previous blocker was that the implementation treated `Default` (or `Profile 1`) as the whole `--user-data-dir`.

That has now been corrected in the right direction:

- live profile resolution distinguishes:
  - Chrome user-data root
  - selected profile directory name
  - Chrome binary path
- child launch now includes:
  - `--user-data-dir <root>`
  - `--profile-directory <Default|Profile 1>`

This is the most important correction from the previous review.

## 2. `external-profile` has effectively been removed from runtime support

This is now true in the parts that matter most:

- removed from `ProfileSourceRecord`
- removed from `create_session` schema
- removed from runtime resolution path
- removed from related tests

This aligns the runtime behavior with the new product direction.

## 3. Windows Chrome binary resolution is much better

The implementation now checks multiple common Chrome install locations on Windows, including:

- `%LOCALAPPDATA%`
- `%PROGRAMFILES%`
- `%PROGRAMFILES(X86)%`

This is meaningfully better than a single hardcoded path.

## 4. Browser constraints are tighter

`live-browser-profile` now enforces Chrome semantics much more explicitly.

This avoids nonsensical combinations like:

- `profileSource.browser = chrome`
- `browserType = chromium`

## 5. Session metadata is richer

This round adds useful fields such as:

- `sessionRef`
- `browserBinary`
- `isolation`
- `warnings`

These improve observability and make the live-profile mode easier to understand from tool responses.

---

## Remaining Issues / Cleanup Work

The remaining work is no longer about core feasibility. It is mostly about:

- surface consistency
- API cleanliness
- documentation alignment
- a bit of abstraction cleanup

---

## P1. README / product messaging likely still needs to be updated

### Problem

The runtime and schemas have moved to the new model, but README and other user-facing docs may still tell the old story.

If README still presents:

- external profile cloning
- clone-based auth seeding
- old examples using `external-profile`

then the product surface is still inconsistent even if the code path is gone.

### Required follow-up

Update README and any primary docs to reflect the new product story:

### Recommended default path

- managed session
- log in once
- reuse or fork later

### Explicit advanced path

- `live-browser-profile`
- uses real local Chrome directly
- not isolated
- not forkable
- may require Chrome to be closed first
- not intended for normal parallel multi-session use

### Acceptance criteria

- README does not present `external-profile` as a supported runtime feature
- README clearly explains the tradeoffs of live-profile mode

---

## P1. `sessionRef` is still not quite semantically clean

### Problem

Current `sessionRef` looks more like a display label than a true reference token, e.g. a combination of name and short id.

That is okay for UI/debugging, but not ideal if the field is intended to be reused by callers programmatically.

### Why this matters

The name `sessionRef` suggests:

- “this is the thing you should pass back into later tools”

But the current value behaves more like:

- “this is a human-readable label”

### Required follow-up

Decide which meaning is intended:

#### Option A — real reference
Make `sessionRef` something the system can reliably accept later, e.g.:

- `name`
- or another stable reference format

#### Option B — display label
If the field is only for readability, rename it to something like:

- `displayRef`
- `label`

### Recommendation

If the near-term plan is to support name-based session resolution, keep `sessionRef`, but make sure its value aligns with that future.

---

## P1. `warnings` should ideally become structured objects

### Problem

Current warnings are strings.

This is readable, but less robust for clients or agents that may want to detect warnings programmatically.

### Recommended shape

Instead of:

```json
["This session uses your real local Chrome profile directly..."]
```

prefer:

```json
[
  {
    "code": "LiveProfileMode",
    "message": "This session uses your real local Chrome profile directly and is not isolated."
  }
]
```

### Why this helps

- easier for clients to inspect
- easier to keep stable across wording changes
- better long-term API hygiene

### Priority

This is **important polish**, but not a blocker for correctness.

---

## P1. `profileDir` is still overloaded conceptually

### Problem

The implementation now works better, but `profileDir` still means different things depending on session type:

### For managed sessions

`profileDir` means:

- manager-owned profile root

### For live-profile sessions

`profileDir` now effectively means:

- Chrome user-data root

with the actual selected profile carried separately as `profileDirectoryName`.

### Why this matters

This is workable, but not fully elegant.
The abstraction is still somewhat overloaded.

### Recommended follow-up

This does not necessarily need an immediate rename/refactor if the team wants to keep the patch small.

But future code should treat the model honestly:

- managed profile root
- live browser user-data root
- selected profile directory name

At minimum, add comments/docs/tests that make this distinction explicit.

### Priority

Medium. This is not blocking current correctness.

---

## P1. Launch-argument regression coverage should be stronger

### Problem

The biggest semantic bug from the previous round came from wrong launch arguments.

That means this is an area worth locking down with direct tests.

### Recommended tests

Add focused tests that verify:

#### For live-profile sessions

child args include:

- `--user-data-dir <userDataRoot>`
- `--profile-directory <Default|Profile 1>`
- `--executable-path <chrome.exe>`

#### For managed sessions

child args do **not** accidentally inherit live-profile-only flags.

### Why this matters

This is cheap protection against future regressions in the feature’s most important behavior.

---

## P1. Cleanup of remaining runtime-adjacent old examples

### Problem

Even though `external-profile` is gone from runtime support, there may still be old usage examples or smoke/e2e scripts referencing it.

These are less important than README, but still worth cleaning up if they are meant to represent current usage.

### Recommended follow-up

Review and update:

- e2e/demo scripts
- smoke examples
- any current-facing example docs

Historical design notes and issue documents can remain as historical artifacts.

### Priority

Medium.

---

## Suggested Final Cleanup Pass

The next Claude Code pass should focus on these items only:

1. **Update README and primary docs** to reflect the new product model
2. **Decide and clean up `sessionRef` semantics**
3. **Convert `warnings` to structured objects** (recommended)
4. **Add direct launch-argument regression tests** for live-profile sessions
5. **Clean up remaining runtime-adjacent old examples/e2e references**
6. **Optionally tighten comments/docs around `profileDir` vs `userDataRoot` semantics**

This should be treated as a polish round, not a major redesign.

---

## Acceptance Checklist for the Next Pass

The feature can be considered cleanly finished when all of the following are true:

- [ ] README tells the new story (managed sessions first, live-profile as explicit advanced mode)
- [ ] No current-facing runtime docs/examples still suggest `external-profile`
- [ ] `sessionRef` meaning is clear and intentional
- [ ] `warnings` are machine-friendly or intentionally documented as display-only
- [ ] launch-argument tests explicitly cover live-profile behavior
- [ ] live-profile limitations are obvious from both docs and tool outputs

---

## Final Review Verdict

### Compared to Round 1

This round is a real improvement.
The main semantic issue has been corrected.
The feature is now mostly on the right abstraction path.

### Current status

**Core functionality: implemented**

**Polish / API / product-surface work: still needed**

### Final recommendation

Proceed with one more cleanup pass focused on:

- docs
- API polish
- regression tests
- removal of remaining old-facing examples

After that, the feature should be in strong shape.
