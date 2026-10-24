# RWAXI Real Estate — Plataforma

Infraestructura White Label de coinversión inmobiliaria tokenizada. RWAXI es **canal de descubrimiento y
proveedor tecnológico**; cada oferta, vehículo jurídico y proceso de cumplimiento es responsabilidad del
desarrollador (tenant). Esa frontera legal guía todas las decisiones de arquitectura de abajo.

Referencia visual y funcional aprobada: `rwaxi-prototype-reference.tsx.html` (no editar; es la fuente de verdad del UX).

## Monorepo (Turborepo + pnpm)

```
apps/web                 Next.js 15 (App Router, Tailwind 3.4, lucide-react) — los 4 entornos
  middleware.ts          Edge Middleware: host → entorno (rewrite + headers x-rwaxi-env / x-rwaxi-tenant)
  app/_lib/hosts.ts      resolución de host pura y Edge-safe (la usan middleware y cliente)
  app/vitrina/           www.rwaxi.com · _lib/catalog.ts: catálogo en vivo (listPublicOfferings → rwaxi_public_offerings)
  app/superadmin/        admin.rwaxi.com · actions.ts (gobierno, facturación B2B, onboarding y registro on-chain)
                         _lib/session.ts (sesión de plataforma) · _lib/onboarding.ts (validación del alta B2B)
  app/tenant/[slug]/     {slug}.rwaxi.com (portal) y /backoffice
    actions.ts           onboarding persistido del inversionista: signNda(), submitKyc(), subscribe()
    _lib/journey.ts      journey del visitante leído de PostgreSQL (sesión por cookie firmada), con sus distribuciones
    _lib/tenant-view.ts  tenants dados de alta en la BD (no del prototipo): vista leída bajo RLS para el estado demo
    backoffice/          actions.ts (KYC) · payment-actions.ts (confirmPayment) · chain-actions.ts (ejecutar la cola)
                         distribution-actions.ts (declareDistribution) · _lib/queries.ts (bandeja de cumplimiento)
                         _lib/subscriptions-desk.ts (Suscripciones y Pagos) · _lib/distributions-desk.ts (Distribuciones)
  app/_lib/server/       tenant-context, staff-auth (contraseña + TOTP, sesiones), staff-invitations + staff-activation
                         (cuentas del alta B2B), investor-session (HMAC), investor-recovery (código por correo) +
                         mail-outbox, vault + vault-access (bóveda documental), chain-queue (calldata viem, puro),
                         chain-invariants (prelación + reverts de los contratos, puro), chain-executor (firma y confirma)
  app/_components/auth/  login del personal (contraseña → TOTP o enrolamiento) y cuenta en la cabecera
  app/_lib/referral.ts   tokens de referido firmados (HMAC-SHA256, Web Crypto: middleware y Server Actions)
  app/_i18n/             i18n: config (idiomas, cookies), provider (useI18n), server (requestTranslate, render),
                         marks (msg, vmsg, reason, LocalizedError), messages/<idioma>.ts, extract.ts + catalogs.test.ts
  app/superadmin/_lib/   métricas consolidadas con platformPrisma() (rol BYPASSRLS, sólo host admin)
  app/api/chain/transactions  cola ChainTransaction del tenant del host (Inspector On-Chain, pestaña 4)
  app/api/inspector/sources   fuente .sol de los contratos, sólo con sesión de backoffice/consola (inspector-access.ts)
  app/api/vault/         upload (KYC, staging del alta, Data Room) · kyc/[caso]/[lado] · data-room/[id] (bóveda documental)
  app/_components/       UI portada del prototipo (ui, shell, vitrina, portal, backoffice, superadmin, inspector, legal)
  app/_lib/              datos, formato, renders canvas, simulador on-chain del prototipo
packages/database        Prisma 6 · esquema multi-tenant (22 entidades) · RLS · cliente con tenant · seed
                         credentials.ts (scrypt, TOTP RFC 6238, AES-256-GCM, tokens y códigos de un solo uso)
  scripts/               provision-app-role.ts (rol de la app sujeto a RLS, idempotente)
packages/blockchain-sdk  merkle.ts (SHA-256 Data Room) · distribution.ts (prorrata en centavos + árbol de asignaciones)
                         canonical.ts (evidenceHash) · evm-adapter.ts (Viem, ITokenizationAdapter) · abi/ (generado)
packages/document-vault  DocumentVault: políticas (tipo por magic bytes, tamaño, SHA-256), claves por contenido y
                         tenant, drivers local (disco privado) y s3 (S3/R2 con SigV4) · sample.ts (PDF deterministas)
contracts                Hardhat 2 · solc 0.8.24 · @openzeppelin/contracts 5.6.1 (versión exacta: bytecode determinista)
```

## Arquitectura multi-tenant: 4 entornos

| Entorno | Host | Ruta interna | Marca | Quién |
|---|---|---|---|---|
| Vitrina pública | `www.rwaxi.com` / `rwaxi.com` | `/vitrina` | RWAXI | público |
| Portal White Label | `{slug}.rwaxi.com` o dominio verificado | `/tenant/[slug]` | desarrollador ("Powered by RWAXI") | inversionista |
| Backoffice | `{slug}.rwaxi.com/backoffice` | `/tenant/[slug]/backoffice` | desarrollador | tenant admin, oficial de cumplimiento |
| Consola Super-Admin | `admin.rwaxi.com` | `/superadmin` | RWAXI | Dirección RWAXI |

Reglas:

1. **El host decide el entorno, nunca la ruta.** Todo request de página pasa por `middleware.ts`, que lo reescribe
   con prefijo interno; por eso `/vitrina`, `/superadmin` y `/tenant/*` no son accesibles directamente. Nuevas
   páginas de un entorno van bajo su carpeta interna. `/api/*` no se reescribe: lee el tenant de `x-rwaxi-tenant`.
   Un reenvío interno de Server Action de Next (`x-action-forwarded`) se rechaza: cada página incluye las acciones
   que llama, y la reescritura por host convertía ese reenvío en un bucle infinito de autopeticiones.
2. **Nunca confiar en un tenant que venga del cliente.** El tenant sale del host: el middleware descarta cualquier
   `x-rwaxi-*` recibido y fija `x-rwaxi-tenant`; el servidor lo traduce a `organizationId` con
   `resolveTenant(slug)` (función SQL `rwaxi_resolve_tenant`, SECURITY DEFINER, sólo campos de enrutado).
   Las Server Actions reciben únicamente ids de registros y los buscan bajo RLS: un id de otro tenant es "no encontrado".
   Subdominios reservados: ver `RESERVED_SUBDOMAINS`. Las únicas lecturas sin contexto de tenant son funciones
   SECURITY DEFINER acotadas: `rwaxi_resolve_tenant` (enrutado), `rwaxi_public_offerings()` (vitrina: campos de
   marketing y sus traducciones, progreso y pausa de captación de ofertas publicadas de desarrolladores publicados,
   sin datos de inversionistas), `rwaxi_next_simulated_nonce` (siguiente nonce del operador RWAXI, un contador global) y
   `rwaxi_factory_creations` (contratos que la factory ya creó en simulación: el nonce de su próximo `CREATE`).
   Un slug que no es de los desarrolladores demo del prototipo se sirve desde la BD: el layout del tenant lo resuelve
   con `resolveTenant`, lee su vista bajo RLS (`_lib/tenant-view.ts`) y la registra en el estado demo
   (`registerDbTenant`); sin organización u oferta, 404.
3. **Aislamiento en la base de datos, no sólo en la app.** Todas las tablas de tenant tienen `organization_id` y RLS
   (`FORCE ROW LEVEL SECURITY`, fail-closed). Acceso a datos de tenant **sólo** con `forTenant(orgId)` (lecturas) o
   `withTenant(orgId, fn)` (escrituras de varios pasos, una transacción). `platformPrisma()` (rol `BYPASSRLS`) sólo en
   la consola Super-Admin. Un trigger (`rwaxi_assert_same_tenant`) impide referencias a filas de otro tenant (las FK
   ignoran RLS). `DATABASE_URL` debe usar un rol **sin** `BYPASSRLS` (`rwaxi_app`): el owner de Neon lo tiene y con él
   RLS no aplica. `/api/health` en un host de tenant debe responder `visibleOrganizations: 1`.
4. **Auditoría inmutable.** Toda decisión de cumplimiento escribe un `AuditEvent` (actor, entidad, SHA-256 de la
   evidencia, snapshot en `payload`) en la misma transacción que el cambio. `audit_events` sólo admite SELECT/INSERT
   para los roles de la app (sin políticas UPDATE/DELETE + privilegios revocados). Las operaciones on-chain se encolan
   como `ChainTransaction` `PENDING` (outbox) y sólo `chain-executor.ts` las pasa a `CONFIRMED`, en orden de creación
   y tras `blockerFor()` (prelación: ningún `mintSubscription` mientras el `approveInvestor` de su wallet siga
   `PENDING`; y los reverts de los contratos sobre el historial confirmado: whitelist/freeze, pausa,
   `SubscriptionAlreadyProcessed`, `SupplyCapExceeded`). `executionMode` dice cómo: `RPC` (recibo de la red) o
   `SIMULATION` (`CHAIN_EXECUTION` por defecto: tx EIP-1559 firmada con `OPERATOR_PRIVATE_KEY`, nonce global
   secuencial, **nunca difundida**; `txHash = keccak256(signedTransaction)`). Toda vista que muestre un hash debe
   mostrar también el modo.
5. **Autenticación institucional** (`app/_lib/server/staff-auth.ts`, credenciales en `@rwaxi/database/credentials`).
   El personal entra con contraseña (scrypt) + TOTP RFC 6238 (6 dígitos, 30 s, ±1 paso, `totpLastStep` impide reusar
   un código; secreto cifrado AES-256-GCM con `AUTH_ENCRYPTION_KEY`, AAD = id del usuario; una cuenta sin MFA enrola
   un secreto nuevo que confirma su primer código): `{slug}.rwaxi.com/backoffice/login` (ES/EN/PT) y
   `admin.rwaxi.com/login` (ES). Cookie `rwaxi_session` (HttpOnly, del host) con un token opaco; `user_sessions`
   guarda sólo su SHA-256, el alcance `TENANT` (organización del host, leída bajo RLS: el token de otro tenant "no
   existe") o `PLATFORM` (sin organización, sólo `SUPER_ADMIN`, sólo host `admin`), expiración y revocación. Tras la
   contraseña hay una sesión pendiente (5 min, 5 códigos); al pasar el MFA el token rota (8 h tenant / 4 h consola,
   inactividad 60 / 30 min). «Cerrar sesión» la revoca. 5 fallos seguidos (contraseña o código) bloquean la cuenta
   15 min; 30 fallos por IP en 15 min se rechazan. Cada resultado es un `AuditEvent` (`LOGIN_SUCCEEDED`,
   `LOGIN_FAILED`, `MFA_FAILED`, `MFA_ENROLLED`, `ACCOUNT_LOCKED`, `LOGOUT`); los de la consola van sin organización
   (sólo esas acciones: CHECK `audit_events_platform_auth`). **Roles**: `COMPLIANCE_OFFICER` (KYC y llamadas al
   registro), `TENANT_ADMIN` (conciliación, mint, distribuciones), `TENANT_ANALYST` (sólo lectura). Una sesión real
   actúa sólo con su rol (`requireBackofficeSession(role)`; las mesas se leen con `{ view: true }` y muestran «Solo
   lectura»); cada fila de la cola la ejecuta el rol que la firma. **Sesión demo** (`RWAXI_DEMO_AUTH`: por defecto
   fuera de producción; `1` la fuerza, `0` exige siempre contraseña + MFA): sólo aplica sin sesión real, tiene ambos
   roles del tenant (o el primer `SUPER_ADMIN` en la consola, nunca en producción) y un navegador puede excluirse con
   la cookie `rwaxi_demo_auth=off` (la usa la suite `auth`). El seed da a todo el personal la contraseña demo
   `RwaxiDemo-2026!` y un secreto TOTP determinista (`SHA-256("rwaxi-demo-totp:" + email)[0..20]`,
   `seed-data/credentials.ts`); nunca en producción salvo `RWAXI_SEED_DEMO_CREDENTIALS=1`. **Activación**: los usuarios
   que crea el alta B2B nacen sin contraseña y reciben una invitación (`staff-invitations.ts`: token de un solo uso en
   el fragmento `#token=` de `{slug}.rwaxi.com/backoffice/activate`, en `user_invitations` sólo su SHA-256, 72 h; el
   correo va a `mail_outbox`; `STAFF_INVITED`). La activación (`staff-activation.ts`, ES/EN/PT) aplica la política de
   `app/_lib/password-policy.ts` en pantalla y en servidor (12–128, mayúsculas y minúsculas, número, símbolo, sin el
   nombre, el correo, la empresa ni «rwaxi»), deja contraseña (scrypt) y secreto TOTP en la invitación y sólo con el
   primer código válido, en una transacción, consume la invitación, activa la cuenta y abre una sesión verificada
   (`ACCOUNT_ACTIVATED`, `MFA_ENROLLED`, `LOGIN_SUCCEEDED`). Un enlace usado, revocado, vencido o de otro tenant no
   sirve. Si vence sin usarse, el Módulo A lo reenvía («Reenviar invitación», `resendStaffInvitation`, revoca los
   anteriores, `STAFF_INVITATION_RESENT`). La consola actúa con `requirePlatformAccess()`
   (`platformActor`); sus acciones van en `AuditEvent` de la organización afectada (que el backoffice del tenant
   también ve) con `subjectHash = evidenceHash({ action, organizationId, entityId, ...payload })`.
   El inversionista se identifica con la cookie `rwaxi_inv` (HttpOnly, HMAC con `INVESTOR_SESSION_SECRET`, ligada a la
   organización del host) emitida al firmar el NDA o al **recuperar la sesión** (`investor-recovery.ts`): un email ya
   registrado en el tenant **nunca** se asocia a un navegador nuevo por el NDA; «Recuperar mi sesión» envía un código
   de 6 dígitos (en `investor_otps` sólo su HMAC; 10 min; 5 intentos descontados atómicamente antes de comparar; un
   solo uso; uno nuevo reemplaza al anterior; 3 por 15 min y 10 por día por inversionista, 10 por hora por IP) con la
   misma respuesta exista o no el correo. Sin SMTP todavía, el correo queda en `mail_outbox` (y en la consola del
   servidor de desarrollo); recuperar escribe `INVESTOR_SESSION_RECOVERED`, agotar un código `INVESTOR_OTP_FAILED`.
   **Atribución firmada:** la vitrina emite en servidor (`app/vitrina/actions.ts`, sólo host `www`, sólo portales
   ACTIVE) `ref_rwx_<nonce>.<slug>.<emitidoMs>.<HMAC-SHA256(REFERRAL_SECRET)>` (`app/_lib/referral.ts`, Web Crypto,
   Edge y Node). El middleware guarda en `rwaxi_ref` sólo un token válido para el tenant del host (primer contacto) y
   `signNda()` lo vuelve a verificar: válido, del tenant, no caducado (30 días) y con id no usado → Lead `REFERRAL`;
   cualquier otra cosa → `DIRECT`. El id (`ref_rwx_<nonce>`) es `Lead.referralToken`: su unicidad impide reutilizarlo
   (la firma se exige en base64url canónico). Super-Admin (`platformPrisma()`, BYPASSRLS) sólo en el host `admin` y con
   una sesión `PLATFORM` con MFA (`requirePlatformAccess`).
6. **RWAXI no custodia el valor emitido.** En contratos, RWAXI sólo tiene `RWAXI_OPERATOR_ROLE` (factory) y
   `MINTER_ROLE`; pausa, Data Room, raíces de distribución (`DISTRIBUTION_ROLE`) y recuperación forzosa son del
   emisor; la whitelist es del oficial de cumplimiento del tenant. No añadir roles a RWAXI sin revisión legal. En modo
   `RPC` el operador sólo envía `mintSubscription` y, desde la consola Super-Admin, `deployTenantRegistry` (el registro
   creado queda con el admin y el oficial del tenant); `approveInvestor` lo firma el oficial y `anchorDistributionRoot`
   el emisor, igual que `updateDataRoomMerkleRoot`, cada uno con su propia wallet, y se registra su hash
   (`registerOfficerTransaction`, que exige recibo exitoso y el evento `InvestorWhitelisted` /
   `DistributionRootAnchored` / `DataRoomMerkleRootAnchored` con los argumentos en cola). En `SIMULATION`
   la clave del operador firma todo, sólo como demostración. Los controles de gobierno de la consola (suspender un portal,
   pausar la captación de una oferta, retirar de la vitrina) son **off-chain**: nunca pausan el token del emisor.
7. **Integridad documental.** Cada documento del Data Room se hashea (SHA-256) en el navegador; la raíz se calcula con
   `@rwaxi/blockchain-sdk/merkle` y se ancla con `updateDataRoomMerkleRoot`. NDA y suscripción citan esa raíz.
   El expediente KYC lo hashea **el servidor**: `KycCase.dossierHash = evidenceHash(KycCase.evidence)` (JSON canónico,
   claves ordenadas, estable tras `jsonb`); `evidence` guarda formulario, SHA-256 del contenido de cada documento,
   declaraciones y NDA, de modo que cualquiera puede recalcular el hash que va on-chain. La evidencia persistida usa
   `app/_lib/sha256.ts` (Web Crypto, falla si no puede); nunca el `sha256Hex()` del prototipo, que inventa un hash.
   **Bóveda documental** (`@rwaxi/document-vault`, `app/_lib/server/vault.ts`): los archivos detrás de esos hashes
   (KYC y Data Room) se guardan direccionados por contenido y aislados por tenant (`tenants/{organización}/sha256/
   {hex}`; `staging/sha256/{hex}` antes de que exista el tenant). Los bytes entran sólo por `POST /api/vault/upload`,
   que lee el tipo de los bytes (PDF, PNG, JPG, WebP; en el Data Room también DOCX/XLSX), aplica el tamaño máximo
   (KYC 10 MB, Data Room 20 MB) y recalcula el SHA-256: si no es exactamente el que declaró el navegador, no se
   escribe nada. KYC (sesión del inversionista con NDA) y alta B2B (consola, a staging) devuelven un recibo HMAC que
   `submitKyc()` / `onboardDeveloper()` exigen; el alta copia los archivos a la bóveda del tenant antes de crearlo. El
   Data Room del backoffice (sólo `TENANT_ADMIN`) crea el `DataRoomDocument`, recalcula la raíz y, con el token
   desplegado, deja un único `updateDataRoomMerkleRoot` `PENDING` (`DATA_ROOM_DOCUMENT_ADDED`). `vault_objects`
   (metadato, append-only, CHECK de que la clave es la de su tenant) registra cada archivo. Descargas, siempre
   re-hasheadas (si no coinciden: 409 y `VAULT_INTEGRITY_FAILED`) y auditadas: `GET /api/vault/kyc/{caso}/{front|back}`
   sólo para el Oficial y el Administrador del tenant (`KYC_DOCUMENT_VIEWED`); `GET /api/vault/data-room/{id}` para el
   inversionista con NDA de esa oferta (los restringidos, además, AccessGrant vigente) o con `?as=backoffice` para el
   personal (`DATA_ROOM_DOCUMENT_DOWNLOADED`); el portal vuelve a hashear la copia en el navegador. Driver
   `DOCUMENT_VAULT_DRIVER`: `local` (por defecto fuera de producción, `<repo>/.vault`, ignorado por git; el seed lo
   reinicia y escribe PDF deterministas de los Data Room demo) o `s3` (S3/Cloudflare R2/MinIO con SigV4 propio y
   payload firmado; obligatorio en producción, que sin configuración falla cerrada). En Vercel el cuerpo máximo de una
   petición es 4,5 MB: archivos mayores requerirán subida directa prefirmada al bucket (pendiente).
8. **Dominios propios**: mapa `DEFAULT_CUSTOM_DOMAINS` + `RWAXI_CUSTOM_DOMAINS` en `hosts.ts`
   (pendiente: Edge Config alimentado desde `Organization.customDomain`).

## Identidad visual (no inventar colores ni fuentes)

| Token Tailwind | Hex | Uso |
|---|---|---|
| `rxPurple` | `#2F145F` | Morado RWAXI · primario, botones |
| `rxDeep` | `#190A36` | Morado Noche · hero, barras oscuras |
| `lav` | `#C4B5FD` | Lavanda · acentos sobre oscuro |
| `rxGold` | `#B77A1E` | Oro · etiquetas editoriales (`goldInk` #8A5B12 para texto) |
| `rxAqua` | `#24B8D7` | Aqua · on-chain, estados verificados (`aquaInk` #0B6E86 para texto) |
| `rxBlue` | `#1453A0` | Azul institucional · links, focus ring |
| `rxOrange` | `#F28A22` | Naranja · degradado del logo |
| `cloud` | `#F5F6F8` | Gris Nube · fondo de la app |

Tipografía: **Cormorant Garamond** (display, `font-display`), **Montserrat** (texto, `font-sans`), **IBM Plex Mono**
(datos, hashes, direcciones; `font-mono`). Se cargan por `<link>` de Google Fonts en `app/layout.tsx` — no cambiar a
`next/font`: los renders en canvas usan los nombres de familia. En el portal White Label el color del tenant va en
`--tc` (`.tc-btn`, `.tc-text`, …) y debe cumplir contraste AA (`onColor()`).

## Internacionalización (i18n)

Dos alcances: la **vitrina** en 10 idiomas (es, en, pt, fr, de, ru, ar, zh, ja, ko; cookie `rwaxi_vitrina_lang`,
selector en el header) y **portal + backoffice** de cada tenant en es | en | pt (cookie `rwaxi_portal_lang`, por host:
la comparten portal y backoffice). La consola Super-Admin es sólo español. El layout lee la cookie en servidor
(`requestI18n`) y entrega el catálogo al `I18nProvider`: el primer render ya sale en el idioma, y cambiarlo no recarga.

- **La clave es el texto español** (estilo gettext): en español la salida es byte a byte la fuente, así que selectores
  E2E, valores persistidos y hashes no cambian; una traducción ausente cae al español. Nunca traducir un valor que se
  guarda o se hashea: se traduce al mostrarlo.
- Marcadores (los extrae `app/_i18n/extract.ts`, y `catalogs.test.ts` exige que cada catálogo los tenga):
  `tr("…", { vars })` y `rich("…", { nodos })` en componentes (`useI18n()`); `msg("…")` / `vmsg("…")` en tablas de
  datos (`vmsg` = también en la vitrina); en servidor `reason("…", vars)` y errores que extienden `LocalizedError`
  (`new XxxError("…", vars)`), que se muestran con `render(tr, e.reason)` y `tr = await requestTranslate(scope)`.
  Placeholders `{nombre}`, nunca template literals interpolados dentro del marcador. Plurales: pasar `count` y el
  catálogo da las formas CLDR. Ámbito por ruta: `_components/{vitrina,ui,shell}`, `vitrina/`, `_i18n/` son de la
  vitrina; el resto, de es/en/pt; `superadmin/` no se extrae. Tras añadir textos:
  `pnpm --filter @rwaxi/web exec tsx app/_i18n/extract.ts > sources.json` y completar `app/_i18n/messages/<idioma>.ts`
  (en y pt: todas las claves; los demás: las de la vitrina).
- **Maquetación**: `lang`/`dir` van en la raíz de `EnvironmentFrame` (`data-env`); el árabe (sólo vitrina) es `rtl`.
  Usar utilidades lógicas (`ms-`, `me-`, `ps-`, `start-`, `end-`, `text-start`, `border-s`) y `rtl:-scale-x-100` en
  iconos direccionales; cifras, porcentajes y códigos en `<Num>` (`<bdi dir="ltr">` + `tabular-nums`, dígitos
  latinos) y nombres legales en `<bdi>`. `globals.css` ajusta alemán (guiones, `overflow-wrap`), coreano
  (`word-break: keep-all`), japonés/chino (`line-break: strict`), quita el tracking en ar/zh/ja/ko y, como IBM Plex
  Mono no tiene glifos árabes, da a `font-mono` en árabe la sans árabe del sistema de respaldo. Los números
  siguen el idioma (`format.ts`, `setNumberLocale`, sólo en el navegador). El Inspector On-Chain es es/en/pt: desde la
  vitrina en otro idioma se abre en inglés (`TenantLanguages`), siempre `ltr`.
- **Frontera legal**: los avisos propios de RWAXI se traducen; las plantillas legales del tenant (NDA, plantillas de
  cumplimiento) se muestran en su original español vinculante (`lang="es"`) con un aviso traducido. La evidencia KYC
  y el acuerdo de suscripción (versión 2) registran el `language` en que el inversionista los vio.
- **Copy comercial de las ofertas**: `Offering.translations` (JSONB `{ idioma: { city, region, assetType,
  economicRight, legalWrapperNote } }`, lo aporta y aprueba el desarrollador); las columnas son el original español
  y el respaldo. Lo expone `rwaxi_public_offerings()` y lo aplica `localizeProject()` en vitrina y portal.

## Comandos

```bash
pnpm install                                   # instala todo el workspace
pnpm dev                                       # Next en http://localhost:3000 (turbo; genera Prisma antes)
pnpm build                                     # db:generate + contratos + next build
pnpm typecheck                                 # tsc en todos los paquetes
pnpm test                                      # contratos, SDK (Merkle, distribuciones), hosts, referidos, invariantes, alta B2B
pnpm audit:licenses                            # licencias del árbol de dependencias: falla con GPL/AGPL/SSPL en producción

pnpm --filter @rwaxi/database prisma generate  # cliente Prisma (alias: pnpm db:generate)
pnpm db:up                                     # Postgres 16 en Docker (crea roles rwaxi_app / rwaxi_platform)
pnpm db:deploy                                 # aplica migraciones con DIRECT_URL (owner)
pnpm db:migrate                                # prisma migrate dev (nuevas migraciones)
pnpm db:seed                                   # resetea y siembra Andes Urbano, Valle Alto y Avista
pnpm db:provision-app-role                     # crea/actualiza rwaxi_app (sin BYPASSRLS) y reaplica permisos
pnpm db:provision-app-role --rotate --write-env packages/database/.env --write-env apps/web/.env.local
pnpm -s db:provision-app-role --rotate --print-url | vercel env add DATABASE_URL production   # staging/prod

pnpm contracts:compile                         # hardhat compile + exporta ABIs a blockchain-sdk/src/abi
pnpm contracts:test                            # tests de cumplimiento (whitelist, freeze, clawback, roles)

pnpm e2e                                       # suites E2E (Chrome headless) contra pnpm dev + la BD de .env; reseedea
pnpm e2e portal onboarding                     # sólo esas (backoffice, portal, referrals-subscriptions, payments-queue,
                                               #   superadmin-ops, onboarding, distributions, i18n, auth, activation, vault)
pnpm e2e:rpc                                   # modo RPC: nodo Hardhat local (registry, token y factory) + next dev con
                                               #   CHAIN_EXECUTION=rpc y RWAXI_FACTORY_ADDRESS
pnpm e2e:strict                                # auth, activation y vault contra un next dev propio con RWAXI_DEMO_AUTH=0
                                               #   (puerto 3000 libre): ninguna petición puede caer en la sesión demo
```

E2E (`scripts/e2e`, paquete `@rwaxi/e2e`): cada suite verifica la UI y, por separado, las filas en la BD con
`DIRECT_URL` (recalcula hashes, firmas y nonces; `ownerDb()` repite sus lecturas tras un corte transitorio de Neon,
nunca sus escrituras). Requieren `pnpm dev` corriendo (salvo `e2e:rpc`, que exige el
puerto 3000 libre y levanta sus propios servicios), contratos compilados y Chrome/Edge (`CHROME_PATH` para otro).
Los secretos se leen en tiempo de ejecución de `packages/database/.env` y `apps/web/.env.local`; las cuentas de
Hardhat salen de su mnemónico público. Capturas en `scripts/e2e/.artifacts/` (ignorado por git). Reseedean la BD.

Entornos en local (Chrome/Edge resuelven `*.localhost` a 127.0.0.1):
`http://localhost:3000` (vitrina) · `http://admin.localhost:3000` · `http://avista.localhost:3000` ·
`http://santabarbara.localhost:3000/backoffice` · `http://elpoblado.localhost:3000`.
Variables: copiar `.env.example` a `.env`, `packages/database/.env` y `apps/web/.env.local`. La cola on-chain usa
`OPERATOR_PRIVATE_KEY` (0x + 64 hex) y `CHAIN_EXECUTION` (`simulation` por defecto; `rpc` exige `RPC_URL_<NETWORK>`)
en `apps/web/.env.local`; el alta B2B usa `RWAXI_FACTORY_ADDRESS` (vacía: la factory ya registrada en esa red).
Requiere Node ≥ 22.9 (`--env-file-if-exists`).
Windows: con `pnpm dev` corriendo, `prisma generate` (y por tanto `pnpm build`/`pnpm typecheck`) falla con `EPERM`
porque el servidor tiene cargado el motor de Prisma. Detener el dev server antes.

Provisionar un entorno (staging/prod): 1) `pnpm db:deploy` con el owner en `DIRECT_URL`; 2)
`pnpm db:provision-app-role` (primera vez crea el rol; después es idempotente y conserva la contraseña salvo
`--rotate`); 3) `DATABASE_URL` = URL que imprime `--print-url` (pooler de Neon, `connect_timeout=15`). Reejecutar el
paso 2 tras cada migración nueva. Para eliminar un rol creado así, revocar sus permisos antes de `DROP ROLE`
(en PostgreSQL 16 el creador no puede `DROP OWNED BY`).

## Convenciones

- **Código portado del prototipo** (`app/_components/**`, `app/_lib/**` salvo `hosts.ts`): conserva lógica y nombres
  cortos originales y lleva `// @ts-nocheck`. Al tocar un módulo, tiparlo y quitar el pragma; no reescribir en bloque.
  El estado de demo vive en `app/_components/shell/demo-provider.tsx` (antes `App`) y se renderiza sólo en cliente
  (`ClientOnly`) hasta migrar cada pantalla a datos de `@rwaxi/database` vía server actions.
  Migrado a BD: catálogo de la vitrina, portal del inversionista (Lead, NDA, KYC, AccessGrant, suscripción y
  portafolio), pestañas "Cumplimiento y Leads" y "Suscripciones y Pagos" del backoffice, Inspector pestaña 4 (cola
  `ChainTransaction` y su ejecución), pestaña "Distribuciones y Rendimientos" del backoffice y su reflejo en el
  portafolio, Super-Admin (consolidado, alta de desarrolladores, módulo A Gobierno, B Atribución y C Tarifas, libro
  mayor y facturación), login del personal con MFA, activación de cuentas invitadas, recuperación de sesión del
  inversionista y bóveda documental (Data Room del backoffice y del portal, documentos KYC). Siguen en estado demo:
  configuración White Label, emisión del token (minting) del backoffice y pestañas 1–3 del inspector.
- **Suscripciones**, en tres pasos, cada uno una transacción `withTenant` con transición condicional y `AuditEvent`:
  1. `subscribe()` (portal): KYC `APPROVED` + wallet; capital recalculado en servidor (`unitPriceUsd × units`, ticket
     mínimo, máx. 250.000 USD); unidades comprometidas con `UPDATE` condicional + `CHECK
     offerings_units_subscribed_range`. Token desplegado → `PAYMENT_PENDING` (referencia de transferencia
     `SUB-XXXXXXXX`, `paymentCodeOf`); pre-venta → `RESERVED`, sin pago, mint ni comisión hasta desplegar el token.
     `agreementHash = evidenceHash(acuerdo)`; el acuerdo queda en `AuditEvent SUBSCRIPTION_CREATED`. Sin mint ni fee.
  2. `confirmPayment()` (backoffice, `TENANT_ADMIN`, "Confirmar Pago Fiduciario"): referencia del comprobante
     normalizada (mayúsculas, 4–64) y única por tenant; `MINT_PENDING` + `paymentEvidenceRef = evidenceHash({ version,
     kind: "rwaxi.subscription.payment", subscriptionId, agreementHash, paymentReference })` + `ChainTransaction`
     `mintSubscription(subscriptionId, investor, amount, paymentEvidenceRef)` (el contrato no tiene
     `mint(wallet, amount)`) + `FeeLedgerEntry INFRASTRUCTURE_USAGE` (`feeUsagePct`, ACCRUED) + `PAYMENT_CONFIRMED`.
  3. Ejecución de la cola (`chain-actions.ts`, desde backoffice o inspector): registro → `COMPLIANCE_OFFICER`, mint →
     `TENANT_ADMIN`. Al confirmar: `CHAIN_TX_CONFIRMED`; whitelist → `KycCase.whitelistTxHash`; mint → `MINTED` +
     `mintTxHash` + `SUBSCRIPTION_MINTED`.
- **Gobierno de plataforma** (`app/superadmin/actions.ts`, motivo obligatorio para lo restrictivo, 10–300 caracteres):
  `SUSPENDED` → aviso institucional en el portal y `signNda`/`submitKyc`/`subscribe` rechazados (`activeTenant`);
  `REVIEW` → la vitrina muestra el proyecto sin enlace; `Offering.capturePausedAt` → la vitrina muestra «Captación
  pausada» sin enlace y `subscribe()` lo rechaza (también dentro del `UPDATE` atómico de unidades); las suscripciones
  ya firmadas siguen (conciliación y mint). `Organization.published` = isPublishedInRwaxi. La vitrina sólo emite
  referidos hacia portales ACTIVE, publicados y con alguna oferta captando.
- **Facturación B2B** (`FeeInvoice`, número único en la plataforma): una factura agrupa asientos `ACCRUED` de un solo
  desarrollador → `INVOICED`; registrar el pago (fecha ≤ hoy y ≥ emisión + comprobante) → la factura y sus asientos
  `PAID`. CHECK: `(status = ACCRUED) = (invoice_id IS NULL)` y pago con fecha y comprobante juntos. Las tarifas
  pactadas (`fee_setup_usd`, `fee_monthly_usd` ≥ 0, `fee_usage_pct` 0–10, CHECK) aplican a devengos futuros.
- **Alta B2B** (`onboardDeveloper()`, una transacción `platformPrisma()`; el servidor revalida todo con
  `parseOnboarding`): `Organization` en `REVIEW` y fuera de la vitrina (NIT con dígito de verificación DIAN, slug
  único fuera de `RESERVED_SLUGS`, color con contraste AA, tarifas pactadas), su `TENANT_ADMIN` y su
  `COMPLIANCE_OFFICER` (correo y wallet distintos), la primera oferta (`PRESALE` o `STRUCTURING`, código único en la
  plataforma) con su token `NOT_DEPLOYED` y su Data Room base (SHA-256 en el navegador, raíz recalculada con el SDK),
  el asiento `ONBOARDING_SETUP` `ACCRUED`, `deployTenantRegistry()` `PENDING` (factory: `RWAXI_FACTORY_ADDRESS` o la
  ya usada en la red) y `ORGANIZATION_ONBOARDED`. «Desplegar registro» (módulo A) lo ejecuta el operador RWAXI
  (`origin: "platform"`; desde el tenant está bloqueado); en `SIMULATION` la dirección es
  `CREATE(factory, 1 + rwaxi_factory_creations)`. Hasta entonces el oficial no puede aprobar KYC.
- **Distribuciones** (`declareDistribution()`, backoffice, `TENANT_ADMIN`): snapshot de tokens `MINTED` por
  inversionista; monto en USD o en COP a la tasa declarada → centavos USD; prorrata por mayor residuo y árbol de
  Merkle de `@rwaxi/blockchain-sdk/distribution` (hoja = `evidenceHash({ v: 1, kind: "rwaxi.distribution.allocation",
  distributionId, wallet, units, amountCents })`). Una transacción `withTenant`: `Distribution` (una por oferta y
  periodo; `distributionId = keccak256("rwaxi.distribution:{offeringId}:{periodo}")`), `DistributionAllocation`
  (append-only, con su `merkleProof`), `anchorDistributionRoot(distributionId, root, totalAmountCents,
  snapshotSupply)` `PENDING` y `DISTRIBUTION_DECLARED` (subjectHash = raíz). Al confirmarse → `ANCHORED`. El
  portafolio muestra las asignaciones del inversionista y verifica su prueba en el navegador.
- **Conexiones con Neon** (`packages/database/src/pool.ts`): `poolUrl()` añade a las URL de Prisma
  `pool_timeout=15` y `max_idle_connection_lifetime=30` salvo que la URL los fije (igual `connection_limit`; por
  defecto 2×CPU+1). Tras un fallo transitorio —pool agotado (P2024), servidor inalcanzable, conexión caída (P1017,
  `ConnectionReset`)— las lecturas de `forTenant` se repiten una vez y las escrituras sólo si nunca llegaron a la base;
  `withTenant()` y `transaction(client, fn)` sólo si la transacción no llegó a empezar: una escritura nunca se aplica
  dos veces. Lecturas directas (`$queryRaw`, cliente de plataforma): `retryTransient(fn, { repeatable: true })`.
- Errores únicos de Prisma (P2002): `isUniqueViolation(e)` de `@rwaxi/database`, nunca `instanceof
  Prisma.PrismaClientKnownRequestError` (con `transpilePackages` el cliente compartido y el namespace importado pueden
  ser copias distintas y el `instanceof` falla).
- Enums de negocio: `LeadSource` REFERRAL | DIRECT · `FeeKind` ONBOARDING_SETUP | MONTHLY_SAAS | INFRASTRUCTURE_USAGE.
  Renombrar valores con `ALTER TYPE … RENAME VALUE` escrito a mano (el diff de Prisma recrea el tipo y falla con datos).
  `PortalScreen` descarta el journey demo del prototipo y aplica el persistido antes de montar el portal.
- Patrón de pantalla persistida: página server (`dynamic = "force-dynamic"`) → `_lib/queries.ts` (`server-only`,
  devuelve un resultado `ok/error`, nunca lanza) → componente cliente tipado → `actions.ts` (`withTenant`, transición
  condicional de estado, `AuditEvent`, `revalidatePath`).
- Código nuevo: TypeScript estricto. Componentes de un solo entorno van colocados en `app/<entorno>/_components`.
- `packages/blockchain-sdk/src/abi/*` es generado: no editar; correr `pnpm contracts:compile` tras cambiar `.sol`.
  El fuente `.sol` es propietario: `app/_lib/server/sol-sources.ts` (`server-only`, copia literal de `contracts/src`)
  sólo sale por `/api/inspector/sources?as=backoffice|platform` hacia una sesión del backoffice (host del tenant) o de
  la consola (host admin), o con `RWAXI_INSPECTOR_SOURCE=1` (demo técnica). Los demás —vitrina, portal— ven la
  interfaz pública (ABI) y las invariantes de `app/_lib/chain/contracts.ts` (con los tamaños de runtime). Al cambiar
  un contrato, regenerar esa copia: `sol-sources.test.ts` falla si difiere.
- **Propiedad intelectual** (`PROPRIETARY.md`): el código es propietario de RWAXI. Todo paquete del workspace declara
  `"private": true` y `"license": "UNLICENSED"`; todo contrato propio empieza con `// SPDX-License-Identifier:
  UNLICENSED` y `// Copyright (c) 2026 RWAXI. All rights reserved. Proprietary and confidential.` Al añadir una
  dependencia, `pnpm audit:licenses` debe seguir pasando (sin copyleft fuerte en producción).
- Cambios de esquema: editar `schema.prisma` y crear migración con `pnpm db:migrate`. Toda tabla nueva de tenant
  necesita `organization_id`, `ENABLE`/`FORCE ROW LEVEL SECURITY` + política en su migración y, si referencia otra
  tabla de tenant, trigger `same_tenant`. Los privilegios por defecto dan SELECT/INSERT/UPDATE/DELETE a `rwaxi_app`:
  una tabla append-only debe revocar UPDATE/DELETE en su migración y en `scripts/provision-app-role.ts`.
- Validación de formularios: las reglas de UI (`validateStep`) se reaplican en el servidor, más listas cerradas
  (países, actividades, rangos). Emails y wallets se guardan en minúsculas (únicos por tenant).
- Copys fuente en español (Colombia), siempre con un marcador de i18n (ver Internacionalización); importes con
  `money()` (COP/USD, TRM de demo 4.100).
- Cifras, proyectos, direcciones y hashes de los seeds son ilustrativos.
