# V17-COMMERCIAL-PREVIEW-CORRECTIONS-12C — Resultado

## Alcance implementado

- La Ficha Comercial ya no importa ni presenta `LogisticsPlanPanel` ni un tab `Motor Logístico`.
- El flujo visible conserva `Resumen`, `Servicios`, `Evaluación`, `Costos` y `Cotización`; `Relaciones` permanece como contexto transversal ya aprobado en 12A/12B.
- `Evaluación` consulta la última revisión publicada del Motor y presenta zona, distancia, perfil de agenda, Visit Fee, necesidades publicadas y advertencias, sin fórmulas ni acciones de cálculo/publicación.
- Los blockers publicados muestran descripción, causa sanitizada y el área de autoridad donde deben resolverse.
- Administración reutiliza `LogisticsRulesAdmin` de 07A bajo `Administración → Motor Logístico`, detrás de `isLogisticsUiEnabled()` y `logistics:rules:view` antes del límite lazy. Esta superficie es independiente de la compuerta de Memberships: si esa compuerta está desactivada no carga `AdminTenantMembershipModule` ni consulta `/api/admin/memberships`.
- Costing continúa recibiendo la revisión publicada del Motor; no calcula logística.

## Autoridades preservadas

- No cambió el dominio, contrato HTTP, reglas ni persistencia del Motor 07A.
- No cambió Prisma ni ninguna migración; el repositorio conserva 31 migraciones.
- Scheduling publica en su DTO la distancia ya resuelta por el Motor; no deriva ni recalcula la distancia.
- El contexto de Relaciones Comerciales se muestra junto al resultado publicado, pero 12C no inventa acuerdos ni altera el algoritmo de matching del Motor.

## Guardias

`guard:v17-commercial-preview-corrections` impide reintroducir el tab o workspace operativo en Comercial, cálculos en Scheduling/Costing, fetches dentro del componente presentacional, montaje administrativo sin permiso y modos Production. Las guardias consolidadas y de 07A fueron reconciliadas con la nueva navegación.

## Riesgo y siguiente frontera

12C consume automáticamente una revisión publicada al abrir una evaluación presencial. La creación/publicación automática de una revisión cuando todavía no existe requiere una futura orquestación transaccional explícita; no se añadió aquí porque implicaría cambiar comportamiento del Motor fuera del alcance autorizado. Tampoco se añadió el contexto comercial al algoritmo de reglas: sólo se presenta contexto ya publicado y se conserva la regla de no inferir acuerdos.

Production, Plantillas/Comunicaciones y 13A quedan fuera de este lote.
