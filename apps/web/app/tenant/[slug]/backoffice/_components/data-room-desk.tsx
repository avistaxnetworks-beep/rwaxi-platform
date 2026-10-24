"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { folderLabel } from "@/app/_components/portal/data-room-panel";
import { fieldCls } from "@/app/_components/ui/form";
import { Icon } from "@/app/_components/ui/icon";
import { useI18n } from "@/app/_i18n/provider";
import { nf, shortHash } from "@/app/_lib/format";
import { uploadToVault } from "@/app/_lib/vault-upload";
import type { DataRoomDeskResult, DataRoomOfferingRow } from "../_lib/types";
import { DeskAccess, useCanAct } from "./desk-access";

type Toast = (message: string) => void;
const KIND: Record<string, string> = {
  "application/pdf": "PDF",
  "image/png": "PNG",
  "image/jpeg": "JPG",
  "image/webp": "WebP",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
};

/**
 * "Data Room" of the backoffice from PostgreSQL and the DocumentVault: every document is a Merkle leaf whose
 * file the server verified (type from the bytes, size, SHA-256) before storing it, and re-hashes on each opening.
 * Uploading belongs to the issuer (TENANT_ADMIN); on a deployed token it queues updateDataRoomMerkleRoot().
 */
export function DataRoomDesk({ desk, toast }: { desk: DataRoomDeskResult; toast: Toast }) {
  if (!desk.ok) {
    return (
      <div
        role="alert"
        className="bg-white border border-[#F3C5C0] px-5 py-4 text-[13px] text-[#B42318] flex gap-2"
      >
        <Icon name="AlertTriangle" size={16} className="mt-0.5 shrink-0" />
        <span>{desk.error}</span>
      </div>
    );
  }
  return (
    <DeskAccess session={desk.data.session} required="TENANT_ADMIN">
      <div className="flex flex-col gap-6" data-data-room-desk>
        {desk.data.offerings.map((o) => (
          <OfferingDataRoom key={o.id} offering={o} folders={desk.data.folders} toast={toast} />
        ))}
      </div>
    </DeskAccess>
  );
}

function OfferingDataRoom({
  offering: o,
  folders,
  toast,
}: {
  offering: DataRoomOfferingRow;
  folders: string[];
  toast: Toast;
}) {
  const { tr } = useI18n();
  const router = useRouter();
  const canAct = useCanAct();
  const input = useRef<HTMLInputElement>(null);
  const [folder, setFolder] = useState(folders[0] ?? "");
  const [name, setName] = useState("");
  const [restricted, setRestricted] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const upload = (file: File | undefined) => {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    startTransition(async () => {
      const result = await uploadToVault(file, file.name, "data-room", {
        offeringId: o.id,
        folder,
        name: name.trim(),
        restricted: restricted ? "1" : "0",
      });
      setBusy(false);
      if (!result.ok)
        return setError(result.error ?? tr("No se pudo subir el archivo a la bóveda documental."));
      setName("");
      toast(
        result.anchorQueued
          ? tr(
              "Documento verificado y guardado · nueva raíz del Data Room en cola (updateDataRoomMerkleRoot)",
            )
          : tr("Documento verificado y guardado en la bóveda · raíz del Data Room actualizada"),
      );
      router.refresh();
    });
  };

  const rootState = !o.tokenDeployed
    ? tr("El Merkle Root se ancla al desplegar el token.")
    : o.anchorPending
      ? tr("updateDataRoomMerkleRoot() en cola: lo firma el emisor desde la cola on-chain.")
      : o.anchoredRoot && o.root && o.anchoredRoot === o.root.toLowerCase()
        ? tr("Merkle Root anclado")
        : tr("El Merkle Root del Data Room difiere del anclado on-chain.");

  return (
    <div className="bg-white border border-line min-w-0" data-dr-offering={o.code}>
      <div className="px-5 py-3.5 border-b border-line flex flex-wrap justify-between gap-3 items-center">
        <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">
          {tr("Data Room · {n} documentos", { n: o.documents.length, count: o.documents.length })}
          {` · ${o.code} · ${o.assetName}`}
        </p>
        <span className="text-[11.5px] text-muted" data-dr-root={o.root ?? ""}>
          {"Merkle Root "}
          <span className="font-mono text-aquaInk">{o.root ? shortHash(o.root, 10, 6) : "—"}</span>
        </span>
      </div>

      <div className="p-5 grid sm:grid-cols-[minmax(0,1fr)_auto] gap-3 items-end border-b border-line">
        <div className="grid sm:grid-cols-3 gap-3">
          <label className="flex flex-col gap-1.5 text-[11px] font-semibold tracking-[0.06em] uppercase text-muted">
            {tr("Carpeta")}
            <select
              id={`drv-folder-${o.code}`}
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              className={fieldCls(false)}
            >
              {folders.map((f) => (
                <option key={f} value={f}>
                  {folderLabel(f, tr)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-[11px] font-semibold tracking-[0.06em] uppercase text-muted">
            {tr("Nombre del documento")}
            <input
              id={`drv-name-${o.code}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={tr("Por defecto, el nombre del archivo")}
              className={fieldCls(false)}
            />
          </label>
          <label className="flex items-center gap-2 text-[12.5px] text-inkBody self-end pb-3">
            <input
              id={`drv-restricted-${o.code}`}
              type="checkbox"
              checked={restricted}
              onChange={(e) => setRestricted(e.target.checked)}
              className="accent-[#2F145F]"
            />
            {tr("Documento reservado (jurídico, fiduciario o financiero)")}
          </label>
        </div>
        <div>
          <input
            ref={input}
            id={`drv-file-${o.code}`}
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp,.docx,.xlsx"
            className="sr-only"
            onChange={(e) => {
              upload(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => input.current?.click()}
            disabled={busy || !canAct}
            className="tc-btn px-4 py-3 text-[12.5px] font-semibold inline-flex items-center gap-2 focus-ring disabled:opacity-60 w-full justify-center"
          >
            <Icon name={busy ? "Loader2" : "Upload"} size={15} className={busy ? "spin" : ""} />
            {busy ? tr("Verificando SHA-256 en el servidor…") : tr("Subir y verificar documento")}
          </button>
        </div>
        <p className="sm:col-span-2 text-[11px] text-muted">
          {tr(
            "PDF, imagen, DOCX o XLSX · máx. 20 MB. El servidor recalcula el SHA-256 y rechaza el archivo si no coincide con el de tu navegador.",
          )}
        </p>
      </div>

      {error && (
        <p
          role="alert"
          className="mx-5 mt-4 border border-[#F3C5C0] bg-[#FDECEA] text-[#B42318] text-[12.5px] px-4 py-3"
        >
          {error}
        </p>
      )}

      <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
        <table className="w-full min-w-[760px] text-[12.5px]">
          <thead className="sticky top-0 bg-white">
            <tr className="text-left text-[10px] tracking-[0.08em] uppercase text-muted border-b border-line">
              <th className="font-semibold px-5 py-2.5">{tr("Documento")}</th>
              <th className="font-semibold px-3 py-2.5">SHA-256</th>
              <th className="font-semibold px-3 py-2.5">{tr("Acceso")}</th>
              <th className="font-semibold px-3 py-2.5 text-end">{tr("Tamaño")}</th>
              <th className="font-semibold px-3 py-2.5">{tr("Bóveda")}</th>
            </tr>
          </thead>
          <tbody>
            {o.documents.map((d) => (
              <tr
                key={d.id}
                className="border-b border-line last:border-b-0"
                data-dr-document={d.id}
                data-stored={d.stored ? "true" : "false"}
              >
                <td className="px-5 py-2.5">
                  <p className="text-inkBody">{tr(d.name)}</p>
                  <p className="text-[10.5px] text-muted">
                    {folderLabel(d.folder, tr)}
                    {` · ${d.uploadedAt}`}
                    {d.mimeType && ` · ${KIND[d.mimeType] ?? d.mimeType}`}
                  </p>
                </td>
                <td className="px-3 py-2.5 font-mono text-[11px] text-muted" title={d.sha256}>
                  {shortHash(d.sha256, 8, 6)}
                </td>
                <td className="px-3 py-2.5 text-[11px]">
                  {d.restricted ? (
                    <span className="text-goldInk font-semibold">{tr("Reservado · con NDA")}</span>
                  ) : (
                    <span className="text-muted">{tr("Con NDA")}</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-[11px] text-muted tnum">{`${nf(0).format(d.sizeBytes / 1024)} KB`}</td>
                <td className="px-3 py-2.5 text-[11.5px] whitespace-nowrap">
                  {d.stored ? (
                    <span className="inline-flex items-center gap-2">
                      <a
                        href={`/api/vault/data-room/${d.id}?as=backoffice`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-rxBlue font-semibold inline-flex items-center gap-1 focus-ring"
                        data-dr-open={d.id}
                      >
                        <Icon name="Eye" size={13} />
                        {tr("Abrir")}
                      </a>
                      <a
                        href={`/api/vault/data-room/${d.id}?as=backoffice&download=1`}
                        className="text-rxBlue inline-flex items-center gap-1 focus-ring"
                        aria-label={tr("Descargar {name}", { name: tr(d.name) })}
                      >
                        <Icon name="Download" size={13} />
                      </a>
                    </span>
                  ) : (
                    <span className="text-muted">{tr("Sin archivo en la bóveda")}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        className="px-5 py-3.5 border-t border-line bg-cloud text-[12px] flex flex-wrap items-center gap-2"
        data-dr-anchor={o.anchorPending ? "pending" : "idle"}
      >
        <Icon name={o.anchorPending ? "Clock" : "Link2"} size={14} className="text-muted" />
        <span className="text-inkBody">{rootState}</span>
      </div>
    </div>
  );
}
