// Password policy of staff accounts, shared by the activation screen (live checklist) and the server, which
// applies it again before hashing. Pure: runs in the browser and in Node.
import { msg } from "@/app/_i18n/marks";

export type PasswordRule = "length" | "case" | "digit" | "symbol" | "personal";

export const PASSWORD_RULES: { id: PasswordRule; text: string }[] = [
  { id: "length", text: msg("Entre 12 y 128 caracteres") },
  { id: "case", text: msg("Mayúsculas y minúsculas") },
  { id: "digit", text: msg("Al menos un número") },
  { id: "symbol", text: msg("Al menos un símbolo (por ejemplo ! ? # - _)") },
  { id: "personal", text: msg("Sin tu nombre, tu correo, el nombre de la empresa ni «rwaxi»") },
];

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Rules the password breaks. `personal` lists what must not appear in it: the person's name and email, the
 * developer's names and slug (words of 4+ letters are checked one by one).
 */
export function passwordFailures(password: string, personal: string[]): PasswordRule[] {
  const failed: PasswordRule[] = [];
  if (password.length < 12 || password.length > 128) failed.push("length");
  if (!/\p{Lu}/u.test(password) || !/\p{Ll}/u.test(password)) failed.push("case");
  if (!/\d/.test(password)) failed.push("digit");
  if (!/[^\p{L}\p{N}\s]/u.test(password)) failed.push("symbol");
  const words = new Set([
    "rwaxi",
    ...personal.flatMap((p) => fold(p).split(/[^a-z0-9]+/)).filter((w) => w.length >= 4),
  ]);
  const folded = fold(password);
  if ([...words].some((w) => folded.includes(w))) failed.push("personal");
  return failed;
}
