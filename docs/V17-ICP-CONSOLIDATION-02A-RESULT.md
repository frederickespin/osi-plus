# V17-ICP-CONSOLIDATION-02A — Resultado

## A. Resumen

El ICP aprobado de PR #73–#75 quedó consolidado sobre Auth 01A/01B sin sustituir su diseño ni incorporar funciones históricas descartadas. La integración mantiene dos pasos, Client existente o inline, direcciones estructuradas, snapshots de ruta, idempotencia y auditoría tenant-first. El cliente transporta la `membershipRef` seleccionada y el servidor revalida User, Membership, Tenant, estados, grants y denies en cada request.

Production no fue consultada ni modificada. `productionApiEnabled=false`; el consumidor visual sólo puede habilitarse en loopback o en el Preview consolidado exacto.

## B. Rama/base/HEAD

- Rama: `feature/v17-auth-users-tenant-first`.
- Base inicial autorizada: `5e9729957b9279d2adb37c655baf2d4623c0ed33`.
- Fuente ICP integrada mediante merge normal: `6b184b580419fc7d07eadc09c333e37cf1c4041a`.
- Ancestro ICP de fundación: `a24f86210138e3596c886699ce9346f19a29728a`.
- Ancestro ICP API: `ddb51888671e32cf929284018caf10f35cdaafa2`.
- El merge fue limpio, sin conflictos, rebase, squash ni reescritura.

## C. Archivos reutilizados desde #73–#75

Fundación y persistencia:

- `prisma/migrations/20260831010000_v17_crm_icp_foundation/migration.sql`.
- `prisma/schema.prisma`.
- `api/_lib/crmIcpV2Domain.js`.
- `scripts/v17-crm-icp-foundation-test.mjs`.
- `scripts/v17-crm-icp-foundation-db-test.mjs`.
- `scripts/v17-crm-icp-foundation-rollback.mjs`.
- Guardias y contrato `V17-CRM-ICP-05A1`.

API:

- `api/_lib/crmIcpV2ApiDomain.js`.
- `api/_lib/crmIcpV2ApiHttp.js`.
- `api/crm/icp-v2/clients/search.js`.
- `api/crm/icp-v2/pipeline-cases/index.js`.
- `api/crm/icp-v2/pipeline-cases/[caseKey]/index.js`.
- Pruebas, guardias y contrato `V17-CRM-ICP-05B1`.

UI:

- `src/crm-icp-v2/IcpIntakeForm.tsx`.
- `src/crm-icp-v2/IcpVisualPreview.tsx`.
- `src/crm-icp-v2/api.ts`.
- `src/crm-icp-v2/clientMode.ts`.
- Integración en `src/commercial-crm/CommercialInboxModule.tsx` y `src/App.tsx`.
- Playwright, guardias y contrato `V17-CRM-ICP-05C1`.

## D. Archivos adaptados

- `src/crm-icp-v2/api.ts`: transporte obligatorio de `X-OSI-Membership-Ref` y fallo cerrado si falta una UUID v4 válida.
- `api/_lib/crmIcpV2Domain.js`: derivación server-side de LOCAL/EXPORT/IMPORT y rechazo de un modo contradictorio.
- `api/_lib/crmIcpV2ApiHttp.js`, `src/crm-icp-v2/clientMode.ts` y `shared/v17CommercialCrmPreview.*`: Preview limitado a la rama consolidada y batch exacto.
- `tests/v17-crm-icp-ui/icp-intake.spec.ts`: sesión Auth 01B y aserciones de transporte de Membership.
- Guardias Auth/ICP: negativas para omisión de Membership, elevación cliente, reintroducción de campos, stops o activación productiva.
- `playwright.v17-crm-icp-ui.config.ts`: Chromium, Firefox y WebKit en escritorio y móvil.
- `.github/workflows/ci.yml` y `package.json`: guardia de consolidación incorporada a CI.
- `docs/V17-CRM-ICP-05C1-UI-CONTRACT.md`: autoridad visual aprobada y perfil Preview consolidado.

## E. Elementos históricos V17 recuperados

Clasificación `CONSERVAR`/`ADAPTAR`:

- Hub como entrada general y shell ERP azul.
- Navegación Comercial dentro de la misma aplicación.
- Inbox compacto y acceso a la Ficha desde el flujo comercial.
- Límites lazy y denegación antes de descargar módulos protegidos.
- Densidad, jerarquía visual y comportamiento responsive del ERP avanzado.
- Conceptos futuros de relaciones comerciales, Servicios, Survey y Cotización únicamente como dependencias contractuales separadas.

## F. Elementos históricos descartados

Clasificación `DESCARTAR`/`LEGACY`:

- `NewCaseModal` histórico como autoridad del ICP.
- `useCasesStore`, `caseBridge`, caches empresariales y browser storage.
- Mocks, fixtures visuales y generación de identidad en frontend.
- RNC/cédula, volumen/CBM, programación Survey, selección completa de servicios, costos, cotización, materiales y recursos dentro del ICP.
- Paradas adicionales visibles, aunque el dominio conserva capacidad futura de ocho.
- Inferencias desde textos legacy de dirección o `clientName`.

## G. AuthorizationContext ICP

Flujo efectivo:

```text
Bearer LEGACY + X-OSI-Membership-Ref
→ resolveCrmPipelineContext
→ AuthorizationContext canónico
→ transacción
→ revalidación User + Membership + Tenant
→ grants efectivos con deniedPermissions prevaleciente
→ operación tenant-first
```

La UI no envía `tenantId`, `userId`, rol ni PK Prisma como autoridad. Una Membership almacenada no se considera vigente hasta que el servidor la revalida.

## H. Modelo persistente

- `Client`: receptor tenant-first, con referencia pública existente.
- `ClientAddress`: `addressRef` UUID inmutable, Client y Tenant obligatorios, dirección estructurada y estado.
- `PipelineCase`: contacto, teléfono visible/normalizado, correo visible/normalizado, canal, perfil del Client, versión de contrato de ruta y estado de destino.
- `PipelineCaseRouteSnapshot`: versión, ORIGIN/DESTINATION/ADDITIONAL_STOP, orden y snapshot inmutable; `sourceAddressRef` es opcional.
- `PipelineCaseCommand`: idempotencia, hash canónico, actor y resultado.
- `CommercialAuditLog`: auditoría append-only sin payload PII completo.

Las FK e índices unen Tenant con Client, Membership, PipelineCase, dirección y snapshot. La creación inline mantiene Client + caso + ruta + comando + auditoría en una sola transacción.

## I. Migraciones

- Migración conservada: `20260831010000_v17_crm_icp_foundation`.
- Es aditiva y compatible con el esquema Auth consolidado; no se detectaron nombres de tablas, columnas o constraints en conflicto.
- Blob Git originador y working tree representan el mismo contenido LF.
- SHA-256 binario LF: `d085a74f4be3bd7be727d182993598008f53f019c8f1d626863b987be6726f37`.
- Tamaño: `17172` bytes; UTF-8 sin BOM; política `text eol=lf`.
- No fue regenerada ni aplicada en Production.

## J. Flujo ICP final

1. Paso 1: seleccionar Client existente o preparar uno inline; capturar nombre/razón social, contacto, tipo de Client, teléfono/WhatsApp, correo y canal.
2. Paso 2: capturar origen, destino confirmado/aproximado/pendiente y notas del requerimiento.
3. El frontend propone el modo y el dominio vuelve a derivarlo: DO→DO LOCAL, DO→otro EXPORT, otro→DO IMPORT.
4. El servidor valida payload cerrado, permiso, Tenant y duplicados.
5. La transacción crea o enlaza Client, crea caso y snapshots, registra comando idempotente y auditoría.
6. La respuesta sólo publica referencias públicas y abre el caso confirmado.

## K. UI final

El ICP permanece como modal compacto de dos pasos dentro del Inbox del shell ERP. No crea una aplicación paralela. Usa Client existente o inline, origen/destino y notas. No muestra selector manual de modo, volumen, Survey, servicios, costos ni paradas. El diseño actual del ICP fue aprobado funcional y visualmente.

## L. Permisos

- `pipeline:view`: búsqueda y lectura tenant/owner según el alcance canónico.
- `pipeline:create`: creación ICP.
- `pipeline:create:pending-destination`: grant explícito adicional para destino pendiente.
- `pipeline:update:own` y `pipeline:update:any`: se preservan para contratos posteriores; no se convierten en autoridad implícita del ICP.
- Ningún rol otorga mutaciones por sí solo; `deniedPermissions` prevalece.

## M. PII

- La búsqueda usa POST, nunca query string, y limita/pagina server-side.
- Teléfono y correo se devuelven enmascarados como pistas de selección.
- Errores, auditoría y logs no reproducen payload, teléfono ni correo completos.
- No se publican CUID, `Client.id`, `tenantId`, `userId` o `membershipId`.
- `caseRef`, `clientRef`, `addressRef` y `membershipRef` son referencias públicas delimitadas; no reemplazan autorización.

## N. Integración futura con Servicios

PR #76 confirma el siguiente límite: el caso ICP publicado alimentará un Catálogo/selección de Servicios. La selección principal/complementaria, reglas por modalidad y cambios posteriores pertenecen a ese lote; no se implementaron aquí.

## O. Integración futura con Survey

PR #79 conserva `Case → Survey Assignment → Survey App`. ICP aporta caso, Client y ruta, pero no agenda Survey, no calcula volumen y no selecciona materiales. El volumen futuro sólo podrá venir de Survey publicado o de un flujo explícito autorizado de datos del cliente.

## P. Integración futura con Cotización

PR #78 puede consumir `caseRef`, Client, modo, snapshot de ruta y `destinationStatus`. Un destino `PENDING` mantiene bloqueada la cotización final. ICP no crea precios, drafts, tarifas ni cotizaciones.

## Q. Tests

- Auth 01A dominio: 16/16.
- Auth 01B dominio: 15/15.
- Guardia Auth 01B: repositorio + 18 negativas.
- ICP fundación: 29/29.
- ICP API dominio: 13/13.
- ICP API HTTP: 23/23.
- Guardia ICP API: repositorio + 29 negativas.
- Guardia ICP UI: repositorio + 17 negativas.
- Guardia consolidación: repositorio + 10 negativas.
- La matriz browser consolidada contiene 24 casos: 4 escenarios × 6 combinaciones motor/viewport.

## R. PostgreSQL

El host no dispone de Docker, `psql`, `postgres`, `pg_ctl` ni una variable de conexión de prueba autorizada. Por ello la validación PostgreSQL de migración, rollback/replay, constraints y concurrencia de `Client.code` queda como gate explícitamente pendiente. Los scripts existentes permanecen conectados a CI para PostgreSQL 18. No se usó Neon ni Production como sustituto.

## S. Guards

La nueva guardia `guard:v17-icp-consolidation` falla si:

- se omite `membershipRef` o la revalidación tenant/User/Membership;
- el cliente puede imponer un modo contradictorio;
- aparecen stops o volumen en la UI;
- se activa Production o se amplía el Preview;
- se reescribe la migración canónica;
- se pierde la declaración de aprobación funcional y visual.

Se conservan además las guardias ICP de fundación/API/UI, Auth 01A/01B, CORS, lazy boundary, referencias públicas y checksums.

## T. Riesgos pendientes

- Gate PostgreSQL 18 pendiente hasta disponer de una base local o efímera autorizada.
- La promoción a un Preview real requiere variables del perfil consolidado exacto y una autorización posterior.
- Los contratos de Services/Survey/Quote deben seguir tratando `destinationStatus`, modo y snapshots como entrada, no como permiso para acoplar sus escrituras al ICP.
- La capacidad de ocho stops existe en dominio, pero un consumidor UI futuro deberá recibir autorización y guardias propios.

## U. Diff summary

El diff integra 94 archivos, con 5289 inserciones y 123 eliminaciones: fundación, migración, API, UI, pruebas, guardias, CI y documentación del ICP, más las adaptaciones mínimas a Auth 01B. No contiene cambios en Survey, Servicios, Costing o Cotización.

## V. Worktree

El trabajo se realizó en el worktree de `feature/v17-auth-users-tenant-first`, inicialmente limpio y en la base exacta. No hubo conflictos. La entrega se cierra mediante commit local, sin push ni PR; el worktree debe quedar limpio.

## W. Propuesta del siguiente lote: Catálogo de Servicios

Proponer un lote separado que consuma únicamente el caso ICP publicado y modele selección de servicio principal/complementarios tenant-first. Debe definir DTO cerrado, permisos explícitos, versionado e idempotencia, y mantener desacoplados Survey, Costing y Cotización. No se implementa en este lote.
