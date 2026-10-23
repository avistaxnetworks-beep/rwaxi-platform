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
  app/vitrina/           www.rwaxi.com
  app/superadmin/        admin.rwaxi.com
  app/tenant/[slug]/     {slug}.rwaxi.com (portal) y /backoffice
  app/_components/       UI portada del prototipo (ui, shell, vitrina, portal, backoffice, superadmin, inspector, legal)
  app/_lib/              datos, formato, renders canvas, simulador on-chain del prototipo
packages/database        Prisma 6 · esquema multi-tenant (13 entidades) · RLS · cliente con tenant · seed
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
2. **Nunca confiar en un tenant que venga del cliente.** El tenant sale del host (middleware) y se valida en el
   layout `app/tenant/[slug]/layout.tsx` (`notFound()` si no existe). Subdominios reservados: ver `RESERVED_SUBDOMAINS`.
3. **Aislamiento en la base de datos, no sólo en la app.** Todas las tablas de tenant tienen `organization_id` y RLS
   (`FORCE ROW LEVEL SECURITY`, fail-closed). Acceso a datos de tenant **sólo** con `forTenant(orgId)` o
   `withTenant(orgId, fn)` de `@rwaxi/database`. `platformPrisma()` (rol `BYPASSRLS`) sólo en la consola Super-Admin.
   Un trigger (`rwaxi_assert_same_tenant`) impide referencias a filas de otro tenant (las FK ignoran RLS).
4. **RWAXI no custodia el valor emitido.** En contratos, RWAXI sólo tiene `RWAXI_OPERATOR_ROLE` (factory) y
   `MINTER_ROLE`; pausa, Data Room y recuperación forzosa son del emisor; la whitelist es del oficial de cumplimiento
   del tenant. No añadir roles a RWAXI sin revisión legal.
5. **Integridad documental.** Cada documento del Data Room se hashea (SHA-256) en el navegador; la raíz se calcula con
   `@rwaxi/blockchain-sdk/merkle` y se ancla con `updateDataRoomMerkleRoot`. NDA y suscripción citan esa raíz.
6. **Dominios propios**: mapa `DEFAULT_CUSTOM_DOMAINS` + `RWAXI_CUSTOM_DOMAINS` en `hosts.ts`
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
pnpm test                                      # tests de contratos, SDK y hosts

pnpm --filter @rwaxi/database prisma generate  # cliente Prisma (alias: pnpm db:generate)
pnpm db:up                                     # Postgres 16 en Docker (crea roles rwaxi_app / rwaxi_platform)
pnpm db:deploy                                 # aplica migraciones (init + RLS) con DIRECT_URL
pnpm db:migrate                                # prisma migrate dev (nuevas migraciones)
pnpm db:seed                                   # resetea y siembra Andes Urbano, Valle Alto y Avista

pnpm contracts:compile                         # hardhat compile + exporta ABIs a blockchain-sdk/src/abi
pnpm contracts:test                            # tests de cumplimiento (whitelist, freeze, clawback, roles)
```

Entornos en local (Chrome/Edge resuelven `*.localhost` a 127.0.0.1):
`http://localhost:3000` (vitrina) · `http://admin.localhost:3000` · `http://avista.localhost:3000` ·
`http://santabarbara.localhost:3000/backoffice` · `http://elpoblado.localhost:3000`.
Variables: copiar `.env.example` a `.env`, `packages/database/.env` y `apps/web/.env.local`.
Windows: con `pnpm dev` corriendo, `prisma generate` (y por tanto `pnpm build`/`pnpm typecheck`) falla con `EPERM`
porque el servidor tiene cargado el motor de Prisma. Detener el dev server antes.

## Convenciones

- **Código portado del prototipo** (`app/_components/**`, `app/_lib/**` salvo `hosts.ts`): conserva lógica y nombres
  cortos originales y lleva `// @ts-nocheck`. Al tocar un módulo, tiparlo y quitar el pragma; no reescribir en bloque.
  El estado de demo vive en `app/_components/shell/demo-provider.tsx` (antes `App`) y se renderiza sólo en cliente
  (`ClientOnly`) hasta migrar cada pantalla a datos de `@rwaxi/database` vía server actions.
- Código nuevo: TypeScript estricto. Componentes de un solo entorno van colocados en `app/<entorno>/_components`.
- `packages/blockchain-sdk/src/abi/*` es generado: no editar; correr `pnpm contracts:compile` tras cambiar `.sol`.
- Cambios de esquema: editar `schema.prisma` y crear migración con `pnpm db:migrate`. Toda tabla nueva de tenant
  necesita `organization_id`, entrada en el bucle RLS y, si referencia otra tabla de tenant, trigger `same_tenant`.
- Copys en español (Colombia); importes con `money()` (COP/USD, TRM de demo 4.100).
- Cifras, proyectos, direcciones y hashes de los seeds son ilustrativos.
