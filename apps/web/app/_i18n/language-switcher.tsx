"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/app/_components/ui/icon";
import { BCP47, LANGUAGE_NAME, dirOf, type Locale } from "./config";
import { useI18n } from "./provider";

/**
 * Vitrina and portal headers: menu of the 10 public languages, each written in its own script. `tenant`: in a White
 * Label portal its accents take the developer's colour (--tc) instead of RWAXI's.
 */
export function LanguageMenu({ tenant = false }: { tenant?: boolean }) {
  const { locale, locales, setLocale, tr } = useI18n();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const escape = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const choose = (next: Locale) => {
    setOpen(false);
    void setLocale(next);
  };

  return (
    <div ref={root} className="relative" data-lang-menu={locale}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${tr("Idioma")}: ${LANGUAGE_NAME[locale]}`}
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border border-line bg-white px-2.5 py-1.5 text-[12.5px] font-medium text-inkBody ${tenant ? "hover:border-current" : "hover:border-rxPurple"} focus-ring`}
      >
        <Icon name="Globe" size={15} className={tenant ? "tc-text" : "text-rxPurple"} />
        <span lang={BCP47[locale]}>{LANGUAGE_NAME[locale]}</span>
        <Icon name="ChevronDown" size={13} className="text-muted" />
      </button>
      {open && (
        <ul
          role="menu"
          aria-label={tr("Idioma")}
          className="absolute end-0 top-full z-40 mt-1 w-[210px] border border-line bg-white py-1 shadow-xl"
        >
          {locales.map((l) => (
            <li key={l} role="none">
              <button
                type="button"
                role="menuitemradio"
                aria-checked={l === locale}
                lang={BCP47[l]}
                dir={dirOf(l)}
                data-lang-option={l}
                onClick={() => choose(l)}
                className={`flex w-full items-center justify-between gap-3 px-3.5 py-2 text-start text-[13px] hover:bg-cloud focus-ring ${
                  l === locale ? `font-semibold ${tenant ? "tc-text" : "text-rxPurple"}` : "text-inkBody"
                }`}
              >
                <span>{LANGUAGE_NAME[l]}</span>
                {l === locale ? (
                  <Icon name="Check" size={14} className={tenant ? "tc-text" : "text-rxAqua"} />
                ) : (
                  <span className="font-mono text-[10.5px] uppercase text-muted">{l}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Backoffice header (internal panel): ES | EN | PT, in the tenant's colour. */
export function LanguageToggle({ className = "" }: { className?: string }) {
  const { locale, locales, setLocale, tr } = useI18n();
  return (
    <div
      role="group"
      aria-label={tr("Idioma")}
      data-lang-toggle={locale}
      className={`flex items-center divide-x divide-line border border-line bg-white ${className}`}
    >
      {locales.map((l) => (
        <button
          key={l}
          type="button"
          lang={BCP47[l]}
          title={LANGUAGE_NAME[l]}
          aria-pressed={l === locale}
          data-lang-option={l}
          onClick={() => void setLocale(l)}
          className={`px-2.5 py-1.5 font-mono text-[11px] font-medium focus-ring ${l === locale ? "tc-bg" : "text-inkBody hover:bg-cloud"}`}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
