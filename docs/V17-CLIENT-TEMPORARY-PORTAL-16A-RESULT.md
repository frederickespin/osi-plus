# V17-CLIENT-TEMPORARY-PORTAL-16A — Resultado local

## A. Resumen

Se implementó una superficie externa temporal, mobile-first e independiente del Hub para consultar una visita, confirmar, solicitar cambio o cancelación, aportar una Mini-visita, cargar fotos/PDF autorizados y validar el QR de un evaluador. El acceso está limitado por propósito, scopes, expiración, revocación y máximo de usos. Esta entrega sólo puede ejecutarse en loopback real; Production y Preview permanecen desactivados.

## B. Rama/base/HEAD

- Rama local: `feature/v17-consolidated-preview`.
- Base verificada: `c5c6a79328e185b1b974f0b1900bc2ebfe61ccfd`.
- Commit de implementación: `73f02802c256880ae0c32a8e586996e6fb518410`.
- El HEAD candidato final incluye además este informe de cierre.
- No hubo push, PR, merge ni consulta a Production, Neon o Vercel.

## C. Modelo Prisma

Se agregaron nueve autoridades tenant-first:

1. `ClientTemporaryAccess`.
2. `ClientTemporaryAccessGrant`.
3. `ClientTemporaryAccessEvent`.
4. `ClientTemporaryAccessCommand`.
5. `ClientTemporaryVisitResponse`.
6. `ClientTemporarySurveyContribution`.
7. `ClientTemporarySurveyContributionItem`.
8. `ClientTemporarySurveyContributionAsset`.
9. `ClientTemporaryQrConfirmation`.

Todas enlazan tenant, caso y, cuando aplica, `SurveyAssignment`, catálogo, contacto publicado, blob o `CommunicationRecord` mediante claves compuestas. Los grants, eventos, comandos, ítems, assets y confirmaciones QR son append-only. El snapshot de una contribución conserva artículo, código, nombre, peso y volumen de la versión de catálogo utilizada.

## D. Migración

- Migración 35: `20260916010000_v17_client_temporary_portal`.
- SHA-256 binario: `daaae1a2a3b5271c047bf1f0aaa089d7faa7231f1ee20286e5097e1ea1659a8b`.
- Tamaño: 24,514 bytes.
- Es aditiva; no modifica las migraciones 1–34 ni infiere backfill empresarial.
- Incluye FKs tenant-first, restricciones de estado/alcance, índices, tope Mini de 10 tipos e inmutabilidad/append-only en base de datos.

## E. Access token

El servidor genera 32 bytes mediante CSPRNG y entrega Base64URL sólo una vez. La base almacena exclusivamente SHA-256 del token. El token llega en el fragmento `#token=`, se retira inmediatamente de la URL y permanece sólo en memoria del documento. No crea sesión LEGACY/V2, cookie ni storage.

## F. Código temporal

Es opcional, de seis dígitos, con salt aleatorio y `scrypt`; no se almacena en claro. Expira como máximo en 15 minutos o junto al acceso, acumula intentos persistentes y bloquea tras cinco fallos. Sólo abre la vista de consulta y no habilita confirmaciones, Mini, uploads o QR.

## G. QR

- El panel interno genera un QR one-time del enlace temporal.
- El QR del evaluador usa el contrato `osi-visit:v1:<visitRef>:<evaluatorRef>`.
- Sólo contiene referencias públicas del contexto; nunca tenant, User, Membership, PK, PII ni navegación ERP.
- La validación registra resultado y hora sin convertir el QR en login.

## H. Scopes

Los scopes implementados son `VISIT_VIEW`, `VISIT_CONFIRM`, `VISIT_CHANGE_REQUEST`, `VISIT_CANCEL_REQUEST`, `VISIT_QR_CONFIRM`, `SURVEY_INFO_VIEW`, `SURVEY_INFO_UPLOAD` y `MINI_SURVEY_EDIT`. Cada operación sensible exige su scope exacto; no existe un booleano general de Portal.

## I. Expiración/revocación

Cada acceso tiene fecha explícita, estado, máximo de usos, contador, última utilización y versión optimista. Ventas/Administración con permiso explícito pueden revocar; expirado, agotado, revocado, token incorrecto y acceso inexistente usan el mismo error público sanitizado.

## J. Visita presencial

Publica únicamente fecha/hora, nombre y función del evaluador, motivo visible, instrucciones, ruta snapshot y Visit Fee sólo cuando ya está marcado como comunicado. No publica información interna del empleado.

## K. Visita virtual

La misma vista distingue `VIRTUAL`, presenta horario, evaluador, motivo e instrucciones. No inventa proveedor, enlace o transporte de videollamada.

## L. Confirmación

La confirmación del cliente se persiste en `ClientTemporaryVisitResponse`, separada de la confirmación/llegada del evaluador. La operación usa request ID, hash canónico, versión esperada, transacción serializable, comando y evento.

## M. Reagendamiento

`VISIT_CHANGE_REQUEST` exige razón CLIENT visible, admite comentario y hasta tres disponibilidades sugeridas. Sólo cambia la confirmación del cliente a `CHANGE_REQUESTED`; no altera `scheduledStart`/`scheduledEnd`, no selecciona slot y no evita las políticas de Scheduling.

## N. Cancelación

El Portal registra `CANCEL_REQUESTED` y su evento. No elimina ni cancela automáticamente `SurveyAssignment`, preservando la cita histórica y dejando la decisión a Scheduling/Administración.

## O. Razones

Se consume `VisitReason` tenant-first, activo, visible al cliente y con origen `CLIENT` (o el catálogo visible compatible para consulta). Reagendamiento y cancelación se validan contra el `kind` correspondiente.

## P. Información Survey

Las contribuciones se asocian al acceso, asignación y catálogo. Incluyen listado, cantidades, notas, medidas declaradas y assets. Nunca se mezclan automáticamente con los ítems técnicos publicados por el evaluador.

## Q. Mini-visita

Admite de 1 a 10 tipos distintos del catálogo activo. El tipo 11 falla en contrato y base con el mensaje exacto: `La información requiere un Survey más detallado.` No selecciona automáticamente otro método.

## R. Peso/volumen

El servidor calcula los totales con los valores unitarios de la versión activa del catálogo; el cliente sólo aporta artículo y cantidad. La UI muestra `Peso aproximado`, `Volumen aproximado` y la fuente `Información suministrada por el cliente / Mini Survey`.

## S. Fotos

Se reutiliza `SurveyBlobObject` y el storage seguro de Survey. Sólo se aceptan JPEG, PNG o WebP, hasta 10 MB, con hash, MIME, tamaño, tenant y contribución.

## T. Documentos

Sólo PDF, hasta 12 MB, bajo `INVENTORY_LIST`, `ACCESS_PLAN`, `PROPERTY_DOCUMENT` u `OTHER_AUTHORIZED`. El antivirus permanece como control futuro; no se abrió upload arbitrario.

## U. Fuente cliente/evaluador

Todo aporte del Portal queda `CLIENT_SUPPLIED`. Survey lo muestra como bloque informativo `Información suministrada por el cliente`, con `evaluatorVerified=false`; no lo publica ni lo transforma en `EVALUATOR_VERIFIED`.

## V. Scheduling

Se reutiliza `SurveyAssignment`, su ruta, evaluador, motivo y confirmación cliente. Solicitudes de cambio/cancelación producen estado y auditoría para que Scheduling las procese; el Portal no duplica agenda.

## W. Communications

Un acceso puede vincularse sólo a un `CommunicationRecord` ya `PREPARED`, del mismo tenant/caso/contacto. Se conserva `externalTransportEnabled=false`; no se envía EMAIL, WHATSAPP, SMS, PORTAL delivery ni webhook. La preparación automática de plantilla no se inventó cuando no existe una plantilla publicada explícita.

## X. Relations

El destinatario se resuelve exclusivamente desde un `CommercialEntityContact` activo, seleccionado explícitamente y perteneciente a un contexto comercial `PUBLISHED` del caso. No se infiere Booker, pagador ni contacto por nombre/correo.

## Y. Survey App

La App reciente del Evaluador consume la contribución asociada a la asignación a través del draft canónico. No se copió ni duplicó la Survey App.

## Z. Quote future

El DTO publica `quoteAcceptanceAvailable=false`. No hay aceptación/rechazo, precio interno ni carga de propuesta en 16A; las relaciones permiten una extensión futura independiente.

## AA. Security

- Resolución tenant/case/assignment/contact-first y owner-first para V.
- User, Membership y Tenant se revalidan en cada operación interna.
- `deniedPermissions` prevalece y A/V no reciben permisos por rol baseline.
- Payloads cerrados y hashes recalculados server-side.
- Same-origin, `private, no-store`, `Vary: Authorization, Origin`, sin CORS permisivo.
- Gate antes de contexto, auth, body o Prisma cuando está desactivado.
- Token fuera de query, logs, DB, cookies y storage.
- El Portal se resuelve antes de `SessionApp` y no monta shell, Hub ni navegación interna.

## AB. Rate limit

Token, scopes, código y acciones usan buckets locales por acceso/operación; el código añade contador y bloqueo persistentes. La futura Preview 16B deberá mantener el gate exacto y, antes de escala multi-instancia, sustituir el bucket local por una autoridad distribuida sin debilitar los límites de base.

## AC. Auditoría

Se auditan creación, revocación, uso, confirmación, cambio, cancelación, upload, Mini guardada/completada y QR. Los eventos no almacenan token. Las mutaciones críticas registran comando idempotente y resultado sanitizado.

## AD. Permisos

Se añadieron `client-access:view`, `client-access:create`, `client-access:revoke` y `client-access:manage`. Son exclusivamente grants explícitos; `permsForRole("A"|"V")` concede cero de estos permisos por baseline y los denies siguen dominando.

## AE. Browser

Playwright pasó 12/12 con un worker, cero retries, contextos aislados y Service Worker bloqueado:

- Chromium desktop/móvil.
- Firefox desktop/móvil.
- WebKit desktop/móvil.
- Flujo válido: visita, confirmación, cambio, Mini, foto y QR.
- Flujo indiscriminado: inválido/expirado/revocado sin contexto revelado.
- Cero cookies, storage, `pageerror` y montaje del ERP.

## AF. PostgreSQL

- PostgreSQL 18 local aislado.
- Vacío: 35/35.
- 35→34 mediante rollback focal, reaplicación 34→35 y 35/35 final.
- Segundo `migrate deploy`: cero pendientes.
- `migrate status`: base actualizada.
- Drift DB contra schema: vacío usando datasource canónico con `schema=osi`.
- Prueba DB: 20 comprobaciones, incluido token hash-only, código, revocación, upload, Mini, QR, tenant isolation y carreras de creación/visita.

## AG. Guards

- Guardia 16A: positiva y 15 negativas.
- CORS: inventario 159/159; 132 rutas same-origin protegidas, 2 públicas deliberadas y 25 legacy cerradas; negativas 31/31.
- Guardias 01A–15B relevantes: 19/19. Las tres guardias históricas que fijaban literalmente 34 migraciones ahora aceptan únicamente 34 o la extensión exacta y nombrada de 16A; sus negativas continúan rechazando una migración genérica inesperada.
- Bloqueos cubiertos: token plano, shell ERP, scope ausente, PK/tenant cruzado, transporte externo, Quote, activación Vercel/Production y migración distinta de 35.

## AH. Feature flags

- Backend: `CLIENT_TEMPORARY_ACCESS_API_MODE=LOCAL_ONLY` sólo en loopback real y sin ninguna variable `VERCEL*`.
- Frontend: `VITE_CLIENT_TEMPORARY_ACCESS_MODE=LOCAL_ONLY` sólo en hostname loopback.
- Ausente, desconocido, whitespace, casing distinto, Vercel o no-loopback: fail-closed.
- `productionApiEnabled=false` permanece literal.
- No existe `PREVIEW_REHEARSAL` en 16A.

## AI. Riesgos

1. El rate limit de proceso debe convertirse en autoridad distribuida antes de escalar el Preview a múltiples instancias.
2. Virus scanning de documentos está deliberadamente pendiente.
3. Fotografía corporativa y videollamada no se publican porque no existe contrato autorizado.
4. La preparación automática de Communications requiere una plantilla publicada y decisión explícita; 16A sólo permite vincular PREPARED.
5. No existe recuperación del token: es intencionalmente one-time; después de reload se requiere el enlace original o el código corto de consulta.

## AJ. Diff

El diff incluye:

- Schema/migración 35 y dominio HTTP/API del acceso temporal.
- UI externa, panel interno de generación/revocación y QR.
- Integración mínima en Comercial/Scheduling y consumo no verificado en Survey.
- Permisos explícitos, inventario CORS y guards.
- Pruebas contractuales, HTTP, DB, browser, rollback y typecheck focal.
- No modifica ICP, Costing, Quote, Services, Logistics, Materials, Tools ni políticas de Personal.

## AK. Worktree

La implementación se entrega mediante commits locales trazables, sin archivos de credenciales, datos de prueba persistentes, push ni cambios externos. `git diff --check`, build, typecheck focal y ESLint focal quedan verdes.

## AL. Siguiente Preview

El único siguiente lote permitido es `V17-CLIENT-PORTAL-PREVIEW-16B`: gate `PREVIEW_REHEARSAL` fail-closed, migración 35 en la base aislada autorizada, fixtures sintéticos mínimos y revisión visual remota. No iniciar Vehicle/Flota, Ingeniería, aceptación Quote ni transportes externos.
