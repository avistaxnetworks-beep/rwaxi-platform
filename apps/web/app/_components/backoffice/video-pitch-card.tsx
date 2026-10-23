// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
"use client";
import { useEffect, useRef, useState } from "react";
import { Field, fieldCls } from "@/app/_components/ui/form";
import { Icon } from "@/app/_components/ui/icon";
import { mmss, streamProvider } from "@/app/_lib/data/video";
import { nf, onColor } from "@/app/_lib/format";
import { useI18n } from "@/app/_i18n/provider";

export function VideoPitchCard({ t: e, p: a, setTenant: t, photos: o, toast: n }) {
  const { tr } = useI18n();
  const l = useRef(),
    r = useRef(),
    [i, s] = useState(e.video.url),
    [c, d] = useState(false);
  useEffect(() => s(e.video.url), [e.slug]);
  const p = e.video,
    m = (y) =>
      t((f) => ({
        ...f,
        video: {
          ...f.video,
          ...y,
        },
      })),
    u = streamProvider(i),
    v = (y) => {
      if (!y) return;
      if (!/^video\/(mp4|quicktime)$/.test(y.type) && !/\.(mp4|mov)$/i.test(y.name)) {
        n(tr("Usa un archivo .mp4 o .mov"));
        return;
      }
      if (p.fileUrl)
        try {
          URL.revokeObjectURL(p.fileUrl);
        } catch (x) {}
      const f = URL.createObjectURL(y),
        N = document.createElement("video");
      ((N.preload = "metadata"),
        (N.onloadedmetadata = () => {
          const x = N.duration;
          (m({
            fileDuration: x,
            fileRes: N.videoHeight ? `${N.videoWidth}×${N.videoHeight}` : null,
          }),
            x > 181 && n(tr("El video dura {duration}: supera el máximo de 3:00", { duration: mmss(x) })));
        }),
        (N.onerror = () =>
          m({
            fileDuration: null,
            fileUnreadable: true,
          })),
        (N.src = f),
        m({
          source: "file",
          fileUrl: f,
          fileName: y.name,
          fileSize: y.size,
          fileDuration: null,
          fileRes: null,
          fileUnreadable: false,
        }),
        n(tr("Video cargado: {name}", { name: y.name })));
    },
    h = () => {
      if (!i.trim()) {
        m({
          source: p.fileUrl ? "file" : "demo",
          url: "",
        });
        return;
      }
      if (!/^https:\/\//i.test(i) || !u) {
        n(tr("Pega un enlace https de Vimeo Pro, Cloudflare Stream o YouTube no listado"));
        return;
      }
      (m({
        source: "url",
        url: i.trim(),
      }),
        n(tr("URL de {provider} guardada", { provider: u })));
    },
    b = p.fileDuration && p.fileDuration > 181;
  return (
    <div
      className="border border-line"
      style={{
        "--tc": e.color,
        "--tc-on": onColor(e.color),
      }}
    >
      <div className="px-5 py-3.5 border-b border-line bg-cloud flex flex-wrap justify-between items-center gap-2">
        <p className="text-[13px] font-semibold text-rxPurple inline-flex items-center gap-2">
          <Icon name="Video" size={16} className="tc-text" />
          {tr("Video Pitch del Proyecto (Máx. 3:00 min - Alta Definición)")}
        </p>
        <span
          className={`text-[10.5px] font-semibold tracking-[0.08em] uppercase px-2 py-1 ${p.source === "demo" ? "bg-goldTint text-goldInk" : "bg-aquaTint text-aquaInk"}`}
        >
          {p.source === "file"
            ? tr("Archivo cargado")
            : p.source === "url"
              ? tr("Streaming")
              : tr("Vista interactiva de ejemplo")}
        </span>
      </div>
      <div className="p-5 flex flex-col gap-5">
        <Field id="vp-title" label={tr("Título del video")}>
          <input
            id="vp-title"
            value={p.title}
            onChange={(y) =>
              m({
                title: y.target.value,
              })
            }
            className={fieldCls()}
          />
        </Field>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field id="vp-presenter" label={tr("Nombre del presentador")}>
            <input
              id="vp-presenter"
              value={p.presenter}
              onChange={(y) =>
                m({
                  presenter: y.target.value,
                })
              }
              className={fieldCls()}
            />
          </Field>
          <Field id="vp-role" label={tr("Cargo")}>
            <input
              id="vp-role"
              value={p.role}
              onChange={(y) =>
                m({
                  role: y.target.value,
                })
              }
              className={fieldCls()}
            />
          </Field>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-inkBody">{tr("Archivo de video")}</span>
            <div
              onDragOver={(y) => {
                (y.preventDefault(), d(true));
              }}
              onDragLeave={() => d(false)}
              onDrop={(y) => {
                (y.preventDefault(), d(false), v(y.dataTransfer.files[0]));
              }}
              className={`border-2 border-dashed min-h-[140px] grid place-items-center text-center p-4 rounded-[8px] ${c ? "tc-border bg-cloud" : p.fileUrl ? "border-rxAqua bg-aquaTint" : "border-[#C9C4D6] bg-white"}`}
            >
              {p.fileUrl ? (
                <div className="flex flex-col items-center gap-1.5 min-w-0 w-full">
                  <Icon name="FileVideo" size={26} className="text-aquaInk" />
                  <span className="text-[12px] font-medium text-inkBody truncate max-w-full">
                    {p.fileName}
                  </span>
                  <span className={`text-[11px] font-mono ${b ? "text-[#B42318]" : "text-aquaInk"}`}>
                    {p.fileDuration
                      ? mmss(p.fileDuration)
                      : p.fileUnreadable
                        ? tr("duración no legible en este navegador")
                        : tr("leyendo duración…")}
                    {p.fileRes ? ` · ${p.fileRes}` : ""}
                    {p.fileSize ? ` · ${nf(1).format(p.fileSize / 1048576)} MB` : ""}
                  </span>
                  {b && (
                    <span className="text-[11px] text-[#B42318]">
                      {tr("Supera 3:00. Recórtalo antes de publicar.")}
                    </span>
                  )}
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => l.current.click()}
                      className="text-[11.5px] text-rxBlue underline focus-ring"
                    >
                      {tr("Reemplazar")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          URL.revokeObjectURL(p.fileUrl);
                        } catch (y) {}
                        m({
                          fileUrl: null,
                          fileName: "",
                          fileDuration: null,
                          source: p.url ? "url" : "demo",
                        });
                      }}
                      className="text-[11.5px] text-muted underline focus-ring"
                    >
                      {tr("Quitar")}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1.5">
                  <Icon name="UploadCloud" size={24} className="tc-text" />
                  <span className="text-[12.5px] text-inkBody">{tr("Arrastra el video o")}</span>
                  <button
                    type="button"
                    onClick={() => l.current.click()}
                    className="text-[12.5px] font-semibold text-rxBlue underline underline-offset-2 focus-ring"
                  >
                    {tr("selecciona un archivo")}
                  </button>
                  <span className="text-[11px] text-muted">{tr(".mp4 / .mov · 1080p o 4K · máx. 3:00")}</span>
                </div>
              )}
              <input
                ref={l}
                id="vp-file"
                type="file"
                accept="video/mp4,video/quicktime,.mp4,.mov"
                className="sr-only"
                onChange={(y) => {
                  (v(y.target.files[0]), (y.target.value = ""));
                }}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Field
              id="vp-url"
              label={tr("O pega una URL de streaming")}
              hint={
                u
                  ? tr("Proveedor detectado: {provider}", { provider: u })
                  : tr("Vimeo Pro, Cloudflare Stream o YouTube no listado.")
              }
            >
              <div className="flex gap-2">
                <input
                  id="vp-url"
                  value={i}
                  onChange={(y) => s(y.target.value)}
                  placeholder="https://vimeo.com/…"
                  className={fieldCls() + " font-mono text-[12.5px]"}
                />
                <button
                  type="button"
                  onClick={h}
                  className="shrink-0 tc-btn px-3 text-[12.5px] font-semibold focus-ring"
                >
                  {tr("Guardar")}
                </button>
              </div>
            </Field>
            <p className="text-[11.5px] text-muted leading-[1.5]">
              {tr(
                "En producción el portal incrusta el reproductor del proveedor. En esta vista previa los reproductores externos están bloqueados: el portal muestra la vista interactiva y un enlace al video.",
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-[12px] font-semibold text-inkBody">
            {tr("Imagen de portada (thumbnail)")}
          </span>
          <div className="flex flex-wrap gap-2 items-center">
            {o.map((y, f) => (
              <button
                key={f}
                type="button"
                onClick={() =>
                  m({
                    posterIdx: f,
                    poster: null,
                  })
                }
                aria-pressed={!p.poster && p.posterIdx === f}
                className={`relative w-[96px] overflow-hidden border-2 rounded-[6px] focus-ring ${!p.poster && p.posterIdx === f ? "tc-border" : "border-transparent"}`}
              >
                <img src={y.src} alt={tr(y.label)} className="w-full aspect-[16/9] object-cover" />
              </button>
            ))}
            {p.poster && (
              <span className="relative w-[96px] overflow-hidden border-2 tc-border rounded-[6px]">
                <img
                  src={p.poster}
                  alt={tr("Portada personalizada")}
                  className="w-full aspect-[16/9] object-cover"
                />
              </span>
            )}
            <input
              ref={r}
              id="vp-thumb"
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(y) => {
                const f = y.target.files[0];
                if (!f) return;
                const N = new FileReader();
                ((N.onload = () =>
                  m({
                    poster: N.result,
                  })),
                  N.readAsDataURL(f),
                  (y.target.value = ""));
              }}
            />
            <button
              type="button"
              onClick={() => r.current.click()}
              className="border border-line bg-white px-3 py-2 text-[12px] font-semibold text-rxBlue inline-flex items-center gap-1.5 focus-ring"
            >
              <Icon name="ImagePlus" size={14} />
              {tr("Subir portada")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
