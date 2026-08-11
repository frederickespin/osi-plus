# CRM-01A — API relacional de lectura de PipelineCase

## Estado y autoridad

La API nace inactiva. `CRM_PIPELINE_RUNTIME_MODE` admite únicamente los bytes exactos `DISABLED` y `READ_ONLY`; la ausencia equivale a `DISABLED`. `READ_ONLY` se reserva a PostgreSQL local y se rechaza en Vercel Preview/Production. No existe variable `VITE_`, import frontend, hook, cron ni fallback a variables de base generales.

La autoridad dedicada es `pipeline:view`. El catálogo backend la concede por base únicamente a Administración (`A`) y Ventas (`V`); K, B, I y operaciones no la reciben. `clients:view` por sí solo no autoriza estas rutas, un grant empresarial explícito de `pipeline:view` sí puede hacerlo y `deniedPermissions` siempre prevalece. La identidad, el tenant, la membresía, el rol y los permisos efectivos se resuelven con el contexto comercial del servidor. Un access token V2 candidato nunca degrada a JWT LEGACY. El catálogo frontend y sus consumidores permanecen intactos en esta fase.

## Inventario relacional

`PipelineCase` contiene `tenantId`, estado, modo, tipo de servicio, tipo de cliente, localizaciones, volumen, encuesta, destino, contadores y timestamps. El owner empresarial es la FK compuesta `(tenantId, ownerMembershipId, ownerUserId) → TenantMembership(tenantId, id, userId)`. `ownerId`/`ownerName` son compatibilidad heredada y no son autoridad. Las relaciones actuales son:

- `Tenant`: raíz empresarial directa.
- `TenantMembership` y `User`: owner empresarial compuesto; el nombre seguro procede del usuario enlazado.
- `PipelineCaseQuote`: 1:N; esta fase expone sólo el conteo.
- `PipelineEvent`: 1:N; esta fase expone sólo el conteo.
- `PipelineCratingRequest`: 1:1; no se expone.
- No existe relación directa de `PipelineCase` con `Client` o `Project`; `clientName` es texto y no constituye FK.

No existe una fecha límite/SLA canónica en `PipelineCase`. `milestonesJson` es un payload ambiguo, por lo que el resumen devuelve `sla: { overdue: null, basis: "UNAVAILABLE" }` y no inventa vencimientos.

## Prototipo frontend actual

La clave `osi-plus.leads` almacena `LeadLite[]`; `osi-plus.quotes` almacena `Quote[]`. Los consumidores son `ClientsModule`, `SalesQuoteModule`, `OperationsModule` y `CrateWoodModule`, apoyados por `salesStore.ts`. `ClientsModule` siembra oportunidades desde los clientes mock y `CustomerPipelineBar` representa sus siete estados. CRM-01A no modifica, importa ni consulta esas claves.

| Campo frontend `LeadLite` | Campo `PipelineCase` | Convertible | Pérdida o riesgo |
| --- | --- | --- | --- |
| `id` | `id` | Sí, sólo identidad | Los IDs locales no se deben importar automáticamente. |
| `customerId` | — | No | No existe FK `PipelineCase → Client`. |
| `clientName` | `clientName` | Parcial | Es texto, no identidad empresarial de Client. |
| `status` | `status` | No directo | 7 estados frontend frente a 15 estados relacionales; exige mapeo empresarial aprobado. |
| `serviceType` | `serviceType` | Sí sintáctico | El modelo relacional aún usa `String`, no catálogo. |
| `pstCode` | relación de cotización/eventos | No | No existe campo equivalente en la raíz. |
| `origin` | `originLocation` | Parcial | Texto libre, sin geografía canónica. |
| `destination` | `destinationLocation` | Parcial | Texto libre y reglas adicionales de destino. |
| `phone` | — | No | Dato de contacto no pertenece a PipelineCase. |
| `email` | — | No | Dato de contacto no pertenece a PipelineCase. |
| `createdAt` | `createdAt` | Sí | Debe conservarse como timestamp, no string arbitrario. |
| `updatedAt` | `updatedAt` | Sí | Debe conservarse como timestamp, no string arbitrario. |

## Contratos JSON

`GET /api/crm/pipeline-cases` devuelve `{ ok, total, page, pageSize, data }`. Cada elemento contiene sólo `id`, `caseCode`, `clientName`, `mode`, `serviceType`, `customerType`, `status`, datos comerciales explícitos, conteos de quotes/events, timestamps y `owner`. El owner es `null` o `{ displayName, role, membershipStatus }`; el estado de membresía es una referencia histórica y nunca concede autoridad. `membershipId` se omite porque todavía no existe asignación CRM y no hay una necesidad contractual de exponerlo.

`GET /api/crm/pipeline-cases/:id` devuelve `{ ok, data }` con la misma selección segura. Un ID inexistente o de otro tenant devuelve `404 CRM_PIPELINE_RESOURCE_NOT_FOUND`.

`GET /api/crm/pipeline-summary` devuelve `{ ok, data: { total, assigned, unassigned, byStatus, sla } }`. Todos los estados del enum aparecen aunque su conteo sea cero.

Todos los contratos incluyen `Cache-Control: private, no-store` y `Vary: Authorization`. `tenantId`, `ownerId`, `ownerUserId`, `membershipId`, `userId`, estado global del usuario, email, teléfono, permisos, hashes, `flags`, `milestonesJson` y payloads hijos no se serializan. Los snapshots congelan lista, detalle, resumen y errores 401/403/404/409/503.

## Filtros allowlist

| Query | Forma | Efecto |
| --- | --- | --- |
| `page` | entero positivo | Página; predeterminado 1. |
| `pageSize` | 1–100 | Límite siempre aplicado; predeterminado 50. |
| `status` | valor exacto del enum | Filtro de estado dentro del tenant. |
| `mode` | `LOCAL`, `EXPORT`, `IMPORT` | Filtro exacto. |
| `serviceType` | string exacto, máximo 80 | Filtro exacto. |
| `q` | máximo 100 | Busca sólo caseCode, clientName, origen y destino. |
| `ownerMembershipId` | máximo 128 | Filtra la FK relacional, nunca `ownerId`. |
| `unassigned` | `true` o `false` exacto | `true` selecciona el conjunto owner NULL. |

Campos desconocidos, arrays, espacios de borde o combinaciones `ownerMembershipId + unassigned=true` se rechazan. El orden es `updatedAt DESC, id ASC` y count/página contienen siempre `tenantId`.

## Riesgos reservados

- CRM-01B deberá decidir el mapeo de los estados frontend, una FK real a Client/Project y un SLA canónico.
- La búsqueda `contains` insensible sobre texto puede requerir índice funcional o `pg_trgm` con mayor volumen; CRM-01A no crea migración 16.
- El owner inactivo se muestra sólo como evidencia histórica. Las operaciones futuras deben volver a autorizar contra membresía vigente.
- `caseCode` continúa siendo único globalmente en el esquema actual; dos tenants no pueden reutilizar el mismo código aunque el aislamiento de lectura sí admita estados coincidentes. CRM-01B debe decidir si esa restricción representa el dominio futuro.
- PipelineCase y Lead continúan sin mutaciones/endpoints de escritura. Los 24 archivos heredados por headers permanecen congelados.

## Evidencia local de rendimiento

Con 2,000 y 10,000 `PipelineCase`, 30 rondas por escenario y preparación de fixtures excluida, cada listado ejecutó exactamente dos consultas (count + página):

| Escenario | p50 ms | p95 ms | máximo ms |
| --- | ---: | ---: | ---: |
| Primera página | 5.176 | 6.594 | 6.688 |
| Página profunda | 5.669 | 6.209 | 6.872 |
| Estado | 3.032 | 3.745 | 3.794 |
| Sin owner | 4.994 | 7.102 | 7.991 |
| Búsqueda comercial | 4.831 | 5.752 | 6.285 |

La repetición Q1 produjo esta evidencia (milisegundos):

| Volumen | Escenario | p50 | p95 | máximo |
| ---: | --- | ---: | ---: | ---: |
| 2,000 | Primera página | 6.162 | 7.024 | 7.149 |
| 2,000 | Página profunda | 6.638 | 7.242 | 7.615 |
| 2,000 | Estado | 3.769 | 4.455 | 4.563 |
| 2,000 | Sin owner | 5.983 | 6.749 | 7.133 |
| 2,000 | Búsqueda | 5.927 | 6.571 | 6.597 |
| 10,000 | Primera página | 17.569 | 19.403 | 19.890 |
| 10,000 | Página profunda | 36.427 | 44.198 | 45.211 |
| 10,000 | Estado | 8.146 | 9.179 | 9.418 |
| 10,000 | Sin owner | 26.394 | 41.569 | 49.455 |
| 10,000 | Búsqueda | 26.084 | 42.264 | 44.446 |

Con 10,000 filas, `EXPLAIN (ANALYZE, BUFFERS)` mostró que lista, estado y búsqueda usan `osi_pipeline_cases_tenant_owner_idx` y ordenan después del filtro; la búsqueda eliminó 9,999 filas. Los p95 permanecen por debajo de 50 ms en el entorno local, por lo que Q1 no justifica crear una migración. CRM-01B debe evaluar `(tenant_id, updatedAt DESC, id)`, el índice de estado con desempate `id` y, sólo con evidencia de volumen, `pg_trgm`/índice funcional para búsqueda. No se creó la migración 16.
