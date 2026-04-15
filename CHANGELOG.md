# Changelog

All notable changes to this project will be documented in this file.

## 0.3.0 - 2026-04-15

### Changed
- Dropped `live-browser-profile` profile source type. Investigation showed that launching `@playwright/mcp` against the real Chrome user-data root is blocked by profile lock, and CDP-attach to a running Chrome instance does not integrate with the child MCP process model. The recommended auth baseline is a managed persistent session: log in inside the session, then reuse or fork it.
- `profileSource` now only accepts `managed-empty` and `session`
- `isolation` field in `create_session` / `list_sessions` responses now correctly exposes `fallback-isolated` instead of collapsing it to `persistent`
- Removed `managedProfile` and `supportsFork` fields from all session responses and persistence (they were only meaningful for the removed live-browser-profile type)

## 0.2.0 - 2026-04-14

### Fixed
- Chrome/Edge profile clones now use the correct user-data-dir layout so Chromium can find cookies.
  Profile data is placed under `<clone-dir>/Default/` and the browser's real `Local State`
  (containing the DPAPI-wrapped AES key) is copied to `<clone-dir>/Local State`.
- Chrome/Edge profile clones now correctly decrypt cookies on Windows.
  The cloned profile receives the correct `os_crypt.encrypted_key` from the browser's real `User Data/Local State`,
  preventing silently discarded cookie values due to a mismatched DPAPI-wrapped AES key.

### Added
- add `profileSource` support to `create_session`
- support cloning session state from external browser profiles
- support selector-based external profile sources:
  - explicit `path`
  - `browser + profile: "default"`
  - `browser + profileName`
- add `fork_session` for creating a new managed session from an existing managed session
- persist session/profile seeding metadata:
  - `profileSource`
  - `seededFromSessionId`
  - `seededFromExternalProfilePath`
  - `materializedAt`
- add tests covering:
  - profile source schema behavior
  - profile resolve/materialization
  - session creation/fork flows
  - session store persistence defaults

### Changed
- session bootstrap now separates:
  - **where state comes from** via `profileSource`
  - **how managed state lives** via `profileMode`
- external profile seeding now resolves selector inputs into real source paths before cloning
- clone directory creation now uses more readable target naming
- session creation responses now include more seeding metadata
- README updated for npm and GitHub to document session/profile seeding and `fork_session`

### Security
- intentionally do **not** support external-direct profile mounting
- `profileName` resolution now rejects path traversal and validates that resolved paths stay inside the browser user-data root
- selector-based external profile sources now record the final resolved source path for better observability

### Notes
- first-priority selector support intentionally stops at:
  - `path`
  - `browser + profile: "default"`
  - `browser + profileName`
- `auto`, `recent`, and "current active profile" guessing are still out of scope for this release
