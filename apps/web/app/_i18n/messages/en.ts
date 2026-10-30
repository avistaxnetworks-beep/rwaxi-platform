import type { Catalog } from "../translate";

// English · vitrina, White Label portal, backoffice and On-Chain Inspector. Keys are the Spanish source texts.
const catalog: Catalog = {
  "¿Cómo te protege la blockchain aquí?": "How does the blockchain protect you here?",
  "¿Cuál es la actividad económica principal del origen de sus fondos?":
    "What is the main economic activity behind the source of your funds?",
  "¿Eres desarrollador o estructurador inmobiliario y te gustaría tokenizar tu proyecto?":
    "Are you a real-estate developer or structurer looking to tokenize your project?",
  "¿Eres desarrollador? Tokeniza tu inmueble": "Developer? Tokenize your property",
  "¿Primera vez? Activa tu cuenta con el enlace personal que RWAXI te envió por correo.":
    "First time? Activate your account with the personal link RWAXI emailed you.",
  "¿Te convence el respaldo del proyecto? Completa tu verificación KYC para poder invertir: el Data Room sigue abierto mientras tanto.":
    "Convinced by the project's backing? Complete your KYC verification to be able to invest: the Data Room stays open in the meantime.",
  "¿Ya firmaste el NDA en otro navegador o dispositivo? Recupera tu sesión con un código enviado a tu correo.":
    "Already signed the NDA on another browser or device? Recover your session with a code sent to your email.",
  ".mp4 / .mov · 1080p o 4K · máx. 3:00": ".mp4 / .mov · 1080p or 4K · max. 3:00",
  "· cumple AA": "· meets AA",
  "· no cumple AA, elige un tono más oscuro": "· fails AA, choose a darker shade",
  "“{asset} está en {region}, una de las zonas de mayor demanda de {city}.”":
    "“{asset} is located in {region}, one of the highest-demand areas in {city}.”",
  "“Cada unidad digital se registra on-chain y solo circula entre inversionistas elegibles.”":
    "“Each digital unit is recorded on-chain and circulates only among eligible investors.”",
  "“El activo se aísla en un vehículo independiente: {wrapper}.”":
    "“The asset is isolated in an independent vehicle: {wrapper}.”",
  "“El escenario base proyecta una TIR estimada de {irr}, con distribuciones por renta y valorización.”":
    "“The base case projects an estimated IRR of {irr}, with distributions from rental income and appreciation.”",
  "(adaptador RWAXI · solo mintSubscription)": "(RWAXI adapter · mintSubscription only)",
  "(no aprobada)": "(not approved)",
  "(origen congelado)": "(source frozen)",
  "(vacío)": "(empty)",
  "[archivo] {name}": "[file] {name}",
  "{amount} · tokens en la wallet del inversionista": "{amount} · tokens in the investor's wallet",
  "{asset} · el desarrollador es responsable de la relación contractual y del cumplimiento.":
    "{asset} · the developer is responsible for the contractual relationship and for compliance.",
  "{available} de {total} unidades": {
    one: "{available} of {total} unit",
    other: "{available} of {total} units",
  },
  "{committed} / {total} unidades": {
    one: "{committed} / {total} unit",
    other: "{committed} / {total} units",
  },
  "{current} de {total}": "{current} of {total}",
  "{file} copiado": "{file} copied",
  "{fn}() confirmada · {mode} · tx {hash}": "{fn}() confirmed · {mode} · tx {hash}",
  "{label}: entre {min} y {max} (hasta 2 decimales).":
    "{label}: between {min} and {max} (up to 2 decimal places).",
  "{n} de 4 imágenes son fotografías cargadas.": {
    one: "{n} of 4 images is an uploaded photo.",
    other: "{n} of 4 images are uploaded photos.",
  },
  "{n} documento(s) cargados · SHA-256 calculado · Merkle Root actualizado": {
    one: "{n} document uploaded · SHA-256 computed · Merkle Root updated",
    other: "{n} documents uploaded · SHA-256 computed · Merkle Root updated",
  },
  "{n} hash(es)": { one: "{n} hash", other: "{n} hashes" },
  "{n} intentos fallidos": "{n} failed attempts",
  "{n} meses": { one: "{n} month", other: "{n} months" },
  "{n} suscripción(es)": { one: "{n} subscription", other: "{n} subscriptions" },
  "{n} suscripción(es) cancelada(s) · {units} unidades liberadas": {
    one: "{n} subscription cancelled · {units} units released",
    other: "{n} subscriptions cancelled · {units} units released",
  },
  "{n} tenedor(es)": { one: "{n} holder", other: "{n} holders" },
  "{n} tokens": "{n} tokens",
  "{n} tokens {symbol} emitidos en {network}": "{n} {symbol} tokens issued on {network}",
  "{n} tokens emitidos": {
    one: "{n} token minted",
    other: "{n} tokens minted",
  },
  "{n} transacciones · más reciente primero": {
    one: "{n} transaction · most recent first",
    other: "{n} transactions · most recent first",
  },
  "{n} unidades": { one: "{n} unit", other: "{n} units" },
  "{n} unidades disponibles": { one: "{n} unit available", other: "{n} units available" },
  "{n} wallets": { one: "{n} wallet", other: "{n} wallets" },
  "{name} · {folder}": "{name} · {folder}",
  "{name} · Portal de inversión": "{name} · Investment portal",
  "{name} · SHA-256 verificado al servirlo · {by}": "{name} · SHA-256 verified when served · {by}",
  "{name} aprobado · whitelist on-chain en cola": "{name} approved · on-chain whitelist queued",
  "{name} revocado · {n} suscripción(es) cancelada(s) · revokeInvestor en cola": {
    one: "{name} revoked · {n} subscription cancelled · revokeInvestor queued",
    other: "{name} revoked · {n} subscriptions cancelled · revokeInvestor queued",
  },
  "{name} revocado · {n} suscripción(es) cancelada(s) · whitelist retirada antes de enviarse": {
    one: "{name} revoked · {n} subscription cancelled · whitelisting withdrawn before it was sent",
    other: "{name} revoked · {n} subscriptions cancelled · whitelisting withdrawn before it was sent",
  },
  "{name}: {error}": "{name}: {error}",
  "{name}: el archivo no coincide con su SHA-256 · acceso bloqueado":
    "{name}: the file does not match its SHA-256 · access blocked",
  "{pct} suscrito": "{pct} subscribed",
  "{pct}% · {n} asiento(s)": { one: "{pct}% · {n} entry", other: "{pct}% · {n} entries" },
  "{price} c/u": "{price} per unit",
  "{provider} · vista previa": "{provider} · preview",
  "{rate} anual": "{rate} per year",
  "{role} · contraseña y TOTP definidos desde la invitación":
    "{role} · password and TOTP set from the invitation",
  "{side} del documento de identidad · SHA-256 verificado al servirlo":
    "{side} of the identity document · SHA-256 verified when served",
  "{text} · motivo: {reason}": "{text} · reason: {reason}",
  "{units} de {total} tokens": { one: "{units} of {total} token", other: "{units} of {total} tokens" },
  "{units} unidades · {capital} USD": {
    one: "{units} unit · {capital} USD",
    other: "{units} units · {capital} USD",
  },
  "⊘ CANCELLED · retirada sin enviarse": "⊘ CANCELLED · withdrawn before it was sent",
  "⏳ PENDING · en cola": "⏳ PENDING · queued",
  "✓ La prueba reconstruye la raíz": "✓ The proof reconstructs the root",
  "✗ La prueba no corresponde a la raíz": "✗ The proof does not match the root",
  "01 / Oportunidades estructuradas": "01 / Structured opportunities",
  "02 / Cómo invertir": "02 / How to invest",
  "1 · Bloqueo en mercado secundario": "1 · Secondary-market transfer block",
  "100 % de los documentos con tu NDA": "100% of documents unlocked with your NDA",
  "100 % del Data Room · {code}": "100% of the Data Room · {code}",
  "2 · Recuperación regulatoria / orden judicial": "2 · Regulatory recovery / court order",
  "Abre tu propio portal institucional White Label, automatiza tu cumplimiento KYC/SAGRILAFT y conecta tu inmueble con inversionistas globales sin ceder el control fiduciario.":
    "Launch your own institutional White Label portal, automate your KYC/SAGRILAFT compliance and connect your property with investors worldwide without giving up fiduciary control.",
  "Abriendo portal oficial de {name}…": "Opening the official portal of {name}…",
  Abrir: "Open",
  "Abrir Bandeja de Cumplimiento": "Open Compliance Inbox",
  "Abrir en la app de autenticación": "Open in the authenticator app",
  "Abrir portal con esta configuración": "Open portal with these settings",
  "Accede al Data Room y valida el respaldo": "Access the Data Room and verify what backs the project",
  Acceso: "Access",
  "Acceso · Backoffice · {name}": "Sign-in · Backoffice · {name}",
  "Acceso al backoffice": "Backoffice sign-in",
  "Acceso con contraseña y código de verificación de dos pasos (TOTP).":
    "Sign-in with a password and a two-step verification code (TOTP).",
  "Acceso global 100 % digital": "100% digital global access",
  "Acceso retirado": "Access withdrawn",
  "Acceso retirado por cumplimiento": "Access withdrawn by compliance",
  Acciones: "Actions",
  "Acepta mayor variación y proyectos en estructuración o pre-venta.":
    "Accepts greater volatility and projects in structuring or pre-sale.",
  Aceptado: "Accepted",
  "Acepto los términos de coinversión y entiendo que la TIR, las distribuciones y la valorización son escenarios estimados, y que mi capital está sujeto a riesgo.":
    "I accept the co-investment terms and understand that the IRR, distributions and appreciation are estimated scenarios, and that my capital is subject to risk.",
  "Acta o sentencia (texto o archivo) → legalActHash = SHA-256":
    "Court record or ruling (text or file) → legalActHash = SHA-256",
  "Activa tu cuenta": "Activate your account",
  "Activar cuenta · Backoffice · {name}": "Activate account · Backoffice · {name}",
  "Activar sonido": "Unmute",
  "Activar y entrar al backoffice": "Activate and enter the backoffice",
  "Actividad económica": "Economic activity",
  "Actividad económica no admitida.": "Economic activity not accepted.",
  Activo: "Asset",
  ACTIVO: "ACTIVE",
  "Activo aportado al vehículo + Data Room": "Asset contributed to the vehicle + Data Room",
  "Activo real": "Real asset",
  "Activo subyacente": "Underlying asset",
  "ACTIVOS REALES · INVERSIONES DIGITALES": "REAL ASSETS · DIGITAL INVESTMENTS",
  "Activos reales · Inversiones digitales. Infraestructura de tokenización inmobiliaria White Label.":
    "Real assets · Digital investments. White Label real-estate tokenization infrastructure.",
  "Activos Tokenizados": "Tokenized Assets",
  "Adjunta el archivo.": "Attach the file.",
  Administrador: "Administrator",
  "Advertencia de riesgos y proyecciones": "Risk warning and projections",
  "Agrega esta clave a tu app de autenticación (Google Authenticator, Microsoft Authenticator, 1Password…) y escribe el código de 6 dígitos que genere.":
    "Add this key to your authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…) and enter the 6-digit code it generates.",
  "aislado · {name}": "isolated · {name}",
  "Al confirmar, la suscripción pasa a {status}, se calcula {ref} (SHA-256 canónico del contrato firmado y de esta referencia) y se encola {call}. Se devenga la comisión de infraestructura RWAXI ({pct}% del capital).":
    "On confirmation, the subscription moves to {status}, {ref} is computed (canonical SHA-256 of the signed agreement and this reference) and {call} is queued. The RWAXI infrastructure fee is accrued ({pct}% of the capital).",
  "Al menos un número": "At least one number",
  "Al menos un símbolo (por ejemplo ! ? # - _)": "At least one symbol (for example ! ? # - _)",
  Alcance: "Scope",
  "Alcance Global con el Mismo Capital": "Global Reach with the Same Capital",
  "Alta B2B · {slug}.rwaxirealestate.com · NIT {taxId} · {users} usuarios · oferta {code} · {documents} documentos":
    "B2B onboarding · {slug}.rwaxirealestate.com · NIT {taxId} · {users} user(s) · offering {code} · {documents} document(s)",
  "Alta en la red RWAXI": "Onboarded to the RWAXI network",
  Analista: "Analyst",
  "Analizando correspondencia con el documento": "Analyzing match with the document",
  "anchorDistributionRoot() en cola · la firma el emisor (DISTRIBUTION_ROLE)":
    "anchorDistributionRoot() queued · signed by the issuer (DISTRIBUTION_ROLE)",
  "Ancla la raíz de Merkle de las asignaciones; la firma el emisor (DISTRIBUTION_ROLE), RWAXI no custodia ese rol.":
    "Anchors the Merkle root of the allocations; the issuer signs it (DISTRIBUTION_ROLE) and RWAXI does not hold that role.",
  "Anclar dataRoomMerkleRoot inicial y vincular el registro ({n} wallets en whitelist)": {
    one: "Anchor the initial dataRoomMerkleRoot and link the registry ({n} whitelisted wallet)",
    other: "Anchor the initial dataRoomMerkleRoot and link the registry ({n} whitelisted wallets)",
  },
  "Anclar Merkle Root": "Anchor Merkle Root",
  "Antes de comprometer capital, entras al Data Room privado. Allí encuentras de manera detallada toda la información jurídica, financiera y comercial que respalda al proyecto: estudios de títulos, encargo fiduciario, modelo financiero y contratos verificados criptográficamente.":
    "Before committing any capital, you enter the private Data Room. There you will find, in full detail, all the legal, financial and commercial information that backs the project: title studies, the fiduciary mandate, the financial model and cryptographically verified contracts.",
  "Año {n}": "Year {n}",
  "approveInvestor(nueva wallet del titular) ejecutado": "approveInvestor(holder's new wallet) executed",
  "approveInvestor(nueva wallet, 170, dossier)": "approveInvestor(new wallet, 170, dossier)",
  aprobado: "approved",
  "Aprobado · Inversionista Elegible": "Approved · Eligible Investor",
  "Aprobado · Whitelist": "Approved · Whitelisted",
  "Aprobado por el desarrollador": "Approved by the developer",
  "Aprobar Inversionista y Añadir a Whitelist On-Chain": "Approve Investor and Add to On-Chain Whitelist",
  "Archivo cargado": "File uploaded",
  "Archivo de video": "Video file",
  "Archivo directo": "Direct file",
  "argumentos de registro (sin calldata reconstruible)": "recorded arguments (calldata not reconstructible)",
  "Argumentos incompletos: no se puede codificar el calldata.":
    "Incomplete arguments: the calldata cannot be encoded.",
  "Arrastra el video o": "Drag the video here or",
  "Arrastra la foto aquí o": "Drag the photo here or",
  Asignación: "Allocation",
  "Asignado:": "Allocated:",
  Atrás: "Back",
  "ATRIBUCIÓN DE LEAD": "LEAD ATTRIBUTION",
  "Atribución deshabilitada: falta REFERRAL_SECRET en el servidor.":
    "Attribution disabled: REFERRAL_SECRET is missing on the server.",
  "AuditEvent · sin edición ni borrado": "AuditEvent · no editing or deletion",
  "Auditoría criptográfica del Data Room": "Cryptographic Data Room audit",
  "Aún no hay decisiones registradas para este tenant.": "No decisions recorded for this tenant yet.",
  "Aún no hay distribuciones declaradas para este tenant.": "No distributions declared for this tenant yet.",
  "Aún no hay suscripciones firmadas en este portal.": "No subscriptions signed on this portal yet.",
  "Aún no hay suscripciones, pagos ni emisiones registradas.":
    "No subscriptions, payments or mints recorded yet.",
  "Aún no tienes suscripciones en este proyecto.": "You have no subscriptions in this project yet.",
  "Autorizo a {entity} a consultar mi información en listas restrictivas y vinculantes (ONU, OFAC y fuentes nacionales) como parte de la debida diligencia.":
    "I authorize {entity} to screen my information against sanctions and binding lists (UN, OFAC and national sources) as part of due diligence.",
  "Autorizo a {entity}, como Responsable del Tratamiento, y a RWAXI, como Encargado Tecnológico de Infraestructura que actúa por cuenta del Responsable, el tratamiento de mis datos conforme a la Ley 1581 de 2012.":
    "I authorize {entity}, as Data Controller, and RWAXI, as Technology Infrastructure Processor acting on behalf of the Controller, to process my data in accordance with Law 1581 of 2012.",
  "Avalúo comercial de referencia": "Reference commercial appraisal",
  "Aviso legal y regulatorio": "Legal and regulatory notice",
  "BACKOFFICE · TENANT ADMIN": "BACKOFFICE · TENANT ADMIN",
  "Backoffice del desarrollador": "Developer backoffice",
  "Bandeja de cumplimiento": "Compliance inbox",
  Billetera: "Wallet",
  "Billetera declarada · se añade a la whitelist al aprobarse":
    "Declared wallet · added to the whitelist upon approval",
  "Billetera: decláralo en el paso 1": "Wallet: declare it in step 1",
  bloque: "block",
  "bloqueada {minutes} min": "locked {minutes} min",
  Bloqueado: "Locked",
  Bóveda: "Vault",
  "Busca equilibrio entre rentas periódicas y valorización.":
    "Seeks a balance between periodic rental income and appreciation.",
  "C.C.": "C.C.",
  "C.E.": "C.E.",
  "Cada desarrollador o vehículo de propósito especial (SPV) es el único emisor y responsable de su inmueble, de la información de su Data Room, de su proceso de conocimiento del inversionista (KYC/SAGRILAFT o SARLAFT) y del recaudo a través de sus cuentas fiduciarias o bancarias. El inversionista contrata directamente con el emisor.":
    "Each developer or special purpose vehicle (SPV) is the sole issuer and the sole party responsible for its property, the information in its Data Room, its know-your-customer process (KYC/SAGRILAFT or SARLAFT) and the collection of investors' funds through its trust or bank accounts. The investor contracts directly with the issuer.",
  "Cada documento del Data Room, cada unidad emitida y cada corte de distribución queda sellado en blockchain con prueba SHA-256 y árboles de Merkle verificables al instante.":
    "Every Data Room document, every unit issued and every distribution cut-off is sealed on the blockchain with SHA-256 proofs and instantly verifiable Merkle trees.",
  "Calculando SHA-256…": "Computing SHA-256…",
  "Cálculo programable de rendimientos": "Programmable yield calculation",
  "Calldata copiado": "Calldata copied",
  "Cambiar correo": "Change email",
  Canadá: "Canada",
  cancelada: "canceled",
  Cancelada: "Canceled",
  "Cantidad de unidades inválida.": "Invalid number of units.",
  Capital: "Capital",
  "Capital suscrito / objetivo": "Capital subscribed / target",
  "CAPÍTULO {n}": "CHAPTER {n}",
  Capítulos: "Chapters",
  "Captación de {code} pausada (plataforma, off-chain)":
    "Capital raising for {code} paused (platform, off-chain)",
  "Captación de {code} reanudada": "Capital raising for {code} resumed",
  "Captación pausada temporalmente": "Capital raising temporarily paused",
  Característica: "Feature",
  "Carga un archivo .mp4 o .mov en el Backoffice para usar el video HTML5":
    "Upload an .mp4 or .mov file in the Backoffice to use HTML5 video",
  "Cargado · {size} KB": "Uploaded · {size} KB",
  "Cargar acta (PDF)": "Upload court record (PDF)",
  "Cargar documentos": "Upload documents",
  "Cargar fotografías del inmueble": "Upload property photos",
  "Cargar logo (SVG o PNG)": "Upload logo (SVG or PNG)",
  Cargo: "Job title",
  Carpeta: "Folder",
  "Carpeta del Data Room inválida.": "Invalid Data Room folder.",
  "Catálogo en vivo no disponible: se muestran los datos ilustrativos del prototipo.":
    "Live catalog unavailable: showing the prototype's illustrative data.",
  "Causal de la revocación": "Grounds for revocation",
  "Cédula · frente": "Cédula · front",
  "Cédula · reverso": "Cédula · back",
  "Cédula de Ciudadanía": "Colombian citizen ID (cédula)",
  "Centra tu rostro en el óvalo": "Center your face in the oval",
  Cerrar: "Close",
  "Cerrar inspector": "Close inspector",
  "Cerrar sesión": "Sign out",
  Certificado: "Certificate",
  "Certificado con el SHA-256 del contrato": "Certificate with the agreement SHA-256",
  "Certificado de participación": "Participation certificate",
  "Certificado de tradición y libertad": "Certificate of title and encumbrances",
  Certificados: "Certificates",
  "ChainTransaction PENDING: approveInvestor() espera la firma del Oficial de Cumplimiento en RwaxiComplianceRegistry.":
    "ChainTransaction PENDING: approveInvestor() awaits the Compliance Officer's signature on RwaxiComplianceRegistry.",
  Chile: "Chile",
  "Cierre de sesión": "Sign-out",
  "Código de recuperación agotado": "Recovery code exhausted",
  "Código de verificación": "Verification code",
  "Código hexadecimal": "Hex code",
  "Código incorrecto o vencido. Pide un código nuevo si lo necesitas.":
    "Incorrect or expired code. Request a new code if you need one.",
  "Código incorrecto. Revisa la hora de tu dispositivo e inténtalo de nuevo.":
    "Incorrect code. Check the time on your device and try again.",
  "código TOTP": "TOTP code",
  "Código TOTP incorrecto": "Incorrect TOTP code",
  "Coincidencia confirmada en listas restrictivas o vinculantes (ONU, OFAC, Procuraduría, Policía).":
    "Confirmed match on restrictive or binding lists (UN, OFAC, Procuraduría, Police).",
  "Coincidencia en listas restrictivas pendiente de aclaración por el inversionista.":
    "Sanctions list match pending clarification by the investor.",
  "Coincidencia parcial · revisar homónimo": "Partial match · review possible namesake",
  "Coinversión inmobiliaria tokenizada, uno de los modelos de mayor crecimiento a nivel global. Cada proyecto cuenta con seguridad jurídica mediante un vehículo legal propio y activos tokenizados en blockchain, brindándote trazabilidad inmutable sobre tu inversión y tus rendimientos.":
    "Tokenized real-estate co-investment, one of the fastest-growing models worldwide. Each project has legal certainty through its own legal vehicle, and its assets are tokenized on the blockchain, giving you immutable traceability of your investment and its yields.",
  "Cola on-chain · orden de ejecución": "On-chain queue · execution order",
  "Cola PostgreSQL · ChainTransaction": "PostgreSQL queue · ChainTransaction",
  "Cola procesada en orden: {done} confirmada(s)": {
    one: "Queue processed in order: {done} transaction confirmed",
    other: "Queue processed in order: {done} transactions confirmed",
  },
  "Cola procesada en orden: {done} confirmada(s) · {blocked} bloqueada(s)": {
    one: "Queue processed in order: {done} transaction confirmed · {blocked} blocked",
    other: "Queue processed in order: {done} transactions confirmed · {blocked} blocked",
  },
  Colombia: "Colombia",
  "Color de marca": "Brand color",
  "Combinamos el rigor jurídico de la estructuración inmobiliaria tradicional con la agilidad y trazabilidad de la tecnología blockchain. Así es tu proceso de principio a fin:":
    "We combine the legal rigor of traditional real-estate structuring with the agility and traceability of blockchain technology. Here is your journey, from start to finish:",
  "Cómo Invertir": "How to Invest",
  "Comparamos tu rostro con la foto del documento y confirmamos que eres una persona real frente a la cámara.":
    "We compare your face with the photo on the document and confirm that you are a real person in front of the camera.",
  "Comparativo de modelos de inversión": "Comparison of investment models",
  "Completa la prueba de vida.": "Complete the liveness check.",
  Completada: "Completed",
  Completado: "Completed",
  "Completar con datos de ejemplo": "Fill in with sample data",
  "Completar verificación KYC (Paso 3)": "Complete KYC verification (Step 3)",
  "Compliance Simulator": "Compliance Simulator",
  "COMPLIANCE_OFFICER_ROLE · Oficial de Cumplimiento del tenant":
    "COMPLIANCE_OFFICER_ROLE · tenant's Compliance Officer",
  Comprobante: "Proof of payment",
  "comprobante {reference}": "proof of payment {reference}",
  "Con el mismo capital con el que antes quedabas atado a un trámite lento, local y de papel, hoy eres partícipe de un negocio inmobiliario global. La tokenización toma la seguridad histórica del ladrillo y la supercarga en blockchain con bondades que la inversión inmobiliaria tradicional —así sea fraccionada en papel— simplemente no permite.":
    "With the same capital that once tied you to a slow, local, paper-based process, today you take part in a global real-estate venture. Tokenization takes the time-tested security of bricks and mortar and supercharges it on the blockchain with benefits that traditional real-estate investment—even when fractionalized on paper—simply cannot offer.",
  "con el pago ya conciliado": "already reconciled",
  "Con NDA": "With NDA",
  "Conectando tu wallet…": "Connecting your wallet…",
  "Configura tu verificación en dos pasos": "Set up your two-step verification",
  "Configuración White Label": "White Label Settings",
  "Confirma la contraseña": "Confirm the password",
  "Confirma la transacción en tu wallet…": "Confirm the transaction in your wallet…",
  "Confirma que leíste el acuerdo.": "Confirm that you have read the agreement.",
  "confirmada en red": "confirmed on the network",
  "Confirmar Pago Fiduciario": "Confirm Fiduciary Payment",
  "Confirmar Pago Fiduciario · {name}": "Confirm Fiduciary Payment · {name}",
  "Confirmar y entrar": "Confirm and sign in",
  congelada: "frozen",
  "Congelamiento de la wallet": "Wallet freeze",
  "Congelamiento de la wallet de {name} en cola (setFrozen)": "Freeze of {name}'s wallet queued (setFrozen)",
  "Congelamiento de wallet solicitado": "Wallet freeze requested",
  "Congelar wallet (setFrozen)": "Freeze wallet (setFrozen)",
  "Conoce cómo estructurar tu inmueble en rwaxi.com": "Learn how to structure your property at rwaxi.com",
  "Conozco y acepto el PTEE de {entity}, adoptado conforme al Capítulo XIII de la Circular Básica Jurídica de la Superintendencia de Sociedades, y me comprometo a reportar cualquier situación de soborno o corrupción relacionada con este negocio.":
    "I am aware of and accept the PTEE of {entity}, adopted pursuant to Chapter XIII of the Basic Legal Circular (Circular Básica Jurídica) of the Superintendency of Companies (Supersociedades), and I undertake to report any situation of bribery or corruption related to this business.",
  "ConsentRecord registrado": "ConsentRecord recorded",
  Conservador: "Conservative",
  "Consola Super-Admin": "Super-Admin console",
  "Constitución del vehículo, estudio de títulos y tradición del inmueble, y constitución del Vehículo Jurídico Independiente (Legal Wrapper) que separa el activo del patrimonio del originador: S.A.S., patrimonio autónomo o cuentas en participación, según el negocio.":
    "Formation of the vehicle, title study and chain of title of the property, and formation of the Independent Legal Vehicle (Legal Wrapper) that separates the asset from the originator's estate: S.A.S., autonomous trust estate or participation accounts, depending on the deal.",
  "Consulta en listas restrictivas": "Sanctions list screening",
  "Consultando ChainTransaction…": "Querying ChainTransaction…",
  Continuar: "Continue",
  "Continuar a la suscripción de unidades (Paso 4)": "Continue to unit subscription (Step 4)",
  "Contract State Explorer": "Contract State Explorer",
  Contraparte: "Counterparty",
  contraseña: "password",
  Contraseña: "Password",
  "Contraste del texto sobre el color: {ratio}:1": "Text contrast on this color: {ratio}:1",
  Contrato: "Contract",
  "Contrato de suscripción": "Subscription agreement",
  "Contrato inteligente": "Smart contract",
  "Copiado al portapapeles": "Copied to clipboard",
  Copiar: "Copy",
  "Copiar calldata": "Copy calldata",
  Corregir: "Fix",
  "Corregir documentación": "Correct documentation",
  "Correo corporativo": "Work email",
  "Correo electrónico": "Email",
  "Correo o contraseña incorrectos.": "Incorrect email or password.",
  "Crea un registro CNAME de {domain} hacia tenants.rwaxirealestate.com. El portal siempre responde también en {host}.":
    "Create a CNAME record pointing {domain} to tenants.rwaxirealestate.com. The portal is always available at {host} as well.",
  "Cuando decides invertir, completas tu verificación de identidad (KYC/SAGRILAFT) para proteger a todos los co-inversionistas. Una vez aprobado por el Oficial de Cumplimiento del emisor, defines cuántas unidades deseas adquirir y firmas tu acuerdo de suscripción.":
    "When you decide to invest, you complete your identity verification (KYC/SAGRILAFT) to protect all co-investors. Once you are approved by the issuer's Compliance Officer, you choose how many units you want to acquire and sign your subscription agreement.",
  "Cuenta activada (contraseña + TOTP)": "Account activated (password + TOTP)",
  "cuenta bloqueada": "account locked",
  "Cuenta bloqueada por intentos fallidos": "Account locked after failed attempts",
  "Cuenta bloqueada temporalmente por intentos fallidos. Inténtalo de nuevo en {minutes} min.":
    "Account temporarily locked after failed attempts. Try again in {minutes} min.",
  "Cumplimiento y Leads": "Compliance & Leads",
  "Custodia directa en tu wallet": "Self-custody in your own wallet",
  "Data Room": "Data Room",
  "Data Room · {n} documentos": { one: "Data Room · {n} document", other: "Data Room · {n} documents" },
  "Data Room {code}": "Data Room {code}",
  "Data Room Auditado con Hash SHA-256": "Audited Data Room with SHA-256 Hashing",
  "Data Room inmobiliario": "Property Data Room",
  "Data Room off-chain: 0x{hash} · pendiente de anclar": "Off-chain Data Room: 0x{hash} · pending anchoring",
  "Data Room y Minting": "Data Room & Minting",
  "DATA_ROOM_ROLE · emisor": "DATA_ROOM_ROLE · issuer",
  "datos aislados": "isolated data",
  "Datos reales de PostgreSQL (ChainTransaction, aislado por RLS). El calldata se codifica con los ABI compilados de RwaxiComplianceRegistry y RwaxiPropertyToken. «Firmar y ejecutar» respeta la prelación (approveInvestor antes del mint) y las invariantes de los contratos; en modo simulación firma con OPERATOR_PRIVATE_KEY sin difundir a la red.":
    "Real PostgreSQL data (ChainTransaction, isolated by RLS). The calldata is encoded with the compiled ABIs of RwaxiComplianceRegistry and RwaxiPropertyToken. “Sign and execute” respects precedence (approveInvestor before the mint) and the contracts' invariants; in simulation mode it signs with OPERATOR_PRIVATE_KEY without broadcasting to the network.",
  "Debes aceptar el contrato, los riesgos y las 4 capas estructurales.":
    "You must accept the agreement, the risks and the 4 structural layers.",
  "Debida Diligencia": "Due Diligence",
  "Debida diligencia · Paso 3 ({regime})": "Due diligence · Step 3 ({regime})",
  "Decisión inválida.": "Invalid decision.",
  "Declaración de No-PEP": "Non-PEP Declaration",
  "Declaración PEP": "PEP declaration",
  "Declarada · raíz en cola": "Declared · root queued",
  "declarada en COP {amount} a {rate} COP/USD": "declared in COP {amount} at {rate} COP/USD",
  "Declarar distribución de rendimientos": "Declare yield distribution",
  "Declarar y encolar raíz de Merkle": "Declare and queue Merkle root",
  "Declaro que la información suministrada es veraz y que mis recursos provienen de actividades lícitas, y autorizo su verificación conforme a la Parte I, Título IV, Capítulo IV de la Circular Básica Jurídica de la Superintendencia Financiera.":
    "I declare that the information provided is truthful and that my funds come from lawful activities, and I authorize its verification pursuant to Part I, Title IV, Chapter IV of the Basic Legal Circular (Circular Básica Jurídica) of the Financial Superintendency of Colombia.",
  "Declaro que la información suministrada es veraz y que mis recursos provienen de actividades lícitas, y autorizo su verificación conforme al Capítulo X de la Circular Básica Jurídica de la Superintendencia de Sociedades.":
    "I declare that the information provided is truthful and that my funds come from lawful activities, and I authorize its verification pursuant to Chapter X of the Basic Legal Circular (Circular Básica Jurídica) of the Superintendency of Companies (Supersociedades).",
  "Declaro que no soy Persona Expuesta Políticamente (PEP), ni familiar o asociado cercano de una PEP, en los términos del Decreto 830 de 2021. Me obligo a informar cualquier cambio en esta condición.":
    "I declare that I am not a Politically Exposed Person (PEP), nor a family member or close associate of a PEP, under the terms of Decree 830 of 2021. I undertake to report any change in this status.",
  "DEFAULT_ADMIN_ROLE · emisor, a su propia wallet": "DEFAULT_ADMIN_ROLE · issuer, to its own wallet",
  "Define las etiquetas y declaraciones del Paso 3 del portal. Autoridad: {authority}.":
    "Defines the labels and declarations for Step 3 of the portal. Authority: {authority}.",
  "Define primero tu contraseña.": "Set your password first.",
  "Define tu contraseña y tu verificación en dos pasos para entrar al backoffice de {name}.":
    "Set your password and two-step verification to enter {name}'s backoffice.",
  "Demasiadas cargas en poco tiempo: espera {seconds} s y vuelve a intentarlo.":
    "Too many uploads in a short time: wait {seconds} s and try again.",
  "Demasiados códigos incorrectos. Vuelve a escribir tu contraseña.":
    "Too many incorrect codes. Enter your password again.",
  "Demasiados intentos fallidos desde esta red. Espera unos minutos.":
    "Too many failed attempts from this network. Wait a few minutes.",
  "Derecho económico": "Economic right",
  Desarrollador: "Developer",
  "Desarrollador y emisor responsable": "Developer and responsible issuer",
  "Desarrollador:": "Developer:",
  "Descargar {name}": "Download {name}",
  "Descongelamiento de la wallet de {name} en cola (setFrozen)": "Unfreeze of {name}'s wallet queued (setFrozen)",
  "Descongelar wallet (setFrozen)": "Unfreeze wallet (setFrozen)",
  "Describe brevemente la actividad.": "Briefly describe the activity.",
  "Describe la actividad": "Describe the activity",
  "Desde el mes {month}": "From month {month}",
  "Desde la cola sólo se otorga MINTER_ROLE.": "Only MINTER_ROLE is granted from the queue.",
  "Destino de carga inválido.": "Invalid upload destination.",
  Dinámico: "Dynamic",
  "Dirección 0x… en Polygon o Base. Es la que el Oficial de Cumplimiento añadirá a la whitelist al aprobarte.":
    "0x… address on Polygon or Base. This is the address the Compliance Officer will add to the whitelist when approving you.",
  "Dirección RWAXI": "RWAXI management",
  Directo: "Direct",
  "Director de Estructuración": "Head of Structuring",
  Disponible: "Available",
  Disponibles: "Available",
  "Distribución {period} · {total} USD entre {holders} tenedor(es) · anchorDistributionRoot en cola": {
    one: "Distribution {period} · {total} USD to {holders} holder · anchorDistributionRoot queued",
    other: "Distribution {period} · {total} USD among {holders} holders · anchorDistributionRoot queued",
  },
  "Distribución anual est.": "Est. annual distribution",
  "Distribución Anual Est.": "Est. Annual Distribution",
  "Distribución declarada": "Distribution declared",
  "Distribución total {amount}": "Total distribution {amount}",
  Distribuciones: "Distributions",
  "Distribuciones acumuladas:": "Accumulated distributions:",
  "Distribuciones de rendimientos": "Yield distributions",
  "Distribuciones declaradas": "Declared distributions",
  "Distribuciones y Rendimientos": "Distributions & Yields",
  "DISTRIBUTION_ROLE · emisor (desarrollador)": "DISTRIBUTION_ROLE · issuer (developer)",
  Documento: "Document",
  "Documento agregado al Data Room": "Document added to the Data Room",
  "Documento cargado": "Document uploaded",
  "Documento constitutivo del Legal Wrapper": "Legal Wrapper incorporation document",
  "DOCUMENTO DE EJEMPLO · FRENTE": "SAMPLE DOCUMENT · FRONT",
  "DOCUMENTO DE EJEMPLO · REVERSO": "SAMPLE DOCUMENT · BACK",
  "Documento del Data Room descargado": "Data Room document downloaded",
  "Documento KYC consultado": "KYC document viewed",
  "Documento no encontrado en este tenant.": "Document not found in this tenant.",
  "Documento no encontrado.": "Document not found.",
  "Documento reservado (jurídico, fiduciario o financiero)": "Confidential document (legal, fiduciary or financial)",
  "Documento verificado y guardado · nueva raíz del Data Room en cola (updateDataRoomMerkleRoot)":
    "Document verified and stored · new Data Room root queued (updateDataRoomMerkleRoot)",
  "Documento verificado y guardado en la bóveda · raíz del Data Room actualizada":
    "Document verified and stored in the vault · Data Room root updated",
  "Documento y biometría": "Document and biometrics",
  "Documentos del expediente · SHA-256 verificado por el servidor al recibirlos":
    "Dossier documents · SHA-256 verified by the server on receipt",
  Dólares: "Dollars",
  "Dólares estadounidenses": "US dollars",
  "Dominio {domain} verificado": "Domain {domain} verified",
  "Dominio activo:": "Active domain:",
  "Dominio del portal": "Portal domain",
  "Dominio personalizado": "Custom domain",
  "duración no legible en este navegador": "duration not readable in this browser",
  Ecuador: "Ecuador",
  "Ej. Juzgado 12 Civil del Circuito de Bogotá, auto 2026-0457: restitución de unidades al titular…":
    "E.g., 12th Civil Circuit Court of Bogotá, order 2026-0457: restitution of units to the holder…",
  "ejecutable: prelación e invariantes del contrato verificadas":
    "executable: precedence and contract invariants verified",
  "Ejecutar forcedTransfer()": "Execute forcedTransfer()",
  "Ejecutar transfer()": "Execute transfer()",
  "El Activo y Ubicación": "Asset & Location",
  'El archivo "{label}" no es válido; vuelve a cargarlo.':
    'The file "{label}" is not valid; please upload it again.',
  'El archivo "{label}" no fue verificado por el servidor; vuelve a cargarlo.':
    'The file "{label}" was not verified by the server; upload it again.',
  "El archivo de la bóveda no coincide con su SHA-256 registrado: la descarga se bloqueó y el incidente quedó auditado.":
    "The vault file does not match its recorded SHA-256: the download was blocked and the incident audited.",
  "El archivo está vacío.": "The file is empty.",
  "El archivo no se pudo reproducir aquí; se muestra la vista interactiva.":
    "Could not play the file here; showing the interactive view.",
  "El archivo supera 10 MB.": "The file exceeds 10 MB.",
  "El archivo supera el tamaño máximo de {max} MB.": "The file exceeds the maximum size of {max} MB.",
  "El Backoffice ahora usa {regime}. El valor on-chain es inmutable: requiere desplegar un nuevo registro y migrar la whitelist.":
    "The Backoffice now uses {regime}. The on-chain value is immutable: it requires deploying a new registry and migrating the whitelist.",
  "El calldata firmado no coincide con la operación en cola ({fn}): no se registró nada.":
    "The signed calldata does not match the queued operation ({fn}): nothing was recorded.",
  "El correo, el documento o la wallet ya están registrados por otro inversionista de este portal.":
    "The email, document or wallet is already registered by another investor on this portal.",
  "El dominio no corresponde a ningún desarrollador activo en la red RWAXI.":
    "This domain does not match any active developer on the RWAXI network.",
  "El emisor aún no ancla la raíz en el token (anchorDistributionRoot en cola).":
    "The issuer has not yet anchored the root on the token (anchorDistributionRoot queued).",
  "El emisor pausó el token {symbol} on-chain: no se pueden emitir nuevas unidades hasta que lo reanude.":
    "The issuer has paused the {symbol} token on-chain: no new units can be minted until the issuer resumes it.",
  "El emisor pausó el token: no se pueden emitir nuevas unidades.":
    "The issuer has paused the token: no new units can be minted.",
  "El emisor pausó el token: reanúdalo antes de conciliar pagos.":
    "The issuer paused the token: resume it before reconciling payments.",
  "El emisor se otorga MINTER_ROLE para firmar sus propios mint con su wallet; RWAXI no recibe ningún rol nuevo.":
    "The issuer grants itself MINTER_ROLE to sign its own mints with its wallet; RWAXI receives no new role.",
  "El expediente no está asociado a una oferta.": "The KYC file is not linked to an offering.",
  "El expediente no tiene un hash SHA-256 válido.": "The KYC file has no valid SHA-256 hash.",
  "El expediente ya está {status}; recarga la bandeja.": "The KYC file is {status}; reload the inbox.",
  "El hash del acuerdo no es válido.": "The agreement hash is not valid.",
  "El hook _update del token exige que el receptor esté en la whitelist: su approveInvestor() debe confirmarse antes.":
    "The token's _update hook requires the recipient to be on the whitelist: their approveInvestor() must be confirmed first.",
  "El inversionista no ha registrado una wallet.": "The investor has not registered a wallet.",
  "El inversionista no tiene una wallet válida.": "The investor has no valid wallet.",
  "El inversionista no ve el motivo: el portal sólo le indica que su verificación fue revocada.":
    "The investor does not see the reason: the portal only tells them their verification was revoked.",
  "El máximo por suscripción es {amount}.": "The maximum per subscription is {amount}.",
  "El Merkle Root del Data Room difiere del anclado on-chain.":
    "The Data Room Merkle Root differs from the one anchored on-chain.",
  "El Merkle Root se ancla al desplegar el token.": "The Merkle Root is anchored when the token is deployed.",
  "El nuevo estándar del patrimonio inmobiliario": "The new standard in real-estate ownership",
  "El Oficial de Cumplimiento de {name} revocó tu verificación: no se reciben nuevas suscripciones y el acceso al Data Room quedó cerrado. Para más información, comunícate directamente con el desarrollador.":
    "{name}'s Compliance Officer revoked your verification: no new subscriptions are accepted and your Data Room access has been closed. For more information, please contact the developer directly.",
  "El pasaporte tiene entre 6 y 12 caracteres alfanuméricos.":
    "The passport number has 6 to 12 alphanumeric characters.",
  "El portal de este desarrollador no está disponible desde la vitrina.":
    "This developer's portal is not available from the showcase.",
  "El portal opera normalmente, pero el proyecto no recibe tráfico desde la vitrina pública mientras termina la revisión.":
    "The portal is operating normally, but the project receives no traffic from the public showcase until the review is complete.",
  "El receptor del mint no es una dirección válida.": "The mint recipient is not a valid address.",
  "El receptor no es la wallet del inversionista de la suscripción.":
    "The recipient is not the wallet of the subscription's investor.",
  "El selector muestra {selected}, pero desde este host RLS sólo permite consultar {tenant}.":
    "The selector shows {selected}, but from this host RLS only allows querying {tenant}.",
  'El tenant "{slug}" no existe en la base de datos.': 'The tenant "{slug}" does not exist in the database.',
  "El SHA-256 recalculado en el servidor no coincide con el de tu navegador: el archivo no se guardó.":
    "The SHA-256 recomputed on the server does not match your browser's: the file was not saved.",
  "El tenant aún no tiene RwaxiComplianceRegistry desplegado.":
    "The tenant has no RwaxiComplianceRegistry deployed yet.",
  "El tenant no tiene un {role} activo.": "The tenant has no active {role}.",
  "El tenant ya tiene RwaxiComplianceRegistry desplegado.":
    "The tenant already has a RwaxiComplianceRegistry deployed.",
  "El tenant ya tiene RwaxiComplianceRegistry.": "The tenant already has a RwaxiComplianceRegistry.",
  "El ticket mínimo es {amount}.": "The minimum investment is {amount}.",
  "El token de {asset} aún no está desplegado. Emítelo desde Backoffice → Data Room y Minting para probar las reglas.":
    "The token for {asset} is not deployed yet. Issue it from Backoffice → Data Room & Minting to test the rules.",
  "El token de la oferta no está desplegado: la suscripción sigue como reserva.":
    "The offering's token is not deployed: the subscription remains a reservation.",
  "El token de la oferta no está desplegado: no hay tenedores a quienes distribuir.":
    "The offering's token is not deployed: there are no holders to distribute to.",
  "El token de la oferta se está desplegando.": "The offering's token is being deployed.",
  "El token destino no está desplegado.": "The target token is not deployed.",
  "El token se crea con {fn} al emitir desde el Backoffice → Data Room y Minting.":
    "The token is created with {fn} when issuing from the Backoffice → Data Room & Minting.",
  "El video dura {duration}: supera el máximo de 3:00":
    "The video runs {duration}: it exceeds the 3:00 maximum",
  "Elige tu oportunidad y firma tu NDA digital": "Choose your opportunity and sign your digital NDA",
  embargo: "court attachment",
  "Embudo legal y de cumplimiento": "Legal and compliance funnel",
  "Emisión de tokens": "Token issuance",
  "Emisión de unidades digitales con contrato OpenZeppelin permissioned, whitelist de inversionistas elegibles y sellado del Data Room con Merkle Root SHA-256.":
    "Issuance of digital units under a permissioned OpenZeppelin contract, a whitelist of eligible investors and sealing of the Data Room with a SHA-256 Merkle Root.",
  Emisor: "Issuer",
  "Emisor autónomo y relación contractual directa": "Independent issuer and direct contractual relationship",
  "Emisor:": "Issuer:",
  emitida: "minted",
  "Emitidas en wallet": "Minted to wallet",
  Emitido: "Issued",
  "Emitir (Mint) tokens con el adaptador RWAXI": "Issue (mint) tokens with the RWAXI adapter",
  emitirá: "will emit",
  "Empleado / asalariado": "Employee / salaried",
  "Empresario / socio de empresa": "Business owner / company partner",
  "en cola": "queued",
  "En curso": "In progress",
  "En estructuración": "In structuring",
  "En Estructuración / Construcción": "In Structuring / Under Construction",
  "En operación": "Operating",
  "En Operación / Rentando": "Operating / Income-Producing",
  "En producción el portal incrusta el reproductor del proveedor. En esta vista previa los reproductores externos están bloqueados: el portal muestra la vista interactiva y un enlace al video.":
    "In production the portal embeds the provider's player. In this preview external players are blocked: the portal shows the interactive view and a link to the video.",
  "en red": "on the network",
  "en red, firmada con tu wallet": "on the network, signed with your wallet",
  "En revisión": "Under review",
  "EN REVISIÓN": "UNDER REVIEW",
  "En revisión del Oficial de Cumplimiento": "Under review by the Compliance Officer",
  "En wallet": "In wallet",
  "En whitelist": "Whitelisted",
  "Entiendo que la TIR, las distribuciones y la valorización son escenarios estimados y que mi capital está sujeto a riesgo.":
    "I understand that the IRR, distributions and appreciation are estimated scenarios and that my capital is subject to risk.",
  Entornos: "Environments",
  "Entre 12 y 128 caracteres": "Between 12 and 128 characters",
  "Enviando tu expediente al Oficial de Cumplimiento…": "Sending your KYC file to the Compliance Officer…",
  "Enviar a revisión de cumplimiento": "Submit for compliance review",
  "Enviar código": "Send code",
  "Enviar otro código": "Send another code",
  "Envío RPC en curso ({hash}): «Procesar cola en orden» lo concilia con su recibo.":
    "RPC submission in progress ({hash}): “Process queue in order” reconciles it with its receipt.",
  "Envío RPC en curso ({hash}): aún sin recibo; «Procesar cola en orden» lo concilia.":
    "RPC submission in progress ({hash}): no receipt yet; “Process queue in order” reconciles it.",
  "Envío RPC reclamado sin tx hash: revisa el nodo antes de reintentar.":
    "RPC submission claimed without a tx hash: check the node before retrying.",
  "Esa referencia de pago ya se usó para otra suscripción de este tenant.":
    "That payment reference was already used for another subscription of this tenant.",
  "Esa transacción no fue exitosa en la red.": "That transaction did not succeed on the network.",
  "Esa wallet ya está registrada por otro inversionista de este portal.":
    "That wallet is already registered by another investor on this portal.",
  "Esa wallet ya tiene MINTER_ROLE en el token.": "That wallet already holds MINTER_ROLE on the token.",
  "Escenario base": "Base case",
  "Escenario base · E.A.": "Base case · effective annual",
  "Escenario Estimado": "Estimated Scenario",
  "Escenario Estimado con base en el modelo financiero del vehículo. No constituye oferta ni promesa de rentabilidad; el capital está sujeto a riesgo.":
    "Estimated Scenario based on the vehicle's financial model. It does not constitute an offer or a promise of returns; capital is subject to risk.",
  "Escenario Estimado.": "Estimated scenario.",
  "Escribe el código de 6 dígitos que muestra tu app de autenticación.":
    "Enter the 6-digit code shown by your authenticator app.",
  "Escribe el correo con el que firmaste el NDA.": "Enter the email you signed the NDA with.",
  "Escribe el correo con el que firmaste el NDA. Te enviaremos un código de 6 dígitos de un solo uso.":
    "Enter the email you signed the NDA with. We will send you a single-use 6-digit code.",
  "Escribe el nombre del documento.": "Enter the document name.",
  "Escribe nombres y apellidos como aparecen en el documento.":
    "Enter your first and last names as they appear on the document.",
  "Escribe tu correo y tu contraseña.": "Enter your email and password.",
  "Escribe tu nombre completo y un correo válido.": "Enter your full name and a valid email.",
  "Escribe un dominio primero": "Enter a domain first",
  "Escribe una dirección EVM válida: 0x seguido de 40 caracteres hexadecimales.":
    "Enter a valid EVM address: 0x followed by 40 hexadecimal characters.",
  "Ese archivo ya está en el Data Room de esta oferta.": "That file is already in this offering's Data Room.",
  "Ese código ya se usó. Espera el siguiente e inténtalo de nuevo.":
    "That code has already been used. Wait for the next one and try again.",
  "Ese documento ya está registrado por otro inversionista de este portal.":
    "That document is already registered by another investor on this portal.",
  España: "Spain",
  "Ese envío lo hizo otra wallet: lo concilia «Procesar cola en orden».":
    "Another wallet made that submission: “Process queue in order” reconciles it.",
  "Esta acción requiere el rol {role}.": "This action requires the {role} role.",
  "Esta dirección no corresponde a un tenant.": "This address does not match any tenant.",
  "Esta oferta aún no tiene distribuciones.": "This offering has no distributions yet.",
  "Esta operación no se ejecuta desde la cola del backoffice.":
    "This operation is not executed from the backoffice queue.",
  Estado: "Status",
  "Esta operación no se firma con wallet desde el backoffice.":
    "This operation is not signed with a wallet from the backoffice.",
  "Estado on-chain": "On-chain state",
  "Estados Unidos": "United States",
  Estándar: "Standard",
  "Este correo ya tiene un proceso de inversión en este portal. Para continuar en este navegador, usa «Recuperar mi sesión»: te enviaremos un código a ese correo.":
    "This email already has an investment process on this portal. To continue in this browser, use «Recover my session»: we will send a code to that email.",
  "Este desarrollador no está publicado en la vitrina.": "This developer is not published on the showcase.",
  "Este desarrollador no existe en la red RWAXI.": "This developer does not exist on the RWAXI network.",
  "Este documento no tiene archivo en la bóveda.": "This document has no file in the vault.",
  "Este enlace de activación no es válido, ya se usó o venció. Pide uno nuevo a RWAXI.":
    "This activation link is invalid, already used or expired. Ask RWAXI for a new one.",
  "Este navegador no pudo reproducir el archivo; se muestra la vista interactiva":
    "This browser could not play the file; showing the interactive view",
  "Este portal no existe": "This portal does not exist",
  "Este portal no tiene una oferta publicada.": "This portal has no published offering.",
  "Estructura de 4 capas": "4-layer structure",
  "Estudio de títulos": "Title study",
  "Expediente inválido.": "Invalid KYC file.",
  "Expediente no encontrado en este tenant.": "KYC file not found in this tenant.",
  "Expira en {time}": "Expires in {time}",
  "Explora las ofertas activas de cada desarrollador e ingresa a su portal exclusivo. Con un clic firmas el Acuerdo de Confidencialidad (NDA) electrónico para desbloquear la información reservada del proyecto.":
    "Explore each developer's active offerings and access its exclusive portal. With a single click, you sign the electronic Confidentiality Agreement (NDA) to unlock the project's confidential information.",
  "externa no verificada": "unverified external",
  Fachada: "Façade",
  "Factura {number} · {entries} asiento(s) · {total} USD": {
    one: "Invoice {number} · {entries} entry · {total} USD",
    other: "Invoice {number} · {entries} entries · {total} USD",
  },
  "Factura RWAXI emitida": "RWAXI invoice issued",
  "false · RWAXI no puede pausar, congelar ni ejecutar forcedTransfer":
    "false · RWAXI cannot pause, freeze or execute forcedTransfer",
  "Falta el SHA-256 del archivo calculado en tu navegador.":
    "The file's SHA-256 computed in your browser is missing.",
  Fecha: "Date",
  "Fecha (UTC)": "Date (UTC)",
  "fee RWAXI {fee} USD": "RWAXI fee {fee} USD",
  "fee RWAXI {fee} USD devengado": "RWAXI fee {fee} USD accrued",
  "fee RWAXI anulado": "RWAXI fee voided",
  "Fee RWAXI devengado": "Accrued RWAXI fee",
  "Ficha técnica": "Fact sheet",
  "Ficha técnica del inmueble": "Property technical data sheet",
  "Filtrar por etapa": "Filter by stage",
  Financiero: "Financial",
  "Finca Raíz Tradicional": "Traditional Real Estate",
  "Firma de mint del emisor · opcional": "Issuer-signed minting · optional",
  "Firma de NDA digital": "Digital NDA signature",
  "Firma del contrato del vehículo": "Vehicle agreement signature",
  "Firma del contrato y registro en PostgreSQL": "Agreement signature and PostgreSQL record",
  "Firma el NDA (Paso 1) para desbloquear el 100 % del Data Room.":
    "Sign the NDA (Step 1) to unlock 100% of the Data Room.",
  "Firma el NDA del proyecto para acceder a los documentos del Data Room.":
    "Sign the project's NDA to access the Data Room documents.",
  "Firma electrónica del contrato de suscripción": "Electronic signature of the subscription agreement",
  "Firma primero el NDA (Paso 1) para iniciar tu verificación.":
    "Sign the NDA first (Step 1) to start your verification.",
  "firma requerida: {role} → {contract} @ {address}": "signature required: {role} → {contract} @ {address}",
  "firma:": "signer:",
  Firmado: "Signed",
  "Firmado (UTC)": "Signed (UTC)",
  Firmante: "Signatory",
  "firmada en el navegador por {wallet}": "signed in the browser by {wallet}",
  "Firmar con mi wallet": "Sign with my wallet",
  "Firmar contrato del vehículo y suscribir": "Sign vehicle agreement and subscribe",
  "Firmar contrato y reservar unidades": "Sign agreement and reserve units",
  "Firmar NDA con un clic": "Sign NDA with one click",
  "Firmar y confirmar": "Sign and confirm",
  "Firmar y ejecutar": "Sign and execute",
  "Firmar y ejecutar (operador RWAXI)": "Sign and execute (RWAXI operator)",
  "Firmar y ejecutar mint": "Sign and execute mint",
  "Flujo de Caja y Rentabilidad": "Cash Flow & Returns",
  "Flujo mensual estimado": "Estimated monthly cash flow",
  "Flujos de renta + valorización": "Rental income + appreciation",
  "Formulario {regime} · {name}": "{regime} form · {name}",
  "Foto anterior": "Previous photo",
  "Foto siguiente": "Next photo",
  Fotografía: "Photograph",
  "Fotografía del activo": "Asset photo",
  "Fotografías cargadas en orden: Fachada, Interior, Zona Común, Ubicación":
    "Photos loaded in order: Façade, Interior, Common Area, Location",
  "Fotografías y Renders del Activo": "Asset Photos and Renderings",
  Fotos: "Photos",
  "Fraccionamiento en Papel": "Paper-Based Fractional Ownership",
  Frente: "Front",
  "frente del documento": "front of the document",
  "from (extraviada / embargada)": "from (lost / attached)",
  "from (titular)": "from (holder)",
  "Gerente de Proyecto": "Project Manager",
  "Gira la cabeza a la izquierda": "Turn your head to the left",
  "Gobierno Corporativo": "Corporate Governance",
  "Gobierno RWAXI · captación pausada": "RWAXI governance · capital raising paused",
  "Gobierno RWAXI · captación reanudada": "RWAXI governance · capital raising resumed",
  "Gobierno RWAXI · estado del portal": "RWAXI governance · portal status",
  "Gobierno RWAXI · publicación en vitrina": "RWAXI governance · showcase publication",
  Guardar: "Save",
  "grantRole(MINTER_ROLE) a la wallet del emisor {wallet} en cola":
    "grantRole(MINTER_ROLE) to the issuer's wallet {wallet} queued",
  "grantRole(MINTER_ROLE) en cola para tu wallet {wallet} en el token de {code}: fírmalo con esa wallet en la cola on-chain.":
    "grantRole(MINTER_ROLE) queued for your wallet {wallet} on the {code} token: sign it with that wallet in the on-chain queue.",
  "grantRole(MINTER_ROLE) en cola: fírmalo con tu wallet en la cola on-chain.":
    "grantRole(MINTER_ROLE) queued: sign it with your wallet in the on-chain queue.",
  "Guardar contraseña y continuar": "Save password and continue",
  "Habilitar MINTER_ROLE para mi wallet": "Enable MINTER_ROLE for my wallet",
  "Hash SHA-256 del documento": "Document SHA-256 hash",
  "Hay un setFrozen() en cola: fírmalo desde la cola on-chain.":
    "A setFrozen() is queued: sign it from the on-chain queue.",
  "Hay una transacción de este inversionista en curso en la red ({fn} · {hash}): concíliala antes de revocar.":
    "A transaction of this investor is in flight on the network ({fn} · {hash}): reconcile it before revoking.",
  "histórico (seed)": "historical (seed)",
  hoja: "leaf",
  "Hoja (SHA-256)": "Leaf (SHA-256)",
  "hoja = SHA-256(JSON canónico de la asignación: v, kind, distributionId, wallet, units, amountCents)":
    "leaf = SHA-256(canonical JSON of the allocation: v, kind, distributionId, wallet, units, amountCents)",
  "Hola, {name}:": "Hello {name},",
  Horizonte: "Horizon",
  "Identidad y ubicación": "Identity and location",
  Idioma: "Language",
  "Imagen de portada (thumbnail)": "Cover image (thumbnail)",
  "Imágenes de referencia generadas para este prototipo. Carga las fotografías del Data Room para reemplazarlas.":
    "Reference images generated for this prototype. Upload the Data Room photos to replace them.",
  "Información de identidad u origen de fondos desvirtuada o sin actualizar tras el requerimiento.":
    "Identity or source-of-funds information disproved, or not updated after the request.",
  "Informe del comité de inversiones": "Investment committee report",
  "Infraestructura digital": "Digital infrastructure",
  "infraestructura maestra RWAXI": "RWAXI master infrastructure",
  "Infraestructura Powered by": "Infrastructure Powered by",
  "Ingresos anuales": "Annual income",
  "Ingresos anuales estimados": "Estimated annual income",
  "Inicia sesión en el backoffice para consultar la cola on-chain.":
    "Sign in to the backoffice to view the on-chain queue.",
  "Inicia sesión en el backoffice para continuar.": "Sign in to the backoffice to continue.",
  "Inicia sesión en la consola RWAXI para continuar.": "Sign in to the RWAXI console to continue.",
  "Iniciar prueba de vida (simulada)": "Start liveness check (simulated)",
  "Iniciar sesión": "Sign in",
  "Inicio de sesión (contraseña + TOTP)": "Sign-in (password + TOTP)",
  "Inspector On-Chain": "On-Chain Inspector",
  "Inspector On-Chain (OpenZeppelin v5)": "On-Chain Inspector (OpenZeppelin v5)",
  Integridad: "Integrity",
  "Integridad de la bóveda comprometida": "Vault integrity compromised",
  "Integridad verificada en tu navegador (SHA-256 coincide)":
    "Integrity verified in your browser (SHA-256 matches)",
  "Intento de acceso fallido": "Failed sign-in attempt",
  Interior: "Interior",
  "Inversión Supercargada": "Supercharged Investment",
  "Inversión Supercargada en Blockchain": "Supercharged Investment on Blockchain",
  Inversionista: "Investor",
  "inversionista con NDA": "investor with NDA",
  "Inversionista demo": "Demo investor",
  "Inversionista Elegible": "Eligible Investor",
  "Inversionista inválido.": "Invalid investor.",
  "Inversionista no encontrado en este tenant.": "Investor not found in this tenant.",
  "Inversionista no residente: se solicitará registro de inversión extranjera.":
    "Non-resident investor: foreign investment registration will be requested.",
  "Inversionista revocado": "Investor revoked",
  "Invierte en bienes raíces de grado institucional en 4 pasos claros":
    "Invest in institutional-grade real estate in 4 clear steps",
  "Invitación de activación enviada": "Activation invitation sent",
  "Invitación de activación enviada a {email} ({role}) · vence {expires}":
    "Activation invitation sent to {email} ({role}) · expires {expires}",
  "Invitación de activación reenviada": "Activation invitation resent",
  "Invitación de activación reenviada a {email} ({role}) · vence {expires}":
    "Activation invitation resent to {email} ({role}) · expires {expires}",
  "Ir al inicio de sesión": "Go to sign-in",
  "Ir al Portal Oficial del Desarrollador": "Go to the Developer's Official Portal",
  "isFrozen(from) omitido en recuperación forzosa": "isFrozen(from) skipped in forced recovery",
  "ISSUER_ADMIN_ROLE o COMPLIANCE_OFFICER_ROLE · emisor":
    "ISSUER_ADMIN_ROLE or COMPLIANCE_OFFICER_ROLE · issuer",
  "JPG, PNG o PDF · máx. 10 MB": "JPG, PNG or PDF · max. 10 MB",
  "Jurídico y Tradición": "Legal & Title",
  "Justifica la decisión (entre {min} y {max} caracteres).":
    "Justify the decision (between {min} and {max} characters).",
  "Justificación del Oficial": "Officer's justification",
  "Justificación del Oficial (10–300 caracteres)": "Officer's justification (10–300 characters)",
  "KYC aprobado": "KYC approved",
  "KYC en revisión": "KYC under review",
  "KYC pendientes": "Pending KYC",
  "KYC rechazado": "KYC rejected",
  "KYC revocado": "KYC revoked",
  "KYC/AML + {regime}": "KYC/AML + {regime}",
  "La autorización de carga no es válida o venció: vuelve a cargar el archivo.":
    "The upload authorization is invalid or expired: upload the file again.",
  "La captación de esta oferta está pausada temporalmente por la plataforma: no se reciben nuevas suscripciones.":
    "Capital raising for this offering is temporarily paused by the platform: no new subscriptions are accepted.",
  "La captación de esta oferta está pausada temporalmente por la plataforma: no se reciben nuevas suscripciones. Las ya firmadas siguen su curso.":
    "Capital raising for this offering is temporarily paused by the platform: no new subscriptions are accepted. Subscriptions already signed proceed normally.",
  "La captación de este proyecto está pausada temporalmente.":
    "Capital raising for this project is temporarily paused.",
  "La carga llegó incompleta o no es un formulario válido; vuelve a intentarlo.":
    "The upload arrived incomplete or is not a valid form; please try again.",
  "La cédula tiene entre 6 y 10 dígitos, sin puntos.": "The cédula number has 6 to 10 digits, without dots.",
  "La cola no tiene transacciones pendientes.": "The queue has no pending transactions.",
  "La cola persistida se consulta desde el portal o el backoffice de un tenant ({host}).":
    "The persisted queue is queried from a tenant's portal or backoffice ({host}).",
  "La contraseña no cumple la política de seguridad.": "The password does not meet the security policy.",
  "La copia recibida no coincide con el SHA-256 anclado en el Data Room: no se abrió.":
    "The copy received does not match the SHA-256 anchored in the Data Room: it was not opened.",
  "La declaración de origen de fondos no tiene soporte suficiente para el rango de ingresos declarado.":
    "The source-of-funds declaration lacks sufficient support for the declared income bracket.",
  "La despliega el operador RWAXI desde la consola de plataforma (RWAXI_OPERATOR_ROLE).":
    "Deployed by the RWAXI operator from the platform console (RWAXI_OPERATOR_ROLE).",
  "La distribución debe sumar al menos 1 USD.": "The distribution must total at least 1 USD.",
  "La distribución ya no está DECLARED.": "The distribution is no longer DECLARED.",
  "La ejecución se autoriza desde el Backoffice del tenant.":
    "Execution is authorized from the tenant's Backoffice.",
  "La ejecuta el operador RWAXI (RWAXI_OPERATOR_ROLE) desde la consola de plataforma; sin registro el tenant no puede aprobar inversionistas.":
    "Executed by the RWAXI operator (RWAXI_OPERATOR_ROLE) from the platform console; without a registry the tenant cannot approve investors.",
  "La firma con wallet requiere modo RPC (CHAIN_EXECUTION=rpc): en simulación la cola la firma la clave de demostración.":
    "Wallet signing requires RPC mode (CHAIN_EXECUTION=rpc): in simulation the queue is signed by the demo key.",
  "La firma con wallet requiere modo RPC (CHAIN_EXECUTION=rpc).":
    "Wallet signing requires RPC mode (CHAIN_EXECUTION=rpc).",
  "La firma el rol {role}: inicia sesión con ese rol para ejecutarla.":
    "It is signed by the {role} role: sign in with that role to execute it.",
  "La firma genera un ConsentRecord con hash SHA-256 del texto aceptado, con validez probatoria según la Ley 527 de 1999.":
    "Signing generates a ConsentRecord with the SHA-256 hash of the accepted text, with evidentiary value under Law 527 of 1999.",
  "La foto del documento de identidad no es legible: el número y la fecha de expedición no coinciden con los datos registrados.":
    "The photo of the identity document is not legible: the number and the issue date do not match the data on record.",
  "La hora de la firma no es válida; recarga la página e inténtalo de nuevo.":
    "The signing time is not valid; reload the page and try again.",
  "La información de esta vitrina es referencial: no constituye oferta pública de valores ni recomendación o asesoría financiera, legal o tributaria. Los documentos vinculantes de cada proyecto están en el portal de su emisor: el Data Room se abre con la firma del NDA y la suscripción exige, además, la verificación KYC.":
    "The information on this showcase is for reference only: it does not constitute a public offering of securities or any financial, legal or tax recommendation or advice. The binding documents of each project are on its issuer's portal: the Data Room opens once the NDA is signed, and subscribing also requires KYC verification.",
  "La pantalla completa no está disponible en esta vista": "Full screen is not available in this view",
  "La raíz de esta distribución ya está anclada.": "This distribution's root is already anchored.",
  "La red {network} no conoce la transacción {hash}: revisa que tu wallet la haya enviado a {chain}.":
    "Network {network} does not know transaction {hash}: check that your wallet sent it to {chain}.",
  "La red no respondió a tiempo.": "The network did not respond in time.",
  "La red rechazaría la llamada desde tu wallet ({detail}): no se pidió ninguna firma.":
    "The network would reject the call from your wallet ({detail}): no signature was requested.",
  "La solicitud supera el tamaño máximo permitido.": "The request exceeds the maximum allowed size.",
  "La suscripción está {status}; recarga la bandeja.": "The subscription is {status}; reload the inbox.",
  "La suscripción está {status}: sólo se emite tras confirmar el pago.":
    "The subscription is {status}: tokens are only issued once the payment is confirmed.",
  "La suscripción no tiene el hash del contrato firmado.": "The subscription has no signed agreement hash.",
  "La suscripción se habilita cuando el Oficial de Cumplimiento aprueba tu verificación KYC/{sys} (Paso 3).":
    "Subscription is enabled once the Compliance Officer approves your KYC/{sys} verification (Step 3).",
  "La suscripción ya no está MINT_PENDING.": "The subscription is no longer MINT_PENDING.",
  "La transacción {hash} no corresponde a la operación en cola (contrato o calldata distintos).":
    "Transaction {hash} does not match the queued operation (different contract or calldata).",
  "La transacción de tu wallet revirtió en la red ({hash}): no se confirmó nada y la operación sigue en cola para firmarla de nuevo.":
    "Your wallet's transaction reverted on the network ({hash}): nothing was confirmed and the operation stays queued to be signed again.",
  "La transacción la firmó {from}, no tu wallet autorizada {expected}: no se registró nada.":
    "The transaction was signed by {from}, not by your authorized wallet {expected}: nothing was recorded.",
  "La transacción no emitió {event} con los argumentos en cola.":
    "The transaction did not emit {event} with the queued arguments.",
  "La transacción revirtió en la red ({hash}).": "The transaction reverted on the network ({hash}).",
  "La transacción se dirigió a {to}, no al contrato del tenant {expected}: no se registró nada.":
    "The transaction was sent to {to}, not to the tenant's contract {expected}: nothing was recorded.",
  "La transacción se firmó para la cadena {actual}, no para {chain} ({expected}): no se registró nada.":
    "The transaction was signed for chain {actual}, not for {chain} ({expected}): nothing was recorded.",
  "La transacción transfirió valor junto con la llamada: no se registró nada.":
    "The transaction transferred value along with the call: nothing was recorded.",
  "La transacción ya no está PENDING.": "The transaction is no longer PENDING.",
  "La wallet de la operación no es una dirección válida.": "The operation's wallet is not a valid address.",
  "La wallet está activa en el registro. Congelarla impide que transfiera sus tokens y que reciba nuevas suscripciones.":
    "The wallet is active in the registry. Freezing it stops it from transferring its tokens and from receiving new subscriptions.",
  "La wallet está congelada en el registro: no puede transferir ni recibir tokens.":
    "The wallet is frozen in the registry: it can neither transfer nor receive tokens.",
  "La wallet EVM no es válida.": "The EVM wallet is not valid.",
  "La wallet no está congelada.": "The wallet is not frozen.",
  "La wallet ya está congelada.": "The wallet is already frozen.",
  "Las contraseñas no coinciden.": "The passwords do not match.",
  "Las unidades reservadas se entregan en tu wallet cuando el desarrollador emite los tokens.":
    "Reserved units are delivered to your wallet when the developer issues the tokens.",
  "LeadReferral Token generado: {token}": "LeadReferral Token generated: {token}",
  "Leads totales": "Total leads",
  Legal: "Legal",
  "LEGAL_ENFORCEMENT_ROLE · emisor": "LEGAL_ENFORCEMENT_ROLE · issuer",
  "Leí el contrato de suscripción del vehículo y el Data Room del proyecto.":
    "I have read the vehicle's subscription agreement and the project's Data Room.",
  "Leí y acepto el Acuerdo de Confidencialidad con {name}.":
    "I have read and accept the Confidentiality Agreement with {name}.",
  "leyendo duración…": "reading duration…",
  "Licencia de construcción / uso de suelo": "Building permit / land use",
  "Licencias Técnicas": "Technical Licenses",
  "Lista para ejecutar: precedencia e invariantes verificadas.":
    "Ready to execute: precedence and invariants verified.",
  "Listas restrictivas": "Sanctions lists",
  "Live Calldata & Event Log": "Live Calldata & Event Log",
  Logo: "Logo",
  "Los datos consolidados sólo están disponibles en admin.rwaxirealestate.com.":
    "Consolidated data is only available at admin.rwaxirealestate.com.",
  "Los documentos KYC sólo los abren el Oficial de Cumplimiento y el Administrador del tenant.":
    "KYC documents can only be opened by the tenant's Compliance Officer and Administrator.",
  "Los referidos sólo se emiten desde la vitrina.": "Referrals are only issued from the showcase.",
  "Marca del desarrollador": "Developer brand",
  "Marca RWAXI": "RWAXI brand",
  "Más de {amount}": "More than {amount}",
  "más reciente primero": "most recent first",
  "Mayúsculas y minúsculas": "Upper- and lowercase letters",
  "Menos de {amount}": "Less than {amount}",
  "Merkle Root anclado": "Merkle Root anchored",
  "Merkle Root del Data Room:": "Data Room Merkle Root:",
  "Merkle Root SHA-256 vigente del Data Room": "Current Data Room SHA-256 Merkle Root",
  México: "Mexico",
  "MFA (TOTP) enrolado": "MFA (TOTP) enrolled",
  "MFA activo": "MFA active",
  "Mi portafolio": "My portfolio",
  "Mi portafolio en este proyecto": "My portfolio in this project",
  "Mint en cola": "Mint queued",
  "MINTER_ROLE · adaptador RWAXI, tras verificar el pago":
    "MINTER_ROLE · RWAXI adapter, after the payment is verified",
  "MINTER_ROLE solicitado para el emisor": "MINTER_ROLE requested for the issuer",
  "MINTER_ROLE sólo se otorga a la wallet registrada del Administrador que lo firma.":
    "MINTER_ROLE is only granted to the registered wallet of the Administrator who signs it.",
  "mintSubscription en cola": "mintSubscription queued",
  "mintSubscription() por cada suscripción aprobada ({n})":
    "mintSubscription() for each approved subscription ({n})",
  "mintSubscription(): {n} tokens {symbol}": "mintSubscription(): {n} {symbol} tokens",
  "Modelo Financiero": "Financial Model",
  "Modelo financiero (escenarios base y conservador)": "Financial model (base and conservative scenarios)",
  "Modelo financiero auditado, avalúo de referencia, escenarios base y conservador de renta y valorización, y política de distribuciones.":
    "Audited financial model, reference appraisal, base and conservative scenarios for rental income and appreciation, and distribution policy.",
  Moderado: "Moderate",
  "Modo del reproductor": "Player mode",
  "Modo RPC: el emisor firma anchorDistributionRoot con su propia wallet (RWAXI no custodia DISTRIBUTION_ROLE); registra luego su tx hash.":
    "RPC mode: the issuer signs anchorDistributionRoot with its own wallet (RWAXI does not hold DISTRIBUTION_ROLE); then register its tx hash.",
  "Modo RPC: el emisor firma updateDataRoomMerkleRoot con su propia wallet (RWAXI no custodia DATA_ROOM_ROLE); registra luego su tx hash.":
    "RPC mode: the issuer signs updateDataRoomMerkleRoot with its own wallet (RWAXI does not hold DATA_ROOM_ROLE); then register its tx hash.",
  "Modo RPC: el emisor se otorga MINTER_ROLE con su propia wallet (DEFAULT_ADMIN_ROLE del token); RWAXI no lo firma.":
    "RPC mode: the issuer grants itself MINTER_ROLE with its own wallet (the token's DEFAULT_ADMIN_ROLE); RWAXI does not sign it.",
  "Modo RPC: el nodo rechazó la transacción ({detail}).":
    "RPC mode: the node rejected the transaction ({detail}).",
  "Modo RPC: esta operación la firma el Oficial de Cumplimiento con su propia wallet (RWAXI no custodia COMPLIANCE_OFFICER_ROLE); registra luego su tx hash.":
    "RPC mode: this operation is signed by the Compliance Officer with their own wallet (RWAXI does not hold COMPLIANCE_OFFICER_ROLE); then register its tx hash.",
  "Modo RPC: falta RPC_URL_{network}.": "RPC mode: RPC_URL_{network} is missing.",
  "Modo RPC: no hay contrato desplegado en esa dirección de la red configurada.":
    "RPC mode: no contract is deployed at that address on the configured network.",
  Moneda: "Currency",
  Monto: "Amount",
  "Monto a suscribir": "Amount to subscribe",
  "Monto total ({currency})": "Total amount ({currency})",
  "Motivo de rechazo inválido.": "Invalid rejection reason.",
  "Motivo de revocación inválido.": "Invalid revocation reason.",
  "Motivo del rechazo": "Rejection reason",
  "Motivo del rechazo:": "Rejection reason:",
  "Nada ejecutable: {blocked} transacción(es) bloqueada(s)": {
    one: "Nothing executable: {blocked} transaction blocked",
    other: "Nothing executable: {blocked} transactions blocked",
  },
  "Naturaleza tecnológica B2B y no custodia": "Non-custodial B2B technology provider",
  "NDA · Paso 1 (Ley 527 de 1999)": "NDA · Step 1 (Law 527 of 1999)",
  "NDA firmado": "NDA signed",
  "NDA firmado · ConsentRecord registrado": "NDA signed · ConsentRecord recorded",
  "NDA firmado con {name}": "NDA signed with {name}",
  "NDA firmados": "NDA signatures",
  "Negocios Inmobiliarios.": "Real Estate Ventures.",
  "Ninguna oferta tiene su token desplegado todavía.": "No offering has its token deployed yet.",
  "NIT del desarrollador": "Developer's NIT",
  No: "No",
  "no desplegado": "not deployed",
  "No es PEP": "Not a PEP",
  "No es solo finca raíz fraccionada. Es una Inversión Supercargada.":
    "It's not just fractional real estate. It's a Supercharged Investment.",
  "No existe la distribución de ese distributionId.": "No distribution exists for that distributionId.",
  "No existe la suscripción de ese subscriptionId.": "No subscription exists for that subscriptionId.",
  "No hay proyectos publicados en esta etapa en este momento.":
    "No projects are currently published in this stage.",
  "No hay proyectos publicados en la vitrina en este momento.":
    "No projects are currently published on the showcase.",
  "No hay transacciones pendientes para este tenant.": "No pending transactions for this tenant.",
  "No hay unidades suficientes: quedan {n}.": "Not enough units available: {n} remaining.",
  "No iniciado": "Not started",
  "No necesitas ser experto en criptomonedas. En esta plataforma, la blockchain funciona como un libro contable incorruptible: sella con prueba matemática que los documentos del Data Room no han sido alterados, certifica que solo inversionistas verificados participan en el proyecto y registra tu participación y tus derechos económicos sin depender de hojas de cálculo manuales.":
    "You don't need to be a crypto expert. On this platform, the blockchain works as a tamper-proof ledger: it provides mathematical proof that the Data Room documents have not been altered, certifies that only verified investors take part in the project and records your stake and your economic rights without relying on manual spreadsheets.",
  "No se detectó una wallet EIP-1193 en este navegador (MetaMask, Rabby, Frame…).":
    "No EIP-1193 wallet was detected in this browser (MetaMask, Rabby, Frame…).",
  "No se encontró el archivo subido: vuelve a cargarlo.": "The uploaded file was not found: upload it again.",
  "No se encontró la red del registro de esta wallet.": "The network of this wallet's registry was not found.",
  "No se pudieron liberar las unidades comprometidas de la oferta.":
    "The offering's committed units could not be released.",
  "No se pudo abrir el documento. Inténtalo de nuevo.": "The document could not be opened. Please try again.",
  "No se pudo activar la cuenta. Inténtalo de nuevo.":
    "The account could not be activated. Please try again.",
  "No se pudo cargar tu progreso desde la base de datos.": "Could not load your progress from the database.",
  "No se pudo completar la recuperación. Inténtalo de nuevo.":
    "The recovery could not be completed. Please try again.",
  "No se pudo conciliar el pago. Inténtalo de nuevo.": "Could not reconcile the payment. Please try again.",
  "No se pudo contactar el servidor.": "Could not reach the server.",
  "No se pudo determinar la dirección del registro desplegado.":
    "Could not determine the address of the deployed registry.",
  "No se pudo ejecutar la transacción. Inténtalo de nuevo.":
    "Could not execute the transaction. Please try again.",
  "No se pudo generar el enlace al portal. Inténtalo de nuevo.":
    "The portal link could not be generated. Please try again.",
  "No se pudo guardar el archivo. Inténtalo de nuevo.": "The file could not be saved. Please try again.",
  "No se pudo guardar tu información. Inténtalo de nuevo.":
    "Could not save your information. Please try again.",
  "No se pudo iniciar sesión. Inténtalo de nuevo.": "Could not sign in. Please try again.",
  "No se pudo leer ChainTransaction desde la base de datos.":
    "Could not read ChainTransaction from the database.",
  "No se pudo leer el Data Room desde la base de datos.":
    "The Data Room could not be read from the database.",
  "No se pudo leer el token en la red.": "The token could not be read on the network.",
  "No se pudo leer la bandeja de cumplimiento desde la base de datos.":
    "Could not read the compliance inbox from the database.",
  "No se pudo leer la mesa de distribuciones desde la base de datos.":
    "Could not read the distributions desk from the database.",
  "No se pudo leer la mesa de suscripciones desde la base de datos.":
    "Could not read the subscriptions desk from the database.",
  "No se pudo preparar tu expediente.": "Could not prepare your KYC file.",
  "No se pudo registrar la decisión. Inténtalo de nuevo.": "Could not record the decision. Please try again.",
  "No se pudo subir {name} a la bóveda documental; inténtalo de nuevo.":
    "{name} could not be uploaded to the document vault; please try again.",
  "No se pudo subir el archivo a la bóveda documental.":
    "The file could not be uploaded to the document vault.",
  "No tienes una wallet registrada.": "You have no registered wallet.",
  "Nombre comercial": "Trade name",
  "Nombre completo": "Full name",
  "Nombre completo del firmante": "Signatory's full name",
  "Nombre del documento": "Document name",
  "Nombre del presentador": "Presenter name",
  "Nombre del token": "Token name",
  "Nombre del vehículo emisor": "Name of the issuing vehicle",
  "Nueva contraseña": "New password",
  "nueva raíz {root}": "new root {root}",
  "nueva wallet": "new wallet",
  "Nueva wallet de {name}": "New wallet for {name}",
  "Nuevas suscripciones suspendidas temporalmente.": "New subscriptions temporarily suspended.",
  NUEVO: "NEW",
  "Número de documento": "Document number",
  "O pega una URL de streaming": "Or paste a streaming URL",
  "Obligatorio para continuar.": "Required to continue.",
  "Ocultar asignaciones": "Hide allocations",
  "Ocultar prueba": "Hide proof",
  "Oferente responsable: {{ORGANIZATION_LEGAL_NAME}} · NIT {{ORGANIZATION_TAX_ID}}. Vehículo emisor: {{LEGAL_ENTITY_NAME}} ({{LEGAL_WRAPPER_TYPE}}). Régimen de cumplimiento: {{COMPLIANCE_REGIME}}. RWAXI actúa solo como proveedor de infraestructura tecnológica: no es parte de la oferta, no recibe recursos y no controla las unidades digitales emitidas.":
    "Responsible offeror: {{ORGANIZATION_LEGAL_NAME}} · NIT {{ORGANIZATION_TAX_ID}}. Issuing vehicle: {{LEGAL_ENTITY_NAME}} ({{LEGAL_WRAPPER_TYPE}}). Compliance regime: {{COMPLIANCE_REGIME}}. RWAXI acts solely as a technology infrastructure provider: it is not a party to the offering, does not receive funds and does not control the digital units issued.",
  Oferta: "Offering",
  "Oferta inválida.": "Invalid offering.",
  "Oferta no encontrada en este tenant.": "Offering not found in this tenant.",
  "Ofertas con token emitido": "Offerings with issued token",
  "Oficial de Cumplimiento": "Compliance Officer",
  operador: "operator",
  "Operación inusual o sospechosa reportada a la UIAF (ROS).":
    "Unusual or suspicious transaction reported to the UIAF (ROS).",
  "operador {address}": "operator {address}",
  "OPERATOR_PRIVATE_KEY no configurada": "OPERATOR_PRIVATE_KEY not configured",
  "OPERATOR_PRIVATE_KEY no está configurada (0x + 64 hex): no se puede firmar la cola.":
    "OPERATOR_PRIVATE_KEY is not configured (0x + 64 hex): the queue cannot be signed.",
  Oportunidades: "Opportunities",
  "orden de ejecución (más antigua primero)": "execution order (oldest first)",
  Origen: "Source",
  "Origen de fondos ({sys}) y perfil": "Source of funds ({sys}) and profile",
  "Origen lícito de fondos ({sys})": "Lawful source of funds ({sys})",
  "Origen: {from} → {to}": "Origin: {from} → {to}",
  "Otorgar MINTER_ROLE al emisor lo firma su wallet en modo RPC: en simulación no aplica.":
    "Granting MINTER_ROLE to the issuer is signed by its own wallet in RPC mode: it does not apply in simulation.",
  "Otra actividad": "Other activity",
  "Otra causal del sistema de cumplimiento del desarrollador.":
    "Other grounds under the developer's compliance system.",
  "Otra ejecución confirmó esta transacción primero.": "Another execution confirmed this transaction first.",
  "Otra ejecución RPC tomó esta transacción.": "Another RPC execution claimed this transaction.",
  "Otra ejecución tomó ese nonce o tx hash primero; vuelve a intentarlo.":
    "Another execution took that nonce or tx hash first; try again.",
  "Otra ejecución tomó esta transacción.": "Another execution claimed this transaction.",
  "Otro país": "Other country",
  "Otro revisor ya resolvió este expediente; recarga la bandeja.":
    "Another reviewer already resolved this KYC file; reload the inbox.",
  "Otro usuario ya concilió este pago; recarga la bandeja.":
    "Another user already reconciled this payment; reload the inbox.",
  "p. ej. {example}": "e.g. {example}",
  "Paga al vehículo del proyecto y recibe tus tokens": "Pay the project's vehicle and receive your tokens",
  "Pago a RWAXI registrado": "Payment to RWAXI recorded",
  "Pago conciliado ({reference}) · {units} unidades de {name}: mintSubscription() en cola":
    "Payment reconciled ({reference}) · {units} unit(s) for {name}: mintSubscription() queued",
  "Pago de la factura {number} · {date} · comprobante {receipt} · {total} USD":
    "Payment of invoice {number} · {date} · proof of payment {receipt} · {total} USD",
  "Pago fiduciario conciliado": "Fiduciary payment reconciled",
  "pago fiduciario pendiente": "fiduciary payment pending",
  "pago fiduciario pendiente · ref. {code}": "fiduciary payment pending · ref. {code}",
  "Pago pendiente": "Payment pending",
  "Pago y evidencia": "Payment & evidence",
  "Pago ya conciliado: reembolso pendiente al inversionista, fuera de la plataforma.":
    "Payment already reconciled: refund to the investor pending, outside the platform.",
  "Pagos por conciliar": "Payments to reconcile",
  "País de residencia": "Country of residence",
  "País de residencia no admitido.": "Country of residence not accepted.",
  Panamá: "Panama",
  "Pantalla completa": "Full screen",
  Parcial: "Partial",
  "Parpadea dos veces": "Blink twice",
  Participación: "Share",
  Pasaporte: "Passport",
  "Pasaporte · página de datos": "Passport · data page",
  "Paso {n}": "Step {n}",
  "PASO {n}": "STEP {n}",
  "Paso {n} / 04": "Step {n} / 04",
  "PASO {n} / 4": "STEP {n} / 4",
  "Paso {n} de 4 · {step}": "Step {n} of 4 · {step}",
  "Paso 1 · Acuerdo de Confidencialidad (NDA)": "Step 1 · Confidentiality Agreement (NDA)",
  "Paso 2 · Data Room inmobiliario": "Step 2 · Property Data Room",
  "Paso 3 · Verificación KYC/AML + {regime}": "Step 3 · KYC/AML + {regime} verification",
  "Paso 4 · Suscripción de tokens y portafolio": "Step 4 · Token subscription and portfolio",
  "Patrimonio Autónomo / Encargo Fiduciario": "Autonomous Trust Estate / Fiduciary Mandate",
  "pausado por el emisor": "paused by the issuer",
  Pausar: "Pause",
  "Pausar token · pause()": "Pause token · pause()",
  "pause() ejecutado por {name}": "pause() executed by {name}",
  "PDF, imagen, DOCX o XLSX · máx. 20 MB. El servidor recalcula el SHA-256 y rechaza el archivo si no coincide con el de tu navegador.":
    "PDF, image, DOCX or XLSX · max. 20 MB. The server recomputes the SHA-256 and rejects the file if it does not match your browser's.",
  "Pega un enlace https de Vimeo Pro, Cloudflare Stream o YouTube no listado":
    "Paste an https link from Vimeo Pro, Cloudflare Stream or unlisted YouTube",
  pendiente: "pending",
  Pendiente: "Pending",
  "Pendiente de consulta": "Screening pending",
  "pendiente de deployOfferingToken": "pending deployOfferingToken",
  "Pendiente de emisión": "Pending issuance",
  "Pendiente de emisión (reserva)": "Pending issuance (reservation)",
  "pendiente de pago": "pending payment",
  "Pendiente de revisión": "Pending review",
  "Pendiente de verificación": "Pending verification",
  Pendientes: "Pending",
  Pensionado: "Retiree",
  "PEP y términos": "PEP and terms",
  "PEP, PTEE y términos": "PEP, PTEE and terms",
  Perfil: "Profile",
  "Perfil de riesgo": "Risk profile",
  "Perfil de riesgo no admitido.": "Risk profile not accepted.",
  Periodo: "Period",
  "Periodo: mes (2026-09) o trimestre (2026-Q3).": "Period: month (2026-09) or quarter (2026-Q3).",
  "Persona Expuesta Políticamente": "Politically Exposed Person",
  "Personal autorizado de {name}: administración y cumplimiento.":
    "Authorized {name} staff: administration and compliance.",
  "personal del backoffice": "backoffice staff",
  Perú: "Peru",
  Pesos: "Pesos",
  "Pesos colombianos": "Colombian pesos",
  Plantilla: "Template",
  "Plantillas parametrizadas para revisión del área legal del desarrollador antes de publicar. Las variables entre llaves se reemplazan con los datos del tenant y del proyecto.":
    "Parameterized templates, to be reviewed by the developer's legal team before publishing. Variables in braces are replaced with the tenant's and the project's data.",
  "Plataforma protegida bajo estándares de debida diligencia y cumplimiento normativo (KYC/AML).":
    "Platform protected under due diligence and regulatory compliance standards (KYC/AML).",
  "Política de contraseñas": "Password policy",
  "Política de distribuciones": "Distribution policy",
  "Pólizas y estudios técnicos": "Insurance policies and technical studies",
  "por {email}": "by {email}",
  "Por decisión de gobierno de la plataforma, {name} no puede recibir nuevos NDA, verificaciones ni suscripciones. Si ya eres inversionista, tu portafolio y tus documentos siguen disponibles.":
    "Following a platform governance decision, {name} cannot receive new NDAs, verifications or subscriptions. If you are already an investor, your portfolio and your documents remain available.",
  "Por defecto el operador RWAXI envía {mint} con su MINTER_ROLE. Si el emisor lo prefiere, otorga {role} a la wallet registrada de su Administrador y firma sus propios mint con ella (EIP-1193). La concesión la firma esa misma wallet con {admin} del token: RWAXI no recibe ningún rol nuevo.":
    "By default the RWAXI operator sends {mint} with its MINTER_ROLE. If the issuer prefers, it grants {role} to its Administrator's registered wallet and signs its own mints with it (EIP-1193). That same wallet signs the grant with the token's {admin}: RWAXI receives no new role.",
  "Por defecto, el nombre del archivo": "Defaults to the file name",
  "Por renta": "From rental income",
  "Por renta · desde mes {month}": "From rental income · starting month {month}",
  "por revocación del KYC": "due to KYC revocation",
  "Portabilidad y Estándar Abierto No-Custodial": "Portability and a Non-Custodial Open Standard",
  "Portada del video: {title}": "Video cover: {title}",
  "Portada personalizada": "Custom cover",
  Portal: "Portal",
  "Portal {from} → {to}": "Portal {from} → {to}",
  "Portal del desarrollador en revisión": "Developer portal under review",
  "Portal en revisión por RWAXI": "Portal under review by RWAXI",
  "Portal inválido.": "Invalid portal.",
  "PORTAL OFICIAL": "OFFICIAL PORTAL",
  "Portal oficial del desarrollador": "Developer's official portal",
  "Portal suspendido temporalmente": "Portal temporarily suspended",
  "Portal temporalmente suspendido para nuevas operaciones":
    "Portal temporarily suspended for new operations",
  "Portal temporalmente suspendido para nuevas operaciones: no se pueden firmar nuevos NDA.":
    "Portal temporarily suspended for new operations: no new NDAs can be signed.",
  "Portal temporalmente suspendido para nuevas operaciones: no se reciben nuevas verificaciones.":
    "Portal temporarily suspended for new operations: no new verifications are accepted.",
  "Portal temporalmente suspendido para nuevas operaciones.":
    "Portal temporarily suspended for new operations.",
  "Portal White Label": "White Label portal",
  "PostgreSQL · ChainTransaction · RLS {tenant} · {n} transacción(es) · {order}": {
    one: "PostgreSQL · ChainTransaction · RLS {tenant} · {n} transaction · {order}",
    other: "PostgreSQL · ChainTransaction · RLS {tenant} · {n} transactions · {order}",
  },
  "PostgreSQL · RLS tnt_{slug} · sesión demo: {email}": "PostgreSQL · RLS tnt_{slug} · demo session: {email}",
  "PostgreSQL · RLS tnt_{slug} · sesión demo: {email} (Administrador)":
    "PostgreSQL · RLS tnt_{slug} · demo session: {email} (Administrator)",
  "PostgreSQL · RLS tnt_{slug} · sesión: {email} ({role})":
    "PostgreSQL · RLS tnt_{slug} · session: {email} ({role})",
  "Pre-venta": "Pre-sale",
  "Precio por unidad": "Price per unit",
  "Precio por unidad (USD)": "Price per unit (USD)",
  "Prelación: el approveInvestor() de esta wallet sigue PENDING; ejecútalo primero.":
    "Precedence: this wallet's approveInvestor() is still PENDING; execute it first.",
  "Prelación: hay un updateDataRoomMerkleRoot() anterior pendiente para este token.":
    "Precedence: an earlier updateDataRoomMerkleRoot() is pending for this token.",
  "Prelación: hay una operación anterior del registro pendiente para esta wallet.":
    "Precedence: an earlier registry operation is pending for this wallet.",
  "Prelación: hay una operación del registro pendiente para esta wallet.":
    "Precedence: a registry operation is pending for this wallet.",
  "Prelación: ya hay un grantRole(MINTER_ROLE) pendiente para esa wallet.":
    "Precedence: a grantRole(MINTER_ROLE) is already pending for that wallet.",
  "Preparando la operación…": "Preparing the operation…",
  "Presentación del desarrollador": "Developer's presentation",
  "Presentación oficial · {asset}": "Official presentation · {asset}",
  "PRESENTACIÓN OFICIAL DEL DESARROLLADOR · 03:00 MIN": "DEVELOPER'S OFFICIAL PRESENTATION · 03:00 MIN",
  Principal: "Main",
  "Prioriza preservar el capital y acepta rentas estimadas menores.":
    "Prioritizes capital preservation and accepts lower estimated rental income.",
  "Procesar cola en orden": "Process queue in order",
  "Procesar cola en orden ({ready}/{total} ejecutables)":
    "Process queue in order ({ready}/{total} executable)",
  "Profesional independiente": "Self-employed professional",
  "Programa de Transparencia y Ética Empresarial (PTEE)": "Business Transparency and Ethics Program (PTEE)",
  "Progreso del video": "Video progress",
  "Propiedad Programable y Rendimientos Exactos": "Programmable Ownership and Exact Payouts",
  "Proveedor detectado: {provider}": "Detected provider: {provider}",
  Proyecto: "Project",
  "Proyectos publicados por desarrolladores": "Projects published by developers",
  Prueba: "Proof",
  "Prueba biométrica facial": "Facial biometric check",
  "Prueba de vida": "Liveness check",
  "PTEE aceptado": "PTEE accepted",
  "Publicado en la vitrina RWAXI": "Published on the RWAXI showcase",
  "Quiero invertir en este proyecto — Completar KYC y Suscribir":
    "I want to invest in this project — Complete KYC and Subscribe",
  "Quiero invertir en este proyecto — Suscribir unidades": "I want to invest in this project — Subscribe for units",
  Quitar: "Remove",
  "Quitar {name}": "Remove {name}",
  "Raíz anclada": "Root anchored",
  "Raíz anclada · tx {hash} · {mode}": "Root anchored · tx {hash} · {mode}",
  "Raíz en cola": "Root queued",
  "Rango de ingresos no admitido.": "Income bracket not accepted.",
  "Razón social del desarrollador (oferente)": "Developer's legal name (offeror)",
  "Realizas tu aporte directamente a las cuentas bancarias o fiduciarias autorizadas del proyecto. Al conciliarse tu pago, el contrato inteligente emite tus tokens directamente en tu billetera digital (wallet), acreditando tu participación y habilitando el cobro de tus rendimientos.":
    "You make your contribution directly to the project's authorized bank or trust accounts. Once your payment is reconciled, the smart contract issues your tokens straight to your digital wallet, recording your stake and enabling you to collect your yields.",
  "Reanudar token · unpause()": "Resume token · unpause()",
  rechazado: "rejected",
  Rechazado: "Rejected",
  "Rechazar con motivo": "Reject with reason",
  "Rechazaste el cambio de red: esta operación se firma en {chain} (chainId {id}).":
    "You rejected the network switch: this operation is signed on {chain} (chainId {id}).",
  "Rechazaste la firma en tu wallet: no se envió ninguna transacción.":
    "You rejected the signature in your wallet: no transaction was sent.",
  "RECONOCIMIENTO DE LAS 4 CAPAS ESTRUCTURALES Y DE LA RECUPERACIÓN JUDICIAL O ADMINISTRATIVA\n\nAl suscribir declaro que entiendo y acepto que mi inversión se organiza en cuatro capas independientes:\n\nCapa 1 · Activo real. El activo subyacente es {{ASSET_NAME}}. Las unidades digitales no me otorgan propiedad directa sobre el inmueble.\n\nCapa 2 · Vehículo jurídico. El activo y sus flujos están aislados en {{LEGAL_ENTITY_NAME}}, estructurado como {{LEGAL_WRAPPER_TYPE}}, cuyo oferente y responsable es {{ORGANIZATION_LEGAL_NAME}}, NIT {{ORGANIZATION_TAX_ID}}. Mis derechos y obligaciones se rigen por el contrato de suscripción y los documentos constitutivos de ese vehículo.\n\nCapa 3 · Derecho económico. Adquiero una participación en los flujos de renta y en la valorización estimada del activo, en la proporción de mis unidades. Las cifras proyectadas son escenarios estimados y no promesas de rentabilidad; mi capital está sujeto a riesgo.\n\nCapa 4 · Infraestructura digital. Mis unidades se representan con el token {{TOKEN_SYMBOL}} en la red {{NETWORK}}, sobre contratos OpenZeppelin con whitelist de inversionistas aprobados por el desarrollador. La versión del Data Room que revisé corresponde al Merkle Root SHA-256 {{DATAROOM_MERKLE_ROOT}}. RWAXI provee esta infraestructura como Encargado Tecnológico y no es parte del vehículo.\n\nRecuperación judicial o administrativa (forcedTransfer). Acepto que, solo por orden judicial, decisión de autoridad administrativa competente o acto jurídico que lo justifique (por ejemplo, sucesión, embargo o pérdida acreditada de mis llaves privadas), el titular del LEGAL_ENFORCEMENT_ROLE de {{ORGANIZATION_LEGAL_NAME}} podrá transferir mis unidades a una wallet verificada mediante la función forcedTransfer. Cada ejecución registra on-chain el hash SHA-256 del acto que la soporta (legalActHash) y emite el evento ForcedRecoveryExecuted, verificable por cualquier interesado. RWAXI no puede ejecutar esta función.\n\nTransferencias. Entiendo que mis unidades solo pueden transferirse a wallets aprobadas en la whitelist del desarrollador; cualquier transferencia a una wallet no verificada será rechazada por el contrato.":
    "ACKNOWLEDGMENT OF THE 4 STRUCTURAL LAYERS AND OF JUDICIAL OR ADMINISTRATIVE RECOVERY\n\nBy subscribing, I declare that I understand and accept that my investment is organized into four independent layers:\n\nLayer 1 · Real asset. The underlying asset is {{ASSET_NAME}}. The digital units do not grant me direct ownership of the property.\n\nLayer 2 · Legal vehicle. The asset and its cash flows are isolated in {{LEGAL_ENTITY_NAME}}, structured as {{LEGAL_WRAPPER_TYPE}}, whose offeror and responsible party is {{ORGANIZATION_LEGAL_NAME}}, NIT {{ORGANIZATION_TAX_ID}}. My rights and obligations are governed by the subscription agreement and the constitutive documents of that vehicle.\n\nLayer 3 · Economic right. I acquire a share in the rental income flows and in the estimated appreciation of the asset, in proportion to my units. The projected figures are estimated scenarios and not promises of returns; my capital is subject to risk.\n\nLayer 4 · Digital infrastructure. My units are represented by the {{TOKEN_SYMBOL}} token on the {{NETWORK}} network, on OpenZeppelin contracts with a whitelist of investors approved by the developer. The version of the Data Room that I reviewed corresponds to the SHA-256 Merkle Root {{DATAROOM_MERKLE_ROOT}}. RWAXI provides this infrastructure as Technology Processor and is not a party to the vehicle.\n\nJudicial or administrative recovery (forcedTransfer). I accept that, solely by court order, a decision of a competent administrative authority or a legal act that justifies it (for example, succession, court attachment or proven loss of my private keys), the holder of the LEGAL_ENFORCEMENT_ROLE of {{ORGANIZATION_LEGAL_NAME}} may transfer my units to a verified wallet through the forcedTransfer function. Each execution records on-chain the SHA-256 hash of the act supporting it (legalActHash) and emits the ForcedRecoveryExecuted event, verifiable by any interested party. RWAXI cannot execute this function.\n\nTransfers. I understand that my units can only be transferred to wallets approved on the developer's whitelist; any transfer to an unverified wallet will be rejected by the smart contract.",
  "Reconozco expresamente las 4 Capas Estructurales de esta inversión y la función de recuperación judicial o administrativa (forcedTransfer) descritas arriba.":
    "I expressly acknowledge the 4 Structural Layers of this investment and the judicial or administrative recovery function (forcedTransfer) described above.",
  "Recuperación ejecutada: {n} {symbol} → {wallet}": "Recovery executed: {n} {symbol} → {wallet}",
  "Recuperar mi sesión": "Recover my session",
  Red: "Network",
  "Red blockchain": "Blockchain network",
  Redes: "Networks",
  Reemplazar: "Replace",
  "reembolso del pago fiduciario pendiente": "fiduciary payment refund pending",
  "Ref. {code}": "Ref. {code}",
  "Ref. esperada": "Expected ref.",
  "Referencia del comprobante fiduciario": "Fiduciary proof of payment reference",
  "Referencia del comprobante inválida: 4 a 64 caracteres (letras, números, espacio y . _ / # -).":
    "Invalid proof of payment reference: 4 to 64 characters (letters, numbers, space and . _ / # -).",
  "Referencia esperada en la transferencia": "Expected transfer reference",
  "Referencia para la transferencia fiduciaria": "Fiduciary transfer reference",
  "Referido desde RWAXI": "Referred from RWAXI",
  "Referidos por RWAXI": "Referred by RWAXI",
  Refrescar: "Refresh",
  "Régimen actualizado: {regime}": "Regime updated: {regime}",
  "Régimen de cumplimiento": "Compliance regime",
  "Régimen de Cumplimiento del Oferente": "Offeror's Compliance Regime",
  "Registrar tx": "Register tx",
  "Registrar tx del emisor": "Register issuer tx",
  "Registrar tx del Oficial": "Register Officer tx",
  "Registrar un tx hash externo sólo aplica en modo RPC.":
    "Registering an external tx hash only applies in RPC mode.",
  "Registro de auditoría · append-only": "Audit trail · append-only",
  "Registro Inmutable en Blockchain": "Immutable Blockchain Record",
  "Registro on-chain y certificado": "On-chain record and certificate",
  "Reglamento de asamblea de inversionistas": "Investors' assembly rules",
  "Render ilustrativo": "Illustrative rendering",
  "Render ilustrativo · referencia visual": "Illustrative rendering · visual reference",
  "Rentas y Valorización.": "Income and Appreciation.",
  "Rentista de capital (inversiones, arriendos)": "Capital income earner (investments, rentals)",
  Reproducir: "Play",
  "Reproducir video": "Play video",
  "Requerido para ver detalles reservados": "Required to view confidential details",
  "Requerimiento de una autoridad competente.": "Order from a competent authority.",
  "Requiere corrección": "Correction required",
  "Requiere NDA": "Requires NDA",
  "Requisito para invertir: identidad, biometría y origen de fondos":
    "Required to invest: identity, biometrics and source of funds",
  "reserva (token no emitido)": "reservation (token not issued)",
  "Reserva de unidades en el registro del vehículo": "Unit reservation in the vehicle's register",
  "Reserva hasta la emisión de tokens": "Reservation until token issuance",
  "Reserva pre-venta": "Pre-sale reservation",
  "Reserva registrada: {n} unidades": {
    one: "Reservation recorded: {n} unit",
    other: "Reservation recorded: {n} units",
  },
  "Reserva registrada: {units} unidades (el token aún no está emitido)":
    "Reservation recorded: {units} unit(s) (the token has not been issued yet)",
  "reservada (pre-venta, sin token)": "reserved (pre-sale, no token)",
  Reservado: "Reserved",
  "Reservado · con NDA": "Confidential · with NDA",
  "Reservas pre-venta": "Pre-sale reservations",
  Residencia: "Residence",
  "Residente en Colombia: aplica régimen cambiario local.":
    "Resident in Colombia: the local foreign exchange regime applies.",
  Respaldo: "Backing",
  "Respaldo Inmutable y Auditoría en Tiempo Real": "Immutable Proof and Real-Time Auditing",
  "Respaldo Jurídico Real.": "Real Legal Backing.",
  "Responsable del tratamiento y la debida diligencia: {name} · NIT {nit} · Oficial de Cumplimiento del desarrollador.":
    "Responsible for data processing and due diligence: {name} · NIT {nit} · the developer's Compliance Officer.",
  "Restaurar plantilla oficial": "Restore official template",
  "Restricciones activas: solo wallets en la whitelist de este tenant · tope maxSupplyCap · pausable por el desarrollador · capitalización total {total}.":
    "Active restrictions: only wallets on this tenant's whitelist · maxSupplyCap limit · pausable by the developer · total capitalization {total}.",
  Resumen: "Summary",
  "Resumen de estructura del vehículo": "Vehicle structure summary",
  "Retirado de la vitrina RWAXI": "Withdrawn from the RWAXI showcase",
  "Retorno estimado acumulado por año": "Estimated cumulative return by year",
  "Retorno total estimado": "Estimated total return",
  Reverso: "Back",
  "reverso del documento": "back of the document",
  "Revert On-Chain: {reason}": "On-Chain Revert: {reason}",
  "Revertiría: DistributionAlreadyAnchored(distributionId).":
    "Would revert: DistributionAlreadyAnchored(distributionId).",
  "Revertiría: EmptyDistributionRoot().": "Would revert: EmptyDistributionRoot().",
  "Revertiría: EmptyDossierHash() — el expediente no tiene hash.":
    "Would revert: EmptyDossierHash() — the KYC file has no hash.",
  "Revertiría: EnforcedPause() — el emisor pausó el token.":
    "Would revert: EnforcedPause() — the issuer paused the token.",
  "Revertiría: InvalidWallet() — la wallet es address(0).":
    "Would revert: InvalidWallet() — the wallet is address(0).",
  "Revertiría: InvestorNotApproved(wallet) — la wallet no está aprobada en el registro.":
    "Would revert: InvestorNotApproved(wallet) — the wallet is not approved in the registry.",
  "Revertiría: la wallet está congelada (isEligible = false).":
    "Would revert: the wallet is frozen (isEligible = false).",
  "Revertiría: RWAXI Compliance: Receiver wallet is not approved in Tenant Whitelist.":
    "Would revert: RWAXI Compliance: Receiver wallet is not approved in Tenant Whitelist.",
  "Revertiría: SubscriptionAlreadyProcessed(subscriptionId).":
    "Would revert: SubscriptionAlreadyProcessed(subscriptionId).",
  "Revertiría: SupplyCapExceeded({requested}, {available}).":
    "Would revert: SupplyCapExceeded({requested}, {available}).",
  "Revertiría: TenantAlreadyRegistered(organizationId).":
    "Would revert: TenantAlreadyRegistered(organizationId).",
  "Revisa nombre, símbolo (2–6 letras mayúsculas), unidades y precio":
    "Check name, symbol (2–6 uppercase letters), units and price",
  "Revisado por": "Reviewed by",
  "Revisar formulario": "Review form",
  "Revocación del KYC por cumplimiento: unidades liberadas": "KYC revoked by compliance: units released",
  "Revocada por cumplimiento": "Revoked by compliance",
  revocado: "revoked",
  Revocado: "Revoked",
  "Revocar inversionista": "Revoke investor",
  "revokeInvestor en cola": "revokeInvestor queued",
  "Rompe las fronteras geográficas y accede desde cualquier lugar a negocios inmobiliarios institucionales con tickets accesibles, sin trámites notariales presenciales.":
    "Break through geographic borders and access institutional real-estate deals from anywhere, with accessible minimum investments and no in-person notary procedures.",
  "Ronda de suscripción para inversionistas elegibles, registro on-chain de la titularidad y distribuciones periódicas en USDC o transferencia bancaria.":
    "Subscription round for eligible investors, on-chain record of ownership and periodic distributions in USDC or by bank transfer.",
  "RPC · nodo configurado": "RPC · configured node",
  "RPC: RWAXI envía mintSubscription; el Oficial firma el registro y el emisor las raíces de distribución con sus wallets":
    "RPC: RWAXI sends mintSubscription; the Officer signs the registry calls and the issuer the distribution roots, each with their own wallet",
  "Ruta de estructuración": "Structuring roadmap",
  "RWAXI · CARGANDO PLATAFORMA": "RWAXI · LOADING PLATFORM",
  "RWAXI · CARGANDO TU PROCESO": "RWAXI · LOADING YOUR PROCESS",
  "RWAXI actúa como canal de descubrimiento y proveedor de infraestructura tecnológica. Cada oferta, vehículo y proceso de cumplimiento es responsabilidad del desarrollador. Proyectos, cifras y entidades son ilustrativos.":
    "RWAXI acts as a discovery channel and technology infrastructure provider. Each offering, vehicle and compliance process is the responsibility of the developer. Projects, figures and entities are illustrative.",
  "RWAXI es un proveedor de software como servicio (SaaS) para desarrolladores y un canal de descubrimiento. No es sociedad fiduciaria, establecimiento bancario, sociedad comisionista de bolsa ni intermediario del mercado de valores; no capta recursos del público, no recibe los aportes de los inversionistas y no custodia llaves privadas ni activos digitales.":
    "RWAXI is a software-as-a-service (SaaS) provider for developers and a discovery channel. It is not a trust company, a bank, a broker-dealer or a securities market intermediary; it does not raise funds from the public, does not receive investors' contributions and does not hold private keys or digital assets in custody.",
  "RWAXI REAL ESTATE — COINVERSIÓN INMOBILIARIA TOKENIZADA EN COLOMBIA":
    "RWAXI REAL ESTATE — TOKENIZED REAL-ESTATE CO-INVESTMENT IN COLOMBIA",
  "RWAXI_OPERATOR_ROLE · operador RWAXI": "RWAXI_OPERATOR_ROLE · RWAXI operator",
  "RWAXI, ir a oportunidades": "RWAXI, go to opportunities",
  "RwaxiTenantFactory.deployOfferingToken() con el adaptador RWAXI":
    "RwaxiTenantFactory.deployOfferingToken() with the RWAXI adapter",
  "SaaS mensual": "monthly SaaS",
  "SAGRILAFT + PTEE (Sector Real / Constructoras - Supersociedades)":
    "SAGRILAFT + PTEE (Real Sector / Construction Companies - Supersociedades)",
  Salida: "Exit",
  "SARLAFT (Entidades Vigiladas Superfinanciera / Fiduciarias)":
    "SARLAFT (Superfinanciera-Supervised Entities / Trust Companies)",
  "Se cancelarán {n} suscripción(es) sin emitir ({units} unidades vuelven a la oferta; {paid} con pago conciliado a reembolsar), se cerrará su acceso al Data Room y se retirará de la whitelist con revokeInvestor(). El inversionista no verá el motivo.": {
    one: "{n} unminted subscription will be cancelled ({units} units go back to the offering; {paid} with a reconciled payment to refund), their Data Room access will be closed and they will be removed from the whitelist with revokeInvestor(). The investor will not see the reason.",
    other: "{n} unminted subscriptions will be cancelled ({units} units go back to the offering; {paid} with a reconciled payment to refund), their Data Room access will be closed and they will be removed from the whitelist with revokeInvestor(). The investor will not see the reason.",
  },
  "Se desbloquea al firmar el NDA": "Unlocks when you sign the NDA",
  "Se habilita con tu KYC aprobado": "Enabled once your KYC is approved",
  "Según tu wallet, la cuenta {account} no tiene {role} en el contrato {contract}: no se pidió ninguna firma.":
    "According to your wallet, account {account} does not hold {role} on contract {contract}: no signature was requested.",
  "Seguridad Jurídica": "Legal Certainty",
  "Selecciona el texto para copiarlo": "Select the text to copy it",
  "Selecciona la actividad económica principal.": "Select the main economic activity.",
  "Selecciona tu perfil de riesgo.": "Select your risk profile.",
  "selecciona un archivo": "select a file",
  "Selecciona un rango de ingresos.": "Select an income bracket.",
  "Selecciona una opción": "Select an option",
  "Seleccionar color": "Select color",
  "Sellos de confianza": "Trust seals",
  Sesión: "Session",
  "Sesión del inversionista recuperada con código": "Investor session recovered with a code",
  "Sesión demo": "Demo session",
  "Sesión recuperada.": "Session recovered.",
  setup: "setup",
  "setFrozen en cola": "setFrozen queued",
  "setFrozen(false) en cola": "setFrozen(false) queued",
  "setFrozen(true) en cola": "setFrozen(true) queued",
  "SHA-256 alta": "Onboarding SHA-256",
  "SHA-256 contrato de suscripción": "Subscription agreement SHA-256",
  "SHA-256 decisión": "Decision SHA-256",
  "SHA-256 del contrato firmado": "Signed agreement SHA-256",
  "SHA-256 del expediente": "KYC file SHA-256",
  "SHA-256 documento": "Document SHA-256",
  "SHA-256 esperado": "Expected SHA-256",
  "SHA-256 evento": "Event SHA-256",
  "SHA-256 expediente": "KYC file SHA-256",
  "SHA-256 factura": "Invoice SHA-256",
  "SHA-256 pago": "Payment SHA-256",
  "SHA-256 verificado en tu navegador": "SHA-256 verified in your browser",
  Sí: "Yes",
  "SHA-256 solicitud": "Request SHA-256",
  "Si ese correo tiene un proceso en este portal, te enviamos un código de 6 dígitos. Vence en 10 minutos.":
    "If that email has a process on this portal, we have sent you a 6-digit code. It expires in 10 minutes.",
  "Si no lo pediste, ignora este correo: sin el código nadie puede entrar a tu proceso.":
    "If you did not request it, ignore this email: without the code no one can access your process.",
  "Signed URL temporal": "Temporary Signed URL",
  Silenciar: "Mute",
  Símbolo: "Symbol",
  "Símbolo del token": "Token symbol",
  simulación: "simulation",
  "SIMULACIÓN · firmada, sin difundir": "SIMULATION · signed, not broadcast",
  "SIMULACIÓN DE ARQUITECTURA": "ARCHITECTURE SIMULATION",
  "simulación determinista · firmada sin difundir": "deterministic simulation · signed, not broadcast",
  "Simulación determinista del estado de los contratos; el código fuente es real y compila con solc 0.8.24. Direcciones y hashes de transacción son de demostración; los hashes SHA-256 de documentos, NDA y KYC se calculan en tu navegador.":
    "Deterministic simulation of the contracts' state; the source code is real and compiles with solc 0.8.24. Addresses and transaction hashes are demonstration values; the SHA-256 hashes of documents, NDA and KYC are computed in your browser.",
  "Simulación determinista: firma EIP-1559 con OPERATOR_PRIVATE_KEY, sin difundir a la red":
    "Deterministic simulation: EIP-1559 signature with OPERATOR_PRIVATE_KEY, not broadcast to the network",
  "simulación firmada (sin difundir)": "signed simulation (not broadcast)",
  "simulación firmada, nonce {nonce}": "signed simulation, nonce {nonce}",
  "Simulación: la aprobación ocurre en el Backoffice aislado del desarrollador.":
    "Simulation: approval takes place in the developer's isolated Backoffice.",
  "Simulación: no se despliega ningún contrato real.": "Simulation: no real contract is deployed.",
  "simulada (sin proveedor biométrico)": "simulated (no biometric provider)",
  Simulador: "Simulator",
  "Simulador financiero": "Financial simulator",
  "sin archivo": "no file",
  "Sin archivo": "No file",
  "Sin archivo en la bóveda": "No file in the vault",
  "sin cambios": "no changes",
  "Sin cobro hasta desplegar el token": "No charge until the token is deployed",
  "Sin coincidencias": "No matches",
  "Sin configurar": "Not configured",
  "Sin emitir": "Not issued",
  "sin iniciar": "not started yet",
  "Sin oferta pública no autorizada ni asesoría financiera": "No unauthorized public offering or financial advice",
  "Sin transacciones para este tenant.": "No transactions for this tenant.",
  "Sin tu nombre, tu correo, el nombre de la empresa ni «rwaxi»":
    "Without your name, your email, the company name or «rwaxi»",
  "sin tx hash": "no tx hash",
  "sin tx hash · no enviada": "no tx hash · not sent",
  "sin valor": "no value",
  "Sin wallets aprobadas todavía.": "No approved wallets yet.",
  "sincronizado con el Data Room ({n} documentos)": {
    one: "synced with the Data Room ({n} document)",
    other: "synced with the Data Room ({n} documents)",
  },
  "Solicitud de {name} rechazada con motivo": "Application from {name} rejected with reason",
  "Solicitud inválida.": "Invalid request.",
  "Solo el ISSUER_ADMIN_ROLE o el COMPLIANCE_OFFICER_ROLE de {name} pueden pausar el token. RWAXI no tiene esta facultad.":
    "Only the ISSUER_ADMIN_ROLE or the COMPLIANCE_OFFICER_ROLE of {name} can pause the token. RWAXI does not hold this power.",
  "Sólo las operaciones que firma el tenant con su wallet (registro de cumplimiento, raíces y MINTER_ROLE del emisor) se registran por hash.":
    "Only the operations the tenant signs with its own wallet (compliance registry, the issuer's roots and MINTER_ROLE) are registered by hash.",
  "Solo lectura: tu rol es {role}; estas acciones requieren el rol {required}.":
    "Read-only: your role is {role}; these actions require the {required} role.",
  "Sólo se congela la wallet de un inversionista con tokens emitidos.":
    "Only the wallet of an investor holding minted tokens can be frozen.",
  "Sólo se revoca un inversionista aprobado; el expediente está {status}.":
    "Only an approved investor can be revoked; the KYC file is {status}.",
  "SPV Sociedad por Acciones Simplificada (S.A.S.)": "SPV Simplified Stock Company (S.A.S.)",
  Streaming: "Streaming",
  "Sube la foto del frente del documento.": "Upload a photo of the front of the document.",
  "Sube la foto del reverso de la cédula.": "Upload a photo of the back of the cédula.",
  "Subir portada": "Upload cover",
  "Subir y verificar documento": "Upload and verify document",
  "super._update(): saldo actualizado": "super._update(): balance updated",
  "Supera 3:00. Recórtalo antes de publicar.": "Exceeds 3:00. Trim it before publishing.",
  "Supera el proceso KYC y suscribe tus unidades": "Pass the KYC check and subscribe for your units",
  "Superintendencia de Sociedades": "Superintendency of Companies (Supersociedades)",
  "Superintendencia Financiera": "Financial Superintendency of Colombia",
  "Suscribir este monto": "Subscribe for this amount",
  Suscripción: "Subscription",
  "Suscripción cancelada": "Subscription cancelled",
  "Suscripción firmada: {units} unidades reservadas · transfiere el pago con la referencia {code}":
    "Subscription signed: {units} unit(s) reserved · transfer the payment using reference {code}",
  "Suscripción inválida.": "Invalid subscription.",
  "Suscripción no encontrada en este tenant.": "Subscription not found in this tenant.",
  "Suscripción registrada": "Subscription recorded",
  "Suscripción y portafolio": "Subscription and portfolio",
  "Suscripciones · conciliación fiduciaria": "Subscriptions · fiduciary reconciliation",
  "Suscripciones y Pagos": "Subscriptions & Payments",
  "SUSPENDED en la Consola RWAXI · el contrato no se modifica":
    "SUSPENDED in the RWAXI Console · the contract is not modified",
  SUSPENDIDO: "SUSPENDED",
  "Tal como aparece en el documento de identidad.": "Exactly as it appears on the identity document.",
  Tamaño: "Size",
  "Tarifas pactadas: {changes}": "Agreed fees: {changes}",
  "Tarifas RWAXI actualizadas": "RWAXI fees updated",
  "Tasa COP/USD": "COP/USD rate",
  "Teaser financiero del proyecto": "Project financial teaser",
  Tecnología: "Technology",
  "Tenant admin": "Tenant admin",
  "Tenedores de {code}": "{code} holders",
  "Tenedores de la oferta": "Offering holders",
  "Términos de Coinversión": "Co-investment Terms",
  "Texto legal del desarrollador en su idioma original (español): es la versión vinculante que aceptas.":
    "Developer's legal text in its original language (Spanish): this is the binding version you accept.",
  "Texto legal del desarrollador en su idioma original (español): es la versión vinculante que firmas.":
    "Developer's legal text in its original language (Spanish): this is the binding version you sign.",
  "Ticket desde": "Invest from",
  "Ticket mínimo": "Minimum investment",
  "Ticket Mínimo": "Minimum Investment",
  Tipo: "Type",
  "Tipo de archivo no admitido: usa {types}.": "File type not supported: use {types}.",
  "Tipo de documento": "Document type",
  "Tipo de documento no admitido.": "Document type not accepted.",
  "Tipo de vehículo jurídico (Legal Wrapper)": "Legal vehicle type (Legal Wrapper)",
  "TIR Estimada": "Estimated IRR",
  "TIR, distribuciones y valorización son escenarios estimados con base en el modelo financiero de cada vehículo; el desempeño real puede ser inferior y el capital invertido está sujeto a riesgo. Valores en COP calculados con TRM de referencia de COP {trm} / USD.":
    "IRR, distributions and appreciation are estimated scenarios based on each vehicle's financial model; actual performance may be lower and invested capital is subject to risk. COP values calculated at a reference TRM of COP {trm} / USD.",
  Titular: "Holder",
  "Titular: wallet {wallet} · {units} unidades": {
    one: "Holder: wallet {wallet} · {units} unit",
    other: "Holder: wallet {wallet} · {units} units",
  },
  "Título del video": "Video title",
  "to (nueva wallet del titular)": "to (holder's new wallet)",
  "Toda inversión inmobiliaria implica riesgos, incluida la pérdida parcial o total del capital y una liquidez limitada. Las tasas de TIR, distribución y valorización proyectadas son estimaciones de cada desarrollador y no garantizan rendimientos fijos ni futuros.":
    "Every real-estate investment involves risks, including the partial or total loss of capital and limited liquidity. The projected IRR, distribution and appreciation rates are each developer's estimates and do not guarantee fixed or future returns.",
  Todas: "All",
  Todos: "All",
  "Todos los tenants": "All tenants",
  Token: "Token",
  "Tokenización y Salida": "Tokenization & Exit",
  "Tokens emitidos": "Tokens minted",
  "Transacción de whitelist:": "Whitelist transaction:",
  "Transacción enviada ({hash}): aún sin recibo en la red; verifícala en unos segundos.":
    "Transaction sent ({hash}): no receipt on the network yet; verify it in a few seconds.",
  "Transacción exitosa": "Transaction successful",
  "Transacción inválida.": "Invalid transaction.",
  "Transacción no encontrada en este tenant.": "Transaction not found in this tenant.",
  "Transacción on-chain confirmada": "On-chain transaction confirmed",
  "Transferencia de tokens a tu wallet": "Token transfer to your wallet",
  "Tratamiento de Datos Personales": "Personal Data Processing",
  "Trazabilidad on-chain en tiempo real": "Real-time on-chain traceability",
  "Tu acceso venció. Vuelve a escribir tu contraseña.": "Your sign-in expired. Enter your password again.",
  "Tu código de verificación es {code}. Vence en 10 minutos y sirve una sola vez.":
    "Your verification code is {code}. It expires in 10 minutes and can be used only once.",
  "Tu código para recuperar tu sesión en {portal}": "Your code to recover your session on {portal}",
  "tu dominio": "your domain",
  "Tu expediente quedó registrado en la bandeja de cumplimiento del desarrollador.":
    "Your KYC file has been recorded in the developer's compliance inbox.",
  "Tu expediente ya está en revisión.": "Your KYC file is already under review.",
  "Tu KYC debe estar aprobado por el Oficial de Cumplimiento para suscribir.":
    "Your KYC must be approved by the Compliance Officer in order to subscribe.",
  "Tu navegador no pudo calcular el hash SHA-256 del acuerdo.":
    "Your browser could not compute the SHA-256 hash of the agreement.",
  "Tu navegador no pudo calcular el hash SHA-256 del archivo.":
    "Your browser could not compute the SHA-256 hash of the file.",
  "Tu perfil ya fue aprobado.": "Your profile has already been approved.",
  "Tu proceso con el desarrollador": "Your process with the developer",
  "Tu sesión no es válida; firma de nuevo el NDA.": "Your session is not valid; sign the NDA again.",
  "Tu sesión ya no es válida; firma de nuevo el NDA.": "Your session is no longer valid; sign the NDA again.",
  "Tu usuario no tiene una wallet registrada en este tenant: no hay una cuenta a la que otorgar MINTER_ROLE.":
    "Your user has no registered wallet in this tenant: there is no account to grant MINTER_ROLE to.",
  "Tu usuario no tiene una wallet registrada en este tenant: no hay una cuenta autorizada para firmar.":
    "Your user has no wallet registered in this tenant: there is no authorized account to sign.",
  "Tu verificación fue revocada por el Oficial de Cumplimiento: comunícate con el desarrollador.":
    "Your verification was revoked by the Compliance Officer: please contact the developer.",
  "Tu verificación fue revocada: el acceso al Data Room de este proyecto quedó cerrado.":
    "Your verification was revoked: access to this project's Data Room has been closed.",
  "Tu verificación fue revocada: el Data Room de este proyecto ya no está disponible.":
    "Your verification was revoked: this project's Data Room is no longer available.",
  "Tu verificación fue revocada: no se reciben nuevas suscripciones.":
    "Your verification was revoked: no new subscriptions are accepted.",
  "Tu verificación ya está aprobada: elige cuántas unidades quieres y firma tu acuerdo de suscripción.":
    "Your verification has been approved: choose how many units you want and sign your subscription agreement.",
  "Tu wallet {wallet} no tiene MINTER_ROLE en el token: el mint lo envía el operador RWAXI («Firmar y ejecutar»), salvo que el emisor otorgue MINTER_ROLE a su propia wallet.":
    "Your wallet {wallet} does not hold MINTER_ROLE on the token: the mint is sent by the RWAXI operator (“Sign and execute”) unless the issuer grants MINTER_ROLE to its own wallet.",
  "Tu wallet está congelada por una decisión de cumplimiento: no se reciben nuevas suscripciones.":
    "Your wallet is frozen by a compliance decision: no new subscriptions are accepted.",
  "Tu wallet está en la red {actual}; cambia a {chain} (chainId {id}) para firmar.":
    "Your wallet is on network {actual}; switch to {chain} (chainId {id}) to sign.",
  "Tu wallet no compartió ninguna cuenta: conéctala y vuelve a intentarlo.":
    "Your wallet shared no account: connect it and try again.",
  "Tu wallet no devolvió un tx hash válido.": "Your wallet did not return a valid tx hash.",
  "Tu wallet no tiene DEFAULT_ADMIN_ROLE en este token: los mint los envía el operador RWAXI.":
    "Your wallet does not hold DEFAULT_ADMIN_ROLE on this token: mints are sent by the RWAXI operator.",
  "Tu wallet no tiene la red {chain} (chainId {id}): añádela y vuelve a intentarlo.":
    "Your wallet does not have the {chain} network (chainId {id}): add it and try again.",
  "Tu wallet registrada {wallet} no tiene {role} en {contract}: no puede firmar esta operación.":
    "Your registered wallet {wallet} does not hold {role} on {contract}: it cannot sign this operation.",
  "Tu wallet registrada {wallet} no tiene DEFAULT_ADMIN_ROLE en el token: sólo el administrador del emisor se otorga MINTER_ROLE.":
    "Your registered wallet {wallet} does not hold DEFAULT_ADMIN_ROLE on the token: only the issuer's administrator grants itself MINTER_ROLE.",
  "Tu wallet respondió con un error: {detail}": "Your wallet answered with an error: {detail}",
  "Tu wallet tiene DEFAULT_ADMIN_ROLE y aún no MINTER_ROLE: puedes otorgártelo.":
    "Your wallet holds DEFAULT_ADMIN_ROLE but not MINTER_ROLE yet: you can grant it to yourself.",
  "Tu wallet tiene MINTER_ROLE: puedes firmar los mint de este token con ella (EIP-1193).":
    "Your wallet holds MINTER_ROLE: you can sign this token's mints with it (EIP-1193).",
  "Tu wallet tiene seleccionada la cuenta {account}; esta operación la firma {expected}. Cámbiala en tu wallet y vuelve a intentarlo.":
    "Your wallet has account {account} selected; this operation is signed by {expected}. Switch accounts in your wallet and try again.",
  "Tus datos se encuentran en revisión por el Oficial de Cumplimiento de {name} (Auditoría estimada: 15 minutos).":
    "Your information is under review by the Compliance Officer of {name} (Estimated audit time: 15 minutes).",
  "Tus participaciones viven en tu propia wallet bajo estándares abiertos (ERC-20 con registro de cumplimiento), listas para transferencias autorizadas entre inversionistas en lista blanca sin semanas de papeleo.":
    "Your holdings live in your own wallet under open standards (ERC-20 with a compliance registry), ready for authorized transfers between whitelisted investors without weeks of paperwork.",
  "Tus tokens representan tu posición verificada en el proyecto. Cuando se declaran distribuciones de rentas o valorización, el cálculo de tu participación es exacto y auditable criptográficamente.":
    "Your tokens represent your verified position in the project. When rental income or appreciation distributions are declared, your share is calculated exactly and can be audited cryptographically.",
  "Tx de emisión": "Issuance tx",
  "tx hash del emisor (0x…)": "issuer tx hash (0x…)",
  "tx hash del Oficial (0x…)": "Officer tx hash (0x…)",
  "tx hash firmado por el emisor": "tx hash signed by the issuer",
  "Tx hash firmado por el emisor": "Tx hash signed by the issuer",
  "tx hash firmado por el Oficial de Cumplimiento": "tx hash signed by the Compliance Officer",
  "Tx hash firmado por el Oficial de Cumplimiento": "Tx hash signed by the Compliance Officer",
  "Tx hash inválido.": "Invalid tx hash.",
  "tx hash mint": "mint tx hash",
  "Tx whitelist:": "Whitelist tx:",
  Ubicación: "Location",
  "Ubicación / Render": "Location / Rendering",
  "Últimas confirmadas": "Recently confirmed",
  "Último congelamiento:": "Last freeze:",
  "Último descongelamiento:": "Last unfreeze:",
  "Una suscripción del inversionista cambió mientras se revocaba; vuelve a intentarlo.":
    "One of the investor's subscriptions changed during the revocation; please try again.",
  "Una transacción en cola del inversionista cambió mientras se revocaba; vuelve a intentarlo.":
    "A queued transaction of the investor changed during the revocation; please try again.",
  "Única asignación: la hoja es la raíz.": "Single allocation: the leaf is the root.",
  Unidades: "Units",
  "Unidades · capital": "Units · capital",
  "Unidades a emitir": "Units to issue",
  "Unidades digitales": "Digital units",
  "Unidades reservadas · pago fiduciario pendiente de conciliación por el desarrollador":
    "Units reserved · fiduciary payment pending reconciliation by the developer",
  "unpause() ejecutado por {name}": "unpause() executed by {name}",
  "updateDataRoomMerkleRoot en cola": "updateDataRoomMerkleRoot queued",
  "updateDataRoomMerkleRoot() en {network}": "updateDataRoomMerkleRoot() on {network}",
  "updateDataRoomMerkleRoot() en cola: lo firma el emisor desde la cola on-chain.":
    "updateDataRoomMerkleRoot() queued: the issuer signs it from the on-chain queue.",
  "URL de {provider} guardada": "{provider} URL saved",
  "Usa un archivo .mp4 o .mov": "Use an .mp4 or .mov file",
  "Usa una imagen JPG o PNG, o un PDF.": "Use a JPG or PNG image, or a PDF.",
  "Usar {color}": "Use {color}",
  "Usar monograma": "Use monogram",
  "Usar otra cuenta": "Use another account",
  uso: "usage",
  "Validado contra el RUES al crear el tenant.": "Validated against the RUES when the tenant was created.",
  "Validar configuración del token y del vehículo": "Validate token and vehicle configuration",
  "Valorización · {months} m": "Appreciation · {months} mo",
  "Valorización Anual Proy.": "Proj. Annual Appreciation",
  "Valorización proy.": "Proj. appreciation",
  Vehículo: "Vehicle",
  "Vehículo de Propósito Especial (SPV / Cuentas en Participación)":
    "Special Purpose Vehicle (SPV / Participation Accounts)",
  "Vehículo Jurídico Independiente": "Independent Legal Vehicle",
  "Vehículo Jurídico Independiente (Legal Wrapper)": "Independent Legal Vehicle (Legal Wrapper)",
  "Vehículo Jurídico y Respaldo": "Legal Vehicle & Backing",
  "Vehículo Legal Independiente por Proyecto": "Independent Legal Vehicle per Project",
  "Vehículo:": "Vehicle:",
  Vehículos: "Vehicles",
  "Venta del activo o mercado secundario permisionado": "Sale of the asset or permissioned secondary market",
  Ver: "View",
  "Ver asignaciones y pruebas": "View allocations and proofs",
  "Ver cifras en": "Show figures in",
  "Ver en {provider}": "View on {provider}",
  "Ver foto {n}": "View photo {n}",
  "Ver mi portafolio": "View my portfolio",
  "Ver mi portal": "View my portal",
  "Ver prueba ({n} hashes)": { one: "View proof ({n} hash)", other: "View proof ({n} hashes)" },
  "Ver prueba (1 hash)": "View proof (1 hash)",
  "Verificación de vida completada con éxito ✓": "Liveness check completed successfully ✓",
  "Verificación revocada": "Verification revoked",
  "Verificado · SSL activo": "Verified · SSL active",
  "Verificando el enlace de activación…": "Verifying the activation link…",
  "Verificando el rol on-chain…": "Checking the on-chain role…",
  "Verificando en la red…": "Verifying on the network…",
  "Verificando la red…": "Checking the network…",
  "Verificando SHA-256 en el servidor…": "Verifying SHA-256 on the server…",
  "Verificar DNS": "Verify DNS",
  "Verificar e ingresar": "Verify and sign in",
  "Verificar prueba de Merkle": "Verify Merkle proof",
  "Verificar recibo": "Verify receipt",
  "Verificar y continuar": "Verify and continue",
  "Video cargado: {name}": "Video uploaded: {name}",
  "Video Explicativo (3 min)": "Explainer Video (3 min)",
  "Video Pitch del Proyecto (Máx. 3:00 min - Alta Definición)":
    "Project Video Pitch (Max. 3:00 min - High Definition)",
  "Video y fotografías del proyecto": "Project video and photos",
  "Vimeo Pro, Cloudflare Stream o YouTube no listado.": "Vimeo Pro, Cloudflare Stream or unlisted YouTube.",
  Visitante: "Visitor",
  Vista: "View",
  "Vista interactiva": "Interactive view",
  "Vista interactiva de ejemplo": "Sample interactive view",
  "Vista previa": "Preview",
  "Vista previa de demostración. En producción el archivo se sirve solo a través de la Signed URL y cada acceso queda registrado en la bitácora de auditoría del desarrollador.":
    "Demo preview. In production, the file is served only through the Signed URL and every access is recorded in the developer's audit log.",
  "Vista previa en vivo": "Live preview",
  "Vista previa: {label}": "Preview: {label}",
  "Vitrina pública": "Public showcase",
  "Vitrina RWAXI": "RWAXI showcase",
  Volumen: "Volume",
  "Vuelve a cargar {name}: el archivo ya no está disponible en este navegador.":
    "Upload {name} again: the file is no longer available in this browser.",
  Wallet: "Wallet",
  "Wallet congelada": "Wallet frozen",
  "Wallet declarada": "Declared wallet",
  "Wallet del inversionista": "Investor wallet",
  "Wallet EVM para recibir tus unidades digitales": "EVM wallet to receive your digital units",
  "Wallet externa": "External wallet",
  "Wallet registrada del Administrador": "Administrator's registered wallet",
  "Wallets en whitelist": "Whitelisted wallets",
  "Whitelist on-chain en cola": "On-chain whitelist queued",
  "Whitelist on-chain en cola: ChainTransaction PENDING, a la espera de la firma del Oficial de Cumplimiento en RwaxiComplianceRegistry.approveInvestor().":
    "On-chain whitelist queued: ChainTransaction PENDING, awaiting the Compliance Officer's signature on RwaxiComplianceRegistry.approveInvestor().",
  "whitelist retirada antes de enviarse": "whitelisting withdrawn before it was sent",
  "Ya existe una distribución de ese periodo para esta oferta.":
    "A distribution for that period already exists for this offering.",
  "Ya hay un setFrozen() en cola para esta wallet: fírmalo o espera su confirmación.":
    "A setFrozen() is already queued for this wallet: sign it or wait for its confirmation.",
  "Ya tienes acceso al 100 % del Data Room del proyecto (Paso 2). Cuando decidas invertir, completa tu verificación KYC/AML con el Oficial de Cumplimiento del desarrollador (Paso 3).":
    "You now have access to 100% of the project's Data Room (Step 2). When you decide to invest, complete your KYC/AML verification with the developer's Compliance Officer (Step 3).",
  "YouTube (no listado)": "YouTube (unlisted)",
  "Zona Común": "Common Area",
  "Cada suscripción se acuña una sola vez y nunca por encima del tope de emisión (SubscriptionAlreadyProcessed, SupplyCapExceeded).":
    "Each subscription is minted exactly once and never beyond the supply cap (SubscriptionAlreadyProcessed, SupplyCapExceeded).",
  "Código fuente": "Source code",
  "Código fuente propietario y confidencial: visible con sesión del backoffice del desarrollador o de la consola RWAXI, o con la demo técnica habilitada.":
    "Proprietary and confidential source code: visible with a developer backoffice or RWAXI console session, or with the technical demo enabled.",
  Errores: "Errors",
  Eventos: "Events",
  Funciones: "Functions",
  "Interfaz pública": "Public interface",
  "Invariantes de seguridad": "Security invariants",
  "La organización, su NIT y su régimen de cumplimiento quedan fijados al desplegar el registro.":
    "The organization, its NIT and its compliance regime are fixed when the registry is deployed.",
  "La recuperación forzosa exige LEGAL_ENFORCEMENT_ROLE del emisor y el hash del acto legal que la respalda (LegalActHashRequired); el receptor debe estar en la whitelist.":
    "Forced recovery requires the issuer's LEGAL_ENFORCEMENT_ROLE and the hash of the legal act behind it (LegalActHashRequired); the receiver must be whitelisted.",
  "Los roles de administración del registro y del token quedan en las wallets del tenant, no en las de RWAXI.":
    "The admin roles of the registry and the token stay with the tenant's wallets, not RWAXI's.",
  "Pausar y reanudar es exclusivo del emisor y del oficial de cumplimiento (ISSUER_ADMIN_ROLE, COMPLIANCE_OFFICER_ROLE).":
    "Only the issuer and the Compliance Officer can pause and unpause (ISSUER_ADMIN_ROLE, COMPLIANCE_OFFICER_ROLE).",
  "RWAXI solo tiene MINTER_ROLE: no puede pausar el token, anclar el Data Room o distribuciones ni ejecutar recuperaciones.":
    "RWAXI only holds MINTER_ROLE: it cannot pause the token, anchor the Data Room or distributions, or execute recoveries.",
  "Solo el oficial de cumplimiento del tenant aprueba, revoca o congela wallets (COMPLIANCE_OFFICER_ROLE).":
    "Only the tenant's Compliance Officer approves, revokes or freezes wallets (COMPLIANCE_OFFICER_ROLE).",
  "Solo el operador RWAXI (RWAXI_OPERATOR_ROLE) despliega registros y tokens: uno por organización y uno por oferta (TenantAlreadyRegistered, OfferingAlreadyDeployed).":
    "Only the RWAXI operator (RWAXI_OPERATOR_ROLE) deploys registries and tokens: one per organization and one per offering (TenantAlreadyRegistered, OfferingAlreadyDeployed).",
  "Solo una wallet aprobada y no congelada en el registro del tenant puede recibir tokens: el hook _update consulta isEligible() en cada emisión y transferencia.":
    "Only a wallet approved and not frozen in the tenant's registry can receive tokens: the _update hook calls isEligible() on every mint and transfer.",
  "Toda aprobación registra el hash del expediente KYC; una aprobación sin hash se rechaza (EmptyDossierHash).":
    "Every approval records the KYC file hash; an approval without it is rejected (EmptyDossierHash).",
  "Un token solo se despliega sobre el registro de su propio tenant (UnknownTenant), aislado de los demás desarrolladores.":
    "A token is only deployed on its own tenant's registry (UnknownTenant), isolated from other developers.",
  "Una wallet congelada no puede transferir; únicamente la recuperación forzosa omite ese bloqueo.":
    "A frozen wallet cannot transfer; only forced recovery bypasses that block.",
  // offering lifecycle, the vitrina's legal wall and the deferred tenant registry
  "Captación completada": "Capital raising completed",
  "El ingreso sólo se registra desde la vitrina.": "Access can only be recorded from the showcase.",
  "Escribe un correo electrónico válido.": "Enter a valid email address.",
  "Demasiados intentos desde esta red: espera {minutes} min y vuelve a intentarlo.": "Too many attempts from this network: wait {minutes} min and try again.",
  "No se pudo registrar tu ingreso. Inténtalo de nuevo.": "Your access could not be recorded. Please try again.",
  "Este proyecto está en estructuración: la captación abrirá próximamente.": "This project is being structured: capital raising will open soon.",
  "Comunidad privada de inversionistas": "Private investor community",
  "La vitrina RWAXI reúne oportunidades de coinversión inmobiliaria de desarrolladores independientes. Para ver los proyectos, identifícate con tu correo y acepta las condiciones de ingreso.": "The RWAXI showcase brings together real estate co-investment opportunities from independent developers. To see the projects, identify yourself with your email and accept the entry conditions.",
  "Ingresar a la vitrina": "Enter the showcase",
  "RWAXI actúa como canal de descubrimiento y proveedor tecnológico: no custodia recursos ni realiza ofertas públicas. Cada oferta es responsabilidad de su desarrollador.": "RWAXI acts as a discovery channel and technology provider: it does not hold funds or make public offerings. Each offering is the responsibility of its developer.",
  "PROYECTO EN ESTRUCTURACIÓN - PRÓXIMAMENTE": "PROJECT IN STRUCTURING - COMING SOON",
  "Próximamente: captación aún no abierta": "Coming soon: capital raising not open yet",
  "Este proyecto está en estructuración: todavía no recibe suscripciones.": "This project is being structured: it does not take subscriptions yet.",
  "Este proyecto completó su captación: ya no recibe nuevas suscripciones.": "This project completed its capital raising: it no longer takes new subscriptions.",
  "Estado de la oferta inválido.": "Invalid offering status.",
  "El motivo admite hasta 300 caracteres.": "The reason may be up to 300 characters long.",
  "La oferta ya está en ese estado; recarga la mesa.": "The offering is already in that status; reload the desk.",
  "Ese cambio de estado no está permitido.": "That status change is not allowed.",
  "Cerrar la captación exige un motivo de 10 a 300 caracteres.": "Closing capital raising requires a reason of 10 to 300 characters.",
  "Otro usuario cambió el estado de la oferta; recarga la mesa.": "Another user changed the offering's status; reload the desk.",
  "{code}: captación abierta (ACTIVE)": "{code}: capital raising open (ACTIVE)",
  "{code}: captación completada (FUNDED)": "{code}: capital raising completed (FUNDED)",
  "{code}: de vuelta a estructuración (STRUCTURING)": "{code}: back to structuring (STRUCTURING)",
  "No se pudo cambiar el estado de la oferta. Inténtalo de nuevo.": "The offering's status could not be changed. Please try again.",
  "Estado de captación de la oferta": "Offering capital-raising status",
  "Gobierno RWAXI · wallets declaradas y registro en cola": "RWAXI governance · wallets declared and registry queued",
  "En estructuración · próximamente": "Structuring · coming soon",
  "Captación abierta": "Capital raising open",
  "Abrir captación": "Open capital raising",
  "Marcar captación completada": "Mark capital raising completed",
  "Volver a estructuración": "Back to structuring",
  "Reabrir captación": "Reopen capital raising",
  "Estado de captación": "Capital-raising status",
  "Sólo una oferta con la captación abierta (ACTIVE) recibe suscripciones. En estructuración, la vitrina la muestra como «próximamente» y el portal no permite suscribir; las suscripciones ya firmadas siguen su curso.": "Only an offering with capital raising open (ACTIVE) takes subscriptions. While structuring, the showcase lists it as “coming soon” and the portal does not allow subscribing; subscriptions already signed carry on.",
  "{code} · {from} → {to}": "{code} · {from} → {to}",
  "La oferta empezará a recibir suscripciones en el portal y la vitrina enlazará a él.": "The offering will start taking subscriptions in the portal and the showcase will link to it.",
  "La oferta dejará de recibir suscripciones: la vitrina la mostrará con la captación completada.": "The offering will stop taking subscriptions: the showcase will show its capital raising as completed.",
  "La oferta dejará de recibir suscripciones: la vitrina la mostrará como «próximamente».": "The offering will stop taking subscriptions: the showcase will list it as “coming soon”.",
  "Motivo (obligatorio, 10 a 300 caracteres)": "Reason (required, 10 to 300 characters)",
  "Motivo (opcional)": "Reason (optional)",
  "Cancelar": "Cancel",
  "{from} → {to}": "{from} → {to}",
  "Oferta {code}": "Offering {code}",
  "El desarrollador todavía no abre la captación de este proyecto: no se reciben suscripciones. Puedes revisar el Data Room y completar tu KYC mientras tanto.": "The developer has not opened capital raising for this project yet: no subscriptions are taken. Meanwhile you can review the Data Room and complete your KYC.",
  "Wallets declaradas · administrador {admin} · oficial {officer} · deployTenantRegistry() en cola ({network})": "Wallets declared · administrator {admin} · officer {officer} · deployTenantRegistry() queued ({network})",
  // granular consent of the vitrina's legal wall and its /legal/* documents
  "Debes aceptar las tres condiciones para ingresar.": "You must accept all three conditions to enter.",
  "Condiciones de ingreso": "Entry conditions",
  "Términos y Condiciones y Exención de Responsabilidad": "Terms and Conditions and Liability Disclaimer",
  "Políticas de Tratamiento de Datos Personales": "Personal Data Processing Policies",
  "Política de Cookies": "Cookie Policy",
  "Documentos legales": "Legal documents",
  "Documento legal en redacción": "Legal document being drafted",
  "El equipo legal de RWAXI está redactando este documento. Su versión vigente se publicará en esta misma dirección.": "RWAXI's legal team is drafting this document. Its current version will be published at this same address.",
  "Volver a la vitrina": "Back to the showcase",
  "Solicito el ingreso a la comunidad privada y acepto los {link} y la Exención de Responsabilidad (Powered by RWAXI).": "I request admission to the private community and accept the {link} and the Liability Disclaimer (Powered by RWAXI).",
  "Términos y Condiciones": "Terms and Conditions",
  "Autorizo y acepto las {link}.": "I authorize and accept the {link}.",
  "Acepto la {link}.": "I accept the {link}.",
  // platform fee agreed with each developer (commercial agreements, factory and token)
  "Cada token se despliega con la comisión de plataforma pactada con su desarrollador (platformFeeBps), que el evento OfferingTokenDeployed publica.":
    "Each token is deployed with the platform fee agreed with its developer (platformFeeBps), published by the OfferingTokenDeployed event.",
  "La comisión de plataforma (platformFeeBps) queda fijada al desplegar el token, solo entre 25 y 500 puntos básicos (InvalidPlatformFee), y cada emisión la declara en PlatformFeeAccrued: el token nunca transfiere unidades ni valor a RWAXI.":
    "The platform fee (platformFeeBps) is fixed when the token is deployed, only between 25 and 500 basis points (InvalidPlatformFee), and every issuance declares it in PlatformFeeAccrued: the token never transfers units or value to RWAXI.",
  "Acuerdo comercial {reference} ({date}) · comisión de plataforma {from} → {to} pb · SHA-256 {hash}":
    "Commercial agreement {reference} ({date}) · platform fee {from} → {to} bps · SHA-256 {hash}",
  "Acuerdo comercial {reference} consultado · re-hasheado contra su SHA-256":
    "Commercial agreement {reference} viewed · re-hashed against its SHA-256",
  "Gobierno RWAXI · acuerdo comercial y comisión de plataforma":
    "RWAXI governance · commercial agreement and platform fee",
  "Gobierno RWAXI · acuerdo comercial consultado":
    "RWAXI governance · commercial agreement viewed",
  // subscription flow: offering token from the console, raising readiness, fee linked to each subscription
  "No se puede abrir la captación: {gaps}":
    "Capital raising cannot be opened: {gaps}",
  "Gobierno RWAXI · despliegue del token de la oferta":
    "RWAXI governance · offering token deployment",
  "Reserva abierta a pago":
    "Reservation opened for payment",
  "La captación no puede abrirse todavía:":
    "Capital raising cannot be opened yet:",
  "comisión de plataforma estimada {bps} pb · {fee} USD (la paga el desarrollador)":
    "estimated platform fee {bps} bps · {fee} USD (paid by the developer)",
  "PlatformFeeAccrued {bps} pb":
    "PlatformFeeAccrued {bps} bps",
  "No se pudo determinar la dirección del token desplegado.":
    "The address of the deployed token could not be determined.",
  "El despliegue del token no indica su oferta.":
    "The token deployment does not name its offering.",
  "El token de la oferta ya está desplegado.":
    "The offering's token is already deployed.",
  "Revertiría: UnknownTenant(organizationId) — el tenant aún no tiene RwaxiComplianceRegistry.":
    "Would revert: UnknownTenant(organizationId) — the tenant has no RwaxiComplianceRegistry yet.",
  "Revertiría: OfferingAlreadyDeployed(offeringId).":
    "Would revert: OfferingAlreadyDeployed(offeringId).",
  "Revertiría: InvalidPlatformFee({bps}) — la comisión debe estar entre 25 y 500 puntos básicos.":
    "Would revert: InvalidPlatformFee({bps}) — the fee must be between 25 and 500 basis points.",
  "La ejecuta el operador RWAXI (RWAXI_OPERATOR_ROLE) desde la consola de plataforma: el token queda con la comisión de plataforma pactada (platformFeeBps) fija y con la raíz del Data Room anclada.":
    "Executed by the RWAXI operator (RWAXI_OPERATOR_ROLE) from the platform console: the token keeps the agreed platform fee (platformFeeBps) fixed and the Data Room root anchored.",
  "Token de {code} en cola · deployOfferingToken() con comisión de plataforma {bps} pb · reservas por abrir a pago: {n} ({network})":
    "Token of {code} queued · deployOfferingToken() with platform fee {bps} bps · reservations to open for payment: {n} ({network})",
  "El registro de cumplimiento (RwaxiComplianceRegistry) del tenant aún no está desplegado.":
    "The tenant's compliance registry (RwaxiComplianceRegistry) is not deployed yet.",
  "Falta la wallet oficial del Administrador del desarrollador.":
    "The developer's Administrator official wallet is missing.",
  "No hay un Oficial de Cumplimiento activo asignado al desarrollador.":
    "No active Compliance Officer is assigned to the developer.",
  "Falta la wallet oficial del Oficial de Cumplimiento.":
    "The Compliance Officer's official wallet is missing.",
  "El Administrador y el Oficial de Cumplimiento deben tener wallets distintas.":
    "The Administrator and the Compliance Officer must have different wallets.",
  "Una wallet oficial del desarrollador no puede ser la del operador RWAXI.":
    "An official wallet of the developer cannot be the RWAXI operator's.",
  // yield distributions: record date, payment currency, supporting document, payment instructions
  "No se pudo completar la operación de la distribución. Inténtalo de nuevo.":
    "The distribution operation could not be completed. Please try again.",
  "A la fecha de corte la oferta no tenía tokens emitidos en wallets de inversionistas.":
    "At the record date the offering had no tokens issued to investor wallets.",
  "La wallet {wallet} tiene tokens de la oferta pero no es de un inversionista de este tenant.":
    "The wallet {wallet} holds tokens of the offering but does not belong to an investor of this tenant.",
  "Fecha de corte: una fecha válida (AAAA-MM-DD) que no sea futura.":
    "Record date: a valid date (YYYY-MM-DD) that is not in the future.",
  "Moneda de pago: COP, USD, USDC o USDT.":
    "Payment currency: COP, USD, USDC or USDT.",
  "Monto en {currency}":
    "Amount in {currency}",
  "El soporte documental no fue verificado por el servidor: vuelve a adjuntarlo.":
    "The supporting document was not verified by the server: attach it again.",
  "El soporte documental debe ser un PDF o una imagen (PNG, JPG o WebP).":
    "The supporting document must be a PDF or an image (PNG, JPG or WebP).",
  "El registro de tenedores no coincide con el token on-chain a la fecha de corte (oferta total {onchain} on-chain, {recorded} en el registro; {n} wallet(s) con otro saldo): no se declaró nada.": {
    one: "The register of holders does not match the on-chain token at the record date (total supply {onchain} on-chain, {recorded} in the register; {n} wallet with a different balance): nothing was declared.",
    other: "The register of holders does not match the on-chain token at the record date (total supply {onchain} on-chain, {recorded} in the register; {n} wallets with a different balance): nothing was declared.",
  },
  "El registro de tenedores cambió mientras se verificaba on-chain: vuelve a declarar la distribución.":
    "The register of holders changed while it was being checked on-chain: declare the distribution again.",
  "Distribución {period} declarada · {amount} {currency} entre {holders} tenedor(es) a la fecha de corte {date} · anchorDistributionRoot() en cola": {
    one: "Distribution {period} declared · {amount} {currency} among {holders} holder at the record date {date} · anchorDistributionRoot() queued",
    other: "Distribution {period} declared · {amount} {currency} among {holders} holders at the record date {date} · anchorDistributionRoot() queued",
  },
  "{n} asignación(es) con el pago retenido hoy por la whitelist": {
    one: "{n} allocation with its payment withheld today by the whitelist",
    other: "{n} allocations with their payment withheld today by the whitelist",
  },
  "Distribución inválida.":
    "Invalid distribution.",
  "El registro de cumplimiento del tenant no está desplegado: no hay whitelist contra la cual validar el pago.":
    "The tenant's compliance registry is not deployed: there is no whitelist to validate the payment against.",
  "Distribución no encontrada en este tenant.":
    "Distribution not found in this tenant.",
  "Esta distribución se declaró sin fecha de corte ni soporte documental: no admite instrucciones de pago.":
    "This distribution was declared without a record date or a supporting document: it takes no payment instructions.",
  "La raíz de la distribución aún no está anclada en el token: el pago se instruye después de anclarla.":
    "The distribution root is not anchored on the token yet: the payment is instructed after anchoring it.",
  "Todas las asignaciones de esta distribución ya tienen instrucción de pago.":
    "Every allocation of this distribution already has a payment instruction.",
  "Ninguna asignación pendiente supera hoy la validación de la whitelist ({n} retenida(s)): no se emitió ninguna instrucción de pago.":
    "No pending allocation passes the whitelist check today ({n} withheld): no payment instruction was issued.",
  "Instrucción de pago #{sequence} de {period} emitida · {total} {currency} a {payees} wallet(s) validada(s) en la whitelist": {
    one: "Payment instruction #{sequence} for {period} issued · {total} {currency} to {payees} wallet cleared by the whitelist",
    other: "Payment instruction #{sequence} for {period} issued · {total} {currency} to {payees} wallets cleared by the whitelist",
  },
  "{n} asignación(es) retenida(s) hasta que la whitelist las habilite": {
    one: "{n} allocation withheld until the whitelist clears it",
    other: "{n} allocations withheld until the whitelist clears them",
  },
  "Instrucción de pago de la distribución":
    "Distribution payment instruction",
  "Soporte de la distribución consultado":
    "Distribution supporting document viewed",
  "SHA-256 instrucción de pago":
    "SHA-256 payment instruction",
  "Tenedores hoy":
    "Holders today",
  "Distribuido declarado (equiv. USD)":
    "Declared distributions (USD equiv.)",
  "{n} distribución(es) · {anchored} raíz(ces) ancladas": {
    one: "{n} distribution · {anchored} root(s) anchored",
    other: "{n} distributions · {anchored} root(s) anchored",
  },
  "Pagos instruidos":
    "Payments instructed",
  "{n} instrucción(es) de pago": {
    one: "{n} payment instruction",
    other: "{n} payment instructions",
  },
  "El emisor declara y paga sus distribuciones: RWAXI calcula la prorrata, la compromete en un árbol de Merkle y verifica la whitelist, pero no custodia ni mueve los fondos. Cada tenedor a la fecha de corte conserva su asignación; el pago solo se instruye a wallets que la whitelist de cumplimiento habilita en ese momento.":
    "The issuer declares and pays its distributions: RWAXI computes the pro-rata split, commits it in a Merkle tree and checks the whitelist, but never holds or moves the funds. Every holder at the record date keeps their allocation; payment is only instructed to wallets the compliance whitelist clears at that moment.",
  "Ninguna oferta de este tenant tiene su token emitido todavía: las distribuciones se calculan sobre los tokens emitidos en wallets de inversionistas.":
    "No offering of this tenant has its token issued yet: distributions are computed over the tokens issued to investor wallets.",
  "No se pudo verificar el archivo; vuelve a adjuntarlo.":
    "The file could not be verified; attach it again.",
  "COP · fiduciaria":
    "COP · fiduciary",
  "USD · fiduciaria":
    "USD · fiduciary",
  "USDC · tesorería del emisor":
    "USDC · issuer's treasury",
  "USDT · tesorería del emisor":
    "USDT · issuer's treasury",
  "Tenedores a la fecha de corte {date} · {n} tokens":
    "Holders at the record date {date} · {n} tokens",
  "Elige una fecha de corte válida que no sea futura.":
    "Choose a valid record date that is not in the future.",
  "Whitelist hoy":
    "Whitelist today",
  "Sin tokens emitidos en wallets de inversionistas a esa fecha.":
    "No tokens issued to investor wallets at that date.",
  Pagable:
    "Payable",
  "Fecha de corte":
    "Record date",
  "Moneda de pago":
    "Payment currency",
  "Soporte documental (certificación fiduciaria o comprobante)":
    "Supporting document (fiduciary certificate or receipt)",
  "Verificando el archivo y guardándolo en la bóveda…":
    "Verifying the file and storing it in the vault…",
  "{name} · {size} · SHA-256 {hash} verificado por el servidor":
    "{name} · {size} · SHA-256 {hash} verified by the server",
  "Se repartirán {amount} entre {holders} tenedor(es) a la fecha de corte, en proporción a sus tokens (centésimas exactas, método del mayor residuo). Cada asignación será una hoja del árbol de Merkle (SHA-256) y la raíz se anclará con anchorDistributionRoot(), que verifica on-chain la oferta total a esa fecha y registra el SHA-256 del soporte.": {
    one: "{amount} will be split among {holders} holder at the record date, in proportion to their tokens (exact hundredths, largest-remainder method). Each allocation will be a leaf of the Merkle tree (SHA-256) and the root will be anchored with anchorDistributionRoot(), which checks the total supply at that date on-chain and records the SHA-256 of the supporting document.",
    other: "{amount} will be split among {holders} holders at the record date, in proportion to their tokens (exact hundredths, largest-remainder method). Each allocation will be a leaf of the Merkle tree (SHA-256) and the root will be anchored with anchorDistributionRoot(), which checks the total supply at that date on-chain and records the SHA-256 of the supporting document.",
  },
  "Indica el monto: el cálculo prorrata se muestra antes de declarar y el servidor lo recalcula sobre el registro de tenedores a la fecha de corte.":
    "Enter the amount: the pro-rata split is shown before declaring and the server recomputes it over the register of holders at the record date.",
  "Hoy la whitelist retendría el pago de {n} tenedor(es): conservan su asignación y se pagan cuando queden habilitados.": {
    one: "Today the whitelist would withhold the payment of {n} holder: they keep their allocation and are paid once cleared.",
    other: "Today the whitelist would withhold the payment of {n} holders: they keep their allocation and are paid once cleared.",
  },
  "Snapshot al declarar · {at}":
    "Snapshot at declaration · {at}",
  "Fecha de corte {date} · instante de registro {at} · {mode}":
    "Record date {date} · instant of record {at} · {mode}",
  "cotejado con balanceOfAt / totalSupplyAt on-chain":
    "checked against balanceOfAt / totalSupplyAt on-chain",
  "réplica de las emisiones confirmadas (simulación)":
    "replay of the confirmed mints (simulation)",
  "Soporte: {name} · {size} · SHA-256 {hash}":
    "Support: {name} · {size} · SHA-256 {hash}",
  "Ver soporte":
    "View support",
  "Declarada sin soporte documental (versión anterior del módulo).":
    "Declared without a supporting document (earlier version of the module).",
  Pago:
    "Payment",
  "Instruido · #{n}":
    "Instructed · #{n}",
  "Retenido · {reason}":
    "Withheld · {reason}",
  "Pendiente · pagable hoy":
    "Pending · payable today",
  Pagos:
    "Payments",
  "{done}/{total} asignaciones con instrucción de pago":
    "{done}/{total} allocations with a payment instruction",
  "{n} pendiente(s), {payable} pagable(s) hoy":
    "{n} pending, {payable} payable today",
  "Emitir instrucción de pago":
    "Issue payment instruction",
  "La instrucción de pago se emite cuando la raíz quede anclada en el token.":
    "The payment instruction is issued once the root is anchored on the token.",
  "Instrucción #{n}":
    "Instruction #{n}",
  "{n} wallet(s)": {
    one: "{n} wallet",
    other: "{n} wallets",
  },
  "{n} retenida(s)":
    "{n} withheld",
  "whitelist leída on-chain":
    "whitelist read on-chain",
  "whitelist según la cola confirmada":
    "whitelist per the confirmed queue",
  "JSON (SHA-256 verificable)":
    "JSON (verifiable SHA-256)",
  "Distribución {period} · {amount} {currency} entre {holders} tenedor(es) a la fecha de corte {date}": {
    one: "Distribution {period} · {amount} {currency} among {holders} holder at the record date {date}",
    other: "Distribution {period} · {amount} {currency} among {holders} holders at the record date {date}",
  },
  "{n} retenida(s) hoy por la whitelist":
    "{n} withheld today by the whitelist",
  "anchorDistributionRoot en cola":
    "anchorDistributionRoot queued",
  "Instrucción de pago #{sequence} de {period} · {total} {currency} a {payees} wallet(s)": {
    one: "Payment instruction #{sequence} for {period} · {total} {currency} to {payees} wallet",
    other: "Payment instruction #{sequence} for {period} · {total} {currency} to {payees} wallets",
  },
  "{n} retenida(s) por la whitelist":
    "{n} withheld by the whitelist",
  "whitelist leída del registro on-chain":
    "whitelist read from the on-chain registry",
  "whitelist según la cola confirmada (simulación)":
    "whitelist per the confirmed queue (simulation)",
  "Soporte de la distribución {period} · SHA-256 verificado al servirlo · {by}":
    "Supporting document of distribution {period} · SHA-256 verified when served · {by}",
  "consola RWAXI (supervisión)":
    "RWAXI console (supervision)",
  "Cada raíz de distribución la ancla el emisor (DISTRIBUTION_ROLE) una sola vez y nunca vacía (DistributionAlreadyAnchored, EmptyDistributionRoot, EmptyDistribution).":
    "Each distribution root is anchored by the issuer (DISTRIBUTION_ROLE) only once and never empty (DistributionAlreadyAnchored, EmptyDistributionRoot, EmptyDistribution).",
  "El token guarda el historial de saldos (balanceOfAt, totalSupplyAt): una distribución solo se ancla si su oferta total coincide con la del token a la fecha de corte, ya transcurrida (SnapshotSupplyMismatch, FutureLookup), y con el SHA-256 de su soporte documental (DistributionEvidenceRequired).":
    "The token keeps the balance history (balanceOfAt, totalSupplyAt): a distribution is only anchored if its total supply matches the token's at the record date, already past (SnapshotSupplyMismatch, FutureLookup), and with the SHA-256 of its supporting document (DistributionEvidenceRequired).",
  "Modo RPC: no se pudo leer el historial de saldos del token (balanceOfAt / totalSupplyAt); un token desplegado antes de esa versión del contrato no lo tiene.":
    "RPC mode: the token's balance history (balanceOfAt / totalSupplyAt) could not be read; a token deployed before that version of the contract does not have it.",
  "Revertiría: EmptyDistribution() — la distribución no tiene monto o tenedores.":
    "Would revert: EmptyDistribution() — the distribution has no amount or holders.",
  "Revertiría: DistributionEvidenceRequired() — falta el SHA-256 del soporte documental.":
    "Would revert: DistributionEvidenceRequired() — the SHA-256 of the supporting document is missing.",
  "Revertiría: FutureLookup — la fecha de corte aún no ha transcurrido.":
    "Would revert: FutureLookup — the record date has not passed yet.",
  "Revertiría: SnapshotSupplyMismatch({declared}, {recorded}) — la oferta total del token a la fecha de corte no coincide con la del snapshot.":
    "Would revert: SnapshotSupplyMismatch({declared}, {recorded}) — the token's total supply at the record date does not match the snapshot's.",
  "KYC revocado por el Oficial de Cumplimiento":
    "KYC revoked by the Compliance Officer",
  "Revocación en cola en el registro (revokeInvestor)":
    "Revocation queued in the registry (revokeInvestor)",
  "Wallet fuera de la whitelist del registro":
    "Wallet outside the registry's whitelist",
  "Wallet congelada en el registro":
    "Wallet frozen in the registry",
  "Congelamiento en cola en el registro (setFrozen)":
    "Freeze queued in the registry (setFrozen)",
  "Fecha de corte {date}":
    "Record date {date}",
  "Soporte documental · SHA-256 {hash}":
    "Supporting document · SHA-256 {hash}",
  "Pago instruido · instrucción #{n} · {date}":
    "Payment instructed · instruction #{n} · {date}",
  "Pago pendiente de instrucción del emisor":
    "Payment pending the issuer's instruction",
  "hoja = SHA-256(JSON canónico de la asignación: v, kind, distributionId, wallet, units, currency, amountCents)":
    "leaf = SHA-256(canonical JSON of the allocation: v, kind, distributionId, wallet, units, currency, amountCents)",
  // console report exports (organization-less audit events)
  "Reporte exportado desde la consola RWAXI":
    "Report exported from the RWAXI console",
  "SHA-256 archivo exportado":
    "SHA-256 of the exported file",
};

export default catalog;
