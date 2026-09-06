# V17 Scheduling Desktop Convergence 11B — resultado

## A. Resumen

Se recuperó la experiencia de Evaluación y Scheduling como una extensión tenant-first de Survey 04A. `SurveyAssignment` sigue siendo la autoridad de la cita y de la entrada a Survey App; la decisión comercial, la política versionada, el historial, Visit Fee y las comunicaciones PIC se almacenan server-side. No se portaron stores ni fórmulas monetarias históricas.

## B. Rama/base/HEAD

- Rama: `feature/v17-scheduling-desktop-convergence`.
- Base exacta: `c100b4e24cdd821ed452f3d1d46addc7c26d03fe`.
- HEAD final: el SHA resultante de estos tres commits locales se registra en la entrega, para no incrustar en el propio commit una identidad circular.

## C. Código histórico recuperado

Se revisaron `LegacyLeadIntakeWorkspace.tsx`, `VisitSchedulingModal.tsx`, `visitSchedulingRules.ts`, `SurveyPicCommunicationPanel.tsx`, `SalesQuoteWorkspace.tsx`, `visitCalendarStore` y `schedulingBridge` del snapshot `modern-baseline-20260814@61a3e8a4525efedfc99120fb5e4845ba45234ba1`. Se recuperaron los métodos de evaluación, perfiles METRO/INTERIOR, slots, capacidad diaria, cierre dominical, validación sabatina, reprogramación, Visit Fee por fases y composición PIC para cliente/evaluador.

## D. Qué se descartó del histórico

Se descartaron `visitCalendarStore`, `schedulingBridge`, `salesStore`, persistencia empresarial en `localStorage`, single-tenant assumptions, selección de evaluador por nombre, PK internas, fórmulas de Visit Fee en frontend y el monolito `SalesQuoteWorkspace` como autoridad.

## E. Modelo final

- `SurveyAssignment`: cita, evaluador, intervalo, perfil, zona, slot, política y revisión de ruta.
- `SurveyEvaluationDecision`: método y estado comercial separado de Survey.
- `SurveySchedulePolicyVersion`: política versionada de slots, capacidad, cierres, sábados, zona gratuita y capacidades operacionales.
- `SurveyAssignmentEvent`: historial append-only.
- `SurveyVisitFee`: disposición y estados independientes de comunicación, aprobación y pago.
- `SurveyCommunicationRecord`: PIC `PREPARED`/registrado sin transporte externo.
- `SurveyDraft` y `SurveyPublication`: permanecen como autoridad del levantamiento y resultado.

## F. Migración

Se creó la migración aditiva `20260911010000_v17_scheduling_desktop_convergence`. No backfillea decisiones ni citas inferidas y conserva válidas las asignaciones 04A existentes. SHA-256: `8b4b507f57714586fc3bfd16a22b58979c4da50059ffbc2bb6397e9caab86896`; 18,650 bytes; LF; sin BOM.

## G. Método de evaluación

Métodos explícitos: `IN_PERSON`, `VIRTUAL`, `CLIENT_PHOTOS_DOCUMENTS`, `WRITTEN_REPORT`, `VOXME`, `MINI` y `NONE`. Sus estados comerciales son `NOT_REQUIRED`, `PENDING_METHOD`, `WAITING_CLIENT_INFO`, `READY_TO_SCHEDULE`, `SCHEDULED`, `IN_PROGRESS`, `COMPLETED` y `CANCELLED`. Los métodos remotos no crean una visita implícita.

## H. Agenda

La agenda es persistente y vinculada a `SurveyAssignment`. Publica fecha/hora, slot, evaluador, ocupación, estado e instrucciones mediante DTO cerrado. Lista y detalle se resuelven con tenant, usuario y Membership revalidados.

## I. Slots/capacidad

Los slots y capacidades proceden de una política activa server-side. La reserva usa transacción `SERIALIZABLE`, advisory locks y constraints para impedir doble asignación, capacidad excedida y slots cerrados. Las pruebas concurrentes confirman un único ganador.

## J. METRO/INTERIOR

La política inicial versionada conserva: METRO con dos franjas y capacidad diaria 2; INTERIOR_SHORT hasta 30 km y capacidad 2; INTERIOR_LONG sobre 30 km y capacidad 1. La zona y distancia reales proceden del Motor 07A mediante `zoneType`/`zoneCode`; React no contiene barrios ni clasificación propia.

## K. Reglas de sábado

Domingo está cerrado. Sábado requiere validación administrativa explícita y motivo; sin esa validación la operación falla cerrada. Las fechas cerradas adicionales se publican en la política versionada.

## L. Evaluador

El cliente envía sólo `evaluatorMembershipRef`. El servidor resuelve y revalida Membership, User y Tenant activos. Un vendedor puede evaluar cuando posee permiso técnico y la capacidad operacional requerida; el rol por sí solo nunca basta.

## M. Políticas operacionales

Se formalizaron `CAN_PERFORM_IN_PERSON_SURVEY`, `CAN_PERFORM_VIRTUAL_SURVEY`, `CAN_PERFORM_OUT_OF_AREA_VISIT`, `CAN_APPROVE_VISIT_FEE` y `CAN_PUBLISH_SURVEY`. La interfaz queda en la política versionada, separada de RBAC. Su futura sustitución por una autoridad general de capacidades de empleado no cambia el contrato público.

## N. Visit Fee

Estados: `FREE`, `CHARGEABLE`, `PENDING_CALCULATION` y `WAIVED`. Comunicación, aprobación y pago permanecen separados. Un fee cobrable exige referencias publicadas del Motor y Costing; `FREE` no inventa importe y Scheduling no calcula dinero.

## O. Motor Logístico integration

Scheduling aporta ruta versionada, fecha, método y contexto del evaluador. Motor 07A aporta zona, distancia y revisión logística. Costing aporta la fuente económica publicada. El contrato del Motor ahora valida de forma cerrada `zoneType`, `zoneCode` y los límites de distancia configurados.

## P. Reprogramación

La reprogramación conserva intervalo anterior/nuevo, motivo, actor, timestamp y necesidad de notificación en eventos append-only. Usa optimistic versioning, idempotencia y bloqueo concurrente; no sobreescribe historia.

## Q. Cambio de dirección

La asignación fija `routeContractVersion`. Si la versión vigente cambia, la lectura publica `routeStale` y la reprogramación se bloquea hasta revalidar zona, distancia, Visit Fee y disponibilidad. Este lote no inventa una mutación de ruta; el futuro editor de ruta debe registrar `ROUTE_INVALIDATED` de forma atómica.

## R. PIC

PIC se conserva como preparación coordinada de la visita para cliente y evaluador. Se registra template, versión, audiencia, canal, actor, fecha, referencia y estado. No se implementó transporte externo.

## S. Comunicación cliente

El contrato permite preparar contenido versionado con evaluador, fecha, hora, lugar, método e instrucciones desde datos autorizados. Sólo se persisten referencia y hash del contenido, no el mensaje ni PII en logs.

## T. Comunicación evaluador

El contrato permite preparar la comunicación con caso/Survey públicos, contacto permitido, ruta, fecha/hora, servicio e instrucciones. Booker, Agent, Lead Account y contacto corporativo están modelados como audiencias, pero quedan sin resolución hasta `Relaciones Comerciales tenant-first`.

## U. Survey desktop

La pestaña Survey de la Ficha incorpora decisión, método, agenda, slots/ocupación, evaluador, reprogramación, cancelación, Visit Fee, PIC, resultado publicado e historial en una composición compacta desktop/mobile.

## V. Survey App integration

Survey App 04A no se reescribió. Se abre desde la asignación publicada y comparte las mismas referencias y autoridad. El flujo mobile-first existente permanece separado del workspace comercial desktop.

## W. Resultado para Comercial

Al publicar Survey, la decisión pasa a `COMPLETED`, queda enlazada a la asignación y se registra `SURVEY_PUBLISHED`. Comercial muestra los campos publicados por Survey —volumen, peso, necesidades, condiciones, acceso, fecha y evaluador— sin editar inventario desde la Ficha.

## X. AuthorizationContext

Todas las lecturas y mutaciones nuevas reciben `AuthorizationContext`. Ningún payload acepta tenant, PK de User/Membership, rol o actor. Cada request revalida User, Membership y Tenant; cross-tenant y referencias ajenas fallan cerradas.

## Y. Permisos

Se añadieron permisos explícitos, sin grants automáticos por rol: `survey:schedule:view`, `survey:schedule:manage`, `survey:schedule:assign`, `survey:schedule:reschedule`, `survey:visit-fee:view` y `survey:visit-fee:approve`. `deniedPermissions` prevalece también en el límite lazy.

## Z. Auditoría

Se auditan decisión de método, publicación de política, agenda, reprogramación, cancelación, cambio de evaluador, cambios de Visit Fee y PIC preparado. Mutación, comando idempotente y auditoría participan en una única transacción.

## AA. Tests

- Contrato histórico/funcional: 19/19.
- Base de datos: 26 aserciones.
- Guardia Scheduling: 26/26; negativas 11/11.
- Matriz visual focal: 18/18.
- Guards 01A–10B afectados: todos verdes.
- TypeScript, ESLint focalizado, build y `git diff --check`: verdes.

## AB. PostgreSQL

PostgreSQL 18.2 aislado: instalación desde vacío 30/30; segundo deploy sin pendientes; rollback controlado a 29/29 con cero residuos; reaplicación 30/30; drift vacío. La prueba DB cubre concurrencia de slot, reprogramación, cambio de evaluador, idempotencia, tenant, deny, ruta stale, Visit Fee, PIC e historia append-only.

## AC. Browsers

Chromium, Firefox y WebKit aprobaron desktop y mobile: 18/18, cero omitidas. Se cubrieron manager, viewer y deny en contextos aislados; deny descargó cero chunks de `SurveyCasePanel` y generó cero requests de Scheduling.

## AD. Guards

Las guardias bloquean stores/localStorage como autoridad, bridges, tenant del cliente, evaluador por nombre, fee hard-coded, duplicación de Survey, permisos implícitos, ausencia de `SERIALIZABLE`, pérdida de CORS privado, debilitamiento tenant-first y activación Production. El inventario CORS clasifica la nueva ruta protegida.

## AE. Feature flags

`productionApiEnabled=false` permanece vigente. No se añadieron modos Production ni se modificaron variables. El seed Preview fue adaptado de forma local para 30 migraciones y contratos sintéticos, pero no se ejecutó contra infraestructura externa.

## AF. Riesgos pendientes

- Falta converger capacidades operacionales con una autoridad general de empleados.
- Falta el editor administrativo de políticas; el contrato versionado ya existe.
- Falta conectar la mutación futura de ruta con `ROUTE_INVALIDATED`.
- Falta transporte real y gestor canónico de plantillas/comunicaciones.
- Booker, Agent, Lead Account y contacto corporativo requieren Relaciones Comerciales.

## AG. Diff summary

El cambio se limita a esquema/migración 30, contrato y dominio Scheduling, una API protegida, permisos explícitos, integración Motor/Survey, UI Survey de la Ficha, seed Preview local, pruebas/guardias/CI, documentación y evidencias visuales. No cambia Auth V2, Operaciones ni contratos productivos.

## AH. Worktree

El lote termina en commits locales trazables y worktree limpio. No se ejecutó push, PR, merge ni acceso a Production/Neon/Vercel.

## AI. Propuesta siguiente lote

Siguiente lote recomendado: `Relaciones Comerciales tenant-first`, para resolver Booker, Agent, Lead Account y contactos corporativos sin duplicar identidades ni introducir PII en Scheduling. No se implementó en 11B.
