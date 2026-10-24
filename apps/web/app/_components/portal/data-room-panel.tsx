"use client";
import { Icon } from "@/app/_components/ui/icon";
import { shortHash } from "@/app/_lib/format";
import { useI18n } from "@/app/_i18n/provider";
import type { Translate } from "@/app/_i18n/translate";
import type { PersistedHolding } from "@/app/tenant/[slug]/_lib/journey-types";
import type { PortalJourney, PortalProject, PortalTenant } from "./portal-types";

/** "01 Jurídico y Tradición" → its number and the folder name in the visitor's language. */
export const folderLabel = (folder: string, tr: Translate) =>
  folder.replace(/^(\d+\s+)?(.*)$/, (_, n = "", name) => `${n}${tr(name)}`);

export function LockedNote({ text: e }: { text: string }) {
  return (
    <p className="flex gap-2 items-center text-[13.5px] text-muted bg-cloud border border-line px-4 py-4">
      <Icon name="Lock" size={16} />
      {e}
    </p>
  );
}

/** A document of the prototype's demo Data Room (tenant.docs). */
export interface DemoDoc {
  id: string;
  folder: string;
  name: string;
  restricted: boolean;
  hash: string;
  uploaded?: boolean;
}

/** What the signed-document preview opens. */
export interface OpenedDoc {
  name: string;
  project: PortalProject;
  folder: string;
  hash: string;
  signed: boolean;
  tenant: PortalTenant;
  /** a subscription certificate: the holding it certifies */
  holding?: PersistedHolding;
}

/**
 * The prototype's Data Room, shown when the offering has no documents in PostgreSQL. Like the persisted one
 * (tenant/[slug]/_components/investor-data-room.tsx), the NDA opens every document and a revocation closes them all.
 */
export function DataRoomPanel({
  t: e,
  p: a,
  journey: t,
  openDoc: o,
}: {
  t: PortalTenant & { docs: DemoDoc[]; merkle: string };
  p: PortalProject;
  journey: PortalJourney;
  openDoc: (doc: OpenedDoc) => void;
}) {
  const { tr } = useI18n();
  const revoked = t.kyc.status === "revocado",
    n = !!t.nda && !revoked,
    l = [...new Set(e.docs.map((r) => r.folder))];
  return (
    <div className="flex flex-col gap-4">
      {revoked ? (
        <p role="status" className="flex gap-2 items-start text-[13px] border border-[#F3C5BF] bg-[#FDF6F5] text-[#B42318] px-4 py-3">
          <Icon name="Lock" size={16} className="shrink-0 mt-0.5" />
          {tr("Tu verificación fue revocada: el acceso al Data Room de este proyecto quedó cerrado.")}
        </p>
      ) : t.nda ? (
        <div className="grid sm:grid-cols-4 gap-px bg-line border border-line text-[12px]">
          {[
            [tr("Acceso"), tr("NDA firmado")],
            [tr("Alcance"), tr("100 % del Data Room · {code}", { code: a.code })],
            [tr("Firmado (UTC)"), t.nda.at],
            [tr("Integridad"), tr("SHA-256 verificado en tu navegador")],
          ].map(([r, i]) => (
            <div key={r} className="bg-aquaTint p-3 min-w-0">
              <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-aquaInk">{r}</p>
              <p className="font-mono text-[11.5px] text-inkBody mt-1 break-words">{i}</p>
            </div>
          ))}
        </div>
      ) : (
        <LockedNote text={tr("Firma el NDA (Paso 1) para desbloquear el 100 % del Data Room.")} />
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
                  const s = !n;
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
                        <span className="font-mono text-[10px] text-muted text-end">
                          {revoked
                            ? tr("Acceso retirado")
                            : !n
                              ? tr("Requiere NDA")
                              : i.restricted
                                ? tr("Reservado · con NDA")
                                : tr("Con NDA")}
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
