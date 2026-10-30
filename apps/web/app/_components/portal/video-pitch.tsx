// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
"use client";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/app/_components/ui/icon";
import {
  CHAPTERS,
  PITCH_DURATION,
  SUBTITLES,
  chapterAt,
  mmss,
  sceneOverlay,
  streamProvider,
  videoTitle,
} from "@/app/_lib/data/video";
import { onColor } from "@/app/_lib/format";
import { useI18n } from "@/app/_i18n/provider";

export function VideoPitch({ t: e, p: a, photos: t, currency: o, toast: n, onPhoto: l }) {
  const { tr } = useI18n();
  const r = e.video,
    i = !!r.fileUrl,
    [s, c] = useState(i ? "html5" : "interactivo"),
    [d, p] = useState(false),
    [m, u] = useState(0),
    [v, h] = useState(0.8),
    [b, y] = useState(false),
    [f, N] = useState(false),
    [x, g] = useState(PITCH_DURATION),
    w = useRef(),
    A = useRef();
  useEffect(() => {
    c(i ? "html5" : "interactivo"), p(false), u(0), N(false);
  }, [r.fileUrl, a.id]),
    useEffect(() => {
      s === "interactivo" && g(PITCH_DURATION);
    }, [s]),
    useEffect(() => {
      if (s !== "interactivo" || !d) return;
      const C = setInterval(
        () => u((S) => (S + 0.25 >= PITCH_DURATION ? (p(false), PITCH_DURATION) : S + 0.25)),
        250,
      );
      return () => clearInterval(C);
    }, [s, d]),
    useEffect(() => {
      A.current && ((A.current.volume = v), (A.current.muted = b));
    }, [v, b, s]);
  const P = () => {
      if (s === "html5" && A.current) {
        A.current.paused
          ? A.current.play().catch(() => {
              N(true),
                c("interactivo"),
                n(tr("Este navegador no pudo reproducir el archivo; se muestra la vista interactiva"));
            })
          : A.current.pause();
        return;
      }
      m >= PITCH_DURATION && u(0), p(!d);
    },
    z = (C) => {
      const S = Math.max(0, Math.min(x, C));
      s === "html5" && A.current
        ? ((A.current.currentTime = S), A.current.play().catch(() => {}))
        : (u(S), p(true));
    },
    G = () => {
      const C = w.current;
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
        return;
      }
      try {
        const S = C.requestFullscreen && C.requestFullscreen();
        S && S.catch && S.catch(() => n(tr("La pantalla completa no está disponible en esta vista")));
      } catch (S) {
        n(tr("La pantalla completa no está disponible en esta vista"));
      }
    },
    U = (C) => {
      const S = C.currentTarget.getBoundingClientRect();
      z(((C.clientX - S.left) / S.width) * x);
    },
    E = (C) => {
      C.key === "ArrowRight" && z(m + 5), C.key === "ArrowLeft" && z(m - 5);
    },
    I = chapterAt(m),
    $ = r.poster || (t[r.posterIdx] || t[0]).src,
    _ = m > 0 || d,
    B = streamProvider(r.url),
    T = !!(r.url && B && B !== "Archivo directo");
  return (
    <div className="flex flex-col gap-3">
      <div
        ref={w}
        className="vp-box relative overflow-hidden rounded-[14px] bg-[#0B0518] aspect-[16/9] max-w-full select-none"
        style={{
          "--tc": e.color,
          "--tc-on": onColor(e.color),
        }}
      >
        {s === "html5" && i ? (
          <video
            ref={A}
            src={r.fileUrl}
            poster={$}
            className="absolute inset-0 w-full h-full object-contain bg-black"
            playsInline={true}
            onPlay={() => p(true)}
            onPause={() => p(false)}
            onTimeUpdate={(C) => u(C.currentTarget.currentTime)}
            onLoadedMetadata={(C) => g(C.currentTarget.duration || PITCH_DURATION)}
            onError={() => {
              N(true), c("interactivo"), p(false);
            }}
            onClick={P}
          />
        ) : (
          <div className="absolute inset-0" onClick={P}>
            {CHAPTERS.map((C, S) => (
              <img
                key={S}
                src={(t[C.shot] || t[0]).src}
                alt=""
                className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${_ && I === S ? "opacity-100" : "opacity-0"} ${_ && I === S && d ? "kenburns" : ""}`}
              />
            ))}
            <img
              src={$}
              alt={tr("Portada del video: {title}", { title: videoTitle(r, a, tr) })}
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${_ ? "opacity-0" : "opacity-100"}`}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0B0518]/85 via-[#0B0518]/10 to-[#0B0518]/45 pointer-events-none" />
            {_ && (
              <div
                className="absolute right-4 top-14 sm:right-6 sm:top-16 w-[min(300px,60%)] bg-white/95 p-4 hidden md:flex flex-col gap-2 pointer-events-none vp-card"
                key={I}
              >
                <p className="font-mono text-[10px] tracking-[0.12em] tc-text">{tr("CAPÍTULO {n}", { n: `0${I + 1}` })}</p>
                <p className="font-display font-semibold text-[19px] text-rxPurple leading-tight">
                  {tr(CHAPTERS[I].label)}
                </p>
                {sceneOverlay(I, e, a, o, tr).map(([C, S]) => (
                  <p key={C} className="text-[11.5px] leading-snug">
                    <span className="text-muted">
                      {C}
                      {": "}
                    </span>
                    <span className="text-inkBody font-semibold">{S}</span>
                  </p>
                ))}
              </div>
            )}
            {_ && (
              <p className="absolute left-1/2 -translate-x-1/2 bottom-[76px] sm:bottom-[86px] w-[min(680px,88%)] text-center text-white text-[12px] sm:text-[14px] leading-snug bg-black/55 px-3 py-1 sm:py-1.5 pointer-events-none">
                {SUBTITLES[I](e, a, tr)}
              </p>
            )}
          </div>
        )}
        <div className="absolute top-3 left-3 right-3 flex flex-wrap gap-2 justify-between items-start pointer-events-none">
          <span
            className={`bg-white/95 text-rxPurple text-[10px] sm:text-[10.5px] font-semibold tracking-[0.1em] px-2.5 py-1.5 items-center gap-1.5 rounded-[6px] ${_ ? "hidden sm:inline-flex" : "inline-flex"}`}
          >
            <Icon name="Video" size={13} className="tc-text" />
            {tr("PRESENTACIÓN OFICIAL DEL DESARROLLADOR · 03:00 MIN")}
          </span>
          {s === "interactivo" && (
            <span className="hidden sm:inline bg-black/50 text-white/85 text-[10px] font-mono px-2 py-1 rounded-[6px]">
              {r.source === "url" && T ? tr("{provider} · vista previa", { provider: tr(B) }) : tr("Vista interactiva")}
            </span>
          )}
        </div>
        {!d && (
          <button
            onClick={P}
            aria-label={tr("Reproducir video")}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 sm:w-[76px] sm:h-[76px] rounded-full tc-btn grid place-items-center shadow-2xl focus-ring vp-play"
          >
            <Icon name="Play" size={32} className="ml-1" />
          </button>
        )}
        {!_ && (
          <div className="hidden lg:block absolute left-6 bottom-[74px] text-white pointer-events-none max-w-[80%]" data-video-title="overlay">
            <p className="font-display font-semibold text-[22px] sm:text-[30px] leading-tight balance">
              {videoTitle(r, a, tr)}
            </p>
            <p className="text-[12.5px] text-white/85 mt-1">
              <span className="font-semibold">{r.presenter}</span>
              {" — "}
              {tr(r.role)}
            </p>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 px-3 sm:px-4 pb-3 pt-6 bg-gradient-to-t from-black/75 to-transparent text-white">
          <div
            role="slider"
            tabIndex={0}
            aria-label={tr("Progreso del video")}
            aria-valuemin={0}
            aria-valuemax={Math.round(x)}
            aria-valuenow={Math.round(m)}
            aria-valuetext={tr("{current} de {total}", { current: mmss(m), total: mmss(x) })}
            onClick={U}
            onKeyDown={E}
            className="relative h-5 flex items-center cursor-pointer focus-ring group"
          >
            <div className="absolute inset-x-0 h-[4px] bg-white/25 rounded-full" />
            <div
              className="absolute left-0 h-[4px] rounded-full tc-bg"
              style={{
                width: `${(m / x) * 100}%`,
              }}
            />
            {CHAPTERS.map((C) => (
              <span
                key={C.at}
                className="absolute w-[3px] h-[8px] bg-white/80"
                style={{
                  left: `${(C.at / x) * 100}%`,
                }}
              />
            ))}
            <span
              className="absolute w-3.5 h-3.5 rounded-full bg-white -ml-[7px] shadow"
              style={{
                left: `${(m / x) * 100}%`,
              }}
            />
          </div>
          <div className="flex items-center gap-2 sm:gap-3 mt-1">
            <button
              onClick={P}
              aria-label={d ? tr("Pausar") : tr("Reproducir")}
              className="w-9 h-9 rounded-full tc-btn grid place-items-center focus-ring"
            >
              <Icon name={d ? "Pause" : "Play"} size={16} />
            </button>
            <span className="font-mono text-[11.5px] tnum">
              {mmss(m)}
              {" / "}
              {mmss(x)}
            </span>
            <span className="hidden md:inline text-[11.5px] text-white/80 truncate">
              {"· "}
              {tr(CHAPTERS[I].label)}
            </span>
            <div className="ml-auto flex items-center gap-1.5">
              <button
                onClick={() => y(!b)}
                aria-label={b ? tr("Activar sonido") : tr("Silenciar")}
                className="p-1.5 focus-ring"
              >
                <Icon name={b || v === 0 ? "VolumeX" : "Volume2"} size={17} />
              </button>
              <input
                id="vp-volume"
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={b ? 0 : v}
                onChange={(C) => {
                  h(+C.target.value), y(false);
                }}
                aria-label={tr("Volumen")}
                className="vp-vol hidden sm:block w-20"
              />
              <button onClick={G} aria-label={tr("Pantalla completa")} className="p-1.5 focus-ring">
                <Icon name="Maximize" size={17} />
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="lg:hidden" data-video-title="below">
        <p className="font-display font-semibold text-[21px] sm:text-[26px] leading-tight text-rxPurple balance">
          {videoTitle(r, a, tr)}
        </p>
        <p className="text-[12.5px] text-muted mt-1">
          <span className="font-semibold text-inkBody">{r.presenter}</span>
          {" — "}
          {tr(r.role)}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="flex border border-line bg-white p-0.5 text-[11.5px] font-semibold"
          role="group"
          aria-label={tr("Modo del reproductor")}
        >
          <button
            onClick={() =>
              i ? c("html5") : n(tr("Carga un archivo .mp4 o .mov en el Backoffice para usar el video HTML5"))
            }
            aria-pressed={s === "html5"}
            className={`px-3 py-1.5 focus-ring ${s === "html5" ? "tc-btn" : i ? "text-inkBody hover:bg-cloud" : "text-muted"}`}
          >
            Video HTML5{!i && ` · ${tr("sin archivo")}`}
          </button>
          <button
            onClick={() => c("interactivo")}
            aria-pressed={s === "interactivo"}
            className={`px-3 py-1.5 focus-ring ${s === "interactivo" ? "tc-btn" : "text-inkBody hover:bg-cloud"}`}
          >
            {tr("Vista interactiva")}
          </button>
        </div>
        {T && (
          <a
            href={r.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[12px] text-rxBlue font-medium inline-flex items-center gap-1 focus-ring"
          >
            {tr("Ver en {provider}", { provider: tr(B) })} <Icon name="ArrowUpRight" size={13} />
          </a>
        )}
        {f && (
          <span className="text-[12px] text-[#B42318]">
            {tr("El archivo no se pudo reproducir aquí; se muestra la vista interactiva.")}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2" role="group" aria-label={tr("Capítulos")}>
        {CHAPTERS.map((C, S) => (
          <button
            key={C.at}
            onClick={() => z(C.at)}
            aria-pressed={I === S && _}
            className={`text-start px-3.5 py-3 border bg-white focus-ring transition-colors ${I === S && _ ? "tc-border shadow-[inset_0_-3px_0_var(--tc)]" : "border-line hover:border-[#B9B2CC]"}`}
          >
            <span className="font-mono text-[11.5px] tc-text tnum">{mmss(C.at)}</span>
            <span className="block text-[12.5px] font-semibold text-rxPurple leading-snug mt-0.5">
              {tr(C.label)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
