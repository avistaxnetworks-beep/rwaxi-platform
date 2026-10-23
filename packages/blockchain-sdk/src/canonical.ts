/**
 * Canonical JSON for evidence hashing (KYC dossiers, consent records).
 *
 * Object keys are sorted recursively and no whitespace is emitted, so the same evidence always
 * serialises to the same string — also after a round-trip through PostgreSQL `jsonb`, which
 * reorders keys. Hash with sha256Document(canonicalJson(evidence)).
 *
 * Only JSON-safe values are accepted: non-finite numbers, bigint, functions and symbols throw;
 * `undefined` object members are omitted (as JSON.stringify does).
 */
import { sha256Document, type Bytes32 } from "./merkle";

export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
    case "boolean":
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value)) throw new TypeError(`Non-finite number in canonical JSON: ${value}`);
      return JSON.stringify(value);
    case "object": {
      if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v === undefined ? null : v)).join(",")}]`;
      if (value instanceof Date) return JSON.stringify(value.toISOString());
      const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
    }
    default:
      throw new TypeError(`Unsupported value in canonical JSON: ${typeof value}`);
  }
}

/** SHA-256 (bytes32) of the canonical serialisation of `evidence`. */
export function evidenceHash(evidence: unknown): Bytes32 {
  return sha256Document(canonicalJson(evidence));
}
