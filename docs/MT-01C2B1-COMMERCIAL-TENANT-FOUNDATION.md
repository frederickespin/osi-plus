# MT-01C2B1 — Fundación multiempresa de raíces comerciales

## Estado y alcance

Implementación local, aditiva e inactiva sobre `origin/main` en `feature/mt01c2b1-commercial-tenant-foundation`. Sólo incorpora la raíz empresarial nullable de `Client`, `Project`, `Lead` y `PipelineCase`. No hace backfill, no activa filtros por tenant y no cambia las unicidades globales actuales.

No se incluyeron `Quote`, `Survey`, `Osi`, `Account`, `BusinessEntity`, `ServiceCase` ni modelos dependientes. Los dos artefactos MT-01C2A se usaron como insumo sin modificar su worktree.

## Datamodel

| Modelo | Campos nuevos | Relaciones nuevas | Restricciones e índices |
| --- | --- | --- | --- |
| `Client` | `tenantId String?` | `tenantId → Tenant.id` | `UNIQUE(tenantId,id)`, índice `(tenantId,status)` |
| `Project` | `tenantId String?` | `tenantId → Tenant.id`; `(tenantId,clientId) → Client(tenantId,id)` | `UNIQUE(tenantId,id)`, índices `(tenantId,status)` y `(tenantId,clientId)` |
| `Lead` | `tenantId String?` | `tenantId → Tenant.id`; `(tenantId,customerId) → Client(tenantId,id)`; `(tenantId,projectId) → Project(tenantId,id)` | `UNIQUE(tenantId,id)`, índices tenant-first para estado, cliente y proyecto |
| `PipelineCase` | `tenantId String?`, `ownerMembershipId String?`, `ownerUserId String?` | `tenantId → Tenant.id`; `(tenantId,ownerMembershipId,ownerUserId) → TenantMembership(tenantId,id,userId)` | `UNIQUE(tenantId,id)`, índices tenant-first para estado y owner; CHECK de terna completa |

Todas las FK nuevas usan `ON DELETE RESTRICT ON UPDATE CASCADE`. `ownerId` y su relación heredada con `User` permanecen intactos.

El CHECK de owner permite únicamente:

- `ownerMembershipId` y `ownerUserId` nulos, con `tenantId` nulo o informado; o
- `tenantId`, `ownerMembershipId` y `ownerUserId` informados conjuntamente.

Por tanto, cualquier par o terna incompleta es rechazado. La FK compuesta impide enlazar una membresía, usuario y tenant incompatibles.

## Relaciones empresariales protegidas

| Relación preexistente | Protección agregada | Comportamiento legacy |
| --- | --- | --- |
| `Project.clientId → Client.id` | FK adicional `(tenantId,clientId)` | Con `tenantId=NULL`, la FK compuesta no interviene y la relación existente sigue vigente. |
| `Lead.customerId → Client.id` | FK adicional `(tenantId,customerId)` | Igual comportamiento nullable. |
| `Lead.projectId → Project.id` | FK adicional `(tenantId,projectId)` | Igual comportamiento nullable. |
| `PipelineCase.ownerId → User.id` | Nueva relación empresarial opcional a `TenantMembership`; no sustituye `ownerId` | No se copió ni infirió ningún owner. |

No existe actualmente una FK de `PipelineCase` a `Project` o `Client`; no se inventó una. También se aplazaron expresamente `PipelineCase → Project 1:N` y `Lead → PipelineCase 1:N`.

La auditoría adversarial demostró que la FK compuesta `RESTRICT` por sí sola no era suficiente: PostgreSQL podía ejecutar primero el `CASCADE` heredado y eliminar el Project antes de comprobarla. La migración incorpora por ello un trigger `BEFORE DELETE` aditivo que rechaza el borrado de un Client tenantizado cuando tiene Projects del mismo tenant. Para Client/Project legacy con `tenantId=NULL`, continúa funcionando el cascade anterior. No existe eliminación parcial.

Decisión: toda fila tenantizada usa semántica `RESTRICT`. La FK legacy con `CASCADE` sólo podrá retirarse después del backfill completo, en una migración posterior independiente.

## Migración 15

Archivo: `prisma/migrations/20260801014000_mt01c2b1_commercial_tenant_foundation/migration.sql`.

- SHA-256: `776e0c167cb0d7561537745cced0438299dea90af1e7bc010325822519d1811b`.
- UTF-8 válido, 4,434 bytes y cero bytes NUL.
- Cuatro columnas `tenant_id` nullable y dos columnas nullable de owner.
- Ocho FK nuevas, doce índices no redundantes, un CHECK y una guarda `BEFORE DELETE` para la convivencia temporal CASCADE/RESTRICT.
- Sin `DROP`, `DELETE`, `TRUNCATE`, renombres, DML o asignación automática.
- Las catorce migraciones anteriores se verifican por hashes SHA-256 normalizados y permanecen sin cambios.

## Compatibilidad de API

Prisma devolvería las nuevas columnas aun siendo nulas. Para conservar exactamente los contratos JSON legacy se añadió `omit: { tenantId: true }` en las consultas que pueden serializar `Client` o `Project`:

- `GET/POST /api/clients`.
- `GET/POST /api/projects`.
- consultas de proyectos en `/api/k/dashboard`, `/api/k/project`, `/api/k/project-validate` y `/api/k/project-release`.
- las copias no activas `/api/_disabled/project-validate` y `/api/_disabled/project-release`, evitando una exposición futura accidental.

No se añadió ninguna lectura, escritura, filtro ni autorización basada en `tenantId`. Los campos internos nuevos no se exponen al navegador. `Lead` y `PipelineCase` no tenían en este lote una consulta Prisma activa que devolviera directamente las nuevas columnas mediante estos contratos.

Las guardias fallan si aparece un consumidor runtime que usa `tenantId` como autoridad o si se elimina la omisión compatible de los contratos auditados.

### Inventario completo de consumidores

| Clasificación | Archivos | Efecto contractual |
| --- | --- | --- |
| Endpoints que serializan raíces | `api/clients/index.js`, `api/projects/index.js`, `api/k/dashboard.js`, `api/k/project.js`, `api/k/project-validate.js`, `api/k/project-release.js` | `tenantId` omitido explícitamente en todas las consultas que retornan objetos Prisma. |
| Copias desactivadas que podrían serializar Project | `api/_disabled/project-validate.js`, `api/_disabled/project-release.js` | También protegidas mediante `omit`. |
| Consultas internas sin serializar Project | `api/k/pgd/apply.js`, `api/_disabled/pgd/apply.js`, `api/osis/index.js` | Usan existencia o campos legacy concretos; la respuesta no contiene el objeto Project consultado. |
| Pruebas | `mt-01b3b1-test.mjs`, `mt-01c1b2a-test.mjs`, `sec-com-01a-test.mjs`, `mt-01c2b1-test.mjs` y guardias SEC-COM | Datos locales sintéticos; no son consumidores runtime. |
| Dry-runs y ensayos históricos | DB-01E/G, DB-01K y scripts MT-01C2B1 | Lectura/fixtures, sin respuestas HTTP activas. |
| Frontend | No se encontraron llamadas activas directas a estas cuatro tablas; sólo documentación de `/api/clients` y `/api/projects` | No se añadió persistencia ni campo empresarial al cliente. |

No existe endpoint Prisma activo de `Lead` o `PipelineCase` que serialice esos modelos completos. Los usos frontend de Lead pertenecen al store local heredado y no al modelo Prisma.

## Dry-run local de backfill

`scripts/mt-01c2b1-dry-run.mjs` exige `MT01C2B1_TEST_DATABASE_URL`; no acepta `DATABASE_URL` como fallback. Antes de consultar valida protocolo, host exacto `127.0.0.1`, puerto `55432`, base allowlisted, `schema=osi`, identidad posterior a la conexión y ausencia de `neon.branch_id`.

Se ejecutó con `BEGIN READ ONLY`, `statement_timeout=5s` y `lock_timeout=1s`. Resultado sobre el estado canónico local después de las pruebas:

| Clasificación | Resultado |
| --- | ---: |
| Client | 0 |
| Project | 0 |
| Lead | 0 |
| PipelineCase | 1 sin raíz empresarial |
| Owner nulo | 1 |
| Owners convertibles, inactivos, ambiguos o incompletos | 0 |
| Contradicciones Project/Client, Lead/Client o Lead/Project | 0 |
| Grupos duplicados bajo claves globales actuales | 0 |
| Filas inferidas o escritas | 0 |

En la prueba sintética con dos tenants se ejercitaron: owner convertible, owner nulo, owner sin membresía activa, owner ambiguo entre tenants, Client sin raíz, evidencia Lead/Client/Project contradictoria y una colisión de `caseCode` normalizado bajo evidencia inequívoca de tenant. El script nunca autoriza backfill automático.

## Rollback local

`scripts/mt-01c2b1-rollback.mjs` sólo opera contra el mismo destino PostgreSQL local allowlisted. Se detiene si:

- la historia no contiene exactamente las quince migraciones;
- cualquiera de las columnas nuevas contiene un valor; o
- la identidad PostgreSQL no es la local esperada.

El ensayo retiró únicamente el trigger/función, FK, CHECK, índices, columnas y fila de migración de MT-01C2B1. Después se confirmó la migración 15 pendiente, se reaplicó y un segundo deploy no tuvo pendientes. No es un runbook productivo.

## Validación local

- PostgreSQL 18 aislado: `127.0.0.1:55432`.
- Cadena desde base vacía: 15/15 migraciones.
- Segundo `prisma migrate deploy`: sin pendientes.
- `prisma migrate status`: actualizado.
- `prisma migrate diff`: `No difference detected`.
- Runner canónico completo: PASS; DB-01D–J 21/37/38/47/35/60/54, MT-01B1 124, MT-01C1A 45, MT-01C1B1 68, MT-01C1B2B 102, MT-01C1B3A 63 y SEC-COM-01A 48.
- MT-01C2B1: 42 pruebas funcionales + 10 guardias = 52/52.
- Navegadores: 36/36 coordinación de sesión y 24/24 navegación anónima, en Chromium, Firefox y WebKit.
- Build, `tsc --noEmit`, ESLint focalizado, preflight de secretos y `git diff --check`: PASS.
- Rendimiento MT-01C2B1 con 100 consultas tenant-first sintéticas: p50 0.621 ms, p95 0.982 ms, máximo 1.615 ms.

Una primera ejecución de la prueba heredada `MT-01B1/REFRESH_RACE` detectó una ronda inestable. La comparación diferencial posterior ejecutó cinco suites sobre Base de 14 migraciones y cinco sobre Candidato de 15 migraciones, cada una con 50 rondas × 20 solicitudes: Base 5/5 y Candidato 5/5, todas 62/62 y sin timeouts. La corrida canónica final también pasó 62/62. La frecuencia observada fue idéntica (cero fallos) y no se modificó autenticación.

## Riesgos y bloqueos para MT-01C2B2

- Los cuatro `tenantId` siguen nullable y ninguna API filtra por tenant; no existe aún aislamiento operativo de estas raíces.
- Debe definirse y aprobarse la evidencia de backfill para cada registro antes de hacer campos obligatorios.
- `Client.code`, `Project.code`, `Lead.code` y `PipelineCase.caseCode` conservan sus unicidades globales. Su conversión a claves por tenant requiere auditoría de duplicados y una migración separada.
- No se ha definido inmutabilidad de tenant después del backfill.
- Los modelos dependientes todavía no están tenantizados; no puede afirmarse aislamiento extremo a extremo ni devolver 404 empresarial en todas las rutas.
- `PipelineCase` no tiene todavía relación relacional con `Project` o `Client`.
- Sólo `PipelineCase` tiene evidencia para preparar owner empresarial. No se añadieron owners a `Client`, `Project` o `Lead`.
- El trigger aditivo resuelve la convivencia inmediata CASCADE/RESTRICT; la FK cascade heredada debe retirarse únicamente después del backfill completo y mediante migración separada.
- La activación de HYBRID, tenant switch, cliente V2 y cualquier autoridad runtime basada en tenant continúa bloqueada.

## Límites operativos

No se accedió a producción ni Neon. No se ejecutó backfill, no se creó commit, no se hizo push ni PR, y no se activó ninguna función runtime.
