# V17-CRM-ICP-05B1 — API aislada del ICP v2

## Estado y límites

Este lote se apila sobre `V17-CRM-ICP-05A1` y publica únicamente API de servidor, contrato, pruebas y guardias. No modifica UI, Production, Vercel, Neon, aliases, variables remotas ni datos. `CRM_ICP_V2_CONTRACT.productionApiEnabled` permanece en `false`.

El runtime nuevo usa `CRM_ICP_V2_API_MODE` y falla cerrado:

- ausente o `DISABLED`: ninguna ruta autentica, lee body o accede a Prisma;
- `LOCAL_ONLY`: exige ambos sockets loopback reales y rechaza cualquier señal Vercel;
- `PREVIEW_REHEARSAL`: exige Vercel Preview, rama `feature/v17-crm-icp-api-05b1`, batch `V17-CRM-ICP-05B1-PREVIEW`, lectura y mutaciones CRM históricas desactivadas y mutación comercial desactivada;
- Production y `main` no poseen combinación válida.

## Superficies HTTP

Todas las respuestas son `private, no-store`, varían por `Authorization` y `Origin`, no conceden CORS y validan same-origin antes de autenticación.

### `POST /api/crm/icp-v2/pipeline-cases`

Ejecuta el contrato cerrado de `normalizeCrmIcpV2CreateInput`. Recalcula `payloadHash`, deriva Tenant/User/Membership desde la sesión, revalida actor y permisos en PostgreSQL y persiste una única transacción:

`CLIENT opcional + CASE + CLIENT_ADDRESS opcional + ROUTE SNAPSHOTS + COMMAND + AUDIT`

El caso nace temporalmente con revisión 0 dentro de la transacción, recibe snapshots inmutables de revisión 1 y se promueve a contrato 2 antes del commit. Los campos de ubicación legacy reciben marcadores no autoritativos y nunca una copia de PII estructurada.

La respuesta sólo contiene `caseRef`, `clientRef`, versión, revisión y bandera de replay. Un `requestId` repetido con el mismo hash y actor retorna el mismo caso; cualquier diferencia produce conflicto.

### `POST /api/crm/icp-v2/clients/search`

La búsqueda recibe `query`, `page` y `pageSize` exclusivamente en JSON. Revalida `pipeline:view`, aplica denies, fija Tenant desde la sesión y devuelve sólo referencia pública, nombre, tipo, estado e indicios enmascarados. No expone IDs internos, Tenant ni PII completa.

### `GET /api/crm/icp-v2/pipeline-cases/:caseRef`

Devuelve el caso ICP v2 y su revisión de ruta vigente. A puede leer el Tenant; V sólo puede leer casos cuyo owner completo sea su Membership/User. No usa textos legacy como fallback.

## Autoridades

- Crear exige el grant explícito `pipeline:create`; no se obtiene por rol baseline.
- Permitir destino `PENDING` exige además el grant explícito y negable `pipeline:create:pending-destination`.
- Buscar y leer exige `pipeline:view`, con `deniedPermissions` prevaleciendo.
- Una `CLIENT_ADDRESS` seleccionada debe pertenecer al Client enlazado, al mismo Tenant y estar activa.
- El código del Client inline procede únicamente de `osi.next_icp_client_code()`.

Una coincidencia exacta de RNC o teléfono+correo bloquea el Client inline. Una coincidencia parcial devuelve sólo un fingerprint SHA-256 opaco; el retry debe incluir la confirmación exacta y queda auditado sin copiar PII.

## Fuera de alcance

Este lote no actualiza casos ni crea revisiones 2+, no cambia las rutas CRM históricas, no añade consumidores frontend, no activa el runtime remoto y no aplica la migración 22 a Production. La edición de ruta será un lote posterior sobre el contrato de versión ya publicado.
