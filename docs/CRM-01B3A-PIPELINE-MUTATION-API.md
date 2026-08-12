# CRM-01B3A — API inactiva de mutaciones del pipeline

## Estado y alcance

La compuerta independiente `CRM_PIPELINE_MUTATION_MODE` acepta únicamente `DISABLED` y `LOCAL_ONLY`. La ausencia de la variable equivale a `DISABLED`. `LOCAL_ONLY` exige simultáneamente `CRM_PIPELINE_RUNTIME_MODE=READ_ONLY` y se rechaza si existe `VERCEL` o cualquier variable `VERCEL_*`; no se recortan ni normalizan BOM, espacios, comillas, saltos o casing. Ambas compuertas se evalúan en cada solicitud, sin caché global.

La variable no se configura en `.env.example`, CI o Vercel. No existe integración frontend, persistencia de credenciales, migración 17 ni activación externa.

## Endpoints

| Método y ruta | Body exacto | Operación de dominio |
| --- | --- | --- |
| `POST /api/crm/pipeline-cases/:id/transition` | `expectedVersion`, `toStatus`, `reasonCode`, `evidence` | `transitionPipelineCase` |
| `POST /api/crm/pipeline-cases/:id/assign-owner` | `expectedVersion`, `ownerMembershipId` | `assignPipelineCaseOwner` |
| `POST /api/crm/pipeline-cases/:id/unassign-owner` | `expectedVersion` | `unassignPipelineCaseOwner` |
| `GET`/`HEAD /api/crm/pipeline-cases/:id/allowed-transitions` | ninguno | `getAllowedPipelineTransitions` (`HEAD` no emite body) |

Los POST exigen exactamente un `Idempotency-Key`, sin normalización, con el mismo formato canónico de `PipelineCaseCommand.requestId`. Se inspeccionan tanto `IncomingMessage.headers` como `rawHeaders`: dos líneas, un valor unido por coma, array, whitespace, BOM, CR/LF, bytes no ASCII o más de 191 caracteres se rechazan. Si una plataforma no conserva `rawHeaders`, cualquier representación combinada deja de coincidir con la gramática y también se rechaza. El valor no se registra completo.

El `caseId` sólo se obtiene del segmento dinámico esperado. Se rechazan query adicionales, arrays del router, barras, encoding, doble encoding, controles y segmentos extra. El parser común limita el cuerpo a 4 KiB reales, exige objeto JSON, UTF-8 válido, profundidad segura y claves permitidas. El getter de Vercel se lee una sola vez. El parser nativo no conserva claves JSON duplicadas una vez preprocesadas por Vercel; por eso la autoridad no depende de ellas y la allowlist del comando rechaza cualquier clave sobreviviente no prevista. Los campos de autoridad empresarial, IDs de actor, rol, permisos, `requestId`, versiones resultantes y metadatos internos se rechazan explícitamente.

## Preflight CORS local

`application/json`, `Authorization` e `Idempotency-Key` hacen que un POST de navegador requiera preflight. En `DISABLED`, incluso `OPTIONS` devuelve `409 CRM_PIPELINE_MUTATIONS_DISABLED` antes de método, CORS, autenticación, body o Prisma y no anuncia métodos. En `LOCAL_ONLY`, un preflight válido usa la allowlist existente de orígenes locales y responde antes de autenticación o body:

- mutaciones: `POST, OPTIONS`;
- consulta de acciones: `GET, HEAD, OPTIONS`;
- headers: `Authorization, Content-Type, Idempotency-Key`.

Sólo se refleja el origen exacto permitido; no hay wildcard ni `Access-Control-Allow-Credentials`, y nunca se aceptan headers `x-osi-*`. Un origen, método o header no autorizado recibe un error controlado sin `Access-Control-Allow-Origin`. Toda respuesta conserva `Vary: Authorization`; cuando se evalúa CORS también conserva `Vary: Origin`. La activación futura no puede reutilizar este modo local: deberá introducir y revisar por separado el origen productivo exacto.

## Orden de ejecución

1. Cabeceras `Cache-Control: private, no-store` y `Vary: Authorization`.
2. Compuerta de mutaciones por solicitud.
3. Preflight CORS local o validación del origen si la solicitud lo incluye.
4. Método HTTP.
5. Rechazo de `Authorization` ambiguo y resolución única del contexto empresarial desde Bearer y base de datos.
6. `caseId` de ruta e `Idempotency-Key`.
7. Lectura y validación estricta del body.
8. Única llamada a la operación CRM-01B2 correspondiente.
9. Selección explícita de campos de respuesta.

En `DISABLED`, la solicitud termina con `409 CRM_PIPELINE_MUTATIONS_DISABLED` antes del método, autenticación, body o ejecución de Prisma. Con mutación `LOCAL_ONLY` y lectura desactivada, la configuración parcial devuelve `503 CRM_PIPELINE_CONFIGURATION_INVALID`. El GET no anuncia acciones si la mutación está desactivada: devuelve 409, no una lista vacía.

| Lectura | Mutación | Resultado |
| --- | --- | --- |
| `DISABLED` | `DISABLED` | Todo inactivo; mutaciones/acciones 409 |
| `READ_ONLY` local | `DISABLED` | Lecturas CRM existentes; mutaciones/acciones 409 |
| `DISABLED` | `LOCAL_ONLY` | 503 configuración inválida |
| `READ_ONLY` local | `LOCAL_ONLY` | Permitido sólo local |
| Cualquier entorno Vercel | `LOCAL_ONLY` | 503 configuración inválida |

## Autorización y respuesta

El contexto revalida User, TenantMembership y Tenant. Rol, tenant, membresía y permisos proceden del servidor; los headers `x-osi-*` y los datos del navegador no son autoridad. Las denegaciones efectivas prevalecen y un JWT V2 inválido no degrada a LEGACY.

La respuesta de comando sólo expone `caseId`, tipo, versiones y estados anterior/resultante, membership del owner si existe y `replayed`. No expone tenant, user del owner, actor, `payloadHash`, journal, auditoría, SQL, Prisma, variables o stack. Ninguna respuesta emite cookies o tokens.

## Errores controlados

| HTTP | Código |
| --- | --- |
| 400 | `CRM_PIPELINE_COMMAND_INVALID` |
| 400 | `CRM_PIPELINE_CORS_PREFLIGHT_INVALID` |
| 401 | error de autenticación sanitizado |
| 403 | `CRM_PIPELINE_ORIGIN_FORBIDDEN` |
| 403 | `CRM_PIPELINE_PERMISSION_FORBIDDEN` |
| 404 | `CRM_PIPELINE_RESOURCE_NOT_FOUND` |
| 409 | `CRM_PIPELINE_STATE_INVALID` |
| 409 | `CRM_PIPELINE_VERSION_CONFLICT` |
| 409 | `CRM_PIPELINE_IDEMPOTENCY_CONFLICT` |
| 409 | `CRM_PIPELINE_OWNER_INELIGIBLE` |
| 409 | `CRM_PIPELINE_EVIDENCE_REQUIRED` |
| 409 | `CRM_PIPELINE_EVIDENCE_INVALID` |
| 409 | `CRM_PIPELINE_COMMAND_IN_PROGRESS` con `recoverable=true` y `retryAfterMs` acotado |
| 503 | `CRM_PIPELINE_DATABASE_UNAVAILABLE` |

Los errores de transporte JSON conservan los códigos seguros del parser común (`REQUEST_*`) y nunca convierten entradas inválidas en 500.

## Commit confirmado y respuesta perdida

La transacción de dominio finaliza antes de serializar la respuesta HTTP. Si el transporte desaparece tras el commit, el comando permanece único; el cliente no debe asumir que falló la escritura. Debe reconsultar el caso y reintentar con el mismo `Idempotency-Key`: el dominio devuelve el receipt histórico con `replayed=true`, sin duplicar versión, journal ni auditoría.

## Concurrencia local

La validación HTTP ejecuta 50 rondas por escenario y 20 solicitudes por ronda para transición, asignación, replay, transición frente a asignación y recuperación de una respuesta perdida después del commit. Exige un único commit ganador por caso, conflictos recuperables o receipts idempotentes, cero 500 observables, cero deadlocks/timeouts inesperados, un journal y una auditoría por caso, y cero estados parciales. Las métricas p50, p95 y máximo se publican separadas para ganadores, contención, replay y transporte perdido en el reporte JSON del runner canónico.

## Bloqueos preservados

`APPROVED` y `OPS_HANDOFF` no ofrecen transiciones. Las transiciones con evidencia no demostrable se excluyen. V sólo puede transicionar casos propios, no reabrir ni asignar owners. La máquina de estados, permisos, locks, idempotencia, evidencia, selección de owner, journal y auditoría permanecen exclusivamente en CRM-01B2.
