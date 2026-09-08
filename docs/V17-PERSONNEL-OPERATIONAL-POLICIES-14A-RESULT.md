# V17-PERSONNEL-OPERATIONAL-POLICIES-14A — Resultado

## A. Resumen

Se implementó localmente una autoridad tenant-first para perfiles operacionales, capacidades, zonas, políticas y ventanas de visita, excepciones fuera de horario, razones, overrides, historial e idempotencia. La autoridad se integra con `SurveyAssignment`, Scheduling 11B, Motor Logístico, Relaciones Comerciales y Comunicaciones, sin sustituir RRHH, implementar nómina ni activar Production.

## B. Rama/base/HEAD

- Rama: `feature/v17-consolidated-preview`.
- Base exacta: `18cb48c802d3e5dc70a34bd81a861b5b89539032`.
- Preflight: worktree limpio, 32 migraciones y guards 01A–13B verdes antes de editar.
- El HEAD final corresponde a los commits locales de 14A registrados en el informe de cierre.

## C. Histórico recuperado

Se conservaron como autoridades previas:

- `f003fd1`: perfiles empresariales `EmployeeProfile` ligados a User/Membership.
- `f00c032`: autoridad tenant-first de evaluación y `SurveyAssignment`.
- `316816f`: fundación persistente de Survey.
- `77578f4`: Motor Logístico tenant-first.
- `5c7ebf5`: método, `ServicesRevision` y `RouteSnapshot` en la App reciente del Evaluador.
- `6a58d1b` y su linaje: Relaciones Comerciales.
- `cd19083`, `61f273a` y `2621a68`: modelo, preparación e interfaz de Comunicaciones.

No se recuperaron stores, horarios o identidades paralelas del snapshot histórico.

## D. Modelo Prisma

Se reutilizó `EmployeeProfile` como perfil operacional vinculado por FK compuesta a `tenantId + membershipId + userId`. Se añadieron diez autoridades: `OperationalCapability`, `OperationalCapabilityAssignment`, `OperationalZoneAssignment`, `VisitPolicyVersion`, `VisitPolicyWindow`, `VisitReason`, `OperationalScheduleOverride`, `AfterHoursVisitRequest`, `VisitPolicyEvent` y `PersonnelPolicyCommand`. `SurveyAssignment` recibió relaciones compatibles con razón, excepción e historial, sin sustituir su identidad vigente.

## E. Migración

- Migración 33: `20260914010000_v17_personnel_operational_policies`.
- Aditiva; no modifica migraciones 1–32.
- SHA-256 binario: `76690c0a5d464440f5924fb72905603e6d301ef8523f39ba3afc5a5cd6bc3bdb`.
- Tamaño: 39,892 bytes.
- Incluye FKs tenant-first, constraints, índices, identidad pública inmutable, comandos idempotentes y eventos append-only.

## F. Personal Profile

`EmployeeProfile` conserva una sola identidad por Membership/User del tenant y registra cargo, departamento, estado laboral, disponibilidad, restricciones JSON, notas administrativas y vigencia operacional. No se creó `OperationalPersonProfile` paralelo.

## G. Capacidades

Existe catálogo administrable y asignación versionable de capacidades. Se prueban capacidades presenciales, virtuales, por fotos, interior, supervisión y recursos. Los roles no conceden capacidad operacional ni los nueve permisos nuevos por sí solos.

## H. Políticas

`VisitPolicyVersion` publica versiones inmutables con timezone, duración, preparación, buffer mínimo, capacidad y vigencia. La precedencia publicada es: `EMPLOYEE_OVERRIDE > APPROVED_EXCEPTION > TENANT_POLICY > FAIL_CLOSED`. Dos reglas aplicables con igual prioridad producen conflicto y cierre seguro.

## I. Horarios

`VisitPolicyWindow` soporta ventanas recurrentes por día y fechas especiales de apertura o cierre. Método, zona, horas, capacidad y requisito de aprobación son configurables; no existe un horario universal hard-coded en runtime.

## J. Slots

Scheduling combina ventana, método, perfil, agenda vigente, capacidad, overrides y excepciones aprobadas antes de ofrecer o reservar. La ocupación del evaluador se comprueba server-side y el frontend no calcula disponibilidad.

## K. Travel buffer

Para visitas físicas se aplica el máximo entre el buffer de política y el tiempo publicado por Motor Logístico. Se prueban 70 minutos de Motor frente a un mínimo menor. El buffer nunca se calcula ni se confía al frontend.

## L. Presencial

Exige capacidad presencial, zona autorizada y revisión logística publicada compatible con la versión de ruta. Si faltan Motor o recursos requeridos, una excepción no puede ser aprobada administrativamente.

## M. Virtual

No exige traslado ni Motor. Usa preparación, duración, disponibilidad y capacidad virtual; se prueba que un valor físico de Motor no contamina la ventana virtual.

## N. Excepciones

Un intento fuera de política devuelve `PERSONNEL_AFTER_HOURS_REQUEST_REQUIRED` y ofrece crear `AfterHoursVisitRequest`, en vez de un rechazo terminal. Estados: `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED` y `EXPIRED`; guarda reglas incumplidas, impacto y recursos como snapshots sanitizados.

## O. Evaluador response

El evaluador propuesto, revalidado por Profile + Membership + User + Tenant, puede responder disponibilidad mediante `EXCEPTION_RESPOND`. No puede responder por otra identidad ni ser asignado silenciosamente.

## P. Admin approval

`EXCEPTION_DECIDE` requiere permiso explícito, versión esperada, aceptación previa del evaluador cuando aplica y autoridad de recursos. La aprobación concurrente admite un único ganador.

## Q. Recursos

Las necesidades se referencian mediante snapshots de autoridad existente; Personal/Políticas no crea vehículos, conductores, equipos, viáticos u hospedajes. La ausencia de autoridad requerida bloquea la aprobación física.

## R. Motor integration

Se consume exclusivamente la última `LogisticsPlanRevision` publicada y compatible con `routeRevision` para zona, distancia y traslado. No se duplicaron `LogisticsRule` ni fórmulas logísticas.

## S. Visit Fee

Permanece separado: política autoriza, Motor determina necesidad, Costing determina importe y Scheduling presenta `SurveyVisitFee`. 14A no recalcula ni modifica el contrato económico.

## T. Reagendamiento

`REBOOK_VISIT` crea un evento append-only con cita anterior y nueva, razón, origen y actor. No sobrescribe el historial. Cancelación y confirmación del cliente conservan eventos separados.

## U. Razones

`VisitReason` es un catálogo tenant-first para evaluación, seguimiento, medición y otros propósitos. Reagendamiento distingue `CLIENT`, `EVALUATOR`, `SALES`, `ADMIN`, `RESOURCE_CONFLICT` y `OTHER`, además del detalle autorizado.

## V. Notificaciones

Los hitos de solicitud, respuesta, aprobación, rechazo, programación, reagendamiento y cancelación pueden generar registros `PREPARED` mediante Comunicaciones 13A. Email, WhatsApp, SMS, Portal y webhooks externos continúan desactivados; nunca se publica `SENT` en 14A.

## W. Cliente

El contexto preparado contiene únicamente fecha, hora, método, razón, instrucciones y lugar autorizados. Direcciones y PII no se colocan en URL, logs ni errores.

## X. Evaluador

La App reciente conserva Case, Client publicado, RouteSnapshot, ServicesRevision, método, razón, instrucciones, zona, traslado y recursos autorizados. 14A no reconstruye esa App desde el snapshot histórico.

## Y. Portal future contract

Se preservan estados de confirmación `NOT_CONFIRMED`, `CONFIRMED`, `CHANGE_REQUESTED` y `CANCELLED_BY_CLIENT`, separados de aceptación del evaluador y de `arrivedAt`. No se implementó Portal Cliente, QR ni transporte Portal.

## Z. AuthorizationContext

La API reutiliza `resolveCrmPipelineContext`; revalida User, Membership y Tenant en cada request y deriva tenant, actor y rol server-side. No acepta PK, tenant, actor ni rol del body.

## AA. Permisos

Se añadieron como grants exclusivamente explícitos: `personnel:profiles:view/manage`, `personnel:capabilities:view/manage`, `scheduling:policies:view/manage`, `scheduling:exceptions:request/approve/respond`. `deniedPermissions` prevalece y las rutas lazy comparten la decisión de acceso del shell.

## AB. Auditoría

`VisitPolicyEvent` es append-only y registra capacidades, zonas, política, excepción, respuesta, decisión, cita, reagendamiento, cancelación, confirmación y comunicación preparada. `PersonnelPolicyCommand` garantiza requestId/payloadHash, replay idéntico y conflicto ante payload distinto.

## AC. Tests

- Contrato: 20/20.
- HTTP/gate/CORS: 10/10.
- Dominio PostgreSQL: 21/21.
- Personal browser: 18/18.
- Scheduling browser integrado: 24/24.
- Negativas Scheduling: 16/16.
- Negativas Personal: 14/14.
- Build, TypeScript y ESLint focalizado: verdes.

## AD. PostgreSQL

PostgreSQL 18 local aislado validó vacío 33/33, adopción 32→33, segundo deploy sin pendientes, rollback/replay y drift vacío. Duraciones observadas: vacío 3,360 ms; adopción 1,678 ms; replay 1,583 ms. Resultado: 33 completas, cero fallidas, `applied_steps_count=33`, checksum Prisma idéntico al archivo, cero locks en espera y fingerprint estructural `722dbd69b2e5eeee8259afe2e8e9ffee`.

## AE. Browsers

Chromium, Firefox y WebKit aprobaron desktop y móvil. Personal ejecutó tres escenarios por proyecto (18/18); Scheduling cuatro por proyecto (24/24), incluida solicitud fuera de horario. Deny se midió en contextos nuevos: cero chunk protegido y cero request de Scheduling.

## AF. Guards

Las guardias fallan ante rol usado como capacidad, horario hard-coded, buffer físico en frontend, cálculo logístico duplicado, excepción sin auditoría, reagendamiento destructivo, envío externo, pérdida tenant-first, activación Production, catálogo sin permiso evaluator o alternativa fuera de horario ausente. CORS mantiene inventario cerrado: 145 rutas, 118 protegidas, 31 negativas.

## AG. Feature flags

`PERSONNEL_POLICIES_API_MODE` y `VITE_PERSONNEL_POLICIES_MODE` aceptan sólo `DISABLED` y `LOCAL_ONLY`. Ausente/desconocido falla cerrado; `LOCAL_ONLY` exige loopback real y cualquier variable `VERCEL*` lo impide. `productionApiEnabled=false` permanece literal. No existe Preview ni Production mode en este lote.

## AH. Riesgos

- 14B deberá ensayar migración, fixtures y experiencia en una base Preview aislada antes de habilitar el dominio.
- La autoridad de recursos depende de revisiones publicadas de Motor; sin ellas las visitas físicas afectadas fallan cerrado.
- Transportes y confirmación del cliente siguen pendientes de gates/Portal futuros.
- No se incluyeron RRHH integral, nómina ni administración de inventario/equipos.

## AI. Diff

El diff se limita a: Prisma/migración 33; dominio, contrato, HTTP y ruta `/api/personnel/policies`; permisos; integración de Scheduling/Survey/Comunicaciones; módulo lazy `src/personnel-policies`; catálogo/Hub/Administración; inventario CORS; guards; scripts de contrato, HTTP, DB y rollback; Playwright; evidencias PNG; configuración y documentación. No se modificaron migraciones 1–32.

## AJ. Worktree

El cierre requiere commits locales trazables y `git status` limpio. No hubo push, PR, acceso a Production, Neon o Vercel.

## AK. Siguiente Preview

Siguiente lote obligatorio: `V17-PERSONNEL-POLICIES-PREVIEW-14B`, para migración y datos sintéticos en Preview aislada, revisión visual de Personal/Políticas, Scheduling y excepciones. No iniciar Portal Cliente automáticamente.
