// Results of the staff login actions (backoffice and console), already in the visitor's language.
export type LoginActionResult =
  | { ok: true; step: "mfa" }
  | { ok: true; step: "enroll"; secret: string; uri: string }
  | { ok: false; error: string };

/** `restart`: the pending session is gone (expired, locked, too many codes): back to the password step. */
export type MfaActionResult = { ok: true } | { ok: false; error: string; restart?: boolean };

/** Who the header shows: a signed-in staff member, or the demo session (where it is enabled). */
export interface AccountView {
  demo: boolean;
  name: string;
  email: string;
  /** Spanish source of the role label (translated where it is shown) */
  role: string | null;
}
