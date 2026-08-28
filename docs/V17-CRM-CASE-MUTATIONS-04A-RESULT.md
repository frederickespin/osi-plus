# V17-CRM-CASE-MUTATIONS-04A — Resultado local

## Identidad y alcance

- Base: `3e632d173f3863b4ebde97fe586d4d0a371873a8`.
- Rama: `feature/v17-crm-case-mutations`.
- Flujo implementado: Inbox → Nuevo Caso → Ficha → Editar → Guardar.
- Compuerta de mutación: `CRM_PIPELINE_MUTATION_MODE=LOCAL_ONLY`; falla cerrada fuera de loopback y ante cualquier entorno Vercel.
- Production, Neon y Vercel no fueron consultados ni modificados.
- Survey y Cotización continúan `En integración`.

## Contratos implementados

### Crear caso

`POST /api/crm/pipeline-cases`

Payload cerrado: `requestId`, `payloadHash`, `clientRef`, `mode`, `serviceType`, `customerType`, `estimatedCbm`, `requiresSurvey`, `surveyMethod`, `originLocation`, `destinationLocation` y `destinationContracted`.

El servidor genera `caseCode`, fija `NEW_INBOX`, resuelve Client por `(tenantId, publicRef)` y permite `clientRef=null`. Un Administrador puede crear sin owner; un vendedor crea con su Membership y User como owner completo.

### Editar caso

`PATCH /api/crm/pipeline-cases/:caseRef`

Acepta el mismo conjunto de campos básicos más `expectedVersion`. `caseRef` debe ser UUID v4 canónico. La resolución es tenant-first y la concurrencia optimista devuelve un conflicto estable. No se aceptan PK, tenant, owner, Client interno, status ni versión arbitraria.

### Selector de Client

`GET /api/crm/client-options`

Lista tenant-first con búsqueda y paginación server-side. El DTO cerrado contiene únicamente `clientRef`, `displayName`, `type` y `status`.

## Permisos

- `pipeline:create`: crear casos.
- `pipeline:update:own`: editar únicamente casos con owner Membership y User coincidentes con la sesión.
- `pipeline:update:any`: editar cualquier caso dentro del tenant.
- Ningún rol baseline concede estos permisos automáticamente.
- `deniedPermissions` prevalece en backend y presentación.

## Persistencia e idempotencia

La migración `20260824010000_v17_client_public_ref_case_mutations` agrega `Client.publicRef` UUID tenant-first, `NOT NULL`, con default PostgreSQL e inmutabilidad. El backfill es exclusivamente técnico. También hace `PipelineCase.caseCode` tenant-first y habilita comandos gobernados `CREATE` y `UPDATE`.

Cada mutación confirma en una sola transacción el caso, `PipelineCaseCommand` y `CommercialAuditLog`. El mismo `requestId` y payload reproduce el resultado; el mismo request con payload distinto falla. Los GET no escriben.

SHA-256 de `migration.sql`: `dbb093f15eb2ee708328518dcf19e52fd8b0623fbc893cec1a001cf819a6da70`.

## Validación local

- PostgreSQL 18 desde vacío: 19/19 migraciones.
- Segundo deploy: sin pendientes; status y drift: correctos/vacío.
- Rollback controlado a 18 y reaplicación a 19: aprobados.
- Backfill técnico: 51/51 UUID v4 no nulos y únicos; fingerprint empresarial antes/después idéntico (`1841944aeb2386b37c09b1bb9ed33bd8`).
- HTTP: 16/16.
- Dominio transaccional: 25/25.
- Guardias específicas: 14/14; guardias heredadas afectadas: verdes.
- Navegadores comerciales: 102/102, cero omitidas, Chromium/Firefox/WebKit desktop y móvil.
- Build, TypeScript, ESLint focalizado y `git diff --check`: verdes.
- Consulta tenant-first medida en PostgreSQL local: 0.014 ms en el fixture de rendimiento.

## Evidencia visual

- [Nuevo Caso — desktop](evidence/V17-CRM-CASE-MUTATIONS-04A/nuevo-caso-chromium-desktop.png)
- [Nuevo Caso — móvil](evidence/V17-CRM-CASE-MUTATIONS-04A/nuevo-caso-chromium-mobile.png)
- [Editar Ficha — desktop](evidence/V17-CRM-CASE-MUTATIONS-04A/editar-ficha-chromium-desktop.png)
- [Editar Ficha — móvil](evidence/V17-CRM-CASE-MUTATIONS-04A/editar-ficha-chromium-mobile.png)

## Brechas deliberadas

- Crear Client desde el flujo comercial.
- Transiciones, asignación/desasignación y catálogo de owners.
- Survey, Cotización y demás verticales coordinados.
- Ensayo Neon, adopción de la migración 19, Preview funcional y activación productiva.
- `CRM_PIPELINE_MUTATION_MODE` no posee modo Preview ni Production en este lote.
