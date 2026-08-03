# DB-01B — Modelos declarados pero no desplegados

Fecha de corte: 2026-08-01. La comprobación se hizo contra la copia estructural local de producción. Ninguna de estas tablas forma parte del baseline candidato.

## Resultado ejecutivo

| Modelo / tabla | Consulta actual | Persistencia alternativa | Decisión propuesta | Riesgo |
|---|---|---|---|---|
| `QuoteV2` / `QuoteV2` | No hay llamadas Prisma ni rutas activas | Cotización vigente en `PipelineCaseQuote`, `quotes` y `milestonesJson` | Retirar del datamodel deseado tras una decisión explícita; no desplegar | Bajo hoy; medio si se revive el prototipo |
| `GeoRegion` / `osi_geo_regions` | Sí; fallaría con `P2021` | Catálogo por defecto + `localStorage` + archivo del motor | Migración futura de geografía | Medio: configuraciones distintas por navegador |
| `ZoneRule` / `osi_zone_rules` | No hay llamada Prisma directa | `data/logistic-engine-admin.json` | Migración futura conjunta del motor logístico | Medio |
| `TransportZoneRule` / `osi_transport_zone_rules` | No hay llamada Prisma directa | `data/logistic-engine-admin.json` | Migración futura conjunta del motor logístico | Medio |
| `Vehicle` / `osi_vehicles` | No hay llamada Prisma directa | `localStorage` en `fleetStore`, con datos mock iniciales | Migración futura separada de flota | Alto: flota no es canónica entre usuarios |
| `VehicleEngineSettings` / `osi_vehicle_engine_settings` | No hay llamada Prisma directa | Reglas de vehículo en archivo/localStorage | Mantener pendiente y consolidar con motor logístico | Medio |
| `RiskEngineRule` / `osi_risk_engine_rules` | No hay llamada Prisma directa | Reglas de riesgo en archivo/localStorage | Migración futura conjunta del motor logístico | Alto si una regla local decide bloqueos |
| `LogisticOverrideApproval` / `logistic_override_approvals` | Sí; error de tabla se suprime | Resultado operativo continúa sin registro relacional | Migración futura de aprobaciones | Alto: pérdida de trazabilidad |
| `ApprovalRequest` / `approval_requests` | Sí; error de tabla se suprime | `PipelineCase.milestonesJson` | Migración futura de aprobaciones + backfill | Alto: doble fuente y control de estado |
| `QuoteChangeOrder` / `quote_change_orders` | Sí; error de tabla se suprime | `PipelineCase.milestonesJson` | Migración futura de adendas/change orders + backfill | Alto: implicación contractual |
| `CommercialAuditLog` / `commercial_audit_logs` | Sí; GET devuelve lista vacía y escrituras opcionales se suprimen | `localStorage` parcial y eventos dispersos | Migración futura de auditoría, con política inmutable | Crítico: auditoría incompleta |
| `CrateSettings` / `crate_settings` | Sí; GET usa defaults, POST devuelve 503 | Defaults compilados; no hay guardado servidor fiable | Migración futura de configuración de cajas | Alto: cálculo puede variar sin configuración persistida |

## Evidencia por modelo

### 1. `QuoteV2`

- Archivos: `prisma/schema.prisma` y la relación `Lead.quotes` del mismo archivo.
- Función: prototipo de cotización V2 con `payloadJson`, número de propuesta y modo derivado.
- Ejecución actual: no se encontró `prisma.quoteV2`, endpoint, import ni componente que consulte la tabla. Un SQL directo fallaría porque la tabla no existe.
- Alternativa: el flujo real usa `PipelineCaseQuote`, `quotes`, versiones y metadatos en `PipelineCase.milestonesJson`.
- Recomendación: no desplegar. Preparar una migración de limpieza del datamodel sólo después de confirmar que no existe consumidor externo.
- Datos iniciales: ninguno.

### 2. `GeoRegion`

- Archivos de servidor: `api/geo-regions/index.js`, `api/admin/logistic-engine/_shared.js`, `api/admin/logistic-engine/zones.js`, `api/cases/_service.js`, `prisma/seedGeoRegions.ts`.
- Consumidores: `src/hooks/useGeoRegions.ts`, `src/lib/geoRegionsStore.ts`, `src/components/admin/logistic/ZoneConfigurationSection.tsx`, `src/modules/sales/QuoteBuilder.tsx`, `src/modules/sales-quote-v3/SalesQuoteWorkspace.tsx` y `src/components/modules/NewCaseModal.tsx`.
- Función: catálogo de regiones, coordenadas, tipo de zona y SLA.
- Ejecución actual: la consulta Prisma no puede completarse contra la estructura real. Los `catch` devuelven regiones predeterminadas; las altas se conservan localmente cuando el servidor no persiste.
- Recomendación: desplegar en una migración de geografía independiente.
- Datos iniciales: seed de códigos de región versionado; importación idempotente de configuraciones vigentes, con clave `(country, code)`.
- Riesgo: los navegadores pueden calcular rutas con catálogos diferentes.

### 3–7. Configuración del motor logístico

Modelos: `ZoneRule`, `TransportZoneRule`, `VehicleEngineSettings` y `RiskEngineRule`; `Vehicle` se separa por pertenecer al dominio de flota.

- Archivos del motor: `api/admin/logistic-engine/_store.js`, `zones.js`, `transport-rules.js`, `vehicle-rules.js`, `risk-rules.js`, `api/logistics/active-config.js`, `api/cases/_service.js`, `api/_domain/logisticEngine.js` y `src/core/logisticEngine.ts`.
- Almacenamiento actual: `data/logistic-engine-admin.json`; el cliente dispone además de `osi.logistic-engine-admin.local` en `src/lib/logisticEngineAdminApi.ts`.
- Ejecución actual: no hay llamadas a los delegates Prisma de estos cuatro modelos. El motor funciona con archivo, defaults y caché local.
- Recomendación: una migración futura `logistics_configuration_persistence`, seguida de escritura dual temporal y comparación de resultados antes de cambiar la autoridad.
- Datos iniciales: importar de forma controlada `zoneTypeConfigs/zoneRules`, `transportRules`, `vehicleRules` y `riskRules`; registrar hash, versión y autor.
- Riesgo: activar tablas sin migrar el archivo produciría configuración vacía o resultados distintos.

`Vehicle` tiene evidencia adicional en `src/lib/fleetStore.ts`, `src/components/modules/FleetAdminModule.tsx`, `src/modules/sales/QuoteBuilder.tsx` y los planificadores de recursos. La flota se almacena en `localStorage` y se inicializa con `mockVehicles`; por ello requiere una migración propia, claves estables, deduplicación por placa dentro del tenant futuro y validación de capacidad/costos.

### 8. `LogisticOverrideApproval`

- Archivos: `api/cases/_service.js` (`findFirst` y `create`).
- Función: aprobación de una excepción del plan logístico.
- Ejecución actual: `safeOptionalCommercialWrite` suprime `P2021`, `P2022`, `P2003` y `P2025`; la operación principal puede continuar sin fila.
- Alternativa: el estado general del caso y sus hitos continúan, pero no existe un registro relacional equivalente completo.
- Recomendación: desplegar con el paquete de aprobaciones, no en el baseline.
- Datos iniciales: backfill sólo desde eventos/hitos con identificador inequívoco; lo no demostrable debe quedar en un reporte, no inventarse.

### 9. `ApprovalRequest`

- Archivos: `api/cases/_service.js` (`upsertStoredApprovalRequest`, lectura y actualización).
- Función: solicitud y estado de aprobación de propuesta.
- Ejecución actual: la consulta falla por tabla ausente y el error se suprime.
- Alternativa: `approvalRequestsFromMilestones()` y funciones relacionadas mantienen solicitudes en `PipelineCase.milestonesJson`.
- Recomendación: migración de aprobaciones con escritura dual, reconciliación por `id` y `quoteId`, y posterior cambio de autoridad.
- Datos iniciales: backfill idempotente desde `milestonesJson`; rechazar duplicados incompatibles y fechas/monedas inválidas.

### 10. `QuoteChangeOrder`

- Archivos: `api/cases/_service.js` (`findMany`, `findUnique`, `create`, `upsert`).
- Función: adenda/cambio posterior a la propuesta.
- Ejecución actual: el acceso relacional falla y se suprime.
- Alternativa: `quoteChangeOrderMapFromMilestones()` y `putQuoteChangeOrdersInMilestones()` son la fuente operativa efectiva.
- Recomendación: migración contractual separada; conservar el JSON durante una etapa de escritura dual.
- Datos iniciales: backfill por identificador y cotización, con validación de aceptación, monto, moneda y límite empresarial vigente.

### 11. `CommercialAuditLog`

- Archivos de servidor: `api/commercial-audit-logs/index.js` y numerosas escrituras en `api/cases/_service.js`.
- Cliente alternativo: `src/lib/commercialAuditStore.ts` usa `localStorage` (`osi-plus.commercial.auditLog`) limitado a 1,000 entradas.
- Función: trazabilidad de cambios, envío, cierre y handoff comercial.
- Ejecución actual: el GET devuelve `[]` si falta la tabla; las escrituras opcionales se descartan. La auditoría local no es compartida ni durable.
- Recomendación: migración propia o dentro del paquete de aprobaciones sólo si se define antes retención, inmutabilidad, actor y tenant futuro.
- Datos iniciales: no fusionar automáticamente entradas locales; preparar importación firmada/administrativa y backfill verificable desde eventos de servidor.

### 12. `CrateSettings`

- Archivos: `api/crate-settings/index.ts`, `src/lib/crateSettingsStore.ts`, `src/modules/CrateSettingsModule.tsx`, `src/modules/CrateWoodModule.tsx`, `src/lib/crateEngine.ts`.
- Función: ingeniería, materiales, mano de obra, fumigación y precios de cajas.
- Ejecución actual: GET retorna defaults ante delegate o tabla ausente; POST responde 503 si no puede persistir.
- Alternativa: configuración predeterminada compilada en servidor/cliente.
- Recomendación: migración de configuración de cajas separada, con una versión activa y auditoría de cambios.
- Datos iniciales: una fila inicial construida desde los defaults actuales, con hash; cualquier configuración local debe importarse explícitamente, no de forma automática.

## Orden de migraciones posterior al baseline

1. `geo_regions`.
2. `logistics_configuration_persistence` (zonas, transporte, ajustes de vehículo y riesgo).
3. `fleet_persistence` (`osi_vehicles`).
4. `commercial_approvals_and_change_orders`.
5. `commercial_audit_log`.
6. `crate_settings`.
7. Decisión de retiro de `QuoteV2`.

Cada paquete debe tener dry-run, backfill idempotente, escritura dual cuando exista una fuente alternativa y una prueba de equivalencia antes de cambiar la autoridad.
