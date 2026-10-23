import { dirOf } from "./_i18n/config";
import { vmsg } from "./_i18n/marks";
import { hostScope, requestLocale, requestTranslate } from "./_i18n/server";
import { spanish } from "./_i18n/translate";

const TITLE = vmsg("Este portal no existe");
const DETAIL = vmsg("El dominio no corresponde a ningún desarrollador activo en la red RWAXI.");

/** 404 of every host, in the language the visitor chose on it (the Super-Admin console is Spanish). */
export default async function NotFound() {
  const scope = await hostScope();
  const tr = scope ? await requestTranslate(scope) : spanish;
  return (
    <main
      dir={dirOf(scope ? await requestLocale(scope) : "es")}
      className="min-h-screen grid place-items-center bg-rxDeep text-white gutter"
    >
      <div className="max-w-md text-center">
        <p className="font-mono text-[11px] tracking-[0.16em] text-lav">404 · RWAXI</p>
        <h1 className="font-display text-[40px] leading-tight mt-3">{tr(TITLE)}</h1>
        <p className="text-[13.5px] text-[#A79FC0] mt-3">{tr(DETAIL)}</p>
      </div>
    </main>
  );
}
