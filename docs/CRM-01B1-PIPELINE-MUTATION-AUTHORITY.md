# CRM-01B1 — Autoridad persistente de mutaciones PipelineCase

Esta fase agrega únicamente persistencia inactiva. No existen endpoints, servicios runtime, activación CRM, backfill semántico ni cambios frontend.

## Estados

`QUOTE_DRAFT`, `WON` y `LOST` amplían el enum existente. `APPROVED` conserva su significado heredado ambiguo de aprobación interna: no equivale a `WON`, queda congelado sin transiciones de entrada o salida en el futuro dominio y requiere revisión manual antes de activar mutaciones.

Cada `PipelineCase` inicia en `version=1`. Todo comando aceptado incrementará la versión exactamente una vez. Sólo `TRANSITION` y `REOPEN` cambiarán `statusChangedAt`; las operaciones de owner no lo harán. `LOST` requiere uno de los códigos cerrados de la migración y cualquier otro estado exige `lossReasonCode=NULL`.

## Journal y concurrencia

`PipelineCaseCommand` es append-only. La clave `(tenantId, requestId)` materializa idempotencia por tenant y `(tenantId, pipelineCaseId, resultingVersion)` impide dos resultados para la misma versión. Las columnas tipadas, no sólo `payloadHash`, serán la autoridad de comparación del futuro servicio. Todas las relaciones de actor y owner son FKs compuestas dentro del tenant.

La evidencia usa un enum cerrado (`SURVEY`, `QUOTE`, `PROJECT`, `APPROVAL`, `ADDENDUM`) sin FK polimórfica. El futuro servicio deberá comprobar existencia y tenant antes de aceptar evidencia.

## Project

`Project.pipelineCaseId` es nullable y forma una relación 1:N con `PipelineCase` mediante `(tenantId, pipelineCaseId)`, `ON DELETE RESTRICT` y `ON UPDATE CASCADE`. No se rellena automáticamente. `OPS_HANDOFF` permanecerá bloqueado mientras no exista un Project relacionado.

## Operación y reversión

La migración 16 es aditiva y no interpreta datos existentes. El dry-run usa exclusivamente PostgreSQL local allowlisted y una transacción `READ ONLY`. El rollback incluido es una herramienta administrativa local, exige precondiciones estrictas y no es un rollback productivo. PostgreSQL no permite retirar valores añadidos a un enum como una reversión trivial; por eso el ensayo reconstruye explícitamente el enum sólo cuando no existen filas con estados nuevos.

La activación CRM continúa `DISABLED`; LEGACY permanece activo y HYBRID, tenant switch y cliente V2 continúan desactivados.
