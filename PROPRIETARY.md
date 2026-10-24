# Aviso de titularidad y propiedad intelectual

Copyright (c) 2026 RWAXI. Todos los derechos reservados. Software propietario y confidencial.

## Titularidad

RWAXI es titular exclusivo de este repositorio y de todo lo que contiene, salvo los componentes de terceros
descritos más abajo. Esto incluye:

- **Código fuente**: la aplicación web de los cuatro entornos (`apps/web`), el paquete de base de datos
  (`packages/database`), el SDK de tokenización (`packages/blockchain-sdk`), los contratos (`contracts`) y los scripts
  y pruebas (`scripts`).
- **Arquitectura**: el diseño multi-tenant White Label, la resolución de entornos por host, el aislamiento por
  Row-Level Security, la cola on-chain con prelación e invariantes, la atribución firmada de referidos y la
  integridad documental con árboles de Merkle.
- **Esquemas de base de datos**: el modelo de datos, las migraciones, las políticas RLS, los triggers y las
  funciones SQL.
- **Contratos inteligentes**: `RwaxiComplianceRegistry`, `RwaxiPropertyToken` y `RwaxiTenantFactory`, sus ABI y su
  bytecode compilado.
- **Lógica de negocio**: los flujos de cumplimiento (NDA, KYC/AML, whitelist), suscripción, conciliación fiduciaria,
  distribuciones de rendimientos, gobierno de plataforma, alta B2B y facturación.
- **Documentación, diseño de interfaz, identidad visual, textos y traducciones** de la plataforma.

## Uso sin licencia

No se concede ninguna licencia, expresa ni implícita. Usar, copiar, modificar, distribuir, sublicenciar, publicar o
crear obras derivadas de este software exige una autorización previa y por escrito de RWAXI. Tener acceso al
repositorio no otorga ningún derecho sobre su contenido. Su contenido es información confidencial: solo pueden
conocerlo las personas que RWAXI autorice, y solo para los fines autorizados.

En el código, esta reserva se expresa así: todos los paquetes del workspace declaran `"private": true` y
`"license": "UNLICENSED"`, y los contratos propios llevan `SPDX-License-Identifier: UNLICENSED` con su aviso de
copyright.

## Contenido de terceros y de los desarrolladores

- **Contenido de cada desarrollador**: lo que un desarrollador (tenant) carga en su portal pertenece a ese
  desarrollador y no forma parte de lo que declara este aviso. Eso incluye sus ofertas, los documentos de su Data
  Room, sus plantillas legales y el copy comercial de sus proyectos. Los datos personales de los inversionistas
  tampoco forman parte de este aviso.
- **Datos de demostración**: los desarrolladores, proyectos, cifras, direcciones y hashes de los datos semilla son
  ilustrativos.

## Componentes open-source

La plataforma usa dependencias open-source. Cada una conserva la licencia y el aviso de copyright de sus autores,
que este documento no modifica. Esos avisos se mantienen en sus paquetes y deben acompañar cualquier distribución
que los incluya.

| Componente | Licencia |
|---|---|
| Next.js, React, viem, zod | MIT |
| OpenZeppelin Contracts (base de los contratos propios) | MIT |
| Prisma Client, sharp | Apache-2.0 |
| lucide-react | ISC |
| caniuse-lite (datos de compatibilidad de navegadores) | CC-BY-4.0 |
| libvips, binario que distribuye `sharp` para la optimización de imágenes de Next.js | LGPL-3.0-or-later, enlazado dinámicamente y sin modificar |
| Cormorant Garamond, Montserrat, IBM Plex Mono (Google Fonts) | SIL Open Font License 1.1 |

Política: ninguna dependencia de producción, directa o transitiva, puede tener una licencia copyleft fuerte (GPL,
AGPL o SSPL). Las licencias permisivas y las de copyleft débil para bibliotecas (LGPL, MPL) se aceptan. Una licencia
desconocida o propietaria de terceros se revisa a mano.

`pnpm audit:licenses` verifica esta política sobre todo el árbol de dependencias del workspace y falla si aparece
una licencia copyleft fuerte. Con `--include-dev` revisa también las dependencias de desarrollo y con `--strict`
falla además ante licencias pendientes de revisión.

Resultado del análisis del 2026-10-23:

- **Producción (74 paquetes)**: MIT, Apache-2.0, ISC, BSD-2-Clause, BSD-3-Clause, 0BSD y CC-BY-4.0, más libvips
  (LGPL-3.0-or-later). Ninguna GPL, AGPL ni SSPL.
- **Desarrollo (388 paquetes)**: también sin copyleft fuerte.

## Summary (English)

Copyright (c) 2026 RWAXI. All rights reserved. Proprietary and confidential.

RWAXI exclusively owns this repository and everything in it except third-party components. That covers:

- the source code;
- the architecture;
- the database schemas and migrations;
- the smart contracts, their ABIs and bytecode;
- the business logic;
- the documentation, design and translations.

No licence is granted. Any use, copy, modification or distribution requires RWAXI's prior written authorization.
Content uploaded by each developer (tenant) belongs to that developer, and investors' personal data is not covered
by this notice.

Open-source dependencies remain under their own licences, which this notice does not alter. Production dependencies
are limited to permissive licences and weak copyleft libraries (LGPL, MPL). `pnpm audit:licenses` enforces this and
fails on any GPL, AGPL or SSPL dependency.
