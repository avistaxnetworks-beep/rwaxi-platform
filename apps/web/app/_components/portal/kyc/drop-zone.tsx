// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
"use client";
import { useRef, useState } from "react";
import { Icon } from "@/app/_components/ui/icon";
import { nf } from "@/app/_lib/format";
import { sha256Bytes } from "@/app/_lib/sha256";
import { useI18n } from "@/app/_i18n/provider";

export function DropZone({ id: e, label: a, file: t, onFile: o, error: n }) {
  const { tr } = useI18n();
  const [l, r] = useState(false),
    i = useRef(),
    s = (c) => {
      if (!c) return;
      if (!/^image\/|application\/pdf/.test(c.type)) {
        o({
          error: tr("Usa una imagen JPG o PNG, o un PDF."),
        });
        return;
      }
      if (c.size > 10 * 1024 * 1024) {
        o({
          error: tr("El archivo supera 10 MB."),
        });
        return;
      }
      const d = new FileReader();
      ((d.onload = () =>
        // SHA-256 of the file bytes, shown now; on submission the file goes to the DocumentVault, which recomputes it.
        c
          .arrayBuffer()
          .then((p) => sha256Bytes(p))
          .then(
            (p) =>
              o({
                name: c.name,
                size: c.size,
                type: c.type,
                sha256: p,
                src: c.type.startsWith("image/") ? d.result : null,
                file: c,
              }),
            () => o({ error: tr("Tu navegador no pudo calcular el hash SHA-256 del archivo.") }),
          )),
        d.readAsDataURL(c));
    };
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <span className="text-[12px] font-semibold text-inkBody">{a}</span>
      <div
        onDragOver={(c) => {
          (c.preventDefault(), r(true));
        }}
        onDragLeave={() => r(false)}
        onDrop={(c) => {
          (c.preventDefault(), r(false), s(c.dataTransfer.files[0]));
        }}
        className={`relative border-2 border-dashed min-h-[150px] grid place-items-center text-center p-4 transition-colors ${l ? "tc-border bg-[#ECE7F6]" : n ? "border-[#B42318] bg-white" : t && !t.error ? "border-rxAqua bg-aquaTint" : "border-[#C9C4D6] bg-white"}`}
      >
        {t && !t.error ? (
          <div className="flex flex-col items-center gap-2 w-full">
            {t.src ? (
              <img
                src={t.src}
                alt={tr("Vista previa: {label}", { label: a })}
                className="max-h-[96px] max-w-full object-contain border border-line"
              />
            ) : (
              <Icon name="FileText" size={30} className="text-rxBlue" />
            )}
            <span className="text-[12px] text-inkBody font-medium truncate max-w-full">{t.name}</span>
            <span className="text-[11px] text-aquaInk inline-flex items-center gap-1">
              <Icon name="CheckCircle2" size={13} />
              {tr("Cargado · {size} KB", { size: nf(0).format(t.size / 1024) })}
            </span>
            <button
              type="button"
              onClick={() => o(null)}
              className="text-[11.5px] text-rxBlue underline focus-ring"
            >
              {tr("Reemplazar")}
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Icon name="UploadCloud" size={26} className="text-rxPurple" />
            <span className="text-[12.5px] text-inkBody">{tr("Arrastra la foto aquí o")}</span>
            <button
              type="button"
              onClick={() => i.current && i.current.click()}
              className="text-[12.5px] font-semibold text-rxBlue underline underline-offset-2 focus-ring"
            >
              {tr("selecciona un archivo")}
            </button>
            <span className="text-[11px] text-muted">{tr("JPG, PNG o PDF · máx. 10 MB")}</span>
          </div>
        )}
        <input
          ref={i}
          id={e}
          type="file"
          accept="image/*,application/pdf"
          className="sr-only"
          onChange={(c) => {
            (s(c.target.files[0]), (c.target.value = ""));
          }}
        />
      </div>
      {(n || (t && t.error)) && (
        <p className="text-[12px] text-[#B42318]" role="alert">
          {(t && t.error) || n}
        </p>
      )}
    </div>
  );
}

/** Sample identity document drawn on a canvas; `tr` writes its caption in the visitor's language. */
export function sampleDoc(e, tr = (s) => s) {
  const a = document.createElement("canvas");
  ((a.width = 420), (a.height = 264));
  const t = a.getContext("2d");
  ((t.fillStyle = e === "front" ? "#E9EEF5" : "#EEF1EC"),
    t.fillRect(0, 0, 420, 264),
    (t.fillStyle = "#1453A0"),
    t.fillRect(0, 0, 420, 34),
    (t.fillStyle = "#FFFFFF"),
    (t.font = "600 13px Montserrat, Arial"),
    t.fillText(
      e === "front" ? tr("DOCUMENTO DE EJEMPLO · FRENTE") : tr("DOCUMENTO DE EJEMPLO · REVERSO"),
      14,
      22,
    ),
    e === "front" &&
      ((t.fillStyle = "#C9C4D6"),
      t.fillRect(18, 52, 110, 140),
      (t.fillStyle = "#8E88A3"),
      t.beginPath(),
      t.arc(73, 105, 26, 0, 7),
      t.fill(),
      t.fillRect(38, 140, 70, 40)),
    (t.fillStyle = "#5E5873"));
  for (let o = 0; o < 6; o++) t.fillRect(e === "front" ? 146 : 18, 56 + o * 24, 220 - (o % 3) * 40, 9);
  if (e === "back")
    for (let o = 0; o < 40; o++) ((t.fillStyle = "#2A2238"), t.fillRect(18 + o * 9, 210, o % 3 ? 4 : 6, 34));
  return {
    name: e === "front" ? "documento-ejemplo-frente.png" : "documento-ejemplo-reverso.png",
    size: 48200,
    src: a.toDataURL("image/png"),
  };
}
