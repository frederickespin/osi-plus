# CRM-01B3B1 — Puente de autenticación y compuerta productiva

Estado: **inactivo**. La ausencia de las variables CRM resuelve `DISABLED/DISABLED`; ninguna ruta consulta Prisma, autentica o lee el body antes de superar la compuerta. Esta fase no configura Vercel ni activa CRM.

## Inventario de rutas

| Ruta | Método | Contexto | Permiso | Consultas esperadas |
| --- | --- | --- | --- | --- |
| `/api/crm/pipeline-cases` | GET | LEGACY o V2 por `resolveCrmPipelineContext` | `pipeline:view` | LEGACY: 1 contexto + count + lista |
| `/api/crm/pipeline-cases/:id` | GET | LEGACY o V2 por `resolveCrmPipelineContext` | `pipeline:view` | LEGACY: 1 contexto + detalle |
| `/api/crm/pipeline-summary` | GET | LEGACY o V2 por `resolveCrmPipelineContext` | `pipeline:view` | LEGACY: 1 contexto + tres agregaciones en una transacción |
| `/api/crm/pipeline-cases/:id/allowed-transitions` | GET/HEAD | LEGACY o V2 por `resolveCrmPipelineContext` | `pipeline:transition`, revalidado por el dominio | 1 contexto + transacción de lectura del dominio |
| `/api/crm/pipeline-cases/:id/transition` | POST | LEGACY o V2 por `resolveCrmPipelineContext` | `pipeline:transition` | 1 contexto + transacción del dominio |
| `/api/crm/pipeline-cases/:id/assign-owner` | POST | LEGACY o V2 por `resolveCrmPipelineContext` | `pipeline:assign` | 1 contexto + transacción del dominio |
| `/api/crm/pipeline-cases/:id/unassign-owner` | POST | LEGACY o V2 por `resolveCrmPipelineContext` | `pipeline:assign` | 1 contexto + transacción del dominio |

Ninguna ruta era exclusivamente V2: las lecturas y las mutaciones convergen en un único adaptador. CRM verifica criptográficamente, contra los contratos estrictos y disjuntos, tanto LEGACY como V2 antes de seleccionar la clase; los claims decodificados sin verificar no eligen el parser. Cero o dos contratos válidos se rechazan. Un JWT V2 sólo se admite en el contexto local explícito `MEMBERSHIP_ONLY`; cuando CRM opera con `LEGACY`, incluso un V2 válido se rechaza sin fallback. El contexto LEGACY revalida en una consulta el `User.status`, la membresía predeterminada única y activa, el tenant activo, rol, grants, denies y `authorizationVersion`. El contexto se memoriza sólo dentro del objeto request; el dominio revalida al actor dentro de la transacción antes de escribir.

Los campos `tenantId`, `membershipId`, `userId`, rol y permisos recibidos desde headers, query o body no son autoridad. `deniedPermissions` prevalece sobre el catálogo del rol y grants explícitos. Los errores controlados se reducen a contratos 401/403/409/503 sin token, SQL, URL, credenciales ni valores ambientales.

## Matriz coordinada

| Lectura | Mutación | Ámbito | Resultado |
| --- | --- | --- | --- |
| `DISABLED` | `DISABLED` | cualquier ambiente, sin batch | permitido e inactivo |
| `READ_ONLY` | `DISABLED` | exclusivamente local | lectura local |
| `READ_ONLY` | `LOCAL_ONLY` | exclusivamente local | lectura y mutación local |
| `PRODUCTION_READ` | `DISABLED` | Production/main, batch exacto y tenancy comercial activa | lectura gradual |
| `PRODUCTION_READ` | `PRODUCTION_WRITE` | Production/main, batch exacto y tenancy comercial activa | lectura y mutación productiva |

Cualquier otra combinación responde `503 CRM_PIPELINE_CONFIGURATION_INVALID`. Los valores se comparan byte por byte: BOM, whitespace, comillas, saltos y casing alternativo se rechazan. `HYBRID`, tenant switch y cliente V2 se rechazan en cualquier modo CRM; `MEMBERSHIP_ONLY` sólo habilita la prueba V2 local. La activación productiva exige autenticación `LEGACY`, tenant switch `false` y cliente V2 `false`, usando sus defaults seguros cuando las variables están ausentes. `CRM_PIPELINE_ACTIVATION_BATCH` es server-only, exacto y versionado como `CRM-01B3B1-PRODUCTION-V1`; es distinto de `COMMERCIAL_TENANCY_ACTIVATION_BATCH=MT-01C2B2-IPACKERS-DO-V1` y no admite aliases. La autoridad de esquema congelada es `20260801015000_crm01b_pipeline_mutation_authority`; guardias verifican la migración 16 y el modelo `PipelineCaseCommand`, sin consulta de esquema por request.

## Permisos y estados

- Lectura: `pipeline:view`.
- Transición: `pipeline:transition`.
- Cambios generales futuros de estado: `pipeline:update`; no existe endpoint nuevo en esta fase.
- Asignación y desasignación: `pipeline:assign`.
- Reapertura de `LOST`: además del permiso de transición, sólo rol efectivo `A` y motivo canónico.

El rol efectivo y los permisos provienen de la membresía vigente. Sólo `A` y `V` pertenecen al catálogo CRM: un grant explícito no incorpora otro rol. `V` sólo opera casos propios en transiciones autorizadas; `A` conserva las facultades administrativas existentes. `pipeline:view` no concede mutaciones, `pipeline:transition` no concede asignación y `pipeline:assign` no concede lectura ni transición. `pipeline:update` queda reservado sin acción actual. `APPROVED` permanece congelado y `OPS_HANDOFF` terminal.

## Orden y compatibilidad

Cada handler aplica: headers privados → resolución estricta → gate → método → contexto/permisos → validación → consulta o dominio → selección segura. Con variables ausentes se conservan `CRM_PIPELINE_DISABLED` para lecturas y `CRM_PIPELINE_MUTATIONS_DISABLED` para las rutas B3A, sin CORS global, cookies, consultas o escrituras. No hay imports frontend, cron, hook de build ni migración 17.

## Rendimiento local observado

PostgreSQL 18 en `127.0.0.1:55432`, 100 solicitudes cálidas por operación, preparación de fixtures excluida:

| Operación | Contexto | Dominio | Total SQL | p50 | p95 | máximo |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Contexto LEGACY | 1 | 0 | 1 | 0.484 ms | 0.820 ms | 0.976 ms |
| Lista | 0 | 2 | 2 | 1.583 ms | 2.476 ms | 3.720 ms |
| Detalle | 0 | 1 | 1 | 1.181 ms | 1.567 ms | 1.903 ms |
| Resumen | 0 | 3 | 3 | 1.418 ms | 2.064 ms | 2.519 ms |
| Transiciones permitidas | 0 | 4 | 4 | 1.685 ms | 2.327 ms | 2.800 ms |

El total HTTP suma una resolución de contexto por request a las consultas del dominio. No existe N+1 ni caché entre requests.
