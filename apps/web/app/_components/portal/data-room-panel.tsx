// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
"use client";
import { Icon } from "@/app/_components/ui/icon";
import { REGIMES } from "@/app/_lib/data/kyc";
import { shortHash } from "@/app/_lib/format";
import { useI18n } from "@/app/_i18n/provider";
import type { Translate } from "@/app/_i18n/translate";

/** "01 Jurídico y Tradición" → its number and the folder name in the visitor's language. */
export const folderLabel = (folder: string, tr: Translate) =>
  folder.replace(/^(\d+\s+)?(.*)$/, (_, n = "", name) => `${n}${tr(name)}`);

export function LockedNote({ text: e }) {
  return (
    <p className="flex gap-2 items-center text-[13.5px] text-muted bg-cloud border border-line px-4 py-4">
      <Icon name="Lock" size={16} />
      {e}
    </p>
  );
}

export function DataRoomPanel({ t: e, p: a, journey: t, openDoc: o }) {
  const { tr } = useI18n();
  const n = t.grant,
    l = [...new Set(e.docs.map((r) => r.folder))];
  return (
    <div className="flex flex-col gap-4">
      {n ? (
        <div className="grid sm:grid-cols-4 gap-px bg-line border border-line text-[12px]">
          {[
            ["AccessGrant", n.id],
            [tr("Alcance"), `Data Room · ${a.code}`],
            [tr("Emitido (UTC)"), n.at],
            [tr("Vigencia"), tr("{hours} h · Signed URLs de 15 min", { hours: n.ttlH })],
          ].map(([r, i]) => (
            <div key={r} className="bg-aquaTint p-3 min-w-0">
              <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-aquaInk">{r}</p>
              <p className="font-mono text-[11.5px] text-inkBody mt-1 break-words">{i}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            [tr("NDA firmado"), !!t.nda],
            [tr("KYC/{sys} aprobado", { sys: REGIMES[e.regime].sys }), t.kyc.status === "aprobado"],
          ].map(([r, i]) => (
            <p
              key={r}
              className={`flex items-center gap-2 text-[13px] px-4 py-3 border ${i ? "border-rxAqua bg-aquaTint text-aquaInk" : "border-line bg-cloud text-muted"}`}
            >
              <Icon name={i ? "CheckCircle2" : "Circle"} size={16} />
              {r}
            </p>
          ))}
        </div>
      )}
      <div className="grid md:grid-cols-2 gap-4">
        {l.map((r) => (
          <div key={r} className="border border-line bg-white">
            <p className="px-4 py-2.5 border-b border-line text-[12.5px] font-semibold text-rxPurple inline-flex items-center gap-2 w-full">
              <Icon name="Folder" size={15} className="tc-text" />
              {folderLabel(r, tr)}
            </p>
            <ul>
              {e.docs
                .filter((i) => i.folder === r)
                .map((i) => {
                  const s = i.restricted && !n;
                  return (
                    <li key={i.id} className="border-b border-line last:border-b-0">
                      <button
                        disabled={s}
                        onClick={() =>
                          o({
                            name: i.name,
                            project: a,
                            folder: r,
                            hash: i.hash,
                            signed: i.restricted,
                            tenant: e,
                          })
                        }
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-start hover:bg-cloud disabled:hover:bg-transparent disabled:cursor-not-allowed focus-ring"
                      >
                        <Icon
                          name={s ? "Lock" : "FileText"}
                          size={15}
                          className={s ? "text-muted shrink-0" : "text-rxBlue shrink-0"}
                        />
                        <span className="flex-1 min-w-0">
                          <span className={`block text-[12.5px] ${s ? "text-muted" : "text-inkBody"}`}>
                            {tr(i.name)}
                            {i.uploaded && (
                              <span className="ms-1.5 text-[10px] font-semibold text-goldInk">
                                {tr("NUEVO")}
                              </span>
                            )}
                          </span>
                          <span className="block font-mono text-[10.5px] text-muted">
                            {"SHA-256 "}
                            {shortHash(i.hash, 8, 6)}
                          </span>
                        </span>
                        <span className="font-mono text-[10px] text-muted">
                          {i.restricted ? (n ? "Signed URL" : tr("Restringido")) : tr("Público")}
                        </span>
                      </button>
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}
      </div>
      <p className="text-[11.5px] text-muted">
        {tr("Merkle Root del Data Room:")}{" "}
        <span className="font-mono text-aquaInk">{shortHash(e.merkle, 16, 10)}</span>
      </p>
    </div>
  );
}
