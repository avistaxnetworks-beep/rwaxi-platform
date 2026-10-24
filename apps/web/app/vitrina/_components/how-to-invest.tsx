"use client";
import { Icon } from "@/app/_components/ui/icon";
import { SectionHead } from "@/app/_components/ui/primitives";
import { useI18n } from "@/app/_i18n/provider";

/**
 * «Cómo Invertir» (#como-funciona): the investor's journey in the order the portals follow — NDA, Data Room, KYC and
 * subscription, payment to the project's vehicle and tokens in the investor's own wallet.
 */
export function HowToInvest() {
  const { tr } = useI18n();
  const steps: [string, string, string][] = [
    [
      "FileSignature",
      tr("Elige tu oportunidad y firma tu NDA digital"),
      tr(
        "Explora las ofertas activas de cada desarrollador e ingresa a su portal exclusivo. Con un clic firmas el Acuerdo de Confidencialidad (NDA) electrónico para desbloquear la información reservada del proyecto.",
      ),
    ],
    [
      "FolderOpen",
      tr("Accede al Data Room y valida el respaldo"),
      tr(
        "Antes de comprometer capital, entras al Data Room privado. Allí encuentras de manera detallada toda la información jurídica, financiera y comercial que respalda al proyecto: estudios de títulos, encargo fiduciario, modelo financiero y contratos verificados criptográficamente.",
      ),
    ],
    [
      "ShieldCheck",
      tr("Supera el proceso KYC y suscribe tus unidades"),
      tr(
        "Cuando decides invertir, completas tu verificación de identidad (KYC/SAGRILAFT) para proteger a todos los co-inversionistas. Una vez aprobado por el Oficial de Cumplimiento del emisor, defines cuántas unidades deseas adquirir y firmas tu acuerdo de suscripción.",
      ),
    ],
    [
      "Wallet",
      tr("Paga al vehículo del proyecto y recibe tus tokens"),
      tr(
        "Realizas tu aporte directamente a las cuentas bancarias o fiduciarias autorizadas del proyecto. Al conciliarse tu pago, el contrato inteligente emite tus tokens directamente en tu billetera digital (wallet), acreditando tu participación y habilitando el cobro de tus rendimientos.",
      ),
    ],
  ];
  return (
    <section id="como-funciona" className="bg-white border-y border-line scroll-mt-20" data-vitrina-section="como-funciona">
      <div className="gutter max-w-[1240px] mx-auto py-12">
        <SectionHead n={tr("02 / Cómo invertir")} title={tr("Invierte en bienes raíces de grado institucional en 4 pasos claros")} />
        <p className="-mt-3 mb-8 max-w-[78ch] text-[15px] leading-[1.7] text-inkBody">
          {tr(
            "Combinamos el rigor jurídico de la estructuración inmobiliaria tradicional con la agilidad y trazabilidad de la tecnología blockchain. Así es tu proceso de principio a fin:",
          )}
        </p>
        <ol className="grid sm:grid-cols-2 xl:grid-cols-4 gap-px bg-line border border-line">
          {steps.map(([icon, title, body], i) => (
            <li key={icon} className="bg-white p-6 flex flex-col gap-3 min-w-0" data-invest-step={i + 1}>
              <span className="flex items-center gap-3">
                <span className="w-10 h-10 grid place-items-center bg-cloud text-rxPurple shrink-0">
                  <Icon name={icon} size={19} />
                </span>
                <span className="font-mono text-[11px] tracking-[0.12em] uppercase text-goldInk">
                  {tr("Paso {n}", { n: String(i + 1).padStart(2, "0") })}
                </span>
              </span>
              <h3 className="font-display font-semibold text-[22px] text-rxPurple leading-tight balance">{title}</h3>
              <p className="text-[13.5px] text-inkBody leading-[1.65]">{body}</p>
            </li>
          ))}
        </ol>
        <aside
          className="mt-6 border border-line border-s-4 border-s-rxAqua bg-cloud px-5 py-4 flex gap-4 items-start"
          data-blockchain-note
        >
          <span className="w-10 h-10 grid place-items-center bg-white text-aquaInk border border-line shrink-0">
            <Icon name="Blocks" size={19} />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-[14.5px] text-rxPurple">{tr("¿Cómo te protege la blockchain aquí?")}</p>
            <p className="text-[13.5px] text-inkBody leading-[1.65] mt-1 max-w-[110ch]">
              {tr(
                "No necesitas ser experto en criptomonedas. En esta plataforma, la blockchain funciona como un libro contable incorruptible: sella con prueba matemática que los documentos del Data Room no han sido alterados, certifica que solo inversionistas verificados participan en el proyecto y registra tu participación y tus derechos económicos sin depender de hojas de cálculo manuales.",
              )}
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}
