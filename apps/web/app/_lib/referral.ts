/**
 * RWAXI LeadReferral hand-off (vitrina → tenant portal). Pure and Edge-safe.
 *
 * The vitrina links to `{slug}.rwaxi.com/?ref=ref_rwx_…`; middleware.ts stores the token in a
 * first-touch HttpOnly cookie on the tenant host, and the NDA Server Action turns it into the
 * persisted Lead (source RWAXI). Tokens are attribution ids, not credentials.
 * TODO(attribution): sign tokens on www (REFERRAL_SECRET) so they cannot be forged.
 */
export const REF_COOKIE = "rwaxi_ref";
export const REF_MAX_AGE_S = 30 * 24 * 3600;
export const REF_TOKEN_RE = /^ref_rwx_[0-9a-f]{24}$/;

export const encodeRef = (token: string, landedAtMs: number) => `${token}.${landedAtMs}`;

export function parseRef(value: string | null | undefined): { token: string; landedAt: Date } | null {
  if (!value) return null;
  const [token, ms] = value.split(".");
  const landedAt = new Date(Number(ms));
  if (!token || !REF_TOKEN_RE.test(token) || Number.isNaN(landedAt.getTime())) return null;
  return { token, landedAt };
}
