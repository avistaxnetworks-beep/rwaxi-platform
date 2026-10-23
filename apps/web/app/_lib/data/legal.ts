// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
import { msg, vmsg } from "@/app/_i18n/marks";
import { REGIMES } from "@/app/_lib/data/kyc";
import { portalHost } from "@/app/_lib/hosts";

export const LEGAL_VARS_DOC = [
  ["ORGANIZATION_LEGAL_NAME", msg("Razón social del desarrollador (oferente)")],
  ["ORGANIZATION_TAX_ID", msg("NIT del desarrollador")],
  ["LEGAL_ENTITY_NAME", msg("Nombre del vehículo emisor")],
  ["LEGAL_WRAPPER_TYPE", msg("Tipo de vehículo jurídico (Legal Wrapper)")],
  ["DATAROOM_MERKLE_ROOT", msg("Merkle Root SHA-256 vigente del Data Room")],
  ["ASSET_NAME", msg("Activo subyacente")],
  ["PORTAL_DOMAIN", msg("Dominio del portal")],
  ["COMPLIANCE_REGIME", msg("Régimen de cumplimiento")],
  ["TOKEN_SYMBOL", msg("Símbolo del token")],
  ["NETWORK", msg("Red blockchain")],
];

export const LEGAL_NDA = `ACUERDO DE CONFIDENCIALIDAD Y NO DIVULGACIÓN (NDA)

Partes. {{ORGANIZATION_LEGAL_NAME}}, identificada con NIT {{ORGANIZATION_TAX_ID}} (en adelante, "la Parte Reveladora"), en su calidad de desarrollador y oferente del proyecto {{ASSET_NAME}}, y la persona natural o jurídica que suscribe electrónicamente este documento (en adelante, "la Parte Receptora").

1. Objeto. La Parte Reveladora pondrá a disposición de la Parte Receptora, a través del portal {{PORTAL_DOMAIN}}, información reservada sobre el proyecto y sobre el vehículo {{LEGAL_ENTITY_NAME}}, estructurado como {{LEGAL_WRAPPER_TYPE}}, con el único fin de que evalúe una posible coinversión.

2. Información Confidencial. Comprende el Data Room del proyecto (estudios de títulos, certificados de tradición, modelo financiero, avalúos, licencias, contratos y documentos de gobierno corporativo), cuya integridad se identifica con el Merkle Root SHA-256 {{DATAROOM_MERKLE_ROOT}}, así como toda información no pública que la Parte Receptora conozca con ocasión de este acuerdo.

3. Obligaciones de la Parte Receptora. (a) Usar la información solo para la finalidad del numeral 1; (b) no divulgarla, copiarla, reproducirla ni transferirla a terceros sin autorización previa y escrita de la Parte Reveladora, salvo a sus asesores sujetos a igual deber de reserva; (c) adoptar medidas razonables de seguridad para protegerla; y (d) devolverla o destruirla cuando la Parte Reveladora lo solicite.

4. Excepciones. No es confidencial la información que sea de dominio público sin culpa de la Parte Receptora, la que ya conociera legítimamente, o la que deba revelar por orden de autoridad competente, caso en el cual informará previamente a la Parte Reveladora.

5. Vigencia. Este acuerdo rige desde su aceptación y sus obligaciones se mantienen durante dos (2) años después de la última consulta al Data Room, aun si no se concreta la inversión.

6. Firma electrónica y valor probatorio. Las partes reconocen que este acuerdo se celebra mediante mensaje de datos en los términos de la Ley 527 de 1999. La aceptación con un clic, asociada a la identificación del firmante, la fecha y hora en UTC y la huella criptográfica SHA-256 del texto aceptado (ConsentRecord), constituye un método confiable de identificación y aprobación que cumple el requisito de firma (artículo 7) y otorga al mensaje de datos admisibilidad y fuerza probatoria (artículos 10 y 11). Cualquier alteración posterior del texto produciría un hash distinto y sería verificable.

7. Proveedor tecnológico. RWAXI actúa únicamente como proveedor de infraestructura tecnológica del portal y custodio técnico del ConsentRecord; no es parte de este acuerdo ni de la relación de inversión.

8. Ley aplicable y jurisdicción. Este acuerdo se rige por las leyes de la República de Colombia. Las controversias se someterán a los jueces competentes del domicilio de la Parte Reveladora.`;

export const LEGAL_COMPLIANCE = {
  sagrilaft: `DEBIDA DILIGENCIA DEL INVERSIONISTA · SAGRILAFT + PTEE

1. Régimen aplicable. {{ORGANIZATION_LEGAL_NAME}}, NIT {{ORGANIZATION_TAX_ID}}, como oferente del proyecto {{ASSET_NAME}} a través del vehículo {{LEGAL_ENTITY_NAME}} ({{LEGAL_WRAPPER_TYPE}}), aplica el Sistema de Autocontrol y Gestión del Riesgo Integral de Lavado de Activos, Financiación del Terrorismo y Financiamiento de la Proliferación de Armas de Destrucción Masiva (SAGRILAFT), conforme al Capítulo X de la Circular Básica Jurídica de la Superintendencia de Sociedades, y el Programa de Transparencia y Ética Empresarial (PTEE), conforme al Capítulo XIII de la misma Circular.

2. Conocimiento del inversionista. Para vincularte, el Oficial de Cumplimiento de {{ORGANIZATION_LEGAL_NAME}} verificará tu identidad, tu prueba de vida biométrica, tu actividad económica, el origen de tus fondos y tu perfil de riesgo, y consultará tu información en listas restrictivas y vinculantes (incluidas las del Consejo de Seguridad de las Naciones Unidas y de la OFAC) y en fuentes nacionales.

3. Personas Expuestas Políticamente. Debes declarar si eres Persona Expuesta Políticamente (PEP), o familiar o asociado cercano de una PEP, en los términos del Decreto 830 de 2021. La condición de PEP no impide la vinculación, pero activa una debida diligencia intensificada.

4. Transparencia y ética. Al aceptar el PTEE te comprometes a no ofrecer, prometer ni entregar dádivas a funcionarios públicos o privados en relación con este negocio, y a reportar cualquier situación de soborno o corrupción por los canales del desarrollador.

5. Tratamiento de datos personales (Ley 1581 de 2012). {{ORGANIZATION_LEGAL_NAME}} es el Responsable del Tratamiento: decide sobre la finalidad y el uso de tus datos, que se tratan para la debida diligencia, la vinculación, la prevención de LA/FT/FPADM y la gestión de tu inversión. RWAXI actúa como Encargado Tecnológico de Infraestructura: trata los datos por cuenta del Responsable, solo para operar el portal, el expediente KYC y los registros on-chain, sin usarlos para fines propios. Puedes conocer, actualizar, rectificar y suprimir tus datos y revocar la autorización ante el Responsable, salvo cuando exista un deber legal de conservación.

6. Huella del expediente. Al enviar el formulario se genera el hash SHA-256 de tu expediente (kycDossierHash). Si eres aprobado, solo ese hash, y no tus datos personales, se registra en el contrato de cumplimiento del desarrollador en la red {{NETWORK}}.`,
  sarlaft: `DEBIDA DILIGENCIA DEL INVERSIONISTA · SARLAFT

1. Régimen aplicable. {{ORGANIZATION_LEGAL_NAME}}, NIT {{ORGANIZATION_TAX_ID}}, como oferente del proyecto {{ASSET_NAME}} a través del vehículo {{LEGAL_ENTITY_NAME}} ({{LEGAL_WRAPPER_TYPE}}), administrado por una entidad vigilada por la Superintendencia Financiera de Colombia, aplica el Sistema de Administración del Riesgo de Lavado de Activos y de la Financiación del Terrorismo (SARLAFT), conforme a la Parte I, Título IV, Capítulo IV de la Circular Básica Jurídica de la Superintendencia Financiera.

2. Conocimiento del inversionista. La vinculación exige verificar tu identidad, tu prueba de vida biométrica, tu actividad económica, el origen de tus fondos y tu perfil de riesgo, y consultar tu información en listas restrictivas y vinculantes (incluidas las del Consejo de Seguridad de las Naciones Unidas y de la OFAC) y en fuentes nacionales, conforme a los procedimientos de la entidad vigilada.

3. Personas Expuestas Políticamente. Debes declarar si eres Persona Expuesta Políticamente (PEP), o familiar o asociado cercano de una PEP, en los términos del Decreto 830 de 2021. La condición de PEP no impide la vinculación, pero activa una debida diligencia intensificada.

4. Tratamiento de datos personales (Ley 1581 de 2012). {{ORGANIZATION_LEGAL_NAME}} es el Responsable del Tratamiento: decide sobre la finalidad y el uso de tus datos, que se tratan para la debida diligencia, la vinculación, la prevención de LA/FT y la gestión de tu inversión. RWAXI actúa como Encargado Tecnológico de Infraestructura: trata los datos por cuenta del Responsable, solo para operar el portal, el expediente KYC y los registros on-chain, sin usarlos para fines propios. Puedes conocer, actualizar, rectificar y suprimir tus datos y revocar la autorización ante el Responsable, salvo cuando exista un deber legal de conservación.

5. Huella del expediente. Al enviar el formulario se genera el hash SHA-256 de tu expediente (kycDossierHash). Si eres aprobado, solo ese hash, y no tus datos personales, se registra en el contrato de cumplimiento del desarrollador en la red {{NETWORK}}.`,
};

// RWAXI's own notices are translated; the developer's legal templates (LEGAL_NDA, LEGAL_COMPLIANCE) are
// shown in their binding original language.
export const LEGAL_FRONTIER = vmsg(`FRONTERA LEGAL DE RWAXI

RWAXI es un canal de descubrimiento y un proveedor de infraestructura tecnológica (portales white label, Data Room, firma electrónica, expediente KYC y adaptador de tokenización). En la vitrina www.rwaxi.com y en cada portal:

1. RWAXI no es emisor, oferente, estructurador financiero, administrador ni custodio de los activos, de los recursos ni de las unidades digitales de ningún proyecto.
2. RWAXI no capta recursos del público, no recibe dinero de los inversionistas, no presta asesoría de inversión ni actúa como intermediario del mercado de valores.
3. Cada proyecto es ofrecido exclusivamente por su desarrollador, identificado con razón social y NIT, a través de su propio vehículo jurídico independiente. La relación contractual, la debida diligencia (SAGRILAFT + PTEE o SARLAFT) y las decisiones sobre los inversionistas son responsabilidad del desarrollador.
4. En la cadena de bloques, los contratos del registro de cumplimiento y del token pertenecen al desarrollador. RWAXI no tiene facultades para pausar, congelar ni transferir unidades digitales; solo ejecuta, como adaptador técnico, las instrucciones de emisión que el desarrollador aprueba.
5. Las cifras de TIR, distribuciones y valorización son escenarios estimados elaborados por cada desarrollador. No constituyen promesa de rentabilidad y el capital invertido está sujeto a riesgo.`);

export const LEGAL_FRONTIER_TENANT = vmsg(
  "Oferente responsable: {{ORGANIZATION_LEGAL_NAME}} · NIT {{ORGANIZATION_TAX_ID}}. Vehículo emisor: {{LEGAL_ENTITY_NAME}} ({{LEGAL_WRAPPER_TYPE}}). Régimen de cumplimiento: {{COMPLIANCE_REGIME}}. RWAXI actúa solo como proveedor de infraestructura tecnológica: no es parte de la oferta, no recibe recursos y no controla las unidades digitales emitidas.",
);

export const LEGAL_LAYERS =
  msg(`RECONOCIMIENTO DE LAS 4 CAPAS ESTRUCTURALES Y DE LA RECUPERACIÓN JUDICIAL O ADMINISTRATIVA

Al suscribir declaro que entiendo y acepto que mi inversión se organiza en cuatro capas independientes:

Capa 1 · Activo real. El activo subyacente es {{ASSET_NAME}}. Las unidades digitales no me otorgan propiedad directa sobre el inmueble.

Capa 2 · Vehículo jurídico. El activo y sus flujos están aislados en {{LEGAL_ENTITY_NAME}}, estructurado como {{LEGAL_WRAPPER_TYPE}}, cuyo oferente y responsable es {{ORGANIZATION_LEGAL_NAME}}, NIT {{ORGANIZATION_TAX_ID}}. Mis derechos y obligaciones se rigen por el contrato de suscripción y los documentos constitutivos de ese vehículo.

Capa 3 · Derecho económico. Adquiero una participación en los flujos de renta y en la valorización estimada del activo, en la proporción de mis unidades. Las cifras proyectadas son escenarios estimados y no promesas de rentabilidad; mi capital está sujeto a riesgo.

Capa 4 · Infraestructura digital. Mis unidades se representan con el token {{TOKEN_SYMBOL}} en la red {{NETWORK}}, sobre contratos OpenZeppelin con whitelist de inversionistas aprobados por el desarrollador. La versión del Data Room que revisé corresponde al Merkle Root SHA-256 {{DATAROOM_MERKLE_ROOT}}. RWAXI provee esta infraestructura como Encargado Tecnológico y no es parte del vehículo.

Recuperación judicial o administrativa (forcedTransfer). Acepto que, solo por orden judicial, decisión de autoridad administrativa competente o acto jurídico que lo justifique (por ejemplo, sucesión, embargo o pérdida acreditada de mis llaves privadas), el titular del LEGAL_ENFORCEMENT_ROLE de {{ORGANIZATION_LEGAL_NAME}} podrá transferir mis unidades a una wallet verificada mediante la función forcedTransfer. Cada ejecución registra on-chain el hash SHA-256 del acto que la soporta (legalActHash) y emite el evento ForcedRecoveryExecuted, verificable por cualquier interesado. RWAXI no puede ejecutar esta función.

Transferencias. Entiendo que mis unidades solo pueden transferirse a wallets aprobadas en la whitelist del desarrollador; cualquier transferencia a una wallet no verificada será rechazada por el contrato.`);

export function legalVars(e, a) {
  return {
    ORGANIZATION_LEGAL_NAME: e.legalName,
    ORGANIZATION_TAX_ID: e.nit,
    LEGAL_ENTITY_NAME: a.vehicle,
    LEGAL_WRAPPER_TYPE: a.wrapper,
    DATAROOM_MERKLE_ROOT: "0x" + e.merkle,
    ASSET_NAME: a.asset,
    PORTAL_DOMAIN: e.domainStatus === "verificado" && e.domain ? e.domain : portalHost(e),
    COMPLIANCE_REGIME: REGIMES[e.regime].short,
    TOKEN_SYMBOL: e.mint.symbol,
    NETWORK: e.mint.network,
  };
}

export const fillLegal = (e, a) => e.replace(/\{\{([A-Z_]+)\}\}/g, (t, o) => (o in a ? String(a[o]) : t));
