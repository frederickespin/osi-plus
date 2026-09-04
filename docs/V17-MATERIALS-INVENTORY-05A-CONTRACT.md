# V17-MATERIALS-INVENTORY-05A — Contrato canónico

## Límite del dominio

Esta autoridad cubre únicamente materiales consumibles. Herramientas serializadas, equipos reutilizables, activos, vehículos, alquiler y mantenimiento quedan fuera. `CatalogMaterial`, `OsiMaterialReturn`, `Osi.ptfMaterialPlan` y los stores históricos no son fuentes de verdad ni reciben backfill.

## Autoridades

| Concepto | Autoridad |
|---|---|
| Identidad y actor | `AuthorizationContext` revalidado (User + Membership + Tenant) |
| Catálogo | `MaterialCatalogItem` tenant-first, código estable y `materialRef` UUID |
| Unidades | `MaterialUnit`; compra, inventario/base y consumo son relaciones distintas |
| Conversión | `MaterialUnitConversion` versionada, vigente por fechas |
| Costo | `MaterialCostVersion`; una versión actual por material, historia preservada |
| Ubicación | `MaterialWarehouse` + árbol `MaterialLocation` de profundidad variable |
| Stock físico | suma del ledger append-only `MaterialInventoryMovement` |
| Compromiso | `MaterialReservation`; no es un movimiento físico |
| Necesidad | snapshot inmutable derivado de `SurveyPublication` + receta activa |
| Compra | `MaterialPurchaseRequest`; recepción posterior genera `RECEIPT` |

Los DTO publican exclusivamente referencias UUID opacas. Las PK, `tenantId`, `userId` y `membershipId` sólo viven dentro del servidor.

## Ledger y disponibilidad

Por ubicación, el signo del movimiento es:

```text
+ RECEIPT, TRANSFER_IN, RETURN, ADJUSTMENT_POSITIVE
- TRANSFER_OUT, ISSUE, CONSUMPTION, ADJUSTMENT_NEGATIVE
```

Una transferencia confirmada contiene exactamente un `TRANSFER_OUT` y un `TRANSFER_IN` con el mismo `transactionRef`, dentro de una transacción serializable. El stock no se persiste como balance mutable.

```text
physical  = Σ(movement.quantity × movement.sign)
available = physical - active RESERVED - active ASSIGNED
```

La operación toma un advisory lock por `(tenant, material, location)`. Una salida, consumo, transferencia o ajuste negativo que deje stock negativo falla con `MATERIALS_NEGATIVE_STOCK_FORBIDDEN`. Dos reservas concurrentes no pueden comprometer más que la disponibilidad.

`RESERVED`, `ASSIGNED`, `DISPATCHED`, `RELEASED` y `CANCELLED` son estados explícitos. Cada transición produce `MaterialReservationEvent`; el historial no se edita. Despachado, consumido y devuelto se obtienen del ledger vinculado a la necesidad, no de una única cantidad mutable.

## Recetas y Survey

`PackingRecipeVersion.applicability` admite contexto extensible (artículo, modos, servicio, condición, flags y dimensiones). Cada línea define `FIXED`, `PER_ITEM`, `PER_LENGTH` o `PER_AREA`, incremento de redondeo, desperdicio y configuración congelada.

```text
SurveyPublication
  → versión ACTIVE de PackingRecipe
  → MaterialRequirementSnapshot (CURRENT/SUPERSEDED)
  → MaterialRequirementLine[]
```

El snapshot conserva publicación, versión de receta, reglas, fórmula, artículos fuente, referencias de materiales/unidades, cantidad y hash lógico. Una receta posterior no altera snapshots previos. La regeneración es una mutación explícita e idempotente. Survey nunca ofrece un selector manual de materiales.

Crating debe integrarse en un lote posterior mediante un adaptador `Crating BOM → MaterialRequirement`; no puede crear un catálogo paralelo.

## Costo y proveedores

El costo tiene importe, ISO currency, unidad, fuente, proveedor opcional, vigencia y versión. Costing futuro deberá capturar el `costVersionRef` y sus valores, nunca consultar retroactivamente “el costo actual”. No se creó una autoridad empresarial nueva de proveedores: `MaterialSupplierReference` es una referencia focal del material hasta que exista un catálogo tenant-first aprobado.

## HTTP

Todas las rutas son same-origin, privadas, `Cache-Control: private, no-store`, `Vary: Authorization, Origin`, sin cookies, CORS wildcard ni autoridad enviada por el browser.

| Ruta | Métodos | Contrato |
|---|---|---|
| `/api/materials/catalog` | GET, POST | Lista/crea material |
| `/api/materials/catalog/:materialRef` | PATCH | Edita o inactiva con versión optimista |
| `/api/materials/units` | GET, POST | Unidades administrables |
| `/api/materials/conversions` | GET, POST | Conversiones explícitas versionadas |
| `/api/materials/warehouses` | GET, POST | Almacén y árbol de ubicaciones |
| `/api/materials/costs` | POST | Nueva versión de costo |
| `/api/materials/movements` | GET, POST | Ledger y operación física |
| `/api/materials/reservations` | GET, POST | Lista/crea reserva |
| `/api/materials/reservations/assign` | POST | Convierte reserva en asignación confirmada |
| `/api/materials/reservations/release` | POST | Liberación explícita |
| `/api/materials/recipes` | GET, POST | Lista/crea y activa receta inicial |
| `/api/materials/recipes/version` | POST | Retira la versión vigente y activa una versión nueva |
| `/api/materials/requirements` | GET | Snapshots Survey y sus necesidades publicadas |
| `/api/materials/requirements/resolve` | POST | Survey → necesidad inmutable |
| `/api/materials/purchase-requests` | GET, POST | Lista/crea solicitud de compra focal |
| `/api/materials/purchase-requests/transition` | POST | Aprueba, ordena, recibe o cancela; recibir crea `RECEIPT` trazable |

Los comandos sensibles recalculan `payloadHash` canónico server-side, hacen única `(tenantId, requestId)`, devuelven el mismo resultado para el mismo payload y `409 MATERIALS_IDEMPOTENCY_CONFLICT` para un payload distinto.

## Permisos explícitos

```text
inventory:catalog:view
inventory:catalog:manage
inventory:stock:view
inventory:stock:receive
inventory:stock:transfer
inventory:stock:issue
inventory:stock:adjust
inventory:reservation:manage
inventory:purchase:request
inventory:purchase:approve
inventory:recipes:view
inventory:recipes:manage
```

No se derivan automáticamente del rol A. `deniedPermissions` prevalece. El permiso genérico histórico `inventory:edit` no habilita esta API.

## Modos

Servidor: `MATERIALS_INVENTORY_API_MODE`. Frontend: `VITE_MATERIALS_INVENTORY_UI_MODE`.

- Ausente, alterado o `DISABLED`: cerrado.
- `LOCAL_ONLY`: sólo loopback real y ningún `VERCEL*`.
- `PREVIEW_REHEARSAL`: Preview, rama y batch exactos, Auth LEGACY, tenant switch apagado.
- No existe modo Production.

`productionApiEnabled=false`.
