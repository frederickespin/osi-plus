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

Cada mutación usa `READ COMMITTED`. Los límites se validan al cargar el módulo y se aplican de forma explícita; ninguno admite 60 segundos:

| Límite | Valor | Alcance |
|---|---:|---|
| Prisma `maxWait` | 3,000 ms | Adquisición de conexión/transacción |
| Prisma `timeout` | 10,000 ms | Transacción interactiva completa |
| PostgreSQL `lock_timeout` | 250 ms | Esperas de row/table locks; `SET LOCAL` |
| PostgreSQL `statement_timeout` | 3,000 ms | Cada sentencia SQL; `SET LOCAL` |
| `retryAfterMs` | 75–175 ms | Jitter criptográfico para reintento del cliente |

El orden global es:

1. try-lock advisory estable por namespace `REQUEST + tenant + requestId`;
2. try-lock advisory estable por namespace `CASE + tenant + PipelineCase.id`;
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

Los locks usan `pg_try_advisory_xact_lock`: un perdedor no espera en cola dentro de Prisma, no lee un receipt, no actualiza el caso y no inserta journal o auditoría. Devuelve `409 CRM_PIPELINE_COMMAND_IN_PROGRESS`, `recoverable=true` y `retryAfterMs` acotado. Una colisión de hash sólo puede causar ese rechazo adicional: tenant, request, caso, actor y payload se releen y comparan después de adquirir los locks, por lo que no mezcla identidades ni comandos.

| Condición | Contrato sanitizado |
|---|---|
| Try-lock ocupado | `409 CRM_PIPELINE_COMMAND_IN_PROGRESS`, recuperable, con jitter |
| `lock_timeout` | `409 CRM_PIPELINE_COMMAND_IN_PROGRESS`, recuperable, con jitter |
| Versión obsoleta | `409 CRM_PIPELINE_VERSION_CONFLICT`, recuperable |
| `statement_timeout` o pérdida de conexión | `503 CRM_PIPELINE_DATABASE_UNAVAILABLE`, recuperable |
| Constraint/journal incoherente | rollback y `409 CRM_PIPELINE_STATE_INVALID` |
| Auditoría fallida | rollback total y error controlado |

No se propagan SQL, constraints, Prisma, URLs, stacks ni causas internas.

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

El SHA-256 cubre sólo la representación canónica de los campos tipados. Después de revalidar `Tenant`, `User`, `TenantMembership` y permisos, el servicio compara con el journal tenant, actor membership/user/role, caso, tipo, versiones, estados, owners, reason, evidencia y payload hash. Un replay exacto devuelve el receipt histórico con `replayed=true`; no actualiza caso, versión, journal ni auditoría. Otro actor o cualquier diferencia devuelve `409 CRM_PIPELINE_IDEMPOTENCY_CONFLICT`.

El receipt de replay describe el commit original, incluso si el caso avanzó después. No representa el estado actual; el cliente debe volver a consultar el caso tras recibirlo.

Acciones críticas: `CRM_PIPELINE_TRANSITIONED`, `CRM_PIPELINE_REOPENED`, `CRM_PIPELINE_OWNER_ASSIGNED`, `CRM_PIPELINE_OWNER_REASSIGNED` y `CRM_PIPELINE_OWNER_UNASSIGNED`. La auditoría incluye únicamente referencias empresariales, versiones, estados, operación, evidencia y reason code canónico. Excluye hash interno, notas libres, PII, JWT y secretos.

## Evidencia de validación local

- PostgreSQL 18, `127.0.0.1:55432`, base allowlist y schema `osi`; `neon.branch_id` debe estar ausente.
- 16 migraciones desde vacío; segundo deploy sin pendientes y drift vacío.
- Suite funcional: 81 comprobaciones; concurrencia focalizada: 22; adversarial: 12; estrés/consistencia: 23.
- Estrés obligatorio: 50 rondas × 20 solicitudes para transición, asignación, replay idéntico y transición frente a asignación. La corrida canónica produjo 200 ganadores, 3,796 `COMMAND_IN_PROGRESS`, 4 conflictos de versión, 50 receipts post-commit, cero timeouts inesperados y cero estados parciales.
- Métricas locales de ganadores: transición p50 12.21 ms, p95 20.25 ms, máximo 74.97 ms; asignación p50 12.60 ms, p95 27.12 ms, máximo 76.82 ms; replay concurrente p50 11.45 ms, p95 27.36 ms, máximo 79.12 ms; mixta p50 12.66 ms, p95 29.80 ms, máximo 74.75 ms.
- Métricas locales de conflictos: transición p50 7.25 ms, p95 12.13 ms, máximo 147.35 ms; asignación p50 7.09 ms, p95 9.25 ms, máximo 9.88 ms; replay concurrente p50 5.96 ms, p95 7.92 ms, máximo 12.63 ms; mixta p50 7.07 ms, p95 10.16 ms, máximo 13.03 ms. Los 50 replays post-commit tuvieron p50 2.55 ms, p95 4.58 ms y máximo 4.89 ms. Son métricas locales, no un presupuesto Vercel–Neon.

Riesgos reservados para CRM-01B3: contrato empresarial para probar `WON`, evidencia inequívoca de encuesta programada, endpoints protegidos y exposición controlada del servicio. Ninguno se resuelve activando o degradando las comprobaciones actuales.
