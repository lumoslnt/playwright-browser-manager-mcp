# Changelog

All notable changes to this project will be documented in this file.

## 0.3.0 - 2026-04-15

### Added
- `live-browser-profile` profile source type for `create_session`:
  - Launches the real Chrome binary against the user's real local profile (no cloning)
  - Supports `{ type: "live-browser-profile", browser: "chrome", profile: "default" }` and `{ type: "live-browser-profile", browser: "chrome", profileName: "Profile 1" }`
  - Path traversal guard on `profileName` (same as `external-profile`)
  - Resolves Chrome binary via OS-specific path (`chromeBinaryPath()`, overridable in tests)
- `ChromeNotInstalledError` — thrown when the Chrome binary is not found at the expected path
- `UnsupportedOperationError` — thrown when `fork_session` is called on a live-browser-profile session
- `managedProfile` field on sessions: `false` for live-browser-profile (we don't own the profile), `true` for all managed sessions
- `supportsFork` field on sessions: `false` for live-browser-profile (cannot snapshot a live profile), `true` for all managed sessions
- Both new fields are persisted in `sessions.json` and exposed in `create_session` and `list_sessions` responses

### Changed
- `fork_session` now throws `UnsupportedOperationError` when the source session is a live-browser-profile session
- `close_session` for live-browser-profile sessions no longer attempts to delete the profile directory
- `create_session` and `list_sessions` responses now include `managedProfile` and `supportsFork`
- `profileSource` schema in `create_session` now includes `live-browser-profile` as a valid type

### Security
- `profileName` traversal guard applies to `live-browser-profile` (same as `external-profile`): rejects `..`, `/`, `\` in profile names and validates resolved path stays inside the browser user-data root

## 0.2.2 - 2026-04-15

### Fixed
- Chrome/Edge profile clones now use the correct user-data-dir layout so Chromium can find cookies.
  When seeding from `profileSource: { type: "external-profile", browser: "chrome"|"msedge" }`, the
  profile data is now placed under `<clone-dir>/Default/` and the browser's real `Local State`
  (containing the DPAPI-wrapped AES key) is copied to `<clone-dir>/Local State`.
  Previously the profile contents were placed directly in `<clone-dir>/`, causing Chromium to treat
  the clone as an empty user-data root and create a fresh unauthenticated profile.

## 0.2.1 - 2026-04-15

### Fixed
- Chrome/Edge profile clones now correctly decrypt cookies on Windows.
  When seeding a session from an external browser profile (`profileSource: { type: "external-profile", browser: "chrome" | "msedge" }`),
  the cloned profile directory now receives the correct `os_crypt.encrypted_key` from the browser's real `User Data/Local State`.
  Previously, Chromium generated a fresh key for the clone, causing all copied cookie values (encrypted with the original DPAPI-wrapped AES key) to be silently discarded, resulting in unauthenticated sessions even when the user was logged in.

## 0.2.0 - 2026-04-14

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
