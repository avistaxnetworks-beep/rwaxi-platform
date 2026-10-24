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
  app/vitrina/           www.rwaxirealestate.com · _lib/catalog.ts: catálogo en vivo (listPublicOfferings → rwaxi_public_offerings)
                         _components: vitrina-screen, how-to-invest, supercharged-investment, developer-band,
                         legal-disclosure · _lib/links.ts (RWAXI_B2B_URL y anclas de la cabecera)
  app/superadmin/        admin.rwaxirealestate.com · actions.ts (gobierno, facturación B2B, onboarding y registro on-chain)
                         _lib/session.ts (sesión de plataforma) · _lib/onboarding.ts (validación del alta B2B)
  app/tenant/[slug]/     {slug}.rwaxirealestate.com (portal) y /backoffice
    actions.ts           onboarding persistido del inversionista: signNda(), submitKyc(), subscribe()
    _lib/journey.ts      journey del visitante leído de PostgreSQL (sesión por cookie firmada), con sus distribuciones
    _lib/tenant-view.ts  tenants dados de alta en la BD (no del prototipo): vista leída bajo RLS para el estado demo
    backoffice/          actions.ts (KYC: aprobar, rechazar, revocar; congelar wallets) · payment-actions.ts
                         (confirmPayment) · chain-actions.ts (ejecutar la cola, firmar con wallet EIP-1193 y pedir
                         MINTER_ROLE para la wallet del emisor) · distribution-actions.ts (declareDistribution) ·
                         _lib/queries.ts (bandeja de cumplimiento) · _lib/subscriptions-desk.ts (Suscripciones y Pagos)
                         _lib/distributions-desk.ts (Distribuciones) · _components/wallet-sign.tsx (firma en el navegador)
  app/_lib/server/       tenant-context, staff-auth (contraseña + TOTP, sesiones), staff-invitations + staff-activation
                         (cuentas del alta B2B), investor-session (HMAC), investor-recovery (código por correo) +
                         mail-outbox (MailDispatcher, redacción), vault + vault-access + vault-uploads (bóveda documental:
                         quién sube qué, subida directa prefirmada), rate-limit (límites en PostgreSQL), chain-queue
                         (calldata viem, puro), chain-invariants (prelación + reverts de los contratos + cotejo de la tx
                         de una wallet, puro), chain-executor (firma, confirma y verifica las firmas de wallet),
                         cron-auth (Bearer CRON_SECRET en tiempo constante, puro) y maintenance (lote correo + GC)
  app/_components/auth/  login del personal (contraseña → TOTP o enrolamiento) y cuenta en la cabecera
  app/_lib/referral.ts   tokens de referido firmados (HMAC-SHA256, Web Crypto: middleware y Server Actions)
  app/_i18n/             i18n: config (idiomas, cookies), provider (useI18n), server (requestTranslate, render),
                         marks (msg, vmsg, reason, LocalizedError), messages/<idioma>.ts, extract.ts + catalogs.test.ts
  app/superadmin/_lib/   métricas consolidadas con platformPrisma() (rol BYPASSRLS, sólo host admin)
  app/api/chain/transactions  cola ChainTransaction del tenant del host (Inspector On-Chain, pestaña 4)
  app/api/inspector/sources   fuente .sol de los contratos, sólo con sesión de backoffice/consola (inspector-access.ts)
  app/api/vault/         upload (KYC, staging del alta, Data Room; + upload/presign y upload/confirm: subida directa al
                         bucket) · kyc/[caso]/[lado] · data-room/[id] (bóveda documental)
  app/api/internal/maintenance  lote de mail:dispatch + vault:gc por HTTP (Vercel Cron; Authorization: Bearer CRON_SECRET)
  app/_components/       UI portada del prototipo (ui, shell, vitrina, portal, backoffice, superadmin, inspector, legal)
  app/_lib/              datos, formato, renders canvas, simulador on-chain del prototipo
packages/database        Prisma 6 · esquema multi-tenant (23 entidades) · RLS · cliente con tenant · seed
                         credentials.ts (scrypt, TOTP RFC 6238, AES-256-GCM, tokens y códigos de un solo uso)
  scripts/               provision-app-role.ts (rol de la app sujeto a RLS, idempotente) · vault-gc.ts (pnpm vault:gc)
packages/blockchain-sdk  merkle.ts (SHA-256 Data Room) · distribution.ts (prorrata en centavos + árbol de asignaciones)
                         canonical.ts (evidenceHash) · evm-adapter.ts (Viem, ITokenizationAdapter) · abi/ (generado)
packages/document-vault  DocumentVault: políticas (tipo por magic bytes, tamaño, SHA-256), claves por contenido y
                         tenant, drivers local (disco privado) y s3 (S3/R2 con SigV4; URLs prefirmadas PUT/GET con
                         presignV4, ListObjectsV2) · gc.ts (purgeUnreferencedBlobs) · sample.ts (PDF deterministas)
packages/mail            MailDispatcher (entrega y redacción de mail_outbox) · drivers Resend, Postmark, webhook firmado
                         y desarrollo (log) · scripts/dispatch.ts (pnpm mail:dispatch)
contracts                Hardhat 2 · solc 0.8.24 · @openzeppelin/contracts 5.6.1 (versión exacta: bytecode determinista)
```

## Arquitectura multi-tenant: 4 entornos

| Entorno | Host | Ruta interna | Marca | Quién |
|---|---|---|---|---|
| Vitrina pública | `www.rwaxirealestate.com` / `rwaxirealestate.com` | `/vitrina` | RWAXI | público |
| Portal White Label | `{slug}.rwaxirealestate.com` o dominio verificado | `/tenant/[slug]` | desarrollador ("Powered by RWAXI") | inversionista |
| Backoffice | `{slug}.rwaxirealestate.com/backoffice` | `/tenant/[slug]/backoffice` | desarrollador | tenant admin, oficial de cumplimiento |
| Consola Super-Admin | `admin.rwaxirealestate.com` | `/superadmin` | RWAXI | Dirección RWAXI |

Dominios: `rwaxirealestate.com` es el dominio exclusivo de la plataforma (`PLATFORM_DOMAIN` en `hosts.ts`; en
producción `NEXT_PUBLIC_PLATFORM_DOMAIN`, que prima sobre el antiguo `NEXT_PUBLIC_ROOT_DOMAIN`; en local
`localhost:3000`). `rwaxi.com` es el sitio corporativo B2B de RWAXI, otro sitio web: la app nunca lo sirve y la vitrina
sólo enlaza a él (`RWAXI_B2B_URL`). Los correos del personal RWAXI siguen en `@rwaxi.com`; los transaccionales salen de
`no-reply@notifications.rwaxirealestate.com`.

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
   sin datos de inversionistas), `rwaxi_next_simulated_nonce` (siguiente nonce del operador RWAXI, un contador global),
   `rwaxi_factory_creations` (contratos que la factory ya creó en simulación: el nonce de su próximo `CREATE`),
   `rwaxi_rate_limit_hit` (límites de tasa de la plataforma: `rate_limit_hits` no es accesible de otro modo, RLS sin
   política y sin privilegios), `rwaxi_redact_expired_mail` (sólo borra cuerpos de correo cuyo código o enlace venció)
   y, para el mantenimiento por HTTP (sin owner ni BYPASSRLS), `rwaxi_mail_due` (id y organización de los correos que
   toca intentar, sin cuerpos), `rwaxi_mail_fail_exhausted` (los que agotaron sus intentos → `FAILED`, sin cuerpo) y
   `rwaxi_vault_referenced_keys` (sólo las claves que la GC de la bóveda debe conservar).
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
   `PENDING`, las llamadas al registro de una wallet en orden, los `updateDataRoomMerkleRoot` de un token en orden; y
   los reverts de los contratos sobre el historial confirmado: whitelist/freeze, `InvestorNotApproved`, pausa,
   `SubscriptionAlreadyProcessed`, `SupplyCapExceeded`). `executionMode` dice cómo: `RPC` (recibo de la red) o
   `SIMULATION` (`CHAIN_EXECUTION` por defecto: tx EIP-1559 firmada con `OPERATOR_PRIVATE_KEY`, nonce global
   secuencial, **nunca difundida**; `txHash = keccak256(signedTransaction)`). Toda vista que muestre un hash debe
   mostrar también el modo.
5. **Autenticación institucional** (`app/_lib/server/staff-auth.ts`, credenciales en `@rwaxi/database/credentials`).
   El personal entra con contraseña (scrypt) + TOTP RFC 6238 (6 dígitos, 30 s, ±1 paso, `totpLastStep` impide reusar
   un código; secreto cifrado AES-256-GCM con `AUTH_ENCRYPTION_KEY`, AAD = id del usuario; una cuenta sin MFA enrola
   un secreto nuevo que confirma su primer código): `{slug}.rwaxirealestate.com/backoffice/login` (ES/EN/PT) y
   `admin.rwaxirealestate.com/login` (ES). Cookie `rwaxi_session` (HttpOnly, del host) con un token opaco; `user_sessions`
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
   el fragmento `#token=` de `{slug}.rwaxirealestate.com/backoffice/activate`, en `user_invitations` sólo su SHA-256, 72 h; el
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
   misma respuesta exista o no el correo; recuperar escribe `INVESTOR_SESSION_RECOVERED`, agotar un código
   `INVESTOR_OTP_FAILED`. **Correo** (`mail-outbox.ts` + `@rwaxi/mail`): `queueMail()` lo deja en `mail_outbox` en la
   transacción del cambio (con `body_sha256`, la fila que lleva —`related_id`: el OTP o la invitación— y su
   vencimiento) y el `MailDispatcher` lo entrega **después de responder** (`after()`: el tiempo de respuesta no
   revela si salió un correo), un intento a la vez (arrendamiento de 2 min), hasta 5, con el id de la fila como
   clave de idempotencia. Driver (`MAIL_DRIVER` o el proveedor cuya clave exista; `MAIL_FROM` obligatorio): `resend`
   (`RESEND_API_KEY`), `postmark` (`POSTMARK_SERVER_TOKEN`), `webhook` (`MAIL_WEBHOOK_URL` + `MAIL_WEBHOOK_SECRET`,
   HMAC sobre `timestamp.body`) o `dev` (por defecto fuera de producción: el log del servidor, prohibido en
   producción; sin proveedor en producción no se entrega nada). **Redacción**: el cuerpo (código o enlace en claro)
   se borra al enviarse (`SENT`), al fallar (`FAILED`), al usarse (`CONSUMED`), al reemplazarlo otro (`SUPERSEDED`) o
   al vencer (`EXPIRED`, `rwaxi_redact_expired_mail()`: en cada entrega y en `pnpm mail:dispatch` o
   `/api/internal/maintenance`, que además reintentan los pendientes); quedan destinatario, asunto, hash, proveedor,
   id del mensaje y fechas (CHECKs
   `mail_outbox_*`). Con el driver `dev` el correo queda `CAPTURED` y legible hasta usarse o vencer: así lo leen el
   desarrollo local y las suites E2E; `pnpm e2e:strict` entrega por un proveedor HTTP de prueba y lee su copia.
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
   creado queda con el admin y el oficial del tenant); `approveInvestor`/`revokeInvestor`/`setFrozen` los firma el
   oficial y `anchorDistributionRoot` el emisor, igual que `updateDataRoomMerkleRoot`, cada uno con su propia wallet:
   - **en el navegador (EIP-1193, «Firmar con mi wallet»** en la cola on-chain y en la mesa de distribuciones):
     `prepareWalletTransaction` devuelve la llamada exacta (`to` = contrato del tenant, `data` = calldata de los ABI
     del SDK, `chainId`, cuenta autorizada = wallet registrada del usuario, que el servidor comprueba on-chain con
     `hasRole` y una ejecución en seco); el navegador comprueba con la propia wallet la cuenta conectada, la red
     (`wallet_switchEthereumChain`) y el rol (`eth_call hasRole`) antes de `eth_sendTransaction`; y
     `confirmWalletTransaction` sólo acepta la tx que el nodo muestre firmada por esa wallet, dirigida a ese contrato,
     con ese calldata, sin valor y en esa cadena (`walletTxMismatch`), la reclama por su hash (el operador ya no puede
     enviarla; «Verificar recibo» o «Procesar cola» la concilian) y la confirma con recibo exitoso y el evento en cola
     (`CHAIN_TX_CONFIRMED` con `via: "wallet"`). Una tx revertida libera la fila para firmarla de nuevo;
   - **o desde cualquier wallet (multisig incluida)**, registrando después su hash (`registerOfficerTransaction`:
     recibo exitoso y el evento `InvestorWhitelisted` / `InvestorRevoked` / `InvestorFreezeUpdated` /
     `DistributionRootAnchored` / `DataRoomMerkleRootAnchored` / `RoleGranted` con los argumentos en cola).
   **Mint firmado por el emisor (opcional, sólo RPC):** por defecto `mintSubscription` lo envía el operador RWAXI con su
   `MINTER_ROLE`. En «Suscripciones y Pagos» el panel «Firma de mint del emisor» lee el token por cada oferta desplegada
   (`readIssuerRoles`: `hasRole` de la wallet registrada del Administrador) y, si esa wallet tiene `DEFAULT_ADMIN_ROLE`
   y aún no `MINTER_ROLE`, «Habilitar MINTER_ROLE para mi wallet» (`requestIssuerMinterRole`, `TENANT_ADMIN`) encola
   `grantRole(MINTER_ROLE, wallet registrada)` (`MINTER_ROLE_GRANTED` + `MINTER_ROLE_REQUESTED`; nunca para la wallet
   del operador ni para otra cuenta: `prepareWalletCall` lo vuelve a exigir) que firma esa misma wallet con su
   `DEFAULT_ADMIN_ROLE`. Desde entonces puede firmar sus mint por EIP-1193; RWAXI no recibe ningún rol y conserva sólo
   el `MINTER_ROLE` que ya tenía (en `SIMULATION` no aplica).
   En `SIMULATION` la clave del operador firma todo, sólo como demostración (sin firma por wallet). Los controles de
   gobierno de la consola (suspender un portal, pausar la captación de una oferta, retirar de la vitrina) son
   **off-chain**: nunca pausan el token del emisor.
7. **Integridad documental.** Cada documento del Data Room se hashea (SHA-256) en el navegador; la raíz se calcula con
   `@rwaxi/blockchain-sdk/merkle` y se ancla con `updateDataRoomMerkleRoot`. NDA y suscripción citan esa raíz.
   El expediente KYC lo hashea **el servidor**: `KycCase.dossierHash = evidenceHash(KycCase.evidence)` (JSON canónico,
   claves ordenadas, estable tras `jsonb`); `evidence` guarda formulario, SHA-256 del contenido de cada documento,
   declaraciones y NDA, de modo que cualquiera puede recalcular el hash que va on-chain. La evidencia persistida usa
   `app/_lib/sha256.ts` (Web Crypto, falla si no puede); nunca el `sha256Hex()` del prototipo, que inventa un hash.
   **Bóveda documental** (`@rwaxi/document-vault`, `app/_lib/server/vault.ts`): los archivos detrás de esos hashes
   (KYC y Data Room) se guardan direccionados por contenido y aislados por tenant (`tenants/{organización}/sha256/
   {hex}`; `staging/sha256/{hex}` antes de que exista el tenant; `incoming/{nonce}` en cuarentena). Quién sube qué
   está en `vault-uploads.ts`. Los bytes entran por `POST /api/vault/upload` (multipart, bóveda local) o, con S3/R2,
   **directo al bucket**: `upload/presign` revisa lo declarado (tamaño, tipo, SHA-256) y entrega un PUT prefirmado de
   15 min que firma `content-length`, `content-type`, `x-amz-content-sha256` y `x-amz-meta-sha256` (el bucket
   rechaza otros bytes, otro tamaño u otro tipo) hacia `incoming/` con un ticket HMAC (clave distinta a la de los
   recibos); `upload/confirm` vuelve a autorizar, exige el ticket del mismo sujeto y relee el objeto. En ambos casos
   el servidor lee el tipo de los bytes (PDF, PNG, JPG, WebP; en el Data Room también DOCX/XLSX), aplica el tamaño
   máximo (KYC 10 MB, Data Room 20 MB) y recalcula el SHA-256: si no es exactamente el declarado, no se guarda nada
   (la cuarentena se borra). Límites (`rwaxi_rate_limit_hit`, compartidos entre instancias): 120 cargas por IP y 20
   por sesión cada 10 min (`VAULT_UPLOADS_PER_IP`, `VAULT_UPLOADS_PER_SESSION`; 429 + `Retry-After`). KYC (sesión
   del inversionista con NDA) y alta B2B (consola, a staging) devuelven un recibo HMAC que
   `submitKyc()` / `onboardDeveloper()` exigen; el alta copia los archivos a la bóveda del tenant antes de crearlo. El
   Data Room del backoffice (sólo `TENANT_ADMIN`) crea el `DataRoomDocument`, recalcula la raíz y, con el token
   desplegado, deja un único `updateDataRoomMerkleRoot` `PENDING` (`DATA_ROOM_DOCUMENT_ADDED`). `vault_objects`
   (metadato, append-only, CHECK de que la clave es la de su tenant) registra cada archivo. Descargas, siempre
   re-hasheadas (si no coinciden: 409 y `VAULT_INTEGRITY_FAILED`) y auditadas: `GET /api/vault/kyc/{caso}/{front|back}`
   sólo para el Oficial y el Administrador del tenant (`KYC_DOCUMENT_VIEWED`); `GET /api/vault/data-room/{id}` para el
   inversionista con NDA de esa oferta —el NDA abre el 100 % de su Data Room, también los documentos marcados
   «reservados» (`restricted`, una clasificación informativa del desarrollador): el KYC es requisito para invertir, no
   para leer—, salvo que esté revocado (último `KycCase` de la oferta `REVOKED`: 403 en todos), o con
   `?as=backoffice` para el personal (`DATA_ROOM_DOCUMENT_DOWNLOADED`, con `access: "nda"` y el `kycStatus` del
   inversionista); el portal vuelve a hashear la copia en el navegador. Con S3/R2 un
   archivo mayor que `DOCUMENT_VAULT_INLINE_MAX_BYTES` (4 MB: el cuerpo de una función de Vercel llega a 4,5 MB) sale
   por un 302 a un GET prefirmado de 60 s (nombre y tipo firmados) tras cotejar su `x-amz-meta-sha256` con el
   registro (`delivery: "presigned"` en la auditoría; los menores, `inline`, re-hasheados). Driver
   `DOCUMENT_VAULT_DRIVER`: `local` (por defecto fuera de producción, `<repo>/.vault`, ignorado por git; el seed lo
   reinicia y escribe PDF deterministas de los Data Room demo) o `s3` (S3/Cloudflare R2/MinIO con SigV4 propio y
   payload firmado; obligatorio en producción, que sin configuración falla cerrada; el bucket necesita CORS para los
   orígenes de los portales: `PUT`/`GET` con las cabeceras `content-type`, `x-amz-content-sha256`, `x-amz-meta-sha256`
   y exponer `content-disposition`). **GC** (`pnpm vault:gc` o `/api/internal/maintenance`): borra los objetos que
   ninguna fila referencia (`vault_objects`, `data_room_documents`) pasada su ventana de gracia (24 h; nunca menos de
   6 h, lo que vive un recibo): cuarentenas sin confirmar, staging de altas abandonadas o ya copiadas, recibos nunca
   usados.
   **Mantenimiento por HTTP** (`GET|POST /api/internal/maintenance`, `maintenance.ts`): el lote de `pnpm mail:dispatch`
   + `pnpm vault:gc` para Vercel Cron, en cualquier host (actúa sobre todos los tenants, nunca sobre el del host) y
   sólo con `Authorization: Bearer <CRON_SECRET>` (`cron-auth.ts`: SHA-256 de ambos lados + `timingSafeEqual`; sin
   secreto de ≥ 32 caracteres responde 503, con otro 401). Parámetros: `?only=mail|vault`, `?limit=1…500` (correos),
   `?graceHours=≥6` y `?dryRun=1` (GC); inválidos → 400 sin ejecutar nada. Responde un resumen auditable (`runId`,
   tiempos, opciones, disparador, resultado de cada paso y `digest` = `evidenceHash` del resto; la misma línea va al
   log del servidor): 200 si todo salió bien, 500 si falló un paso. Vercel Cron envía `GET` con el secreto si el
   proyecto define `CRON_SECRET`: `{ "crons": [{ "path": "/api/internal/maintenance", "schedule": "0 3 * * *" }] }`
   en `vercel.json` (el plan Hobby sólo admite crons diarios; con Pro, p. ej. `?only=mail` cada 10 min y la GC diaria).
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

Logo oficial: `apps/web/public/brand/rwaxi-logo-principal.webp` (original, 4400×1800, fondo transparente) y
`rwaxi-logo-wordmark.webp` (derivado: sin márgenes ni el lema horneado, 3× el tamaño del header), que usa
`ui/logo.tsx` (`OFFICIAL_LOGO_SRC`, 34 px de alto en móvil y 37 px desde `md`); el lema «Activos reales ·
Inversiones digitales» sigue siendo texto traducible debajo. Regenerar el derivado si cambia el original.

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
pnpm vault:gc [-- --dry-run --grace-hours 24]  # GC de la bóveda configurada (owner): objetos sin referencia vencidos
pnpm mail:dispatch                             # reintenta los correos PENDING y redacta los vencidos (para un cron)
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/internal/maintenance   # ambos, por HTTP

pnpm contracts:compile                         # hardhat compile + exporta ABIs a blockchain-sdk/src/abi
pnpm contracts:test                            # tests de cumplimiento (whitelist, freeze, clawback, roles)

pnpm e2e                                       # suites E2E (Chrome headless) contra pnpm dev + la BD de .env; reseedea
pnpm e2e portal onboarding                     # sólo esas (backoffice, portal, referrals-subscriptions, payments-queue,
                                               #   superadmin-ops, onboarding, distributions, revocation, i18n, auth,
                                               #   activation, vault, maintenance)
pnpm e2e:rpc                                   # modo RPC: nodo Hardhat local (registry, token y factory) + next dev con
                                               #   CHAIN_EXECUTION=rpc y RWAXI_FACTORY_ADDRESS; suites rpc (operador y
                                               #   hashes registrados) y wallet (EIP-1193 inyectado: `pnpm e2e:rpc wallet`)
pnpm e2e:strict                                # auth, activation, vault y maintenance contra un next dev propio con
                                               #   RWAXI_DEMO_AUTH=0 (puerto 3000 libre): ninguna petición puede caer en la
                                               #   sesión demo; el correo sale por un proveedor HTTP de prueba (puerto 4010)
pnpm e2e:s3                                    # vault-s3: bóveda en un bucket S3 de prueba que verifica SigV4 (puerto
                                               #   9000): subida directa prefirmada, GET prefirmado, pnpm vault:gc y la GC
                                               #   por /api/internal/maintenance
```

E2E (`scripts/e2e`, paquete `@rwaxi/e2e`): cada suite verifica la UI y, por separado, las filas en la BD con
`DIRECT_URL` (recalcula hashes, firmas y nonces; `ownerDb()` repite sus lecturas tras un corte transitorio de Neon,
nunca sus escrituras). Requieren `pnpm dev` corriendo (salvo `e2e:rpc`, `e2e:strict` y `e2e:s3`, que exigen el
puerto 3000 libre y levantan sus propios servicios), contratos compilados y Chrome/Edge (`CHROME_PATH` para otro).
Los secretos se leen en tiempo de ejecución de `packages/database/.env` y `apps/web/.env.local`; las cuentas de
Hardhat salen de su mnemónico público. Capturas en `scripts/e2e/.artifacts/` (ignorado por git). Reseedean la BD.
Dobles de prueba propios: `fake-s3.cjs` (bucket S3 que verifica SigV4 por su cuenta, CORS, ListObjectsV2) y
`fake-mail.cjs` (API de Resend); `wallet.cjs` inyecta `window.ethereum` y firma en Node con una cuenta de Hardhat
(la clave nunca llega a la página ni al servidor), y puede portarse mal (otra red, otra cuenta, otro calldata u otro
contrato, otro firmante, una tx revertida o sin minar) para probar que nada se confirma. `revocation` cubre congelar,
descongelar y revocar desde la bandeja (simulación) y lo que ve el portal; `wallet` firma con la wallet del Oficial
`setFrozen` y el `revokeInvestor` de una revocación, y con la del Administrador su `grantRole(MINTER_ROLE)` y su mint;
`maintenance` llama al endpoint con `CRON_SECRET` como lo haría Vercel Cron.

Entornos en local (Chrome/Edge resuelven `*.localhost` a 127.0.0.1):
`http://localhost:3000` (vitrina) · `http://admin.localhost:3000` · `http://avista.localhost:3000` ·
`http://santabarbara.localhost:3000/backoffice` · `http://elpoblado.localhost:3000`.
Variables: copiar `.env.example` a `.env`, `packages/database/.env` y `apps/web/.env.local`. La cola on-chain usa
`OPERATOR_PRIVATE_KEY` (0x + 64 hex) y `CHAIN_EXECUTION` (`simulation` por defecto; `rpc` exige `RPC_URL_<NETWORK>`)
en `apps/web/.env.local`; el alta B2B usa `RWAXI_FACTORY_ADDRESS` (vacía: la factory ya registrada en esa red).
Correo: `MAIL_DRIVER`, `MAIL_FROM` y la clave del proveedor (`RESEND_API_KEY`, `POSTMARK_SERVER_TOKEN` o
`MAIL_WEBHOOK_URL` + `MAIL_WEBHOOK_SECRET`); bóveda: `DOCUMENT_VAULT_*`, `S3_*`, `VAULT_UPLOADS_PER_*`;
mantenimiento por HTTP: `CRON_SECRET` (≥ 32 caracteres; la suite `maintenance` lo lee de `apps/web/.env.local`) (ver
`.env.example`). Valores no secretos de producción (documentados en `.env.example`):
`NEXT_PUBLIC_PLATFORM_DOMAIN=rwaxirealestate.com`, `S3_BUCKET=rwaxi-vault-prod`, `S3_REGION=auto` (R2) y
`MAIL_FROM="RWAXI Real Estate <no-reply@notifications.rwaxirealestate.com>"`. Requiere Node ≥ 22.9
(`--env-file-if-exists`).
Vercel: `schema.prisma` genera también el motor `rhel-openssl-3.0.x` (`binaryTargets`), `@rwaxi/database` corre
`prisma generate` en `postinstall` y `next.config.mjs` inyecta `@prisma/nextjs-monorepo-workaround-plugin` (misma versión
que Prisma) en el bundle de servidor, que copia el motor a `.next/server/chunks`: sin eso, en el monorepo pnpm el
cliente no encuentra su Query Engine en producción. Al actualizar Prisma, actualizar el plugin a la misma versión.
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
  **En un build de producción** (`IS_PRODUCTION_BUILD`, `app/_lib/runtime.ts`: `NODE_ENV` que Next fija al compilar,
  ninguna variable de entorno lo cambia) no existe el andamiaje de simulación: ni la barra «Simulación de
  arquitectura» (`EnvironmentFrame`), ni los proyectos ilustrativos del prototipo como respaldo del catálogo o del hero,
  ni el aviso «Catálogo en vivo no disponible» (el servidor ni siquiera lo envía): si la base no responde, la vitrina
  queda sin proyectos y el fallo va al log del servidor. Fuera de producción todo sigue igual (las suites E2E lo usan).
  Migrado a BD: catálogo de la vitrina, portal del inversionista (Lead, NDA, KYC, AccessGrant, suscripción y
  portafolio), pestañas "Cumplimiento y Leads" y "Suscripciones y Pagos" del backoffice, Inspector pestaña 4 (cola
  `ChainTransaction` y su ejecución), pestaña "Distribuciones y Rendimientos" del backoffice y su reflejo en el
  portafolio, Super-Admin (consolidado, alta de desarrolladores, módulo A Gobierno, B Atribución y C Tarifas, libro
  mayor y facturación), login del personal con MFA, activación de cuentas invitadas, recuperación de sesión del
  inversionista y bóveda documental (Data Room del backoffice y del portal, documentos KYC). Siguen en estado demo:
  configuración White Label, emisión del token (minting) del backoffice y pestañas 1–3 del inspector. Tipados ya:
  los paneles del portal (`portal`, `funnel-stepper`, `portal-header`, `nda-panel`, `kyc-panel`, `subscription-panel`,
  `data-room-panel`, `signed-doc-modal`, `tenant-brand`, tipos en `_components/portal/portal-types.ts`), `ui/logo`,
  `backoffice/config-tab` y
  `backoffice/data-mint-tab`,
  `ui/primitives`, `ui/form`, `vitrina-nav` y `_lib/data/legal`.
- **Embudo del inversionista** (portal): 1 NDA → 2 Data Room (el NDA abre todos sus documentos) → 3 KYC/AML (requisito
  para invertir) → 4 suscripción, pago fiduciario y portafolio (`STEP` en `portal-types.ts`). El visitante aterriza en
  el Data Room al firmar el NDA, en el KYC mientras está en curso y en la suscripción con el KYC aprobado (o con
  tokens). El Data Room ofrece «Quiero invertir en este proyecto — Completar KYC y Suscribir» (Paso 3). El
  `AccessGrant` se sigue emitiendo al aprobar el KYC (elegibilidad, revocado con el KYC) pero ya no gobierna el Data
  Room; la suscripción se habilita con el KYC `APPROVED`. Con la wallet congelada (o congelándose: `walletFrozen()`,
  `journey.frozen`) el portal cambia el botón de suscribir por el aviso y `subscribe()` lo rechaza.
- **Vitrina comercial** (conversión del inversionista; `app/vitrina/_components`): cabecera con sólo tres anclas —
  «Oportunidades» (`#oportunidades`), «Cómo Invertir» (`#como-funciona`, los 4 pasos del embudo y la nota sobre
  blockchain) e «Inversión Supercargada» (`#beneficios-tokenizacion`, 4 beneficios y el comparativo finca raíz
  tradicional · fraccionamiento en papel · blockchain: tabla en escritorio, filas apiladas en móvil)— y el enlace B2B
  «¿Eres desarrollador? Tokeniza tu inmueble →», más una banda B2B antes del footer, ambos a `RWAXI_B2B_URL`
  (`app/vitrina/_lib/links.ts`, `https://rwaxi.com`). El footer lleva el aviso legal y regulatorio (B2B SaaS no
  custodio, emisor autónomo, sin oferta pública ni asesoría, riesgos y proyecciones) en lugar de la antigua sección
  «Frontera legal». La suite `i18n` mide en los 10 idiomas, a 1360 y 390 px, textos desbordados, scroll horizontal y
  solapamientos de la cabecera.
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
     `TENANT_ADMIN` (en modo RPC también con su propia wallet, regla 6). Al confirmar: `CHAIN_TX_CONFIRMED`;
     whitelist → `KycCase.whitelistTxHash`; mint → `MINTED` + `mintTxHash` + `SUBSCRIPTION_MINTED`. Una revocación
     cancela las suscripciones aún sin emitir (ver «Revocación y congelamiento»).
- **Revocación y congelamiento** (bandeja de cumplimiento, `COMPLIANCE_OFFICER`, ES/EN/PT; justificación 10–300
  caracteres, revalidada en servidor):
  - `revokeInvestor(kycCaseId, causal, nota)` sobre un KYC `APPROVED`, con una causal de `REVOCATION_REASONS` (listas
    restrictivas, ROS a la UIAF, información desvirtuada, autoridad competente, otra). En una transacción `withTenant`
    (bloquea al inversionista, igual que `subscribe()`): `KycCase` `REVOKED` (`revokedAt`, `revokedById`,
    `revocationReason`, `revocationNote`; CHECK `kyc_cases_revocation_check`), sus `AccessGrant` revocados, cada
    suscripción sin emitir (`RESERVED`/`PAYMENT_PENDING`/`MINT_PENDING`) → `CANCELLED` (`cancelledAt`,
    `cancellationReason = KYC_REVOKED`) con sus unidades devueltas a `units_subscribed`, su `mintSubscription` sin
    enviar → `ChainTransaction` `CANCELLED` y su fee `ACCRUED` → `VOIDED` (`voidedAt`; la consola no lo cuenta como
    ingreso; uno ya facturado se lista en la auditoría). Un pago ya conciliado queda marcado «reembolso pendiente»
    (se devuelve fuera de la plataforma). Un `approveInvestor` aún sin enviar se retira; una whitelist confirmada se
    deshace con `revokeInvestor(wallet)` `PENDING` (lo firma el oficial). `KYC_REVOKED` + un
    `SUBSCRIPTION_CANCELLED` por suscripción. Se rechaza mientras una tx del inversionista esté en curso en la red.
    Los `MINTED` siguen siendo del inversionista.
  - `setInvestorFrozen(investorId, frozen, nota)`: sólo con tokens `MINTED`; encola `setFrozen(wallet, bool)` en el
    registro del tenant + `INVESTOR_FREEZE_REQUESTED` (uno a la vez por wallet). Una wallet congelada —o con un
    congelamiento en cola— no suscribe, y su mint pendiente revertiría (`isEligible = false`).
  - **Sin *tipping-off***: el portal sólo dice «Verificación revocada» (sigue mostrando los tokens emitidos); nunca la
    causal ni la nota. El revocado no puede reenviar KYC, suscribir ni descargar ningún documento del Data Room (403). Las
    lecturas del portal usan `select` con sólo lo que se muestra: lo que un Server Component espera puede viajar al
    navegador (la información de depuración de React en desarrollo lo serializa).
- **Gobierno de plataforma** (`app/superadmin/actions.ts`, motivo obligatorio para lo restrictivo, 10–300 caracteres):
  `SUSPENDED` → aviso institucional en el portal y `signNda`/`submitKyc`/`subscribe` rechazados (`activeTenant`);
  `REVIEW` → la vitrina muestra el proyecto sin enlace; `Offering.capturePausedAt` → la vitrina muestra «Captación
  pausada» sin enlace y `subscribe()` lo rechaza (también dentro del `UPDATE` atómico de unidades); las suscripciones
  ya firmadas siguen (conciliación y mint). `Organization.published` = isPublishedInRwaxi. La vitrina sólo emite
  referidos hacia portales ACTIVE, publicados y con alguna oferta captando.
- **Facturación B2B** (`FeeInvoice`, número único en la plataforma): una factura agrupa asientos `ACCRUED` de un solo
  desarrollador → `INVOICED`; registrar el pago (fecha ≤ hoy y ≥ emisión + comprobante) → la factura y sus asientos
  `PAID`; un asiento cuya emisión no ocurrió (revocación) queda `VOIDED`, sin factura. CHECK: `(status IN (ACCRUED,
  VOIDED)) = (invoice_id IS NULL)`, `VOIDED` con su `voided_at`, y pago con fecha y comprobante juntos. Las tarifas
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
- Enums de negocio: `LeadSource` REFERRAL | DIRECT · `FeeKind` ONBOARDING_SETUP | MONTHLY_SAAS | INFRASTRUCTURE_USAGE ·
  `KycStatus` … `REVOKED` · `ChainTxStatus` … `CANCELLED` (retirada sin enviarse) · `FeeStatus` … `VOIDED`.
  Renombrar valores con `ALTER TYPE … RENAME VALUE` escrito a mano (el diff de Prisma recrea el tipo y falla con datos).
  Un valor añadido con `ALTER TYPE … ADD VALUE` no puede usarse en la misma transacción: va en su propia migración, y
  los CHECK que lo nombran comparan `status::text`.
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
- Ids que recibe una Server Action: cuid (`/^[a-z0-9]{20,40}$/i`) salvo organizaciones y ofertas, que en el seed
  tienen ids legibles (`org_avista`, `off_avista`): ésas se validan con `/^[A-Za-z0-9_-]{1,64}$/`.
- Copys fuente en español (Colombia), siempre con un marcador de i18n (ver Internacionalización); importes con
  `money()` (COP/USD, TRM de demo 4.100).
- Cifras, proyectos, direcciones y hashes de los seeds son ilustrativos.
