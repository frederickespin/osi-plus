# V17-COMMERCIAL-CRM-PREVIEW-01B — Auditoría adversarial

## Identidades

- Base: `de5e8460c5da4e7f1c1fe42836b7ab488f67dd42`
- HEAD inicial: `b468cd4e287cde73acd349d59c1cc9005b9d534d`
- Rama: `feature/v17-commercial-crm-preview`
- Migraciones: 17; no existe migración 18.

## Inventario inicial (27 archivos)

| Clasificación | Archivos |
|---|---|
| Runtime backend | `api/_lib/commercialTenancyWrite.js`, `api/_lib/crmPipelineAccess.js`, `api/_lib/crmPipelineReadHttp.js`, `api/_lib/http.js`, `api/_lib/v17CommercialCrmPreviewAuth.js`, `api/auth/me.js` |
| Runtime frontend | `src/App.tsx`, `src/components/auth/LoginScreen.tsx`, `src/crm-relational/clientMode.ts`, `src/hub/HubWorkspace.tsx`, `src/hub/hubMode.ts`, `src/lib/api.ts`, `src/lib/sessionStore.ts`, `src/v17-preview-env.d.ts`, `vite.config.ts` |
| Resolver compartido | `shared/v17CommercialCrmPreview.js`, `shared/v17CommercialCrmPreview.d.ts` |
| Pruebas | `playwright.v17-commercial-crm-preview.config.ts`, `scripts/v17-commercial-crm-preview-test.mjs`, `tests/v17-commercial-crm-preview/preview-rehearsal.spec.ts`, `tests/v17-hub/mode-harness.ts` |
| Guardias | `scripts/validate-v17-commercial-crm-preview-guard.mjs`, `scripts/validate-v17-commercial-crm-guard.mjs`, `scripts/validate-v17-hub-guard.mjs` |
| Scripts/CI | `package.json`, `tsconfig.crm-01b3b2.json`, `tsconfig.v17-commercial-crm.json` |
| Documentación | Ninguna en el HEAD inicial. |

No se identificaron cambios ajenos al Preview CRM.

## Matriz efectiva

| Entorno/configuración | Resultado |
|---|---|
| Production sin variables | Hub, cliente, lectura y mutación `DISABLED`. |
| Production con cualquier modo Preview | `503 CRM_PIPELINE_CONFIGURATION_INVALID` antes de auth, body o Prisma. |
| Preview exacto completo | Hub/cliente y lecturas de lista, detalle y resumen permitidos. |
| Preview parcial, alterado o con representación no exacta | `503 CRM_PIPELINE_CONFIGURATION_INVALID` antes de auth, body o Prisma. |
| Mutaciones y owner options | Siempre `409 CRM_PIPELINE_MUTATIONS_DISABLED`. |
| Loopback exacto | Conserva `LOCAL_ONLY/READ_ONLY`; mutación desactivada. |
| Variables ausentes | Todo inactivo. |

El resolver compartido es puro y no lee `process.env`, `import.meta.env`, query,
headers o storage. El backend le entrega únicamente variables servidor; el
frontend le entrega únicamente las variables públicas autorizadas. El batch
servidor `CRM_PIPELINE_ACTIVATION_BATCH` no se empaqueta ni es autoridad del
frontend. El frontend exige, además, el acuse revalidado por `/api/auth/me`.

## Correcciones de la auditoría

- Las 24 pruebas browser quedaron obligatorias en `browser-session-validation`
  mediante seis proyectos y un reporter que exige 24/24 y cero omitidas.
- Las lecturas CRM aceptan exclusivamente `GET`, `HEAD` y `OPTIONS` después de
  la compuerta; un `Origin` presente debe coincidir exactamente con el origen
  del deployment. Un origen externo falla antes de autenticación y Prisma.
- Se añadió una prueba sobre servidor HTTP real para lista, detalle, resumen,
  mutación, owner options, login LEGACY y `/api/auth/me`.
- No se modificaron rutas ni contratos de mutación.

## Seguridad HTTP CRM

Lista, detalle y resumen conservan `Cache-Control: private, no-store`, `Vary:
Authorization, Origin`, no emiten wildcard ni credenciales CORS y no crean
cookies. Un Bearer inválido responde 401. Una búsqueda cross-tenant responde el
mismo 404 sanitizado que un recurso inexistente. Mutaciones y owner options
responden 409 antes de auth, body, origen o Prisma.

## Bloqueo Auth LEGACY para Q2

La auditoría del servidor HTTP real confirma un defecto heredado fuera del
alcance de este PR:

- `/api/auth/login` y `/api/auth/me` pasan por el CORS global con
  `Access-Control-Allow-Origin: *`;
- no fijan `Cache-Control: private, no-store`.

No se corrigió aquí para evitar ampliar el PR. Este hallazgo bloquea configurar
un Preview autenticado público: antes de Q2 debe existir un hotfix separado que
restrinja Auth LEGACY al origen exacto, elimine el wildcard y aplique cache
privado/no-store sin alterar el contrato de autenticación.

## Estado de publicación

El Preview del Draft PR debe permanecer con variables ausentes: Hub, cliente e
Inbox inactivos, API CRM en 409, sin datos ni credenciales. Ningún Preview
autenticado público queda autorizado por este cambio.
