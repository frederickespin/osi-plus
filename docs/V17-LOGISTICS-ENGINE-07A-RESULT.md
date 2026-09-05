# V17-LOGISTICS-ENGINE-07A — Resultado local

## Resumen

Se implementó localmente el Motor Logístico tenant-first sobre `feature/v17-tools-equipment@8a53f8f86df3dde8503c03c5227151cd830456bc`. Consume autoridades V17 ya publicadas, produce simulaciones y revisiones inmutables y conserva Costing/Cotización fuera del lote. No se consultó ni modificó Production, Neon, Vercel, variables o datos externos.

## Autoridad histórica revisada

| Histórico | Uso rescatado | Nuevo destino | Acción |
|---|---|---|---|
| `src/lib/quoteOperationalRequirements.ts` | Familias de necesidades y señales | Regla + item logístico | Adaptar, no copiar Costing |
| `src/lib/quoteOperationalPlanner.ts` | Separación planificación/resultado | calculate/publish | Reescribir tenant-first |
| `src/lib/quoteOperationalCost.ts` | Frontera entre cantidad y costo | Referencias para 08A | Mantener fuera de 07A |
| `src/lib/operationalResourceRulesStore.ts` | Regla operacional administrable | `LogisticsRule` versionada | Sustituir store local |
| `src/components/motor/ResourcesPanel.tsx` | Agrupación visual de recursos | `LogisticsPlanPanel` | Adaptar densidad, no datos |
| `api/_lib/vehicleEngine*.js` | Capacidad y disponibilidad Vehicle | Hechos `vehicles` | Consumir autoridad vigente |
| `prisma/migrations/20260801007000_logistics_geography_zone_rules` | Concepto zona/distancia | Familia `ZONE` | Referencia; sin geocoding |
| `prisma/migrations/20260801008000_vehicle_engine_settings` | Configuración de vehículo | Hechos/versiones Vehicle | No duplicar catálogo |
| `api/logistics/operational-compensations.js` | Dietas/viáticos | Familias travel | Reexpresar sin importes inventados |
| `src/lib/cratingFumigationPolicy.ts` y APIs Crating | Pendientes técnicos | Familia `CRATING` | Sólo consumir evidencia futura |
| PR #77 `AdminLogisticEnginePreview.tsx` | Dirección visual administrativa | `LogisticsRulesAdmin` | Adaptar a contratos reales |
| PR #77 `CostingVisualPreview.tsx` | Separación Motor/Costing | Output para 08A | No incorporar cálculo monetario |

Los mismos archivos históricos del worktree original dirty fueron leídos exclusivamente como referencia; no se modificaron ni copiaron sus stores.

## Modelo, migración y contratos

La migración 27 `20260908010000_v17_logistics_engine` es aditiva e introduce ocho modelos: Rule, Calculation, Plan, PlanRevision, PlanItem, PlanIssue, PlanOverride y MutationCommand. Incluye FK compuestas tenant-first, UUID públicos, índices, exclusión temporal de reglas, restricciones de severidad/estado/fuentes y triggers de inmutabilidad.

SHA-256 de la migración: `e8e073725b8075d6306e64d34dcf5c1b5fbc459ac1f3a808243747c28f78cb0e`.

Inputs: revisión real de ruta, selección/revisión de Servicios, publicación de Survey, requerimiento de material, inventario, assets, reservas, mantenimiento, Vehicle, ofertas externas y reglas vigentes. Los resultados conservan fuente y versión. No se migró ni infirió texto legacy.

## Capacidades resultantes

- Personal y tiempo: cantidad, horas y fase/tipo mediante reglas versionadas.
- Transporte: tipo, cantidad, viajes, capacidad y disponibilidad Vehicle.
- Materiales: requeridos, disponibles, reservados y faltantes desde snapshot/inventario.
- Assets: disponibilidad temporal a nivel de modelo sin asignación arbitraria de instancia.
- Externos: proveedor cuando existe, referencia, disponibilidad y `PENDING` de precio.
- Dietas, viáticos, hospedaje, peajes y estacionamiento: necesidades estructuradas mediante reglas; nunca precios inventados.
- Permisos/gestiones, zonas y Crating: items/issues estructurados.
- Warnings y blockers: colección separada, severidad explícita y resolución conservada.
- Recalculation: nueva revisión; no overwrite.
- Overrides: sugerencia + final + razón + actor + timestamp.
- Stale protection: fingerprint completo revalidado al publicar.

## APIs y UI

Se añadieron seis superficies HTTP privadas bajo `/api/logistics/**`, con gates antes de auth/body/Prisma, payloads cerrados, hash canónico, idempotencia y auditoría. El tab `Motor Logístico` y la Administración de reglas se cargan de forma lazy únicamente con grants efectivos. La UI no muestra importes comerciales.

## Validación local

- Contrato: 29 aserciones; escenarios Local simple, Local complejo, Export e Import.
- HTTP: 22 aserciones; compuerta antes de auth/body/Prisma.
- Guardia focal: 12 negativas; 8 modelos, 6 rutas, 8 permisos.
- PostgreSQL 18: vacío 27/27; adopción 26→27; segundo deploy sin pendientes; drift vacío; rollback a 26 y replay a 27.
- Dominio DB: 14 aserciones; tres publicaciones históricas, un ganador concurrente, snapshots inmutables y stale publish rechazado.
- Browser: 18/18, Chromium/Firefox/WebKit, desktop y móvil; cálculo, blockers, publicación, override, reglas/versionado y deny sin chunk/API.
- Build y TypeScript: verdes. Chunks separados `LogisticsPlanPanel` y `LogisticsRulesAdmin`.
- CORS/Vary: inventario actualizado para las seis APIs privadas; no wildcard/reflection.
- Runtime: `productionApiEnabled=false`; sólo `DISABLED`, `LOCAL_ONLY`, `PREVIEW_REHEARSAL`.

## Riesgos y brechas explícitas

- Las distancias calculadas por geocoding siguen pendientes de una autoridad aprobada; se reportan como pendiente.
- No se asignan personas, vehículos o assets específicos; sólo necesidad/capacidad/disponibilidad.
- No se ejecutan compras, reservas, asignaciones ni búsqueda de proveedor.
- Crating consume candidatos y puede producir necesidad/pendiente; nesting/BOM técnico permanece en su autoridad.
- Costos existentes sólo quedan referenciables por versión. No se agregan importes, margen o precio de venta.
- Las reglas admiten estructura empresarial acotada; ampliar fórmulas requiere nueva versión contractual y negativas.

## Diff y estado

El diff se limita a esquema/migración 27, dominio/API logística, permisos explícitos, gates/CORS, UI lazy, pruebas, guardias y estos documentos. No se modificaron migraciones 1–26 ni autoridades ICP, Servicios, Survey, Materiales, Assets o Vehicle.

Siguiente lote propuesto: `Costing 08A`, consumiendo exclusivamente una `LogisticsPlanRevision` publicada. No se implementó automáticamente.
