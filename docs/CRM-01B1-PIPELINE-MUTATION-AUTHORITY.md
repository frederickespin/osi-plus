# CRM-01B1 — Autoridad persistente de mutaciones PipelineCase

Esta fase agrega únicamente persistencia inactiva. No existen endpoints, servicios runtime, activación CRM, backfill semántico ni cambios frontend.

## Defecto bloqueante confirmado en la versión inicial

La primera versión de la migración sólo protegía unicidad y forma del journal. No existía una relación ejecutable entre el comando insertado y el estado final del caso: era posible insertar un comando sin actualizar el caso, declarar una versión, estado u owner final falsos, o actualizar campos gobernados sin journal. Las pruebas adversariales congelan ahora todos esos casos como rechazos. La unicidad también rechaza reutilizar `(tenantId, requestId)` aunque cambien el payload o el caso; otro tenant conserva su propio espacio idempotente.

## Estados

`QUOTE_DRAFT`, `WON` y `LOST` amplían el enum existente. `APPROVED` conserva su significado heredado ambiguo de aprobación interna: no equivale a `WON`, queda congelado sin transiciones de entrada o salida en el futuro dominio y requiere revisión manual antes de activar mutaciones.

Cada `PipelineCase` inicia en `version=1`. Todo comando aceptado incrementará la versión exactamente una vez. Sólo `TRANSITION` y `REOPEN` cambiarán `statusChangedAt`; las operaciones de owner no lo harán. El futuro servicio debe obtener `statusChangedAt` desde el servidor PostgreSQL dentro de la misma transacción, usando `transaction_timestamp()` o su equivalente. El valor no proviene ni se acepta del navegador o del proceso Node; la tolerancia de cinco segundos sólo comprueba coherencia entre el caso, el journal y el reloj transaccional del servidor. Las transacciones deben permanecer breves. `LOST` requiere uno de los códigos cerrados de la migración y cualquier otro estado exige `lossReasonCode=NULL`. Sólo `REOPEN` puede salir de `LOST`, siempre hacia `NEW_INBOX`, limpiando el motivo de pérdida y preservando en el journal la razón de reapertura.

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

## Criterio formal de drift

La validación separa tres capas. El drift administrable por Prisma debe ser vacío; el texto normalizado de `-- This is an empty migration.` tiene SHA-256 `0983c8c2474f18152b093842104ef9aef25f03fb78861c9e681da2249a64a385`. Los objetos SQL-only históricos se conservan, se inventarían por catálogo y se comparan con una baseline explícita. Los objetos aditivos CRM-01B1 deben coincidir exactamente con la migración 16 y desaparecer por completo después de la reversión controlada del ensayo.

La firma de catálogo PostgreSQL 18 para la cadena 1–15 es `cf48b58f82cdaa9f2ce4e7bb3f467848ee32a3b83043977d56a896f27888dd35`; la cadena 1–16 es `f220349f2c2cbdd2ae083f57ba2ae18ee66716873ffbea8057ac60147853dc1d`. En la rama Neon restaurada, dos lecturas consecutivas de la baseline 1–15 produjeron `4d5959dc99b03a7866bc3e038fcaea611fe665a5412cb235522cc05ab5e011d3`. La diferencia de conteo de constraints entre PostgreSQL local 18 y Neon corresponde a constraints `NOT NULL` catalogados por PostgreSQL 18; las demás categorías coinciden exactamente.

Los fingerprints independientes capturados antes y después del ensayo permanecen `d27983046c41ed270d3491510dd6bf6ec0bc439d6b3607b3ac97adada781c5b4` para estructura y `867f3ce3cb8110c0883874c70db77c87e9dd69a13c1f4940722bb9d192a36f82` para historia. El detalle y clasificación están en [CRM-01B1-SQL-ONLY-DRIFT.md](./CRM-01B1-SQL-ONLY-DRIFT.md).
