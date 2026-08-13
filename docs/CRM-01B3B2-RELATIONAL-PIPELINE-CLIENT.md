# CRM-01B3B2 — Cliente relacional inactivo

## Estado y separación

`VITE_CRM_PIPELINE_CLIENT_MODE` se resuelve sólo en `src/crm-relational/clientMode.ts`. Ausente o `DISABLED` mantiene oculto el menú y evita montar el módulo. `LOCAL_ONLY` exige hostname loopback y ausencia de marcadores Vercel. No existe un modo productivo frontend.

El prototipo continúa sin cambios funcionales y conserva estas autoridades locales:

- `LeadLite`: `PROSPECT`, `CONTACTED`, `SITE_VISIT`, `QUOTE_SENT`, `NEGOTIATION`, `WON`, `LOST`.
- `osi-plus.leads` y `osi-plus.quotes`, leídos/escritos por `salesStore.ts`.
- `osi-plus.salesQuote.openContext` y `osi-plus.crateWood.openContext`, usados para navegación heredada.
- `ClientsModule`, `SalesQuoteModule` y `QuoteBuilder` siguen creando/actualizando Leads, cotizaciones y borradores locales.

No existe tabla de equivalencias entre esos siete estados y `PipelineCaseStatus`. El cliente relacional no importa `salesStore`, no observa Storage y no realiza escritura dual.

## Arquitectura

- `clientMode.ts`: compuerta estricta y única lectura ambiental.
- `types.ts`: DTO públicos seguros. No incluye tenant, membresía, usuario, claims ni permisos.
- `api.ts`: único adaptador `/api/crm/**`; Bearer desde `sessionStore.getToken`, `credentials=same-origin`, `cache=no-store`, timeout y `AbortController`. Valida esquemas y campos exactos.
- `RelationalPipelineModule.tsx`: lista paginada, resumen y drawer accesible. Mantiene máximo 25 filas por página (la API limita a 100), cancela lecturas al cambiar filtros/desmontar y usa fencing por secuencia para descartar respuestas tardías.
- `App.tsx`: importación dinámica. Con la compuerta cerrada el chunk no se ejecuta ni se crea estado, timer, listener o request CRM.

El ajuste de `crmPipelineRead.js` agrega `QUOTE_DRAFT`, `WON` y `LOST` a la allowlist ya definida por el enum y dominio. Sin ello, la API existente podía producir esos estados pero rechazarlos como filtro y omitirlos del resumen.

## Comandos, recuperación e idempotencia

Cada intención crea una clave sólo en memoria mediante `crypto.randomUUID()`. La misma intención conserva la clave para respuesta perdida, timeout, `COMMAND_IN_PROGRESS` y retry manual. Sólo `COMMAND_IN_PROGRESS` admite un retry automático, con `retryAfterMs` entero entre 0 y 5,000 ms. Conflictos de versión o idempotencia nunca generan otra clave ni retry automático.

Tras éxito se releen lista, resumen, detalle y transiciones. No hay estado optimista. Un 401 usa el logout actual; 403 retira acciones del caso; 404 cierra el detalle; 503 conserva datos visibles y ofrece retry. Cerrar el drawer cancela definitivamente la intención pendiente.

## Matriz A/V

| Capacidad | A | V | Autoridad final |
|---|---:|---:|---|
| Lista, resumen, detalle | sí | sí | API/RBAC |
| Transiciones publicadas por `allowed-transitions` | sí | sólo caso propio | API/dominio |
| Reabrir LOST | cuando API lo publique | no | dominio |
| Desasignar owner | control visible | oculto | API/dominio |
| Asignar/reasignar | adaptador tipado disponible; UI bloqueada | no | falta catálogo CRM seguro |

La UI no expone un campo libre de `ownerMembershipId`. Las APIs actuales reciben ese identificador para el comando, pero no publican un catálogo de owners autorizado que permita construir un selector sin exponer IDs internos. Activar esa acción requiere primero un endpoint CRM de referencias opacas/seguras; no se reutiliza `/api/users` ni se pide al operador pegar IDs.

## Validación local

- Browser suite: 102/102 en Chromium, Firefox y WebKit, escritorio y móvil; flag cerrado, matriz estricta de configuración, 39/12, filtros, drawer, APPROVED, OPS_HANDOFF, A/V, 401/403/404/409/503, respuesta tardía, doble envío, dos pestañas y almacenamiento.
- Guardias: 16 migraciones exactas; modo productivo/17 prohibidos; variable ambiental central; sin Storage, LeadLite, batches, tenant/actor/owner heredado ni retries peligrosos.
- El backend relacional mantiene dos consultas para lista (`count` + página) y no materializa 2,000 filas en el cliente. Las mediciones SQL de CRM-01A para 2,000 filas siguen siendo la referencia backend (p95 local 4.455–7.242 ms según escenario).
- Paginación frontend con 2,000 resultados y 25 filas montadas: Chromium 50/62/62 ms, Firefox 71/110/110 ms y WebKit 154/177/177 ms p50/p95/máximo en escritorio; 47/50/50 ms, 58/71/71 ms y 136/192/192 ms respectivamente en móvil. Cada cambio de página produjo una sola lectura; el resumen se carga independientemente y no vuelve a pedirse por filtros o paginación. No hubo N+1 frontend.
- Regresión: cadena canónica 299/299, CRM-01A/B1/B2/B3A/B3B1, 75/75 navegadores heredados, build, typecheck focalizado y ESLint aprobados.

## Riesgos reservados

- Catálogo seguro de owners para habilitar asignación/reasignación visual.
- Ensayo integral con PostgreSQL, HTTP real y dos tenants en rama aislada.
- Activación gradual posterior: lectura, mutaciones A y finalmente V.
- El historial no se presenta porque la API actual no lo publica.
