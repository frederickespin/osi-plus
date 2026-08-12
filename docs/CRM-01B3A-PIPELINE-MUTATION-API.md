# CRM-01B3A — API inactiva de mutaciones del pipeline

## Estado y alcance

La compuerta independiente `CRM_PIPELINE_MUTATION_MODE` acepta únicamente `DISABLED` y `LOCAL_ONLY`. La ausencia de la variable equivale a `DISABLED`. `LOCAL_ONLY` se rechaza si existe `VERCEL` o cualquier variable `VERCEL_*`; no se recortan ni normalizan BOM, espacios, comillas, saltos o casing. La evaluación ocurre en cada solicitud.

La variable no se configura en `.env.example`, CI o Vercel. No existe integración frontend, persistencia de credenciales, migración 17 ni activación externa.

## Endpoints

| Método y ruta | Body exacto | Operación de dominio |
| --- | --- | --- |
| `POST /api/crm/pipeline-cases/:id/transition` | `expectedVersion`, `toStatus`, `reasonCode`, `evidence` | `transitionPipelineCase` |
| `POST /api/crm/pipeline-cases/:id/assign-owner` | `expectedVersion`, `ownerMembershipId` | `assignPipelineCaseOwner` |
| `POST /api/crm/pipeline-cases/:id/unassign-owner` | `expectedVersion` | `unassignPipelineCaseOwner` |
| `GET /api/crm/pipeline-cases/:id/allowed-transitions` | ninguno | `getAllowedPipelineTransitions` |

Los POST exigen exactamente un `Idempotency-Key`, sin normalización, que se entrega al dominio como `requestId`. El `caseId` sólo se obtiene del segmento de ruta. El parser común limita el cuerpo a 4 KiB, exige objeto JSON, UTF-8 válido, profundidad segura y claves permitidas. Los campos de autoridad empresarial, IDs de actor, rol, permisos, `requestId`, versiones resultantes y metadatos internos se rechazan explícitamente.

## Orden de ejecución

1. Cabeceras `Cache-Control: private, no-store` y `Vary: Authorization`.
2. Compuerta de mutaciones por solicitud.
3. Método HTTP.
4. Resolución única del contexto empresarial desde Bearer y base de datos.
5. `caseId` de ruta e `Idempotency-Key`.
6. Lectura y validación estricta del body.
7. Única llamada a la operación CRM-01B2 correspondiente.
8. Selección explícita de campos de respuesta.

En `DISABLED`, la solicitud termina con `409 CRM_PIPELINE_MUTATIONS_DISABLED` antes del método, autenticación, body o ejecución de Prisma. El GET requiere además la compuerta de lectura CRM existente.

## Autorización y respuesta

El contexto revalida User, TenantMembership y Tenant. Rol, tenant, membresía y permisos proceden del servidor; los headers `x-osi-*` y los datos del navegador no son autoridad. Las denegaciones efectivas prevalecen y un JWT V2 inválido no degrada a LEGACY.

La respuesta de comando sólo expone `caseId`, tipo, versiones y estados anterior/resultante, membership del owner si existe y `replayed`. No expone tenant, user del owner, actor, `payloadHash`, journal, auditoría, SQL, Prisma, variables o stack. Ninguna respuesta emite cookies o tokens.

## Errores controlados

| HTTP | Código |
| --- | --- |
| 400 | `CRM_PIPELINE_COMMAND_INVALID` |
| 401 | error de autenticación sanitizado |
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

## Concurrencia local

La validación HTTP ejecuta 20 rondas por escenario y 20 solicitudes por ronda para transición, asignación, replay y transición frente a asignación. Exige un ganador cuando corresponde, conflictos recuperables o receipts idempotentes, cero 500, cero deadlocks/timeouts inesperados, un journal y una auditoría por caso, y cero estados parciales. Las métricas p50, p95 y máximo se publican en el reporte JSON del runner canónico.

## Bloqueos preservados

`APPROVED` y `OPS_HANDOFF` no ofrecen transiciones. Las transiciones con evidencia no demostrable se excluyen. V sólo puede transicionar casos propios, no reabrir ni asignar owners. La máquina de estados, permisos, locks, idempotencia, evidencia, selección de owner, journal y auditoría permanecen exclusivamente en CRM-01B2.
