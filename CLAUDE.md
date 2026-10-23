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
  app/superadmin/        admin.rwaxi.com
  app/tenant/[slug]/     {slug}.rwaxi.com (portal) y /backoffice
    actions.ts           onboarding persistido del inversionista: signNda(), submitKyc(), subscribe()
    _lib/journey.ts      journey del visitante leído de PostgreSQL (sesión por cookie firmada)
    backoffice/          actions.ts (KYC) · payment-actions.ts (confirmPayment) · chain-actions.ts (ejecutar la cola)
                         _lib/queries.ts (bandeja de cumplimiento) · _lib/subscriptions-desk.ts (Suscripciones y Pagos)
  app/_lib/server/       tenant-context, investor-session (HMAC), chain-queue (calldata viem, puro),
                         chain-invariants (prelación + reverts de los contratos, puro), chain-executor (firma y confirma)
  app/_lib/referral.ts   tokens de referido firmados (HMAC-SHA256, Web Crypto: middleware y Server Actions)
  app/superadmin/_lib/   métricas consolidadas con platformPrisma() (rol BYPASSRLS, sólo host admin)
  app/api/chain/transactions  cola ChainTransaction del tenant del host (Inspector On-Chain, pestaña 4)
  app/_components/       UI portada del prototipo (ui, shell, vitrina, portal, backoffice, superadmin, inspector, legal)
  app/_lib/              datos, formato, renders canvas, simulador on-chain del prototipo
packages/database        Prisma 6 · esquema multi-tenant (14 entidades) · RLS · cliente con tenant · seed
  scripts/               provision-app-role.ts (rol de la app sujeto a RLS, idempotente)
packages/blockchain-sdk  merkle.ts (SHA-256 Data Room) · evm-adapter.ts (Viem, ITokenizationAdapter) · abi/ (generado)
contracts                Hardhat 2 · solc 0.8.24 · @openzeppelin/contracts 5.0.2
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
2. **Nunca confiar en un tenant que venga del cliente.** El tenant sale del host: el middleware descarta cualquier
   `x-rwaxi-*` recibido y fija `x-rwaxi-tenant`; el servidor lo traduce a `organizationId` con
   `resolveTenant(slug)` (función SQL `rwaxi_resolve_tenant`, SECURITY DEFINER, sólo campos de enrutado).
   Las Server Actions reciben únicamente ids de registros y los buscan bajo RLS: un id de otro tenant es "no encontrado".
   Subdominios reservados: ver `RESERVED_SUBDOMAINS`. Las únicas lecturas sin contexto de tenant son funciones
   SECURITY DEFINER acotadas: `rwaxi_resolve_tenant` (enrutado), `rwaxi_public_offerings()` (vitrina: campos de
   marketing y progreso de ofertas publicadas de desarrolladores publicados, sin datos de inversionistas) y
   `rwaxi_next_simulated_nonce` (siguiente nonce del operador RWAXI, un contador global).
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
5. **Autenticación pendiente.** El backoffice usa una sesión demo por rol del tenant — `COMPLIANCE_OFFICER` (KYC y
   llamadas al registro) y `TENANT_ADMIN` (conciliación de pagos y mint) —, activa sólo fuera de producción o con
   `RWAXI_DEMO_AUTH=1`. En producción, sin auth real, la bandeja, sus acciones y la cola del inspector se niegan; el
   inspector sólo ofrece ejecutar la cola desde el backoffice. El inversionista se identifica con la cookie `rwaxi_inv` (HttpOnly, HMAC con
   `INVESTOR_SESSION_SECRET`, ligada a la organización del host) emitida al firmar el NDA. Sin verificación de email
   todavía: un email ya registrado en el tenant **nunca** se asocia a un navegador nuevo (se rechaza la firma).
   **Atribución firmada:** la vitrina emite en servidor (`app/vitrina/actions.ts`, sólo host `www`, sólo portales
   ACTIVE) `ref_rwx_<nonce>.<slug>.<emitidoMs>.<HMAC-SHA256(REFERRAL_SECRET)>` (`app/_lib/referral.ts`, Web Crypto,
   Edge y Node). El middleware guarda en `rwaxi_ref` sólo un token válido para el tenant del host (primer contacto) y
   `signNda()` lo vuelve a verificar: válido, del tenant, no caducado (30 días) y con id no usado → Lead `REFERRAL`;
   cualquier otra cosa → `DIRECT`. El id (`ref_rwx_<nonce>`) es `Lead.referralToken`: su unicidad impide reutilizarlo.
   Super-Admin (`platformPrisma()`, BYPASSRLS) sólo en el host `admin` y nunca en producción sin MFA
   (`requirePlatformAccess`).
6. **RWAXI no custodia el valor emitido.** En contratos, RWAXI sólo tiene `RWAXI_OPERATOR_ROLE` (factory) y
   `MINTER_ROLE`; pausa, Data Room y recuperación forzosa son del emisor; la whitelist es del oficial de cumplimiento
   del tenant. No añadir roles a RWAXI sin revisión legal. En modo `RPC` el operador sólo envía `mintSubscription`;
   `approveInvestor` lo firma el oficial con su propia wallet y se registra su hash (`registerOfficerTransaction`,
   que exige recibo exitoso y el evento `InvestorWhitelisted` con los argumentos en cola). En `SIMULATION` la clave
   del operador firma todo, sólo como demostración.
7. **Integridad documental.** Cada documento del Data Room se hashea (SHA-256) en el navegador; la raíz se calcula con
   `@rwaxi/blockchain-sdk/merkle` y se ancla con `updateDataRoomMerkleRoot`. NDA y suscripción citan esa raíz.
   El expediente KYC lo hashea **el servidor**: `KycCase.dossierHash = evidenceHash(KycCase.evidence)` (JSON canónico,
   claves ordenadas, estable tras `jsonb`); `evidence` guarda formulario, SHA-256 del contenido de cada documento,
   declaraciones y NDA, de modo que cualquiera puede recalcular el hash que va on-chain. La evidencia persistida usa
   `app/_lib/sha256.ts` (Web Crypto, falla si no puede); nunca el `sha256Hex()` del prototipo, que inventa un hash.
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

## Comandos

```bash
pnpm install                                   # instala todo el workspace
pnpm dev                                       # Next en http://localhost:3000 (turbo; genera Prisma antes)
pnpm build                                     # db:generate + contratos + next build
pnpm typecheck                                 # tsc en todos los paquetes
pnpm test                                      # contratos, SDK, hosts, referidos e invariantes de la cola

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
pnpm e2e portal payments-queue                 # sólo esas suites (backoffice, portal, referrals-subscriptions, …)
pnpm e2e:rpc                                   # modo RPC: nodo Hardhat local + next dev con CHAIN_EXECUTION=rpc
```

E2E (`scripts/e2e`, paquete `@rwaxi/e2e`): cada suite verifica la UI y, por separado, las filas en la BD con
`DIRECT_URL` (recalcula hashes, firmas y nonces). Requieren `pnpm dev` corriendo (salvo `e2e:rpc`, que exige el
puerto 3000 libre y levanta sus propios servicios), contratos compilados y Chrome/Edge (`CHROME_PATH` para otro).
Los secretos se leen en tiempo de ejecución de `packages/database/.env` y `apps/web/.env.local`; las cuentas de
Hardhat salen de su mnemónico público. Capturas en `scripts/e2e/.artifacts/` (ignorado por git). Reseedean la BD.

Entornos en local (Chrome/Edge resuelven `*.localhost` a 127.0.0.1):
`http://localhost:3000` (vitrina) · `http://admin.localhost:3000` · `http://avista.localhost:3000` ·
`http://santabarbara.localhost:3000/backoffice` · `http://elpoblado.localhost:3000`.
Variables: copiar `.env.example` a `.env`, `packages/database/.env` y `apps/web/.env.local`. La cola on-chain usa
`OPERATOR_PRIVATE_KEY` (0x + 64 hex) y `CHAIN_EXECUTION` (`simulation` por defecto; `rpc` exige `RPC_URL_<NETWORK>`)
en `apps/web/.env.local`.
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
  `ChainTransaction` y su ejecución) y Super-Admin (consolidado + módulos B Atribución y C Tarifas/Libro mayor, sólo
  lectura). Siguen en estado demo: configuración White Label, Data Room y minting del backoffice, módulo A (Gobierno)
  del Super-Admin y pestañas 1–3 del inspector.
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
- Cambios de esquema: editar `schema.prisma` y crear migración con `pnpm db:migrate`. Toda tabla nueva de tenant
  necesita `organization_id`, `ENABLE`/`FORCE ROW LEVEL SECURITY` + política en su migración y, si referencia otra
  tabla de tenant, trigger `same_tenant`. Los privilegios por defecto dan SELECT/INSERT/UPDATE/DELETE a `rwaxi_app`:
  una tabla append-only debe revocar UPDATE/DELETE en su migración y en `scripts/provision-app-role.ts`.
- Validación de formularios: las reglas de UI (`validateStep`) se reaplican en el servidor, más listas cerradas
  (países, actividades, rangos). Emails y wallets se guardan en minúsculas (únicos por tenant).
- Copys en español (Colombia); importes con `money()` (COP/USD, TRM de demo 4.100).
- Cifras, proyectos, direcciones y hashes de los seeds son ilustrativos.
