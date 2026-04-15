# Final Review Note

This implementation is now **very close to done**. Core behavior looks correct and the feature is in good shape.

## What is already good

- `live-browser-profile` is implemented
- `external-profile` is removed from runtime/schema
- launch args now correctly separate:
  - `--user-data-dir`
  - `--profile-directory`
  - `--executable-path`
- README is now aligned with the new product story
- warnings are structured
- regression tests for live-profile launch args were added

## Final polish items

### 1. Fix `isolation` output

Current `sessionMeta()` collapses `fallback-isolated` into `persistent`.

Please make `isolation` reflect the true mode:

- live profile → `"none"`
- managed persistent → `"persistent"`
- managed isolated → `"isolated"`
- managed fallback-isolated → `"fallback-isolated"`

### 2. Update tool descriptions

These descriptions are now slightly outdated:

- `create_session`
  - currently says: `"Create a managed session. Browser launch is lazy."`
  - should be updated to something like:
    - `"Create a browser session. Browser launch is lazy."`
    - or `"Create a managed or live-profile session. Browser launch is lazy."`

- `list_sessions`
  - currently says: `"List managed sessions."`
  - should be updated to:
    - `"List sessions."`
    - or `"List managed and live-profile sessions."`

### 3. Quick wording sweep

Do one final small pass over:

- `README.md`
- `CHANGELOG.md`
- any user-facing descriptions

to make sure there is no leftover wording that still implies:

- managed-only behavior
- old external-profile semantics

## Final goal

After these last polish fixes, this feature should be ready to merge.
