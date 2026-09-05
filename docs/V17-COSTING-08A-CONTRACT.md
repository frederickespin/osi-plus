# V17-COSTING-08A — Contrato canónico

## Frontera de autoridad

Costing valora exclusivamente una `LogisticsPlanRevision` con estado `PUBLISHED`. No consulta Survey, ICP o Servicios para reconstruir necesidades, no resuelve disponibilidad y no modifica Materiales, Assets, Vehicle ni proveedores. El flujo contractual es:

```text
Published LogisticsPlanRevision → CostingCalculation → Published CostingRevision
```

`CostingCalculation` es una simulación reproducible. `CostingRevision`, sus líneas y sus snapshots son históricos inmutables. Costing produce costo, margen y precio sugerido interno; `quotedPrice`, propuesta, contrato y aprobación del cliente pertenecen a Cotización 09A.

## Modelo

- `CostingRule`: serie económica administrable y versionada; costo interno, clasificación, margen, riesgo o compensación.
- `CostingExchangeRate`: tasa histórica versionada con par, fuente, vigencia y hash.
- `CostingCalculation`: input, reglas, tasas y resultado completos con hashes.
- `CostingRevision`: publicación económica por caso y revisión.
- `CostingLine`: familia, Pr/Ex/De, fuente/ref/versión, cantidad, unidad, costo original, conversión, total y sugerido.
- `CostingIssue`: INFO/WARNING/BLOCKER estructurado y resolución auditada.
- `CostingOverride`: sugerido, final, tipo, razón y actor.
- `CostingMarginAuthorization`: decisión append-only para overrides bajo mínimo.
- `CostingMutationCommand`: idempotencia tenant-first.

La migración 28 es aditiva. Todas las relaciones críticas usan FK compuestas con `tenant_id`; las identidades navegables son UUID opacos. Triggers impiden UPDATE/DELETE de cálculos, revisiones, líneas, overrides, autorizaciones y comandos, y limitan reglas/tasas a transiciones de vigencia y issues a su resolución.

## Familias, fuentes y clasificación

Las 13 familias son Personal, Transporte, Materiales, Cajas de madera, Herramientas/equipos, Dietas/viáticos, Terceros, Fletes, Aduanas, Permisos/gestiones, Cargos adicionales, Riesgos y Compensación por moneda.

Las fuentes aprobadas se representan como `SURVEY`, `SERVICE` (Servicio), `COMBO`, `ADMIN`, `MOTOR` y `PROVIDER` (Proveedor), más autoridades específicas `MATERIAL_COST`, `ASSET_COST`, `VEHICLE_COST` y `EXCHANGE_RATE` cuando mejoran la trazabilidad sin sustituir la fuente logística.

- `PR`: costo propio sujeto a una política versionada de margen mínimo y recomendado.
- `EX`: costo externo; pasa al sugerido sin margen propio por defecto.
- `DE`: desembolso; pasa al sugerido sin margen propio por defecto.

No se asume que todo costo interno comparte margen. La regla puede variar por familia, servicio, modo, zona u otros hechos publicados del snapshot logístico. Un empate real de prioridad/especificidad falla como conflicto.

## Autoridades económicas

- Material: `MaterialRequirementSnapshot` indirecto en el item logístico y `MaterialCostVersion`; la línea conserva material, requirement y cost version en snapshot.
- Asset propio: requirement logístico + `AssetCostVersion` de tipo `INTERNAL_RATE`.
- Recurso externo: `ExternalResourceOffer` vigente, importe, moneda, versión y presencia de referencia contractual. Falta de precio o referencia nunca genera una estimación.
- Personal, Vehicle, transporte propio, viáticos, riesgo, permisos y otros conceptos: `CostingRule` versionada. No contiene nómina y no inventa combustible/distancia.
- Moneda: tasa almacenada de `CostingExchangeRate`; la revisión captura ref, versión, fuente y rate. Los históricos nunca usan la tasa vigente al abrirse.

Crating, fletes y aduanas son familias separadas. Costing recibe sus necesidades del Motor; BOM/nesting, búsqueda de proveedor, impuestos completos y gestión operativa permanecen en sus autoridades.

## Cálculo, redondeo y blockers

Los cálculos usan enteros escalados: cantidades a 4 decimales, costo a 6, tasa a 10 y redondeo half-up determinista. La moneda base se captura en cada revisión y cada línea conserva moneda/costo original. La compensación cambiaria se expresa como línea independiente y nunca se esconde en margen o redondeo.

Issues bloqueantes incluyen `PROVIDER_PRICE_PENDING`, `CURRENCY_RATE_MISSING`, `MARGIN_POLICY_MISSING`, `LOGISTICS_BLOCKER_PRESENT`, `COST_VERSION_MISSING` y `EXTERNAL_REFERENCE_MISSING`. Una publicación con blocker abierto se rechaza. Hospedaje o proveedor sin precio permanece pendiente.

Antes de publicar se vuelve a cargar exactamente la revisión logística y sus autoridades económicas. Si existe una revisión logística posterior o cambió el hash de regla, costo, oferta o tasa, responde `409 COSTING_INPUT_STALE`. Recalcular crea otra simulación y publicar crea otra revisión; nunca actualiza el histórico.

## Overrides, autorización, idempotencia y auditoría

Costo, tasa, margen, sugerido o clasificación admiten override sólo con permiso explícito. El comando conserva sugerido, final, razón y actor. Un precio propio bajo el margen mínimo produce `AUTHORIZATION_REQUIRED`; una autoridad separada registra `AUTHORIZED` o `REJECTED` sin reescribir el override.

Cada comando incluye UUID `requestId` y hash SHA-256 recalculado sobre JSON canónico. Mismo request/payload reproduce el resultado; payload distinto falla 409. Advisory locks y transacciones serializables protegen publicación, reglas, tasas y autorizaciones. Cálculo, publicación, override, autorización, regla, tasa y resolución generan `CommercialAuditLog` en la misma transacción.

## Autorización y HTTP

Todas las APIs obtienen un `AuthorizationContext` revalidado y exigen User, Membership y Tenant activos. No aceptan tenant, actor, rol o PK internas. `deniedPermissions` prevalece. Sin `costing:tenant`, el caso exige owner Membership + User del actor; con él, el alcance es tenant-wide.

Permisos explícitos: `costing:view`, `costing:calculate`, `costing:publish`, `costing:tenant`, `costing:override`, `costing:authorize-margin`, `costing:resolve`, `costing:rules:view` y `costing:rules:manage`. Ningún rol baseline los recibe automáticamente.

| Método | Ruta | Uso |
|---|---|---|
| GET/HEAD | `/api/costing/revisions/:caseRef` | Última revisión visible |
| POST | `/api/costing/calculate` | Simulación |
| POST | `/api/costing/publish` | Publicación stale-safe |
| POST | `/api/costing/overrides` | Override auditado |
| POST | `/api/costing/authorizations` | Decisión de margen |
| POST | `/api/costing/issues/resolve` | Resolución de issue |
| GET/POST | `/api/costing/rules` | Listar/versionar reglas |
| GET/POST | `/api/costing/exchange-rates` | Listar/versionar tasas |

Las rutas son same-origin privadas, con `private, no-store`, `Vary: Authorization, Origin`, sin cookies ni wildcard CORS. El gate se evalúa antes de auth, body y Prisma.

## UI y modos

La Ficha monta el chunk lazy `CostingPanel` sólo con modo habilitado y `costing:view`. El tab `Costos` está después de Motor Logístico y antes de la futura Cotización. Expone tabla compacta, filtros, issues, totales, fuentes/versiones, cálculo, publicación y override accesible con color + icono + texto.

Administración monta por separado `CostingRulesAdmin` sólo con `costing:rules:view`; organiza Márgenes/Personal/Transporte/Riesgos/Reglas por familia y Monedas, y permite nuevas versiones, no borrado histórico.

Los únicos modos son `DISABLED`, `LOCAL_ONLY` y `PREVIEW_REHEARSAL`. `LOCAL_ONLY` exige loopback real y ausencia total de variables Vercel; Preview exige rama, batch y Auth LEGACY exactos. No existe modo Production y `productionApiEnabled=false`.
