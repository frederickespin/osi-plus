# V17-TOOLS-EQUIPMENT-06A — Resultado

## A. Resumen ejecutivo

Se implementó localmente la autoridad tenant-first para herramientas, equipos y otros activos reutilizables. La solución separa el modelo del activo de cada unidad física, calcula disponibilidad desde intervalos y estados autoritativos, registra custodia, entrega, devolución, inspecciones, incidentes, mantenimiento, costos versionados y oferta externa. Materiales consumibles, Vehicle, Survey, Motor Logístico, Costing y Cotización no fueron absorbidos ni modificados en su autoridad.

La API y la UI sólo admiten `DISABLED`, `LOCAL_ONLY` y `PREVIEW_REHEARSAL`; `productionApiEnabled=false`. No hubo push, PR, acceso a Production, Neon ni Vercel.

## B. Rama/base/HEAD

- Rama: `feature/v17-tools-equipment`.
- Base exacta: `845d709e9debc08c35abab4161054801635e91bf`.
- HEAD de partida confirmado: `845d709e9debc08c35abab4161054801635e91bf`; el HEAD final se reporta en el cierre porque resulta de los commits que incluyen este documento.
- Worktree: `C:\Users\espin\osi-plus-v17\osi-plus-erp-v17-v17-tools-equipment-06a`.
- Preflight: base exacta, worktree inicial limpio, 25 migraciones y migración 26 inicialmente ausente.

## C. Fuentes históricas recuperadas

Se inspeccionaron en el snapshot moderno limpio y, sólo en lectura, en el worktree histórico dirty:

- `src/components/modules/FleetAdminModule.tsx`.
- `src/components/modules/MaintenanceModule.tsx`.
- `src/components/modules/MechanicModule.tsx`.
- `src/components/modules/WarehouseAdminModule.tsx`.
- `src/components/motor/ResourcesPanel.tsx`.
- `src/lib/operationalResourceRulesStore.ts`.
- `src/lib/fleetStore.ts`.
- `src/types/wms.types.ts`.

Se recuperaron conceptos de presentación, ficha, disponibilidad, asignación, QR, mantenimiento y recursos. No se copiaron stores ni mocks: sus autoridades históricas dependían de estado local, datos demostrativos o códigos aleatorios no aptos para concurrencia.

## D. Modelo Prisma

La migración añade 14 modelos tenant-first:

1. `AssetModel`.
2. `AssetCodeCounter`.
3. `AssetInstance`.
4. `AssetCostVersion`.
5. `AssetMutationCommand`.
6. `AssetReservation`.
7. `AssetAssignment`.
8. `AssetInspection`.
9. `AssetIncident`.
10. `AssetMaintenanceRule`.
11. `AssetMaintenanceOrder`.
12. `AssetHistoryEvent`.
13. `ExternalResourceOffer`.
14. `ExternalResourceReservation`.

Todas las relaciones empresariales relevantes incluyen tenant. Las referencias públicas son UUID v4 inmutables y las PK internas no forman parte de los DTO.

## E. Migración

- Migración: `20260907010000_v17_tools_equipment` (26).
- SQL aditivo; no altera las migraciones 1–25.
- Tamaño: 41,746 bytes.
- SHA-256: `81dd96e97a1b35446dd1a2fe8934f1fe2524b1c75d6ff5645b98e091ebf98a44`.
- Codificación: UTF-8 sin BOM y LF.
- Incluye restricciones, índices tenant-first, exclusión temporal, triggers de inmutabilidad y append-only.
- Rollback focal: `scripts/v17-tools-equipment-rollback.sql`.

## F. AssetModel

Representa la definición reutilizable: código, nombre, descripción, familia, tipo `TOOL`/`EQUIPMENT`/`OTHER`, política de serial, identificación, capacidad, estado y versión. No representa existencias consumibles ni una unidad física concreta.

## G. AssetInstance

Representa cada unidad individual. Conserva `assetRef`, código interno seguro, modelo tenant-first, serial/barcode/QR cuando corresponda, estado operativo, condición física, ubicación, fechas/costos de adquisición y reposición, moneda y versión optimista.

## H. Serial/QR/códigos

- `assetRef` y `modelRef`: UUID v4 públicos e inmutables.
- Código interno: contador atómico por tenant/prefijo, protegido con advisory lock; no usa `MAX+1`.
- Serial: obligatorio, opcional o prohibido según la política del modelo; un trigger impide inconsistencias.
- Barcode/QR: datos identificadores opcionales con unicidad tenant-first cuando existen.
- Ninguna PK interna se expone al cliente.

## I. Estado/condición

El estado operativo y la condición física son autoridades separadas. Un activo puede estar activo administrativamente y, aun así, no disponible por condición `UNSAFE`, mantenimiento o custodia. Una inspección insegura mueve el activo a `OUT_OF_SERVICE`.

## J. Ubicación

`AssetInstance` reutiliza `MaterialLocation` como ubicación física tenant-first. Entrega, devolución e inspección también registran referencias de ubicación autorizadas. No se creó un segundo catálogo de almacenes o ubicaciones.

## K. Disponibilidad

No existe un booleano mutable como autoridad. `assetAvailability()` deriva el resultado para un intervalo a partir de:

- estado del registro y estado operativo;
- condición física;
- custodia/asignación activa;
- reservas solapadas;
- mantenimiento solapado.

El contrato común `resourceAvailability()` deja una interfaz futura para `AssetInstance`, `Vehicle` y oferta externa sin fusionar sus modelos.

## L. Reservas

Las reservas contienen intervalo `[startsAt, endsAt)`, referencia operacional o caso, estado y auditoría. Una restricción GiST tenant-first impide reservas activas solapadas de la misma unidad. Advisory locks serializan decisiones concurrentes.

## M. Asignaciones/custodia

Una asignación vincula activo, assignee/custodian revalidados, caso o referencia operacional y ubicaciones. Un índice parcial impide más de una custodia activa por activo. La asignación no equivale a una reserva ni a disponibilidad permanente.

## N. Entrega/devolución

La entrega exige versión esperada y deja la asignación `ACTIVE`. La devolución registra hora, ubicación y condición; una devolución dañada crea un incidente dentro de la misma operación. Ambos cambios crean comando idempotente, auditoría e historial.

## O. Inspecciones

Se soportan inspecciones trazables con tipo, ubicación, condición, señal `safeToUse`, notas y referencias privadas de evidencia. Los registros son append-only. No se guarda base64 en JSON.

## P. Incidentes

Los incidentes registran tipo, severidad, estado y descripción sanitizada. Pueden originarse directamente o durante una devolución. No crean Costing ni alteran Survey.

## Q. Mantenimiento

`AssetMaintenanceRule` constituye la fundación de reglas preventivas. `AssetMaintenanceOrder` permite programar mantenimiento preventivo/correctivo con intervalo y costo opcional. Reservas y mantenimiento incompatible se excluyen mutuamente bajo lock; mantenimiento activo bloquea disponibilidad. No se implementó un checklist gigante ni un taller alternativo.

## R. Costos

`AssetCostVersion` conserva versiones append-only de adquisición, reposición, reparación, operación u otros costos. Cada versión tiene vigencia, moneda y fuente. No calcula Costing ni Cotización.

## S. ExternalResourceOffer

Representa oferta externa/alquilada separada del activo propio: proveedor contractual, descripción, tipo, capacidad, tarifa, moneda, unidad, disponibilidad y vigencia. No convierte alquiler en una clase de `AssetInstance` ni crea una autoridad paralela de proveedores.

## T. External reservations

`ExternalResourceReservation` reserva capacidad de una oferta para un intervalo y un caso/referencia operacional. La capacidad se valida bajo advisory lock; la prueba concurrente deja un solo ganador cuando sólo queda una unidad.

## U. Vehicle integration

`Vehicle` permanece como modelo separado y autoritativo. No se añadió `Vehicle` a `AssetModel`/`AssetInstance` ni se duplicaron fleet/maintenance. La futura convergencia ocurre por el contrato de disponibilidad común, no por herencia de tablas.

## V. Warehouse integration

Se reutilizan `MaterialWarehouse` y `MaterialLocation` para ubicación física. El stock consumible sigue bajo Materiales e Inventario; custodia y disponibilidad reusable quedan bajo activos.

## W. Survey future contract

Survey podrá publicar requerimientos observados y restricciones operacionales. No selecciona unidades físicas ni materiales de empaque, no reserva activos y no fue modificado en este lote.

## X. Motor future contract

Motor Logístico podrá consultar disponibilidad temporal unificada y crear reservas/asignaciones mediante contratos autorizados. No se implementó planificación, despacho ni optimización.

## Y. Costing future contract

Costing podrá consumir versiones autoritativas de costos y snapshots confirmados de reservas/asignaciones/oferta externa. No se calculan tarifas, márgenes, depreciación ni cotizaciones en 06A.

## Z. AuthorizationContext

Cada request resuelve y revalida servidor-side User, Membership y Tenant mediante el contexto canónico. Tenant y actor nunca se aceptan desde body, query, storage o headers `x-osi-*`. `deniedPermissions` prevalece.

## AA. Permisos

Se añadieron permisos explícitos, sin concesión automática por rol baseline:

- `assets:model:view`, `assets:model:manage`.
- `assets:instance:view`, `assets:instance:manage`.
- `assets:reservation:manage`, `assets:assignment:manage`.
- `assets:inspection:perform`, `assets:incident:manage`.
- `assets:maintenance:view`, `assets:maintenance:manage`.
- `assets:external:view`, `assets:external:manage`.

La tarjeta del Hub exige explícitamente `assets:instance:view`.

## AB. Auditoría

Cada mutación se ejecuta junto con `AssetMutationCommand`, `CommercialAuditLog` e historial dentro de una transacción. `requestId` y hash canónico proporcionan idempotencia; reutilizar el request con otro payload produce conflicto. Comandos, historia e inspecciones son append-only.

## AC. API

Se añadieron 13 rutas protegidas bajo `/api/assets/**`:

- modelos e instancias, incluido detalle por `assetRef`;
- reservas;
- asignaciones, entrega y devolución;
- inspecciones e incidentes;
- mantenimiento y costos;
- ofertas externas y sus reservas.

La compuerta corre antes de auth, body y Prisma. Las respuestas usan `private, no-store`, `Vary: Authorization, Origin`, same-origin cerrado y DTO sin PK internas.

## AD. UI

Se añadió un workspace compacto y responsive bajo `Recursos → Herramientas y Equipos`: resumen, filtros, tabla, detalle, modelos, disponibilidad/custodia, inspecciones, mantenimiento, incidentes, costos y recursos externos. La superficie es lazy y sólo se renderiza después de modo y permiso. No usa mocks ni localStorage empresarial.

## AE. Histórico mapping

- **CANÓNICO RECUPERABLE:** composición azul del ERP, organización por recursos, conceptos de ficha, QR, custodia, condición y mantenimiento.
- **ADAPTAR:** `ResourcesPanel`, reglas operacionales, WMS y pantallas Fleet/Maintenance/Mechanic/Warehouse a contratos tenant-first y DTO cerrados.
- **LEGACY:** stores de fleet/recursos/WMS basados en memoria o browser storage y catálogos demostrativos.
- **OBSOLETO:** códigos aleatorios, disponibilidad booleana manual, mezcla de consumibles con equipos y datos mock como autoridad.

No se efectuó backfill histórico.

## AF. Tests

- Contrato: 17 aserciones.
- HTTP/modos/gate: 22 aserciones.
- Base: concurrencia de códigos, reservas, custodia, mantenimiento, capacidad externa, append-only, inmutabilidad e idempotencia/auditoría.
- Guardia 06A: 20 negativas.
- CORS protegido: inventario 99/99 y negativas.
- Regresiones focales de Auth, ICP, Servicios, Survey y Materiales.

## AG. PostgreSQL

Validado localmente con PostgreSQL 18.2:

- base vacía: 26/26;
- actualización 25→26;
- segundo `migrate deploy`: cero pendientes;
- drift vacío;
- rollback exacto 26→25 y replay 25→26;
- 10 creaciones concurrentes con códigos únicos;
- reservas solapadas bloqueadas;
- custodia activa: un ganador;
- mantenimiento incompatible bloqueado;
- capacidad externa concurrente: un ganador;
- 22 comandos y 22 auditorías.

## AH. Browsers

Playwright: 12/12, sin omitidas, en Chromium, Firefox y WebKit, desktop y móvil. Se cubrieron tabla, detalle, reserva, asignación, devolución, inspección, mantenimiento, incidente, costo y recurso externo. El contexto deny descargó cero chunks de `ToolsEquipmentApp` y generó cero requests `/api/assets/**`.

## AI. Guards

Las guardias fallan ante mezcla con consumibles, disponibilidad booleana, localStorage empresarial, tenant/actor desde cliente, PK públicas, doble asignación, reservas incompatibles, alquiler modelado como activo propio, duplicación de Vehicle, DELETE destructivo, permisos implícitos o modo Production. El inventario CORS clasifica 99/99 rutas; 72 son protegidas.

## AJ. Feature flags/runtime

- Server: `TOOLS_EQUIPMENT_API_MODE`.
- Frontend: `VITE_TOOLS_EQUIPMENT_UI_MODE`.
- Permitidos: `DISABLED`, `LOCAL_ONLY`, `PREVIEW_REHEARSAL`.
- Preview exige rama y batch exactos.
- `LOCAL_ONLY` exige loopback real y ausencia total de variables `VERCEL*`.
- Ausente/desconocido/mal formado falla cerrado.
- `productionApiEnabled=false`; no existe modo Production.

## AK. Riesgos pendientes

- No existe todavía una entidad canónica de cuadrilla; asignaciones usan Membership autorizada.
- La autoridad tenant-first de proveedores externos requiere un lote propio; 06A conserva snapshot contractual mínimo.
- Integrar Vehicle al contrato común necesita pruebas de fleet específicas.
- Impresión/rotación física de etiquetas QR no forma parte de 06A.
- La edición administrativa de reglas recurrentes de mantenimiento queda pendiente; el esquema ya evita mezclarla con órdenes.
- Los blobs privados de evidencia deberán reutilizar el proveedor de Survey en un lote posterior.

## AL. Diff summary

El cambio se limita a esquema/migración/rollback, dominio y API de activos, permisos explícitos, inventario CORS, workspace lazy, integración mínima del Hub, pruebas/guardias y este resultado. No modifica Costing, Cotización, Motor Logístico, datos, variables ni infraestructura externa.

## AM. Worktree

El lote termina en la rama local con commits trazables y worktree limpio. No se hizo push ni se creó PR.

## AN. Propuesta siguiente lote

El siguiente lote propuesto es **Motor Logístico**: consumir requerimientos de Survey y disponibilidad autoritativa de materiales, activos, vehículos y ofertas externas; producir planes/reservas sin duplicar catálogos. Requiere autorización separada y no fue implementado automáticamente.
