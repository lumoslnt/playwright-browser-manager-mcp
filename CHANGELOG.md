# Changelog

All notable changes to this project will be documented in this file.

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
