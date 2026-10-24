"use client";

import { useState } from "react";
import { folderLabel } from "@/app/_components/portal/data-room-panel";
import { Icon } from "@/app/_components/ui/icon";
import { useI18n } from "@/app/_i18n/provider";
import { shortHash } from "@/app/_lib/format";
import { sha256Bytes } from "@/app/_lib/sha256";
import type { PersistedDataRoomDocument } from "../_lib/journey-types";

type DocState = { kind: "busy" } | { kind: "verified" } | { kind: "error"; message: string };

/**
 * Data Room of the portal from PostgreSQL and the DocumentVault. Every visitor sees the index; a document's file
 * goes out only to this portal's investor with the NDA (restricted ones: also a current AccessGrant) — the server
 * decides and records the download. The browser re-hashes the copy against the SHA-256 anchored as a Merkle leaf
 * before handing it over.
 */
export function InvestorDataRoom({
  documents,
  root,
  nda,
  kycApproved,
  grant,
  regimeSys,
  code,
}: {
  documents: PersistedDataRoomDocument[];
  root: string | null;
  nda: boolean;
  kycApproved: boolean;
  grant: { id: string; at: string; ttlH: number } | null;
  regimeSys: string;
  code: string;
}) {
  const { tr } = useI18n();
  const [state, setState] = useState<Record<string, DocState>>({});
  const folders = [...new Set(documents.map((d) => d.folder))];

  const download = async (doc: PersistedDataRoomDocument) => {
    setState((s) => ({ ...s, [doc.id]: { kind: "busy" } }));
    try {
      const response = await fetch(`/api/vault/data-room/${doc.id}`, { cache: "no-store" });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? tr("No se pudo abrir el documento. Inténtalo de nuevo."));
      }
      const blob = await response.blob();
      const hash = `0x${await sha256Bytes(await blob.arrayBuffer())}`;
      if (hash !== doc.sha256.toLowerCase()) {
        throw new Error(
          tr("La copia recibida no coincide con el SHA-256 anclado en el Data Room: no se abrió."),
        );
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // The server names the file after the document with its verified extension (Content-Disposition).
      const named = /filename\*=UTF-8''([^;]+)/.exec(response.headers.get("content-disposition") ?? "");
      a.download = named ? decodeURIComponent(named[1]!) : doc.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setState((s) => ({ ...s, [doc.id]: { kind: "verified" } }));
    } catch (e) {
      setState((s) => ({
        ...s,
        [doc.id]: { kind: "error", message: e instanceof Error ? e.message : String(e) },
      }));
    }
  };

  return (
    <div className="flex flex-col gap-4" data-investor-data-room>
      {grant ? (
        <div className="grid sm:grid-cols-4 gap-px bg-line border border-line text-[12px]">
          {[
            ["AccessGrant", grant.id],
            [tr("Alcance"), `Data Room · ${code}`],
            [tr("Emitido (UTC)"), grant.at],
            [tr("Vigencia"), tr("{hours} h", { hours: grant.ttlH })],
          ].map(([label, value]) => (
            <div key={label} className="bg-aquaTint p-3 min-w-0">
              <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-aquaInk">{label}</p>
              <p className="font-mono text-[11.5px] text-inkBody mt-1 break-words">{value}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {(
            [
              [tr("NDA firmado"), nda],
              [tr("KYC/{sys} aprobado", { sys: regimeSys }), kycApproved],
            ] as [string, boolean][]
          ).map(([label, done]) => (
            <p
              key={label}
              className={`flex items-center gap-2 text-[13px] px-4 py-3 border ${done ? "border-rxAqua bg-aquaTint text-aquaInk" : "border-line bg-cloud text-muted"}`}
            >
              <Icon name={done ? "CheckCircle2" : "Circle"} size={16} />
              {label}
            </p>
          ))}
        </div>
      )}
      <div className="grid md:grid-cols-2 gap-4">
        {folders.map((folder) => (
          <div key={folder} className="border border-line bg-white">
            <p className="px-4 py-2.5 border-b border-line text-[12.5px] font-semibold text-rxPurple inline-flex items-center gap-2 w-full">
              <Icon name="Folder" size={15} className="tc-text" />
              {folderLabel(folder, tr)}
            </p>
            <ul>
              {documents
                .filter((d) => d.folder === folder)
                .map((d) => {
                  const allowed = d.stored && nda && (!d.restricted || !!grant);
                  const s = state[d.id];
                  return (
                    <li
                      key={d.id}
                      className="border-b border-line last:border-b-0"
                      data-room-document={d.id}
                      data-verified={s?.kind === "verified" ? "true" : "false"}
                    >
                      <button
                        disabled={!allowed || s?.kind === "busy"}
                        onClick={() => void download(d)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-start hover:bg-cloud disabled:hover:bg-transparent disabled:cursor-not-allowed focus-ring"
                      >
                        <Icon
                          name={s?.kind === "busy" ? "Loader2" : allowed ? "Download" : "Lock"}
                          size={15}
                          className={`shrink-0 ${s?.kind === "busy" ? "spin text-rxBlue" : allowed ? "text-rxBlue" : "text-muted"}`}
                        />
                        <span className="flex-1 min-w-0">
                          <span className={`block text-[12.5px] ${allowed ? "text-inkBody" : "text-muted"}`}>
                            {tr(d.name)}
                          </span>
                          <span className="block font-mono text-[10.5px] text-muted">{`SHA-256 ${shortHash(d.sha256, 8, 6)}`}</span>
                          {s?.kind === "verified" && (
                            <span className="block text-[10.5px] text-aquaInk">
                              {tr("Integridad verificada en tu navegador (SHA-256 coincide)")}
                            </span>
                          )}
                          {s?.kind === "error" && (
                            <span role="alert" className="block text-[10.5px] text-[#B42318]">
                              {s.message}
                            </span>
                          )}
                        </span>
                        <span className="font-mono text-[10px] text-muted">
                          {!d.stored
                            ? tr("Sin archivo")
                            : d.restricted
                              ? grant
                                ? "AccessGrant"
                                : tr("Restringido")
                              : nda
                                ? tr("Con NDA")
                                : tr("Requiere NDA")}
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
        <span className="font-mono text-aquaInk">{root ? shortHash(root, 16, 10) : "—"}</span>
      </p>
    </div>
  );
}
