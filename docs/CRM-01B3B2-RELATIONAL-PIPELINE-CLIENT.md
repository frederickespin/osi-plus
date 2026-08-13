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
- `api.ts`: único adaptador `/api/crm/**`; Bearer desde `sessionStore.getToken`, `credentials=same-origin`, `cache=no-store`, timeout y `AbortController`. Valida status, `Content-Type: application/json`, JSON, esquemas y campos exactos.
- `RelationalPipelineModule.tsx`: lista paginada, resumen y drawer accesible. Mantiene máximo 25 filas por página (la API limita a 100), cancela lecturas al cambiar filtros/desmontar y usa fencing por secuencia para descartar respuestas tardías.
- `App.tsx`: importación dinámica. Con la compuerta cerrada el chunk no se ejecuta ni se crea estado, timer, listener o request CRM.

El ajuste de `crmPipelineRead.js` agrega `QUOTE_DRAFT`, `WON` y `LOST` a la allowlist ya definida por el enum y dominio. Sin ello, la API existente podía producir esos estados pero rechazarlos como filtro y omitirlos del resumen.

## Comandos, recuperación e idempotencia

Cada intención crea una clave sólo en memoria mediante `crypto.randomUUID()`. La misma intención conserva la clave para respuesta perdida, timeout, `COMMAND_IN_PROGRESS` y retry manual. Sólo `COMMAND_IN_PROGRESS` admite un retry automático, con `retryAfterMs` entero entre 0 y 5,000 ms; un valor ausente o inválido usa un fallback fijo y seguro de 150 ms. Conflictos de versión o idempotencia nunca generan otra clave ni retry automático.

Tras éxito se releen lista, resumen, detalle y transiciones. No hay estado optimista. Un 401 usa el logout actual; 403 obliga a releer autorización antes de mostrar acciones; 404 cierra el detalle; 503 conserva datos visibles y ofrece retry. Cerrar el drawer o desmontar cancela el request y la intención pendiente sin crear otra clave. Las mutaciones exigen un diálogo de confirmación accesible.

## Matriz A/V

| Capacidad | A | V | Autoridad final |
|---|---:|---:|---|
| Lista, resumen, detalle | sí | sí | API/RBAC |
| Transiciones publicadas por `allowed-transitions` | sí | sólo caso propio | API/dominio |
| Reabrir LOST | cuando API lo publique | no | dominio |
| Desasignar owner | control visible | oculto | API/dominio |
| Asignar/reasignar | adaptador tipado disponible; UI bloqueada | no | falta catálogo CRM seguro |

La UI no expone un campo libre de `ownerMembershipId`. Las APIs actuales reciben ese identificador para el comando, pero no publican un catálogo de owners autorizado que permita construir un selector sin exponer IDs internos. Activar esa acción requiere primero un endpoint CRM de referencias opacas/seguras; no se reutiliza `/api/users` ni se pide al operador pegar IDs.

## Contratos deliberadamente incompletos

El cliente no inventa historial de comandos, SLA, catálogo o datos personales de owners, relaciones Client/Project ausentes, métricas no publicadas ni evidencia para `WON`/`SURVEY_SCHEDULED`. Esas transiciones sólo pueden aparecer si el dominio publica evidencia soportada. Estos contratos quedan reservados para CRM-01B3B3 o una fase posterior.

## Validación local

- Browser suite Q1: 156/156 en Chromium, Firefox y WebKit, escritorio y móvil. Incluye contrato HTTP estricto, fallback de retry, respuesta perdida, cancelación, texto hostil, foco, confirmaciones e idempotencia.
- Guardias: 16 migraciones exactas; modo productivo/17 prohibidos; variable ambiental central; sin Storage, LeadLite, batches, tenant/actor/owner heredado, CORS global, HTML editable ni retries peligrosos. Cuatro fixtures negativas prueban que la guardia falla.
- El backend relacional mantiene dos consultas para lista (`count` + página) y no materializa 2,000 filas en el cliente. Las mediciones SQL de CRM-01A para 2,000 filas siguen siendo la referencia backend (p95 local 4.455–7.242 ms según escenario).
- Paginación frontend Q1 con 2,000 resultados, 30 rondas y 25 filas montadas: Chromium desktop 82/101/104 ms y WebKit móvil 166/192/231 ms p50/p95/máximo; todos los proyectos quedaron con p95 menor de 250 ms. Cada cambio produjo una lectura; el resumen se carga independientemente y no vuelve a pedirse por paginación. No hubo N+1 frontend.
- Bundle DISABLED contra la base exacta: el entry principal aumenta 1,432 bytes raw/521 gzip por la compuerta y navegación; el chunk relacional queda separado (37,003 bytes raw/9,570 gzip) y no se solicita durante navegación real con la variable ausente o `DISABLED`.
- Regresión: cadena canónica 299/299, CRM-01A/B1/B2/B3A/B3B1, 75/75 navegadores heredados, build, typecheck focalizado y ESLint aprobados.

## Riesgos reservados

- Catálogo seguro de owners para habilitar asignación/reasignación visual.
- Ensayo integral con PostgreSQL, HTTP real y dos tenants en rama aislada.
- Activación gradual posterior: lectura, mutaciones A y finalmente V.
- El historial no se presenta porque la API actual no lo publica.
