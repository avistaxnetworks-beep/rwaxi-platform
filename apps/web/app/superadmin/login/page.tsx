import { redirect } from "next/navigation";
import { platformActor } from "@/app/_lib/server/staff-auth";
import { ConsoleLogin } from "../_components/console-login";

// Per-request: the session cookie decides between the form and the console.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Acceso · Consola Super-Admin · RWAXI",
  robots: { index: false, follow: false },
};

/** admin.rwaxirealestate.com/login — RWAXI direction sign-in (password + TOTP). */
export default async function ConsoleLoginPage() {
  const actor = await platformActor();
  if (actor && !actor.demo) redirect("/");
  return <ConsoleLogin />;
}
