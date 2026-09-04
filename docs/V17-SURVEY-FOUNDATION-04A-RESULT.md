# V17-SURVEY-FOUNDATION-04A — Resultado local

## A. Resumen ejecutivo

Se implementó localmente una fundación Survey tenant-first: agenda/asignación, borrador persistente, inventario móvil, accesos, evidencia, firma, publicación inmutable y PDF privado. Production continúa apagada y no se consultó infraestructura externa.

## B. Rama/base/HEAD

- Rama: `feature/v17-survey-foundation`.
- Base exacta: `38603e985085277d408e17b62f3180c0d17472fc`.
- HEAD final: se registra en el informe de cierre tras los commits locales.

## C. Archivos recuperados de PR #79

Se revisaron completos `SurveyWorkflowPanels.tsx`, `SurveyVisualPreview.tsx`, `SurveyPdf.ts`, su contrato, client mode, pruebas Playwright y guardia. Se conservaron agenda rica, llegada/puntualidad separadas, inventario por área, búsqueda progresiva, controles táctiles, flags, medidas, accesos separados, revisión A4, firma y PDF. No se copió el store ni la autoridad de datos del Preview.

## D. Elementos V17 históricos recuperados

- **CONSERVAR/ADAPTAR:** catálogo de artículos/áreas, conceptos de visita, ítem, media, firma y acceso.
- **LEGACY:** `Survey`, `SurveyRoom`, `SurveyItem`, `SurveyMedia`, `SurveySignature`, `SurveySiteAccess`, `CaseSurvey`, `EvaluatorArticleCatalogSnapshot`, `EvaluatorVisitReport` y migraciones archivadas de 2026-02/07.
- **DESCARTAR como autoridad:** base64/canvas en local storage, mocks de inventario, JSON global y relaciones sin tenant.
- No hubo backfill automático.

## E. Modelo Prisma

Se añadieron 15 modelos Survey y 14 enums, todos tenant-scoped, con UUID públicos, FKs compuestas, estados, índices, snapshots y relaciones a PipelineCase, revisión de Servicios y TenantMembership. Las autoridades históricas no se modificaron.

## F. Migración

- Nueva migración aditiva: `20260905010000_v17_survey_foundation`.
- SHA-256 binario LF: `faeb0dee08b667b1ba042ab1756e683b4fb832fb47789e01c5d8be220694dde1`.
- 39,913 bytes, LF, sin BOM.
- No modifica ni reescribe migraciones 1–23.

## G. Assignment

La creación resuelve `caseRef`, `serviceSelectionRef` y `evaluatorMembershipRef` tenant-first. Fija ruta y selección de Servicios, guarda contexto histórico permitido y valida el evaluador completo. Crear/cancelar es idempotente y auditado.

## H. Agenda

Orden cronológico, próxima visita, advertencia de visita distante, contexto, instrucciones y acciones separadas “Llegué”, “Llegué a la hora acordada” e “Iniciar/Continuar Survey”. El evaluador sólo recibe sus asignaciones; manage habilita alcance tenant-wide.

## I. Draft/autosave

El borrador vive en PostgreSQL y cada acción se confirma en servidor antes de reflejarse. Versionado optimista e idempotencia evitan doble creación/sobrescritura. Reload recupera estado. No existe una cola offline; queda documentada como evolución posterior.

## J. Catálogo de artículos

Catálogo tenant-first por versiones DRAFT/ACTIVE/RETIRED. Artículos, aliases, áreas frecuentes, volumen/peso base y referencias estables quedan congelados por snapshot al observar/publicar.

## K. Inventario

UI mobile-first por área, modo persistente, búsqueda, frecuentes, cantidad 1..999, −/+, Próximo, foco restaurado, listado por área, edición y eliminación confirmada. El servidor repite todos los límites.

## L. Condiciones

`GOOD`, `USED`, `DAMAGED`, `PRE_EXISTING_DAMAGE`; facilidades/inconvenientes tienen catálogo versionado. Daño bloquea READY/PUBLISH sin foto DAMAGE.

## M. Medidas

CM e IN conservan entrada original y normalización exacta a centímetros. Volumen y peso publicados incluyen fuente y total derivado.

## N. Fotografías

Metadata y binario están separados. Cada foto pertenece a ítem, daño, acceso, condición especial o evidencia general. MIME/tamaño/hash/contexto se validan; upload y retry son idempotentes. No existen URLs públicas ni base64 en DB.

## O. Accesos

ORIGIN y DESTINATION se guardan por separado con pisos, escaleras, elevadores, distancia, restricciones, notas y fotos.

## P. Facilidades/inconvenientes

El catálogo mínimo versiona ambas categorías y el borrador persiste flags estructurados. No se añadió geocoding, reglas zonales ni cálculo de recursos.

## Q. Firma

Canvas accesible, trazos normalizados, nombre, relación y timestamp. Se genera SVG privado y la firma se dibuja en el PDF.

## R. Publicación

Sólo una CURRENT por caso/tenant; la anterior pasa a SUPERSEDED. Ítems, accesos y firma son append-only. Los checksums lógico y PDF identifican la versión exacta.

## S. PDF

PDF privado paginado, métricas SI/imperiales, inventario, accesos, evidencias, declaración y firma. Endpoint GET/HEAD autenticado; sin precio, costo, margen, notas internas o PK.

## T. AuthorizationContext

Las rutas resuelven el contexto LEGACY canónico y el dominio revalida User, Membership y Tenant en cada transacción. No acepta tenant/actor/rol desde body o headers alternos.

## U. Permisos

Se registraron cinco permisos explícitos Survey. Ningún rol baseline los obtiene automáticamente y `deniedPermissions` prevalece.

## V. Auditoría

Asignación, llegada, puntualidad, inicio, cambios de borrador, fotos, cancelación, firma, PDF, publicación y supersede producen comando/auditoría sanitizados. Fotos y firma completas nunca entran al audit payload.

## W. ICP integration

Consume PipelineCase por `caseRef` y su versión de ruta estructurada. Guarda snapshot histórico; no duplica Client/CRM y no usa textos legacy de origen/destino como autoridad.

## X. Services integration

Assignment, draft y publication apuntan a la revisión exacta de Servicios y publican su `serviceSelectionRef`; cambios futuros del catálogo no alteran el Survey.

## Y. Material recipe provisional contract

Sólo se publica el hecho “materiales derivados: en integración”. No hay selector, tabla de recetas ni persistencia de materiales. Materiales/Inventario será la autoridad del siguiente lote.

## Z. Tests

Contrato: 21 aserciones. Dominio PostgreSQL: 31 aserciones. Guardias: 17 positivas y 14 negativas. Cubren idempotencia y creación concurrente, scopes, deny, catálogo, métricas, daño/foto, acceso, firma, publicación, PDF, inmutabilidad, aislamiento tenant, identidades obsoletas y DTO.

## AA. PostgreSQL

PostgreSQL 18 local desde vacío: 24/24. Rollback 24→23: completo; replay 23→24: completo; segundo deploy: cero pendientes; `migrate status`: al día; drift: `-- This is an empty migration.`

## AB. Storage

Memory/local probados para put/get/remove, MIME inválido, confinamiento y checksum. Tres objetos exactos por flujo publicado con una foto: foto, firma y PDF. Production no tiene provider configurado ni habilitado.

## AC. Browsers

Playwright: 12/12, un worker y cero retries: Chromium, Firefox y WebKit en desktop/móvil. Incluye flujo completo y deny previo al lazy load con cero requests Survey/chunk.

## AD. Guards

La guardia bloquea blobs inline, mutabilidad, falta de tenant/owner scope, pérdida de foto requerida, falta de idempotencia/auditoría, `clientName` legacy, activación Production, packing manual, campos PDF privados, carga lazy no gated y grants implícitos. Inventario CORS: 70/70, 43 rutas privadas.

## AE. Feature flags/runtime consumers

`productionApiEnabled=false`. API/UI aceptan sólo LOCAL_ONLY o Preview exacto; ausente/desconocido queda DISABLED. Un único consumidor runtime lazy (`SurveyApp`), efectivo únicamente tras autorización del shell y compuerta válida.

## AF. Riesgos pendientes

- El provider definitivo de blobs y su política de retención requieren lote/deployment aislado.
- Offline complejo, reasignación y delivery CRM quedan pendientes.
- Empresa, Lead Account, Booker y preferencias sólo aparecerán cuando exista contrato publicado; no se infirieron.
- Las reglas de escaleras/elevadores permanecen hechos, sin impacto logístico.
- No existe aún autoridad de recetas, stock o reservas.

## AG. Diff summary

Esquema/migración, dominio/API/storage/PDF, Survey App, registro RBAC/Hub, guardias/CI, pruebas y estos dos documentos. Sin Costing, Cotización, Motor Logístico, WMS, Auth V2 o datos Production.

## AH. Worktree

El estado final limpio y el HEAD se registran en el cierre después de los commits locales. No hubo push, PR ni acceso externo.

## AI. Propuesta del siguiente lote

`Materiales / Inventario`: catálogo único de consumibles/herramientas/equipos, recetas versionadas artículo→material, stock por almacén, disponibilidad, reservas y costos. Debe consumir Survey publicado sin duplicar catálogos ni modificar hechos históricos. No se implementó en 04A.
