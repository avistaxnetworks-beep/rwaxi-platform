// Markers of translatable Spanish source texts outside a render (data tables, server messages).
// They are identities at runtime; `catalogs.test.ts` extracts their literals (and those of `tr(...)`) to
// check that every language has every message it must show.
import { interpolate, type Vars } from "./translate";

/** A text of the portal, backoffice or inspector (Spanish, English, Portuguese). */
export const msg = (source: string) => source;

/** A text shown in the vitrina too (its 10 languages). */
export const vmsg = (source: string) => source;

/** A server message (error, toast, blocker) not yet rendered: its Spanish source and its values. */
export interface Reason {
  source: string;
  vars?: Vars;
}
export const reason = (source: string, vars?: Vars): Reason => ({ source, vars });

/**
 * An expected failure whose message is shown to the user: it keeps its Spanish source and values so the
 * caller renders it in the visitor's language (`render(tr, e.reason)`); `message` is the Spanish text.
 */
export class LocalizedError extends Error {
  readonly reason: Reason;
  constructor(source: string, vars?: Vars) {
    super(interpolate(source, vars));
    this.reason = { source, vars };
  }
}
