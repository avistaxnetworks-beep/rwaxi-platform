// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
"use client";
import { Icon } from "@/app/_components/ui/icon";
import { SectionHead } from "@/app/_components/ui/primitives";

export function HowItWorks() {
  return (
    <section id="como-funciona" className="bg-white border-y border-line">
      <div className="gutter max-w-[1240px] mx-auto py-12">
        <SectionHead n="02 / Cómo funciona" title="Un canal de descubrimiento, un portal por desarrollador" />
        <ol className="grid md:grid-cols-3 gap-px bg-line border border-line">
          {[
            [
              "Search",
              "01",
              "Descubre en RWAXI",
              "www.rwaxi.com es una vitrina de descubrimiento e infraestructura tecnológica. RWAXI no capta recursos ni ofrece valores.",
            ],
            [
              "Building2",
              "02",
              "Portal oficial del desarrollador",
              "Cada proyecto se gestiona en el portal de su desarrollador: NDA, KYC/AML con SAGRILAFT + PTEE o SARLAFT según el régimen del oferente, Data Room y suscripción con el vehículo jurídico.",
            ],
            [
              "Cpu",
              "03",
              "Infraestructura Powered by RWAXI",
              "LeadReferral para la atribución, ConsentRecord con hash SHA-256, AccessGrant con Signed URLs y tokens OpenZeppelin con whitelist.",
            ],
          ].map(([a, t, o, n]) => (
            <li key={t} className="bg-white p-6 flex flex-col gap-3">
              <span className="flex items-center gap-3">
                <span className="w-9 h-9 grid place-items-center bg-cloud text-rxPurple">
                  <Icon name={a} size={18} />
                </span>
                <span className="font-mono text-[11px] text-muted">{t}</span>
              </span>
              <h3 className="font-display font-semibold text-[23px] text-rxPurple leading-tight">{o}</h3>
              <p className="text-[13.5px] text-inkBody leading-[1.65]">{n}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
