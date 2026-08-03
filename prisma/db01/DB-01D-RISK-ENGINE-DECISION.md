# DB-01D — Decisión de prioridad de RiskEngineRule

Fecha: 2026-08-01. Alcance: análisis de código; no se creó ni modificó la tabla `osi_risk_engine_rules`.

## Consumidores encontrados

- `api/admin/logistic-engine/_store.js` y `risk-rules.js`: configuración persistida en archivo/local.
- `api/services/logisticsEngineService.js` y `api/logistics/active-config.js`: publicación de la configuración activa.
- `api/_domain/logisticEngine.js` y `src/core/logisticEngine.ts`: evaluación de zonas y límites de distancia.
- `api/cases/_service.js`: carga la política, agrega banderas y la aplica al aprobar cotizaciones.
- `src/components/admin/logistic/RiskControlSection.tsx` y `src/lib/logisticEngineAdminApi.ts`: edición administrativa y fallback local.

## Evidencia funcional

| Pregunta | Resultado actual |
|---|---|
| ¿Puede bloquear una cotización? | **Sí.** `requireApprovalOverKm` alimenta `maxDistanceWithoutApproval`; una distancia superior genera `DISTANCE_OVER_LIMIT`. Al aprobar, `hasBlockingLogisticFlags` provoca `409 LOGISTIC_ENGINE_BLOCKED` si no existe override. |
| ¿Puede autorizar una excepción? | No directamente. La excepción la autoriza el flujo administrativo; la regla determina que esa excepción sea necesaria. |
| ¿Altera precios, márgenes o recargos? | No directamente desde `RiskEngineRule`. Los precios y márgenes se calculan con otras reglas. `highRiskZones` sólo agrega una bandera en el código actual. |
| ¿Aprueba o rechaza automáticamente? | No aprueba. Puede impedir la aprobación normal, pero no cambia por sí sola el estado a rechazado. |
| ¿Modifica el flujo sin confirmación humana? | **Sí.** Convierte una aprobación normal en un flujo que exige validación administrativa. |
| ¿Extiende el SLA automáticamente? | `autoExtendedSla` se configura, pero no se encontró consumo que modifique el SLA en el flujo actual. |

## Decisión

`RiskEngineRule` queda clasificado definitivamente como **P0**, porque puede bloquear la aprobación de una cotización y exigir una excepción administrativa. DB-01D no lo implementa. Su futura migración deberá incluir versión, autor, vigencia, modo sombra y auditoría crítica antes de convertirse en fuente relacional autoritativa.
