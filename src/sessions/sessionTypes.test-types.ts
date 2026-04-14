// This file is intentionally never executed — it is a compile-time type check.
import type { ProfileSourceRecord, SessionRecord } from "./sessionTypes.js";

// Must compile without error — ensures the union covers all cases.
const src: ProfileSourceRecord = { type: "managed-empty" };
const src2: ProfileSourceRecord = { type: "external-profile", path: "/a/b" };
const src3: ProfileSourceRecord = { type: "session", sessionId: "x" };

// SessionRecord must have profileSource
function check(s: SessionRecord): string {
  return s.profileSource.type;
}
void src; void src2; void src3; void check;
