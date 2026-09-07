# V17-COMMUNICATIONS-TEMPLATES-13A — Resultado

## A. Resumen

Se consolidó localmente una autoridad tenant-first para plantillas versionadas y comunicaciones preparadas. El render ocurre en servidor, los destinatarios son explícitos, cada mensaje conserva un snapshot inmutable y el transporte permanece desactivado. No se recuperaron stores ni webhooks históricos.

## B. Rama/base/HEAD

- Rama: `feature/v17-consolidated-preview`.
- Base aprobada: `6db44a9400bc09b81c587f74cdc10126c730b472`.
- HEAD inicial verificado: la base aprobada.
- HEAD final: se registra en el cierre local tras los commits de 13A.

## C. Código histórico recuperado

Se auditó `modern-baseline-20260814@61a3e8a4525efedfc99120fb5e4845ba45234ba1`. Se conservaron la taxonomía comercial, el catálogo compacto, el editor/preview, los hitos de Quote y los escenarios PIC. Se rechazaron persistencia local, selección ambigua de destinatarios, `tenantId` aportado por cliente y transportes/webhooks históricos.

## D. Modelo Prisma

Se añadieron `CommunicationTemplate`, `CommunicationTemplateVersion`, `CommunicationRecord`, `CommunicationCommand` y `CommunicationAuditEvent`, con relaciones compuestas tenant-first hacia Tenant, Membership/User actor, PipelineCase, SurveyAssignment y QuoteProposalRevision. Las referencias públicas son UUID; las PK nunca forman parte del DTO.

## E. Migración

La migración 32 es `20260913010000_v17_communications_templates` (16,336 bytes; SHA-256 `26b7c3552f067c737e651d0e95a5188a6b4641b512df6331136caf5bf1637320`; LF; sin BOM). Es aditiva, no modifica migraciones 1–31 ni hace backfill empresarial. Incluye enums, FK compuestas, índices, unicidad de código por tenant, una sola versión draft, constraints temporales/hash y triggers de inmutabilidad/append-only. El rollback SQL está en `scripts/v17-communications-rollback.sql` y el ejecutor local fail-closed en `scripts/v17-communications-rollback.mjs`.

## F. Templates

El catálogo usa código estable, nombre, categoría, estado y tenant. No usa el nombre visible como identidad. Las categorías recuperadas cubren visita, evaluador, PIC, solicitudes de información/documentos, Quote y relaciones comerciales.

## G. Versiones

Las versiones tienen estado `DRAFT`, `PUBLISHED` o `INACTIVE`, vigencia y hash de contenido. Sólo un draft puede editarse; una publicada no puede mutarse. Cambiar una publicada exige una versión nueva.

## H. Variables

Existe catálogo v1 tipado con 14 variables, fuente, tipo, indicador PII, contextos y fallback. El parser rechaza placeholders no declarados, arbitrarios o triples.

## I. Audiencias

Se soportan Client, Booker, Lead Account, Agent, Evaluator, Sales, Coordinator, Payer, Approver, Referral e Internal Team. Un destinatario sólo aparece si existe una relación explícita y tenant-first.

## J. Canales

El modelo reconoce Email, WhatsApp, Portal, Internal y SMS. Ninguno posee transporte activo en 13A; Portal se rechaza como canal de preparación hasta tener autoridad propia.

## K. Render

El servidor valida la plantilla publicada, resuelve el contexto autorizado y realiza la interpolación. El frontend sólo solicita preview sintético o preparación; nunca es autoridad de contenido resuelto.

## L. CommunicationRecord

Guarda referencia pública, versión exacta, caso, assignment/revisión Quote opcionales, hito, canal, destinatario, contenido renderizado, variables/contexto, hash, actor y timestamps. El destino completo queda únicamente en el snapshot necesario; el DTO devuelve destino enmascarado.

## M. Estados

Se modelaron `PREPARED`, `QUEUED`, `SENT`, `DELIVERED`, `FAILED` y `CANCELLED`, con transiciones y timestamps controlados en PostgreSQL. En este lote toda creación termina exclusivamente en `PREPARED`.

## N. Scheduling

El workspace de Evaluación incorpora el panel canónico cuando hay `SurveyAssignment`; referencia el assignment exacto y permite los hitos confirmación, asignación, reprogramación y cancelación.

## O. PIC cliente

El contexto publicado admite fecha, hora, lugar, evaluador, instrucciones, tarifa de visita y referencia de caso. La preparación requiere seleccionar expresamente Client y canal disponible.

## P. PIC evaluador

El evaluador procede de Membership + User revalidados y del assignment exacto. No se admiten nombres libres como destinatario.

## Q. Reprogramación/cancelación

Son hitos nuevos que crean `CommunicationRecord` nuevos; nunca reescriben el registro anterior. La automatización temporal queda fuera de alcance.

## R. Client

El nombre empresarial procede de `PipelineCase.client` tenant-first, pero el destinatario procede exclusivamente del contacto explícito capturado en el caso (`caseContact*`). Su referencia se ancla al `caseRef`; no se reutiliza de forma ambigua cualquier teléfono/email maestro de Client. Email/teléfono se publican enmascarados en el selector.

## S. Booker

Se ofrece sólo cuando el contexto comercial publicado contiene el rol `BOOKER` con contacto explícito activo.

## T. Lead Account

Se ofrece sólo desde el rol `LEAD_ACCOUNT` publicado; no se infiere por nombre, compañía o caso.

## U. Agent

Se modela como audiencia y destinatario sólo si el contexto comercial explícito contiene `AGENT`.

## V. Quote

El panel de Cotización monta Comunicaciones sobre la `QuoteProposalRevision` activa exacta. El dominio Quote no fue modificado.

## W. Follow-up

Se recuperaron `QUOTE_SENT`, `FOLLOW_UP_1`, `FOLLOW_UP_2`, `EXPIRY_REMINDER`, `QUOTE_ACCEPTED` y `QUOTE_REJECTED`. No se añadió scheduler automático.

## X. Solicitud de información

Las categorías/hitos `CLIENT_INFORMATION_REQUEST` y `DOCUMENT_REQUEST` permiten plantillas para fotos, artículos, documentos, direcciones, medidas o faltantes sin convertir esas listas en reglas rígidas.

## Y. FIDI/documentos

Las plantillas históricas FIDI/FAIM se conservaron como referencia contextual dentro de `DOCUMENT_REQUEST`. No se copiaron reglas regulatorias ni textos hard-coded al runtime canónico.

## Z. Privacy/PII

Las variables PII están marcadas; no se registran tokens o secretos; las rutas usan body para búsquedas/preparación y no ponen PII en URL; errores son códigos cerrados; no hay logging de payloads. El HTML rechaza scripts, handlers, formularios, objetos, estilos embebidos y esquemas `javascript:`.

## AA. Editor admin

`Administración → Plantillas y Comunicaciones` ofrece catálogo compacto, creación, edición de draft, nueva versión, preview sintético, publicación e inactivación. No usa stores históricos ni almacenamiento empresarial del navegador.

## AB. UI caso

La Ficha muestra historial compacto y preparación; Evaluación muestra comunicaciones del assignment; Quote muestra comunicaciones de la revisión seleccionada. El panel deja explícito que no envía.

## AC. AuthorizationContext

Todas las rutas se resuelven mediante el contexto CRM revalidado. Los bodies no aceptan tenant, actor, rol ni PK. Los casos se consultan por `(tenantId, publicRef)` y, sin permiso tenant-wide, por owner Membership + User.

## AD. Permisos

Se añadieron `communications:templates:view`, `communications:templates:manage`, `communications:prepare`, `communications:send`, `communications:view` y `communications:tenant`. Son permisos explícitos excluidos del baseline por rol; `deniedPermissions` prevalece.

## AE. Auditoría

Crear template, crear/editar versión, publicar, inactivar y preparar generan comando idempotente y evento append-only en la misma transacción. Preview es sintético/read-only y no escribe. Enviar no está implementado.

## AF. Tests

Las suites focales cubren contrato cerrado, hash canónico, variables contextuales, HTML, destinatario explícito, UUID público, gate antes de auth/body/Prisma, CORS, deny, idempotencia concurrente, publicación simultánea, cross-tenant e inmutabilidad. Resultados: contrato 18/18, HTTP 7/7, DB 11/11 y guardias negativas 14/14.

## AG. PostgreSQL

Validado en PostgreSQL 18.2 aislado: vacío 32/32, segundo deploy sin pendientes, estado 32/32, 31→32 mediante rollback focal y reaplicación, drift vacío, cinco triggers, FK/constraints, concurrencia e inmutabilidad. No se conectó a Production.

## AH. Browsers

La matriz focal pasó 18/18 en Chromium, Firefox y WebKit, cada uno en desktop y móvil. Cubre catálogo, editor, preview sintético, panel Scheduling, panel Quote y deny previo al lazy load.

## AI. Guards

La guardia negativa bloquea activación Production, transporte, variables arbitrarias, ausencia de tenant-first/Serializable, deny debilitado, `LOCAL_ONLY` sobre Vercel, pérdida de append-only, ruta CORS ausente y dependencias de transporte. El inventario CORS clasifica 144/144 rutas, 117 protegidas.

## AJ. Histórico mapping

| Histórico | Autoridad final |
|---|---|
| `src/modules/commercial-shared/TemplateRepository.ts` | categorías, códigos y contenido migrables a Template/Version; no store estático |
| `src/modules/commercial/TemplatesHub.tsx` | catálogo/editor compacto en Administración |
| `src/lib/quoteCommunicationMilestones.ts` | enum `CommunicationMilestone` y panel por revisión Quote |
| `src/modules/sales-quote-v3/components/survey/SurveyPicCommunicationPanel.tsx` | panel Scheduling/PIC sobre Assignment |
| `src/modules/commercial-shared/NotificationTemplates.ts` | referencia de categorías de visita/FIDI/documentos, sin reglas hard-coded |
| `api/templates/**` | reemplazado por API tenant-first y DTO cerrado `/api/communications/**` |
| `api/notifications/**` | no recuperado como transporte; reemplazado por PREPARED + adaptador desactivado |
| `api/_lib/whatsapp.js`, `api/webhooks/whatsapp.js` | explícitamente legacy/no autorizado |

## AK. Feature flags

- Backend: `COMMUNICATIONS_API_MODE`, valores `DISABLED` y `LOCAL_ONLY`.
- Frontend: `VITE_COMMUNICATIONS_MODE`, valores `DISABLED` y `LOCAL_ONLY`.
- Ausente/desconocido/Vercel: cerrado. `productionApiEnabled=false`.

## AL. Riesgos

Quedan fuera: proveedor de email/WhatsApp, entrega/receipts, Portal Cliente, scheduler de follow-up, sanitizador HTML de allowlist más amplio y política para notificaciones internas. Hasta autorizarlos, el estado no supera `PREPARED`.

## AM. Diff summary

El diff añade modelo/migración 32, contrato/dominio/HTTP, diez rutas privadas, adaptador desactivado, UI admin/caso/Scheduling/Quote, permisos, CORS, pruebas, rollback y este informe. No cambia Auth V2, dominios Quote/Survey, migraciones 1–31 ni contratos productivos.

## AN. Worktree

La implementación se conserva local en el worktree consolidado. El cierre exige commits trazables y `git status` limpio; no se hace push, PR, Preview ni acceso externo.

## AO. Siguiente lote Preview

El único siguiente lote autorizado es `V17-COMMUNICATIONS-PREVIEW-13B`, para aplicar migración 32 y revisar visualmente con datos sintéticos en infraestructura aislada. No se inicia en 13A.
