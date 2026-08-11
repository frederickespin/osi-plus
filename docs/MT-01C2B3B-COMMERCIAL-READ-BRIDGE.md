# MT-01C2B3B — Puente empresarial de lecturas comerciales

## Estado de activación

El puente queda preparado e inactivo. Los valores predeterminados y únicos autorizados en CI y Vercel son:

```env
COMMERCIAL_TENANCY_WRITE_MODE=LEGACY_ONLY
COMMERCIAL_TENANCY_READ_MODE=LEGACY_ONLY
MT01B_AUTH_MODE=LEGACY
MT01B_TENANT_SWITCH_ENABLED=false
VITE_MT01B2_CLIENT_ENABLED=false
```

Sólo existen dos pares válidos: `LEGACY_ONLY/LEGACY_ONLY` y, exclusivamente en PostgreSQL local de pruebas, `TENANT_WRITE/TENANT_READ`. Una combinación parcial, un valor desconocido o el par tenant dentro de Vercel produce `503 COMMERCIAL_TENANCY_CONFIGURATION_INVALID` antes de consultar o escribir una raíz comercial.

## Inventario runtime

| Área | Operación encontrada | Estado MT-01C2B3B | Motivo |
|---|---|---|---|
| `GET /api/clients` | listado, búsqueda y conteo Client | preparado | filtra `tenantId`, pagina y ordena dentro del tenant |
| `GET /api/projects` | listado, búsqueda y conteo Project | preparado | filtra Project y Client padre por el mismo tenant |
| `GET /api/k/dashboard` | proyectos, señales, PGD y conteos K | preparado | filtro de raíz antes de includes y fallback en memoria |
| `GET /api/k/project` | detalle Project, señales, PGD y OSI | preparado | acceso cruzado/NULL 404; el modo tenant no inicializa señales |
| `POST /api/k/project-validate` | lectura de Project y update K | preparado | permiso `projects:validate`; sólo `kState/kValidatedAt` |
| `POST /api/k/project-release` | lectura de Project y update K | preparado | permiso `projects:release`; sólo `kState/kReleasedAt` |
| PipelineCase | no existe consumidor Prisma runtime | sólo servicio | conserva visibles los casos sin owner; no filtra ni cambia owner |
| Lead | no existe consumidor Prisma runtime | sólo servicio | filtro preparado, sin endpoint nuevo |
| `POST /api/osis` | lee Project y crea OSI sin raíz tenantizada | bloqueado | OSI no tiene todavía autoridad empresarial verificable |
| `POST /api/k/pgd/apply` | lee Project y escribe PGD | bloqueado | autenticación heredada por headers y children sin tenant propio |
| `/api/k/signal`, `/api/k/pgd/item` | mutaciones de children por ID | bloqueado | requieren resolver primero el Project raíz |

No se encontraron lectores relacionales activos de PipelineCase o Lead para calendario, búsqueda, KPI o pipeline. Los consumidores frontend actuales de Pipeline son stores/fixtures no Prisma; la guardia falla si aparece un lector runtime nuevo fuera del servicio preparado.

### Trazabilidad completa de PipelineCase y Lead

La búsqueda incluyó `api/cases/**`, `api/pipeline/**`, `_service.js`, Prisma, SQL crudo, aliases físicos, imports dinámicos, stores, seeds, dashboard, calendario, KPI y cotizaciones. `api/cases/_service.js` sólo aparece mencionado en documentación histórica y no existe en el árbol runtime actual. Tampoco existen rutas `api/cases`, `api/pipeline` o `api/leads`.

| Flujo visible | Origen frontend | Endpoint | Servicio/consulta | Persistencia real |
|---|---|---|---|---|
| Pipeline comercial en Clientes | `ClientsModule` → `loadLeads/saveLeads` | ninguno | `salesStore` | `localStorage` `osi-plus.leads` |
| Cotizador | `SalesQuoteModule`/`QuoteBuilder` → `loadLeads/loadQuotes` | ninguno | `salesStore` | `localStorage`; si está vacío crea 15 fixtures desde `mockClients` |
| Calendario comercial | `CommercialCalendarModule` → leads/quotes/bookings | sólo Projects para la raíz Project | `salesStore` y `commercialCalendarStore` | `localStorage` para leads, quotes y bookings |
| KPI/dashboard | módulos existentes | no consultan PipelineCase/Lead relacional | sin delegate Prisma PipelineCase/Lead | datos heredados/locales |
| 51 PipelineCase relacionales | ningún consumidor activo | ninguno | sólo scripts C2B2 y lector preparado no importado | `osi_pipeline_cases` |
| Lead relacional | ningún consumidor activo | ninguno | lector preparado no importado | `osi_leads` |

Por ello, las 51 oportunidades no pueden tenantizarse en un flujo runtime inexistente sin crear un endpoint/cutover nuevo fuera de alcance. PipelineCase y Lead quedan como bloqueos P0 de activación; el guard falla si un runtime empieza a consultar sus delegates fuera del servicio preparado.

## Autoridad y compatibilidad

El contexto se resuelve una vez por request. En LEGACY se revalida el usuario global y se selecciona la membresía predeterminada ACTIVE; en V2 se usa `resolveAuthContext`. Tenant, membership, role y permisos provienen del servidor. Los denied permissions prevalecen. Headers `x-osi-*` y campos empresariales del query/body no intervienen en modo tenant.

LEGACY conserva consultas, cuerpos JSON y permisos previos. Los campos internos `tenantId`, `ownerMembershipId` y `ownerUserId` no se incorporan a respuestas. En modo tenant, raíces `tenantId=NULL`, recursos de otro tenant y padres incompatibles no son enumerables; el detalle devuelve 404.

`scripts/mt-01c2b3b-legacy-differential.mjs` compara contra la base Git exacta `a592623f…b21b7b`: conserva el número de llamadas Prisma/SQL de cada rama LEGACY, las formas HTTP y confirma que resolver los modos ejecuta cero consultas. Los snapshots focalizados comparan cuerpo, status, orden, conteo, campos y ausencia de headers nuevos. Resultado: cero diferencias en LEGACY y cero consultas agregadas por el puente inactivo.

Las respuestas comerciales preparadas usan `Cache-Control: private, no-store` y `Vary: Authorization`, incluidos errores controlados. La paginación tenant tiene tamaño predeterminado 50 y máximo 100 con orden estable.

Las transiciones K usan comparación optimista por `tenantId`, `updatedAt` y estado esperado. En 20 validaciones y 20 liberaciones simultáneas hubo exactamente un ganador por transición; el resto recibió 409, sin 500 ni actualización cruzada. El camino LEGACY conserva sus llamadas originales.

## Rendimiento local sintético

Se probaron 2,000 Client, 2,000 Project y 2,000 PipelineCase distribuidos entre dos tenants, con página máxima 100. La cifra inicial de Project (p95 127.11 ms) mezclaba la carga masiva de fixtures con estadísticas todavía no actualizadas y no separaba calentamiento. La reproducción inmediata del runner anterior dio p95 39.88 ms. El perfil controlado ahora ejecuta `ANALYZE` fuera del cronómetro, cinco calentamientos y 30 rondas por escenario.

Además, el listado imponía `tenantClient.is.tenantId` tanto en `count` como en la página. La FK compuesta `osi_projects_tenant_id_client_id_fkey` ya garantiza exactamente esa relación. El filtro redundante producía un `Hash Join`, duplicaba scans y elevaba buffers sin reforzar el aislamiento. Se eliminó sólo esa condición redundante; `Project.tenantId` continúa siendo obligatorio en cada lectura tenant.

| Escenario Project | p50 | p95 | máximo |
|---|---:|---:|---:|
| Primera página TENANT_READ | 3.42 ms | 4.40 ms | 4.43 ms |
| Página profunda (offset 800) | 3.54 ms | 5.11 ms | 5.25 ms |
| Estado | 3.29 ms | 4.21 ms | 5.34 ms |
| Código exacto | 1.27 ms | 1.63 ms | 1.77 ms |
| Nombre textual | 2.92 ms | 3.83 ms | 3.87 ms |
| Client relacionado | 1.28 ms | 1.95 ms | 2.41 ms |
| Count aislado | 0.61 ms | 1.09 ms | 1.17 ms |
| Filas aisladas | 2.64 ms | 3.72 ms | 4.66 ms |
| Include Client mínimo | 5.83 ms | 7.12 ms | 7.61 ms |
| LEGACY_ONLY, lista completa | 21.51 ms | 24.73 ms | 25.12 ms |

Client quedó en p95 5.45 ms y PipelineCase en 5.42 ms. Cada listado tenant ejecuta exactamente dos operaciones ORM (count + página), sin N+1.

### Planes PostgreSQL

Los planes se obtienen mediante `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` sin deshabilitar sequential scans.

| Forma | Plan principal | Filas descartadas | Buffers hit | ejecución |
|---|---|---:|---:|---:|
| Count anterior | Hash Join + 2 Seq Scan | 2,000 | 456 | 0.577 ms |
| Count corregido | Seq Scan | 1,000 | 136 | 0.212 ms |
| Filas anteriores | Hash Join + 2 Seq Scan + Sort | 2,000 | 587 | 0.839 ms |
| Filas corregidas | Seq Scan + Sort | 1,000 | 204 | 0.322 ms |

Para este volumen PostgreSQL elige correctamente sequential scan en listado, página profunda, estado y búsqueda textual. El índice `osi_projects_tenant_id_status_idx` existe, pero la selectividad sintética de `active` (75 %) hace más barato no usarlo. Código exacto usa el unique heredado de `code`; la relación exacta usa `osi_projects_tenant_id_client_id_idx` y el unique compuesto del Client.

No existe hoy un índice que cubra `tenant_id + startDate DESC + id ASC`, ni uno específico `tenant_id + code`. No se creó migración 16: todos los presupuestos solicitados se cumplen con amplio margen. Si el volumen futuro cambia el plan, el candidato a ensayar separadamente sería `CREATE INDEX CONCURRENTLY ... ON osi.osi_projects (tenant_id, "startDate" DESC, id ASC)`, evaluando antes tamaño, costo de escritura y redundancia.

## Readiness no automática

`scripts/mt-01c2b3b-readiness.mjs` requiere exclusivamente `MT01C2B3B_READINESS_DATABASE_URL`. La URL debe señalar `127.0.0.1:55432`, `schema=osi`, una base de la allowlist exacta y un servidor sin `neon.branch_id`. Ejecuta una transacción `READ ONLY` y comprueba:

- cero raíces Client, Project, PipelineCase o Lead con `tenantId=NULL`;
- cero owners parciales o incompatibles;
- cero relaciones padre/hijo entre tenants.

No está conectado a build, deploy, endpoint, cron ni script de paquete. Antes de una activación futura deberá ejecutarse mediante autorización separada contra el destino específico y producir todos los conteos en cero.

## Riesgos reservados

- Backfill C2B2 y cualquier asignación de tenant/owner continúan fuera de alcance.
- OSI y children K bloqueados requieren raíces/FK empresariales y migración posterior revisada.
- Lead y PipelineCase requieren endpoints tenantizados reales antes de activar sus consumidores.
- `Client.code`, `Project.code`, `Lead.code` y otros códigos heredados todavía poseen unicidad global; la prueba confirma que un mismo código entre tenants se rechaza. Cambiarlo requiere una migración posterior independiente.
- La activación necesita ensayo aislado, backfill completo, readiness cero, revisión de caché, carga y autorización independiente.
- No se creó migración 16 ni se habilitó HYBRID, tenant switch o cliente V2.
