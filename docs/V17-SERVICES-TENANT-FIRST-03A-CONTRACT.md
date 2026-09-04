# V17 Services tenant-first 03A — contrato canónico

## Autoridades y límites

La autoridad de producto es la composición de PR #76: `Modo/Alcance → Servicio principal → Servicios que incluye`. La autoridad de identidad, sesión, tenant y permisos es `AuthorizationContext` de Auth 01B. El modo es el `PipelineCase.mode` derivado y validado por ICP; Servicios nunca lo recibe como dato mutable.

Este lote no contiene Survey, volumen, costos, tarifas, líneas de cotización ni una activación productiva. `productionApiEnabled=false`.

## Modelo

- `ServiceCatalogItem`: entrada tenant-first con `serviceRef` UUID v4 público, `code` estable, nombre, categoría, uso `PRIMARY|COMPLEMENTARY|BOTH`, modos compatibles, estado `ACTIVE|INACTIVE`, orden y versión optimista.
- `ServiceCatalogCompatibility`: conjunto permitido entre un principal y un complementario del mismo tenant. Permitido no significa predeterminado.
- `ServiceDefaultCombination` y `ServiceDefaultCombinationItem`: combinaciones administrables, versionadas y con un máximo de una combinación activa predeterminada por principal.
- `PipelineCaseServiceRevision`: cabecera append-only ligada por `(tenantId,pipelineCaseId)`, con revisión, modo snapshot, fuente y actor revalidado.
- `PipelineCaseServiceItem`: snapshot inmutable del código, nombre, categoría, `serviceRef`, versión de catálogo, posición y fuente. Un `OTHER` no tiene catálogo, exige descripción y queda `PENDING`.
- `ServiceMutationCommand`: idempotencia tenant-first por `requestId`, hash canónico, operación, resultado y actor.
- `CommercialAuditLog`: auditoría compartida para altas, ediciones, estados, defaults y selección por caso.

No se agrega `DRAFT/CONFIRMED`: el caso puede permanecer sin selección durante ICP y cada guardado completo crea una revisión confirmada. No hay actualización parcial del snapshot.

## Reglas de integridad

- Todas las FK entre catálogo, defaults, caso y actor incluyen el tenant.
- Existe un único principal por revisión; no se permiten posiciones ni complementarios duplicados.
- Sólo un principal `ACTIVE`, de uso principal y compatible con el modo del caso puede seleccionarse.
- Sólo complementarios `ACTIVE` presentes en la relación permitida pueden añadirse.
- `serviceRef`, `combinationRef`, tenant y códigos son inmutables.
- Revisiones e ítems de caso no se actualizan ni borran. Un servicio inactivo deja de ser opción pero continúa legible en snapshots históricos.
- No existe endpoint `DELETE` de servicios.
- Al cambiar principal, la UI advierte antes de reemplazar decisiones manuales y precarga una copia del default vigente. Editar esa copia no altera la combinación global.
- Idempotencia y versión optimista evitan doble submit y last-write-wins silencioso.

## API cerrada

Todas las rutas son same-origin, privadas, `no-store`, varían por `Authorization, Origin`, usan Bearer LEGACY y `X-OSI-Membership-Ref`, y revalidan User, Membership y Tenant en cada request.

| Ruta | Métodos | Permiso |
|---|---|---|
| `/api/crm/services/catalog` | GET, POST | `services:catalog:view/manage` |
| `/api/crm/services/catalog/:serviceRef` | GET historial, PATCH | `services:catalog:view/manage` |
| `/api/crm/services/defaults` | GET, POST | `services:catalog:view/manage` |
| `/api/crm/services/cases/:caseRef` | GET, PATCH | `services:case:view/update` |

El rol no concede estos permisos por sí mismo. Los cuatro son grants explícitos y `deniedPermissions` prevalece. A puede administrar y consultar casos tenant-wide cuando posee el grant; V sólo resuelve casos cuyo owner completo coincide con User, Membership y Tenant revalidados. Caso ajeno, inexistente o cross-tenant devuelve el mismo 404.

Los DTO publican únicamente referencias opacas y snapshots funcionales. Nunca publican PK Prisma, `tenantId`, `userId`, `membershipId` ni nombres legacy como autoridad.

## Compuertas

- Server: `CRM_SERVICES_API_MODE=DISABLED|LOCAL_ONLY|PREVIEW_REHEARSAL`.
- Frontend: `VITE_CRM_SERVICES_UI_MODE=DISABLED|LOCAL_ONLY|PREVIEW_REHEARSAL`.
- Ausente, alterado o desconocido: `DISABLED`.
- `LOCAL_ONLY` exige loopback real y rechaza cualquier señal `VERCEL*`.
- `PREVIEW_REHEARSAL` exige rama `feature/v17-services-tenant-first` y batch `V17-SERVICES-TENANT-FIRST-03A-PREVIEW`.
- No existe valor Production en este lote.

## UI

La Ficha incorpora una pestaña lazy `Servicios` sólo después de confirmar modo de entorno y `services:case:view`. Presenta el modo ICP en read-only, el principal filtrado por modo, complementarios permitidos, defaults copiados y “Otro servicio” pendiente. Administración añade una tabla compacta con código, servicio, tipo, modos, estado, usos y acciones de edición, estado, combinación e historial.

## Inventario histórico y seed

| Fuente | Clasificación | Decisión |
|---|---|---|
| PR #76 (`MOV_RES`, `MOV_CORP`, `MOV_DIP`, `STORAGE_*`, `TRANSPORT`, `CUSTOMS`, `PACK_*`, `FINE_ART`, `CRATING`) | CANÓNICO RECUPERABLE visual/funcional | Conserva composición, compatibilidades y concepto de combos; no se inserta automáticamente. |
| `CommercialWorkspaceV7` y `serviceTypes.ts` históricos | LEGACY REFERENCIABLE | Nomenclatura útil para el futuro mapping empresarial. |
| `TipoServicioConfig` | DUPLICADO global | No es autoridad tenant-first de selección. |
| `CatalogServiceType` | DUPLICADO global | No se reutiliza como autoridad. |
| presets de `quoteServices.ts` | LEGACY REFERENCIABLE de Cotización | No gobiernan Servicios. |
| PST/PTF y servicios de OSI | LEGACY REFERENCIABLE operativo | No se convierten en catálogo sin decisión empresarial. |

No hay seed productivo: las colisiones semánticas entre nomenclaturas históricas y #76 requieren aprobación del propietario. Las pruebas pueden crear fixtures explícitos y aislados.

## Consumidores futuros

- Survey recibirá Case + revisión de Service Selection como contexto; no derivará materiales aquí.
- Costing utilizará la selección como fuente `SERVICE` y referenciará su revisión, sin duplicar catálogo ni almacenar costos en Servicios.
- Quote conservará `serviceRef`, código y revisión/snapshot para conceptos derivados, sin que este lote genere líneas económicas.

## Estado de consumidores

| Indicador | Valor |
|---|---:|
| `productionApiEnabled` | `false` |
| `runtimeConsumers` | `4` rutas API y 2 superficies lazy |
| `effectiveProductionConsumers` | `0` |
| `previewConsumers` | `1` Preview acotado, aún no publicado |
