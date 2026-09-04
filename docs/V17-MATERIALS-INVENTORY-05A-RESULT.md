# V17-MATERIALS-INVENTORY-05A — Resultado

## A. Resumen ejecutivo

Se implementó localmente la autoridad tenant-first de materiales consumibles: catálogo, unidades, conversiones, costos versionados, almacenes/ubicaciones, ledger, reservas, recetas, necesidades Survey, compras, API y UI compacta. No se implementaron herramientas/equipos, Motor Logístico, Costing ni Cotización.

## B. Rama/base/HEAD

- Base: `feature/v17-survey-foundation@84d433da9a3cb190aee82a4dc44ec512e6dab300`.
- Rama: `feature/v17-materials-inventory`.
- HEAD final: se registra al cerrar los commits locales.

## C. Fuentes históricas recuperadas

Del snapshot `61a3e8a4525efedfc99120fb5e4845ba45234ba1` se conservaron como intención: jerarquía Warehouse/Zone/Aisle/Rack/Level/Bin, áreas RECEIVING/DISPATCH, catálogo compacto, solicitudes, reserva/faltante de Crating y trazabilidad de movimientos. No se copiaron stores, mocks, IDs, inferencias por nombre ni persistencia browser.

## D. CatalogMaterial legacy

`CatalogMaterial` continúa intacto y global/legacy. No es apto como autoridad porque carece de tenant, referencia pública, unidades relacionadas, costos históricos, versión y relaciones de stock. Queda como candidato a adaptador explícito, sin backfill inferido.

## E. Modelo Prisma

La migración agrega 17 modelos: `MaterialUnit`, `MaterialCatalogItem`, `MaterialUnitConversion`, `MaterialCostVersion`, `MaterialSupplierReference`, `MaterialWarehouse`, `MaterialLocation`, `MaterialInventoryCommand`, `MaterialInventoryMovement`, `MaterialReservation`, `MaterialReservationEvent`, `PackingRecipe`, `PackingRecipeVersion`, `PackingRecipeLine`, `MaterialRequirementSnapshot`, `MaterialRequirementLine` y `MaterialPurchaseRequest`.

## F. Migración

Migración 25: `20260906010000_v17_materials_inventory`. Es aditiva y no contiene backfill ni cambios a migraciones 1–24. Blob final: 43,741 bytes, LF, UTF-8 sin BOM, SHA-256 `9d2f1eebb797e02a59343e166bbaaed3921347920d4c630b349f04709406bd21`.

## G. Catálogo

Código tenant-scoped estable, UUID público inmutable, familia/subfamilia, estado ACTIVE/INACTIVE, flags técnicos, política dimensional JSON, política de lote, mínimos/máximos/reposición, orden y versión optimista.

## H. Unidades/conversiones

Compra, base/inventario y consumo son relaciones separadas. Las conversiones son explícitas, positivas, material-specific, versionadas y con vigencia.

## I. Costos

`MaterialCostVersion` reemplaza el costo mutable: sólo una versión vigente, historia por intervalo, moneda/unidad/fuente/proveedor y actor tenant-first.

## J. Warehouses/locations

Árbol de profundidad 0–32, parent tenant-first, mismo warehouse, profundidad/path coherentes y ubicación pública. No exige niveles vacíos.

## K. Ledger

Movimientos append-only con cantidad positiva, actor, motivo, lote opcional, `transactionRef`, comando y vínculos opcionales a reserva/necesidad. El balance se deriva matemáticamente.

## L. Reservas

Reserva separada del stock, vinculable a caso, necesidad o Crating. Creación, asignación y liberación idempotentes, historia append-only y control optimista.

## M. Disponibilidad

`physical - RESERVED - ASSIGNED`; no existe columna autoritativa “available”. Advisory locks y aislamiento serializable evitan oversubscription.

## N. Despacho/consumo/devolución

Son conceptos distintos. ISSUE/CONSUMPTION/RETURN permanecen en ledger y pueden vincularse a una línea de necesidad para comparar sugerido, despachado, consumido y devuelto.

## O. Ajustes

Ajustes positivos/negativos exigen permiso separado, motivo, actor, comando y auditoría. El ajuste negativo no puede producir stock negativo.

## P. Recetas

Versionadas, una ACTIVE por receta, contexto extensible y fórmulas sin hard-code por artículo. Activar una versión retira la anterior bajo lock; los snapshots previos conservan esa versión. Materiales inactivos no resuelven nuevas necesidades.

## Q. Survey MaterialRequirement

La publicación es fuente de hechos. La operación explícita genera un snapshot inmutable con hash; nuevas recetas no lo reescriben. Survey conserva el texto y la prohibición de selección manual.

## R. Crating integration

Se definió el destino canónico `Crating BOM → MaterialRequirement → Inventory`. El store histórico que crea materiales por nombre queda legacy; no se reescribió nesting.

## S. Compras

Solicitud focal REQUESTED/APPROVED/ORDERED/RECEIVED/CANCELLED vinculable a necesidad. La transición aprobada a RECEIVED crea exactamente un movimiento RECEIPT trazado a la solicitud; no hay compra automática ni contabilidad.

## T. AuthorizationContext

Las APIs resuelven User, Membership y Tenant server-side con `resolveCrmPipelineContext`; no aceptan actor, rol, tenant o PK del frontend.

## U. Permisos

Se añadieron doce permisos explícitos de catálogo, stock, reserva, compras y recetas. A no los hereda automáticamente y los denies prevalecen.

## V. Auditoría

Las mutaciones crean `MaterialInventoryCommand` idempotente y `CommercialAuditLog` con referencia pública; no se registran PII, cuerpos empresariales ni secretos.

## W. API

Dieciséis rutas protegidas, same-origin y fail-closed. El inventario CORS queda 86/86, 59 privadas, 2 públicas y 25 legacy cerradas.

## X. UI

Aplicación lazy `Materiales e Inventario`, visible sólo con permisos explícitos y modo autorizado. Incluye resumen físico/reservado/asignado/disponible, tabla compacta con costo vigente, búsqueda, filtros por familia/estado/almacén/disponibilidad/reposición, detalle, recepción, transferencia, reserva, asignación, liberación, ajuste, ledger, recetas y necesidades. Responsive, navegación por teclado y estados con texto. Las altas administrativas de catálogo, unidades, conversiones, costos, recetas y compras están disponibles por API cerrada; no se presenta un CTA visual incompleto.

## Y. Histórico mapping

| Histórico | Código | Nuevo material | Acción |
|---|---|---|---|
| Papel kraft | `MAT-PAPEL-KRAFT` | candidato consumible PAPEL | conservar código; validar unidad |
| Caja cartón cristalería | `MAT-CAJA-CARTON-CRISTALERIA` | candidato consumible CAJAS | adaptar |
| Plancha de cartón | `MAT-PLANCHA-CARTON` | candidato dimensional CARTÓN | adaptar con dimensiones |
| Caja cartón tipo B | `MAT-CAJA-CARTON-TIPO-B` | requiere decisión returnable | legacy hasta separar reutilizables |
| Fieltro/mantas | `MAT-FIELTRO-MANTAS` | reutilizable/rental | fuera de 05A; próximo lote |
| Caja plástica estándar | `MAT-CAJA-PLASTICA-ESTANDAR` | reutilizable/rental | fuera de 05A; próximo lote |
| BOM plywood/madera/foam/cartón | `CRATE-*` | catálogo compartido | adaptar mediante mapping aprobado |

No se sembró ningún registro empresarial.

## Z. Tests

Contrato/HTTP: 40 aserciones sobre payload cerrado/hash, modos fail-closed, CORS, ledger, disponibilidad, asignación, compras, versiones y fórmula. DB: conversiones y costos versionados, Survey→receta v1/v2→snapshots inmutables, idempotencia, par de transferencia, ledger RECEIPT/ISSUE/CONSUMPTION/RETURN/ajustes, carreras de costo, creación/activación de receta, reserva, recepción e issue, ciclo RESERVED→ASSIGNED→RELEASED, despacho enlazado a necesidad, compra→RECEIPT, inactivación optimista, append-only, aislamiento tenant y 37 comandos/auditorías.

## AA. PostgreSQL

PostgreSQL 18 local: instalación desde vacío 25/25; actualización 24→25; segundo deploy con cero pendientes; drift vacío; rollback exacto a 24 con cero tablas residuales; replay 25/25; constraints, índices parciales, triggers, locks y concurrencia verdes.

## AB. Browser

12/12: catálogo, filtros mínimos, detalle, recepción, transferencia, reserva, asignación, liberación, movimientos, recetas, necesidades Survey y deny-before-lazy en Chromium/Firefox/WebKit, desktop y móvil; cero omitidas/retries.

## AC. Guards

Guardia positiva + 18 negativas bloquea modelos/operaciones ausentes, cantidad mutable, costo hard-coded, catálogo por nombre/sin tenant, ledger mutable, storage browser, MAX+1, DELETE, falta de lock, gate tardío, Production, lazy sin autorización, grants de rol, selección manual Survey y mezcla de activos.

## AD. Feature flags/runtime consumers

Modos exclusivos DISABLED/LOCAL_ONLY/PREVIEW_REHEARSAL. Sin variables, el módulo no se monta y la API responde 409 antes de Auth/body/Prisma. `productionApiEnabled=false`; cero consumidores productivos.

## AE. Riesgos pendientes

- La taxonomía empresarial y unidades históricas requieren aprobación antes de importar.
- Proveedor es referencia focal, no módulo procurement completo.
- Crating requiere adaptador y mapping explícitos.
- Despacho extraordinario con stock negativo no está autorizado.
- Conteos cíclicos completos, expiración y lotes avanzados quedan posteriores.

## AF. Diff summary

Esquema/migración 25, dominio/HTTP/API, permisos, Hub/UI lazy, inventario CORS, pruebas/guardias y esta documentación.

## AG. Worktree

Se entrega limpio tras commits locales, sin push ni PR.

## AH. Propuesta del siguiente lote

`Herramientas / Equipos`: investigar y diseñar `AssetModel` + `AssetInstance`, serial/QR, custodias, reserva/asignación/devolución, condición y mantenimiento, consumiendo Warehouse/Location sin mezclarse con `MaterialCatalogItem`. No se implementa automáticamente.
