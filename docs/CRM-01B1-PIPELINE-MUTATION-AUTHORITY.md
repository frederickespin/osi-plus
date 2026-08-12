# CRM-01B1 — Autoridad persistente de mutaciones PipelineCase

Esta fase agrega únicamente persistencia inactiva. No existen endpoints, servicios runtime, activación CRM, backfill semántico ni cambios frontend.

## Defecto bloqueante confirmado en la versión inicial

La primera versión de la migración sólo protegía unicidad y forma del journal. No existía una relación ejecutable entre el comando insertado y el estado final del caso: era posible insertar un comando sin actualizar el caso, declarar una versión, estado u owner final falsos, o actualizar campos gobernados sin journal. Las pruebas adversariales congelan ahora todos esos casos como rechazos. La unicidad también rechaza reutilizar `(tenantId, requestId)` aunque cambien el payload o el caso; otro tenant conserva su propio espacio idempotente.

## Estados

`QUOTE_DRAFT`, `WON` y `LOST` amplían el enum existente. `APPROVED` conserva su significado heredado ambiguo de aprobación interna: no equivale a `WON`, queda congelado sin transiciones de entrada o salida en el futuro dominio y requiere revisión manual antes de activar mutaciones.

Cada `PipelineCase` inicia en `version=1`. Todo comando aceptado incrementará la versión exactamente una vez. Sólo `TRANSITION` y `REOPEN` cambiarán `statusChangedAt`; las operaciones de owner no lo harán. El instante de transición debe estar a no más de cinco segundos del comando y de la transacción. `LOST` requiere uno de los códigos cerrados de la migración y cualquier otro estado exige `lossReasonCode=NULL`. Sólo `REOPEN` puede salir de `LOST`, siempre hacia `NEW_INBOX`, limpiando el motivo de pérdida y preservando en el journal la razón de reapertura.

## Journal y concurrencia

`PipelineCaseCommand` es append-only. La clave `(tenantId, requestId)` materializa idempotencia por tenant y `(tenantId, pipelineCaseId, resultingVersion)` impide dos resultados para la misma versión. Las columnas tipadas, no sólo `payloadHash`, serán la autoridad de comparación del futuro servicio. Todas las relaciones de actor y owner son FKs compuestas dentro del tenant. PostgreSQL no puede demostrar mediante una FK histórica que la membresía del actor continúa `ACTIVE`; el futuro servicio debe revalidar ese estado dentro de la misma transacción.

La coherencia es atómica y bidireccional. Un trigger inmediato sobre el journal exige que el caso ya refleje tenant, versión, estado y owner resultantes. Un constraint trigger diferido sobre el caso impide comprometer cambios en `version`, estado, tiempo de estado, motivo de pérdida u owner si no existe exactamente un comando que represente el estado anterior y el final. El orden futuro es actualizar el caso y luego insertar el comando dentro de una sola transacción; si falla el journal, la actualización revierte con él. Las funciones fijan `search_path` a `pg_catalog, osi`.

`APPROVED` queda completamente congelado: no admite entradas, salidas, reapertura, asignación ni desasignación de owner hasta revisión manual.

La evidencia usa un enum cerrado (`SURVEY`, `QUOTE`, `PROJECT`, `APPROVAL`, `ADDENDUM`) sin FK polimórfica. El futuro servicio deberá comprobar existencia y tenant antes de aceptar evidencia.

## Project

`Project.pipelineCaseId` es nullable y forma una relación 1:N con `PipelineCase` mediante `(tenantId, pipelineCaseId)`, `ON DELETE RESTRICT` y `ON UPDATE CASCADE`. Un proyecto sin tenant no puede relacionarse, un caso inexistente o cross-tenant se rechaza y el caso relacionado no puede eliminarse. No se rellena automáticamente al llegar a `WON` u `OPS_HANDOFF`; `OPS_HANDOFF` permanecerá bloqueado mientras no exista un Project relacionado.

## Operación y reversión

La migración 16 es aditiva y no interpreta datos existentes. El dry-run usa exclusivamente PostgreSQL local allowlisted y una transacción `READ ONLY`. El rollback incluido es una herramienta administrativa local, exige precondiciones estrictas y no es un rollback productivo. PostgreSQL no permite retirar valores añadidos a un enum como una reversión trivial; por eso el ensayo reconstruye explícitamente el enum sólo cuando no existen filas con estados nuevos.

La activación CRM continúa `DISABLED`; LEGACY permanece activo y HYBRID, tenant switch y cliente V2 continúan desactivados.

La regresión C2B2 reproduce localmente un backfill que en producción ocurrió antes de instalar CRM-01B1. Su fixture local verifica la identidad aislada, desactiva únicamente el constraint trigger durante ese ensayo histórico y lo reactiva obligatoriamente antes de limpiar. Esto no constituye una vía runtime ni una autorización para repetir el backfill.
