# CRM-01B2 — dominio transaccional interno de PipelineCase

Estado: **inactivo**. El módulo no tiene consumidores en API, frontend, cron, hooks de build ni otros puntos runtime. `CRM_PIPELINE_RUNTIME_MODE` continúa `DISABLED`; no se agregan endpoints ni migraciones.

## Autoridad y contratos

El servidor acepta únicamente estos comandos tipados:

- Transición: `{ caseId, expectedVersion, requestId, toStatus, reasonCode?, evidence?: { type, id } }`.
- Asignación: `{ caseId, expectedVersion, requestId, ownerMembershipId }`.
- Desasignación: `{ caseId, expectedVersion, requestId }`.

`tenantId`, usuarios, rol, permisos, versión resultante, hash y timestamps se derivan de PostgreSQL. Su presencia en un comando causa `CRM_PIPELINE_COMMAND_INVALID`. El contexto sólo identifica el tenant y la membresía que deben revalidarse; el rol y los permisos efectivos se releen desde `TenantMembership`, `User` y `Tenant`. Las denegaciones prevalecen.

| Operación | A | V |
|---|---:|---:|
| `pipeline:update` | Sí | Sí |
| `pipeline:transition` | Sí, cualquier caso del tenant | Sí, sólo caso propio con owner completo |
| `pipeline:assign` | Sí | No |
| Reabrir `LOST` | Sí | No |

`pipeline:view`, `clients:create` y `projects:create` no conceden autoridad de mutación. No hay autoasignación. El owner elegible es una membresía `ACTIVE`, rol `V`, con `User.status=active`, del mismo tenant y distinta del owner vigente. `ownerId` heredado nunca se escribe.

## Orden transaccional

Cada mutación usa `READ COMMITTED`, `maxWait=3,000 ms` y `timeout=10,000 ms`, en este orden:

1. advisory lock estable por `tenant + requestId`;
2. advisory lock estable por `tenant + PipelineCase.id`;
3. revalidación de `Tenant`, `TenantMembership`, `User`, rol y permisos;
4. resolución de idempotencia;
5. lectura `FOR UPDATE` del caso;
6. validación de versión, estado y autoridad;
7. validación de evidencia u owner;
8. `transaction_timestamp()` de PostgreSQL;
9. `UPDATE` condicionado por tenant, id y versión esperada;
10. inserción append-only de `PipelineCaseCommand`;
11. auditoría comercial crítica;
12. commit.

Un fallo del update, journal o auditoría revierte el conjunto. Los errores no reconocidos se convierten en `503 CRM_PIPELINE_DATABASE_UNAVAILABLE`; no se propagan SQL, Prisma, URLs ni stacks.

## Grafo y evidencia

El grafo persistido se aplica exactamente. Su disponibilidad real es:

| Transición | Permiso | Evidencia | Relación comprobada | Estado actual |
|---|---|---|---|---|
| `NEW_INBOX → AWAITING_ICP` | transition | — | — | Habilitada |
| `AWAITING_ICP → GOVERNANCE_CONFIRMED` | transition | — | — | Habilitada |
| `GOVERNANCE_CONFIRMED → REQUIREMENTS_CONFIRMED` | transition | — | — | Habilitada |
| `REQUIREMENTS_CONFIRMED → SURVEY_PLANNING` | transition | — | — | Habilitada |
| `REQUIREMENTS_CONFIRMED → CRATING_ESTIMATE_PENDING` | transition | — | — | Habilitada |
| `REQUIREMENTS_CONFIRMED → PRICING_IN_PROGRESS` | transition | — | — | Habilitada |
| `SURVEY_PLANNING → SURVEY_SCHEDULED` | transition | `SURVEY` | No existe timestamp/estado programado inequívoco ligado al caso | **Bloqueada** |
| `SURVEY_SCHEDULED → SURVEY_COMPLETED` | transition | `SURVEY` | `Survey(SUBMITTED, submittedAt) → Project(tenantId,pipelineCaseId)` | Habilitada |
| `SURVEY_COMPLETED → CRATING_ESTIMATE_PENDING` | transition | — | — | Habilitada |
| `SURVEY_COMPLETED → PRICING_IN_PROGRESS` | transition | — | — | Habilitada |
| `CRATING_ESTIMATE_PENDING → PRICING_IN_PROGRESS` | transition | — | — | Habilitada |
| `PRICING_IN_PROGRESS → QUOTE_DRAFT` | transition | `QUOTE` | `PipelineCaseQuote(DRAFT) → PipelineCase(tenantId,id)` | Habilitada |
| `QUOTE_DRAFT → INTERNAL_REVIEW` | transition | — | — | Habilitada |
| `INTERNAL_REVIEW → QUOTE_SENT` | transition | `QUOTE` | `PipelineCaseQuote(SENT, sentAt) → PipelineCase(tenantId,id)` | Habilitada |
| `QUOTE_SENT → NEGOTIATION` | transition | — | — | Habilitada |
| `QUOTE_SENT/NEGOTIATION → WON` | transition | `APPROVAL` | `ApprovalRequest` no define todavía un contrato empresarial inequívoco para PipelineCase | **Bloqueada** |
| `QUOTE_SENT/NEGOTIATION → LOST` | transition | reason allowlist | — | Habilitada |
| `NEGOTIATION → CHANGE_CONTROL` | transition | — | — | Habilitada |
| `CHANGE_CONTROL → QUOTE_DRAFT` | transition | `QUOTE` | Quote DRAFT del caso | Habilitada |
| `CHANGE_CONTROL → NEGOTIATION` | transition | — | — | Habilitada |
| `WON → OPS_HANDOFF` | transition | `PROJECT` | FK compuesta `Project(tenantId,pipelineCaseId)` | Habilitada para filas `WON` heredadas |
| `LOST → NEW_INBOX` | transition + A | reason allowlist | — | Habilitada como `REOPEN` |

`APPROVED` queda completamente congelado, incluido owner. `OPS_HANDOFF` es terminal. `getAllowedPipelineTransitions` omite aristas bloqueadas o cuya evidencia requerida no existe. `ADDENDUM` permanece como tipo persistido, pero ninguna arista actual lo usa como prueba obligatoria: no se inventó una regla empresarial nueva.

Motivos `LOST`: `PRICE`, `COMPETITOR`, `NO_RESPONSE`, `CLIENT_CANCELLED`, `TIMING`, `SERVICE_UNAVAILABLE`, `DUPLICATE`, `OTHER`. La reapertura conserva su motivo en el journal y limpia `lossReasonCode` del caso.

## Idempotencia y auditoría

El SHA-256 cubre sólo la representación canónica de los campos tipados. Después del lock, el servicio compara también cada campo con el journal. Un replay exacto devuelve el receipt histórico con `replayed=true`; no actualiza caso, versión, journal ni auditoría. Cualquier diferencia devuelve `409 CRM_PIPELINE_IDEMPOTENCY_CONFLICT`.

Acciones críticas: `CRM_PIPELINE_TRANSITIONED`, `CRM_PIPELINE_REOPENED`, `CRM_PIPELINE_OWNER_ASSIGNED`, `CRM_PIPELINE_OWNER_REASSIGNED` y `CRM_PIPELINE_OWNER_UNASSIGNED`. La auditoría incluye únicamente referencias empresariales, versiones, estados, operación, evidencia y reason code canónico. Excluye hash interno, notas libres, PII, JWT y secretos.

## Evidencia de validación local

- PostgreSQL 18, `127.0.0.1:55432`, base allowlist y schema `osi`; `neon.branch_id` debe estar ausente.
- 16 migraciones desde vacío; segundo deploy sin pendientes y drift vacío.
- Suite funcional: 73 comprobaciones, incluidos todos los caminos habilitados, bloqueos de evidencia, owners, idempotencia y rollback del journal/auditoría.
- Concurrencia: 20 comprobaciones; 20 transiciones y 20 asignaciones producen un ganador; 20 replays idénticos producen una escritura y 19 receipts; cero deadlocks, duplicados o estados parciales.
- Métricas de la corrida canónica final: transición 20-way p50 155.71 ms, p95 215.38 ms, máximo 221.55 ms; asignación p50 34.99 ms, p95 55.30 ms, máximo 57.47 ms. Son métricas locales, no presupuesto Vercel–Neon.

Riesgos reservados para CRM-01B3: contrato empresarial para probar `WON`, evidencia inequívoca de encuesta programada, endpoints protegidos y exposición controlada del servicio. Ninguno se resuelve activando o degradando las comprobaciones actuales.
