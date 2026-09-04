# V17-SURVEY-FOUNDATION-04A — Contrato canónico

## Alcance y autoridad

Survey registra hechos observados después del ICP y de una selección publicada de Servicios. No es autoridad de Client, PipelineCase, catálogo de Servicios, materiales físicos, Costing, Cotización ni Motor Logístico. La cadena es `PipelineCase.publicRef` → revisión exacta de Servicios → asignación → borrador → publicación inmutable.

Las tablas históricas `Survey*`, `CaseSurvey`, `EvaluatorArticleCatalogSnapshot` y `EvaluatorVisitReport` permanecen legacy, sin backfill ni consumidores nuevos. La nueva autoridad está completamente tenant-scoped y se crea mediante la migración aditiva `20260905010000_v17_survey_foundation`.

## Entidades y referencias

- `SurveyCatalogVersion`: versión DRAFT/ACTIVE/RETIRED del catálogo del tenant.
- `SurveyArticleCatalogItem`, `SurveyAreaCatalogItem`, `SurveyConditionCatalogItem`: entradas versionadas con referencias UUID estables entre versiones.
- `SurveyAssignment`: caso, revisión de Servicios, versión de ruta, evaluador completo `(tenant, membership, user)`, agenda y snapshots históricos.
- `SurveyDraft`: trabajo mutable server-side con versión optimista.
- `SurveyDraftItem`: observación de artículo con snapshots de artículo/área, condición, modo, cantidad, indicadores y métricas.
- `SurveyAccessObservation`: hechos separados de ORIGIN y DESTINATION.
- `SurveyBlobObject`: descriptor privado de un objeto; nunca contiene el blob ni una URL pública.
- `SurveyPhoto`: vínculo contextual de foto con ítem, acceso o evidencia general.
- `SurveyPublication`, `SurveyPublicationItem`, `SurveyPublicationAccess`, `SurveyPublicationSignature`: resultado normalizado e inmutable.
- `SurveyMutationCommand`: idempotencia tenant-first por `requestId` y `payloadHash` canónico.

Las referencias publicadas son UUID v4: `assignmentRef`, `surveyRef`, `publicationRef`, `articleRef`, `areaRef`, `conditionRef`, `itemRef`, `accessRef`, `photoRef` y `signatureRef`. Ningún DTO publica PK Prisma, tenantId, userId, membershipId, clientId o blobObjectId.

## Lifecycle

La asignación recorre `ASSIGNED → ARRIVED → IN_PROGRESS → COMPLETED`; puede terminar en `CANCELLED`. Llegada y confirmación de puntualidad son eventos independientes. El borrador recorre `IN_PROGRESS → READY_FOR_REVIEW → PUBLISHED`. Una nueva evaluación crea otra revisión; una nueva publicación pasa la vigente anterior a `SUPERSEDED`. Sólo puede existir una publicación `CURRENT` por caso y tenant.

Los triggers bloquean cambios de identidad pública, catálogo activado, hechos publicados, firma y objetos de publicación. El PDF y la firma son objetos vinculados a una publicación concreta.

## Autorización

Todas las operaciones parten del `AuthorizationContext` LEGACY revalidado contra User, TenantMembership y Tenant activos. El servidor ignora identidad, rol y tenant enviados por el cliente. Los denies prevalecen.

Permisos explícitos, excluidos de los grants baseline de A:

- `survey:assignment:view`: agenda propia.
- `survey:assignment:manage`: agenda tenant-wide, catálogo y asignación/cancelación.
- `survey:perform`: llegada, puntualidad, inicio, borrador, acceso y fotos propios.
- `survey:publish`: firma y publicación de un Survey autorizado.
- `survey:read`: consulta de publicación y PDF.

El evaluador se selecciona sólo mediante `TenantMembership.publicRef`; el servidor vuelve a comprobar membership, user, tenant, permiso y estado. El own-scope exige simultáneamente membership y user del evaluador.

## APIs privadas

Todas son same-origin, `private, no-store`, `Vary: Authorization, Origin`, sin wildcard CORS y gated antes de auth/body/Prisma.

- `GET|POST /api/crm/survey/catalog`
- `GET|POST /api/crm/survey/assignments`
- `PATCH /api/crm/survey/assignments/:assignmentRef`
- `GET|PATCH /api/crm/survey/drafts/:surveyRef`
- `POST /api/crm/survey/drafts/:surveyRef/photos`
- `POST /api/crm/survey/drafts/:surveyRef/publish`
- `GET /api/crm/survey/publications/:publicationRef`
- `GET|HEAD /api/crm/survey/publications/:publicationRef/pdf`

Los cuerpos JSON son cerrados. Las mutaciones llevan `requestId`, `payloadHash` recalculado en servidor y versiones esperadas. Las fotos llevan la misma identidad idempotente en headers, más hash SHA-256 y tamaño recalculados del binario.

## Catálogo, inventario y métricas

Cada borrador fija una versión de catálogo. Los renombres posteriores no modifican un Survey histórico. Las áreas son configurables. Los modos conservados son `LOCAL`, `ROAD`, `AIR`, `SEA` y `STORAGE`; clasifican la observación para consumidores posteriores y no calculan logística.

Cantidad es entera `1..999`. Condiciones mínimas: `GOOD`, `USED`, `DAMAGED`, `PRE_EXISTING_DAMAGE`. Las dos condiciones de daño exigen foto contextual antes de READY/PUBLISH. Indicadores: crating, frágil, armar, desarmar, grúa candidata, valioso y sobredimensionado.

Las medidas conservan unidad/valores originales CM o IN y normalizan a centímetros. El volumen unitario proviene de medidas observadas o, si faltan, de la versión del catálogo; el peso base proviene del catálogo y conserva fuente. El total publicado siempre deriva de los ítems, nunca del ICP ni de un total libre.

## Accesos y fotos

Origen y destino son registros independientes y admiten pisos, escaleras, elevador, distancia de parqueo, flags estructurados, notas y fotos. Survey registra el hecho; no calcula recursos, precio ni grúa.

El adaptador de blobs separa metadata DB de bytes y admite implementaciones MEMORY/LOCAL para pruebas. MIME permitido: JPEG, PNG, WEBP, SVG y PDF; máximo 12 MiB. La ruta local usa scopes no reversibles por tenant, claves aleatorias, rutas confinadas y archivos `0600`. No existe bucket o credencial Production en este lote.

## Revisión, firma y PDF

La revisión muestra inventario agrupado por área, métricas, accesos, flags y el estado provisional de materiales. El evaluador nunca selecciona packing. La firma dibujada se normaliza, guarda como SVG privado y se incorpora vectorialmente al PDF. Publicación, firma, PDF, checksum lógico y checksum binario se crean en una transacción; los objetos se eliminan si la transacción falla.

El PDF es paginado, incluye contexto permitido, servicios, ruta, inventario, condiciones, evidencias por conteo, métricas SI/imperiales, declaración, evaluador y firma. Excluye precios, costos, márgenes, notas internas, secretos e IDs internos. La descarga exige sesión y permiso; no usa URL pública.

## Compuertas y operación offline

API: `DISABLED`, `LOCAL_ONLY`, `PREVIEW_REHEARSAL`. UI: los mismos modos. Ausente/desconocido falla cerrado. LOCAL_ONLY exige loopback real y ausencia total de `VERCEL*`. PREVIEW_REHEARSAL exige Preview, rama y batch exactos, Auth LEGACY y tenancy fija. No existe modo Production.

Cada acción confirma en servidor y recarga el borrador. Los reintentos conservan idempotencia y los conflictos de versión son visibles; recargar recupera el borrador server-side. No se implementa cola offline ni localStorage empresarial. Un futuro lote puede añadir cache efímero cifrado y sincronización, sin cambiar la autoridad server-side.

## Integraciones futuras

Materiales 05A consumirá artículos, cantidades, métricas, flags y accesos publicados para aplicar recetas versionadas. El texto “Materiales derivados: en integración” no representa una receta ni una selección persistida. Costing, Cotización, WMS, Taller y Motor Logístico sólo podrán consumir publicaciones CURRENT sin reescribirlas. La entrega al cliente requerirá después un evento CRM auditado; no se envían correos en 04A.
