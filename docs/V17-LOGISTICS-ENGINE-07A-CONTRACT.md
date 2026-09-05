# V17-LOGISTICS-ENGINE-07A — Contrato canónico

## Propósito y límites

El Motor Logístico transforma hechos publicados y configuración administrativa en necesidades operativas reproducibles. No es autoridad de Cliente, ruta, Servicios, Survey, inventario, activos, vehículos, proveedores, Costing ni Cotización. No calcula margen, precio de venta ni importe de proveedor inexistente.

El runtime sólo admite `DISABLED`, `LOCAL_ONLY` y `PREVIEW_REHEARSAL`; todo valor ausente, parcial, desconocido o ejecutado en un ambiente incompatible falla cerrado. `productionApiEnabled=false` en este lote.

## Inputs canónicos

Cada cálculo conserva referencias y versiones de:

- `PipelineCase.publicRef` publicado como `caseRef`, revisión y contrato de ruta;
- selección y revisión de Servicios;
- publicación y hash lógico de Survey;
- snapshot y hash lógico de requerimientos de materiales;
- disponibilidad observada de inventario, `AssetModel`, reservas, asignaciones y mantenimiento;
- capacidad/versiones de `Vehicle`;
- ofertas/versiones de recursos externos;
- reglas administrativas activas, vigencia, prioridad, especificidad, versión y hash;
- intervalo solicitado y timestamp de observación.

Las direcciones se consumen desde `PipelineCaseRouteSnapshot`; no se reconstruyen desde texto legacy ni se copian datos de contacto o dirección detallada al resultado logístico.

## Modelo y revisiones

- `LogisticsPlan`: identidad estable tenant-first por caso.
- `LogisticsPlanRevision`: publicación inmutable con input, reglas, resultado y hash lógico.
- `LogisticsPlanItem`: necesidad estructurada y fuente/versiones.
- `LogisticsPlanIssue`: `INFO`, `WARNING` o `BLOCKER`, conservado aun después de resolverlo.
- `LogisticsPlanOverride`: sugerencia, valor final, razón y actor; no altera la regla.
- `LogisticsCalculation`: simulación no publicada, con hashes de entrada y resultado.
- `LogisticsRule`: serie versionada, activa/inactiva/sustituida, con prioridad y especificidad.
- `LogisticsMutationCommand`: idempotencia tenant-first para cálculo, publicación, reglas, override y resolución.

Recalcular no actualiza una revisión: produce un nuevo cálculo y, al publicar, una revisión adicional. Triggers PostgreSQL bloquean cambios y eliminaciones de snapshots publicados, items, overrides y comandos. Las resoluciones de issues sólo permiten la transición auditada prevista.

## Motor determinista

Las reglas se filtran por vigencia y hechos, y se ordenan por prioridad, especificidad, versión y referencia. Dos reglas exclusivas incompatibles con igual prioridad/especificidad producen `LOGISTICS_RULE_CONFLICT`; nunca se elige por orden accidental.

Las familias cubren personal, tiempo, transporte, materiales, activos, recursos externos, dietas/viáticos, hospedaje, peajes, estacionamiento, permisos, zonas y crating. Sus resultados expresan cantidad, unidad, horas, viajes, disponibilidad, reserva, faltante, estado de precio y fuente. Costing futuro consume la revisión publicada; no consume un cálculo transitorio.

Disponibilidad:

- materiales: movimientos de inventario menos reservas vigentes;
- assets: instancias activas menos reservas, asignaciones y mantenimiento superpuestos;
- vehículos: autoridad `Vehicle`, disponibilidad y capacidad vigentes;
- externos: `ExternalResourceOffer`, capacidad, reservas, proveedor conocido y `priceStatus` real.

Si falta precio externo se publica `EXTERNAL_PRICE_PENDING`. Nunca se sintetiza una tarifa.

## Stale inputs y concurrencia

Antes de publicar se recargan ruta, Servicios, Survey, materiales, disponibilidad y reglas. Si el fingerprint difiere del cálculo, responde `409 LOGISTICS_INPUT_STALE`. La publicación y el versionado usan transacciones serializables y advisory locks; una simulación sólo puede originar una publicación y dos publicaciones simultáneas no crean dos revisiones.

## Autorización

Todas las rutas obtienen `AuthorizationContext` revalidado. No aceptan tenant, actor, rol ni ownership del cliente. Los permisos explícitos son:

- `logistics:plan:view`
- `logistics:plan:calculate`
- `logistics:plan:publish`
- `logistics:plan:tenant`
- `logistics:plan:override`
- `logistics:plan:resolve`
- `logistics:rules:view`
- `logistics:rules:manage`

Ningún rol baseline los concede. `deniedPermissions` prevalece. Sin `logistics:plan:tenant`, el caso se resuelve por tenant + owner Membership + owner User. Con el grant tenant-wide, se resuelve sólo dentro del tenant. La UI usa la misma lista efectiva para no montar los chunks lazy; el backend sigue siendo autoridad definitiva.

## HTTP

| Método | Ruta | Contrato |
|---|---|---|
| GET | `/api/logistics/plans/:caseRef` | Última revisión visible |
| POST | `/api/logistics/plans/calculate` | Simulación idempotente |
| POST | `/api/logistics/plans/publish` | Publicación idempotente y stale-safe |
| POST | `/api/logistics/plans/overrides` | Override auditable |
| POST | `/api/logistics/plans/issues/resolve` | Resolución auditable |
| GET | `/api/logistics/rules` | Catálogo tenant-first |
| POST | `/api/logistics/rules` | Nueva regla o nueva versión |

Las referencias son UUID públicas. Los DTO no publican PK Prisma, `tenantId`, `userId` o `membershipId`. Las rutas son same-origin privadas, con `Cache-Control: private, no-store` y `Vary: Authorization, Origin`. La compuerta se evalúa antes de auth, body y Prisma.

## Auditoría

Cada cálculo, publicación/republicación, creación/versionado/inactivación de regla, override y resolución genera un comando idempotente y `CommercialAuditLog` en la misma transacción. Los payloads cerrados se recalculan y verifican mediante SHA-256 canónico en servidor.

## UI

La Ficha incorpora el tab lazy `Motor Logístico` después de Servicios/Survey cuando existe permiso. Presenta Personal, Tiempo, Transporte, Materiales, Equipos, Recursos externos, Viajes/Viáticos, Permisos, Crating y blockers con texto, no sólo color. Permite simular, publicar, recalcular y registrar un override autorizado.

Administración incorpora una tabla compacta por familia con formulario empresarial para crear una regla o una nueva versión. No es un editor de programación y nunca borra una versión histórica.

