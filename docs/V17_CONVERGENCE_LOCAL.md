# V17-CONVERGENCE-01 — desarrollo local soportado

## Autoridades

- La presentación y el vocabulario visual provienen del snapshot moderno local.
- Auth, `User`, `TenantMembership`, permisos, Prisma, las 16 migraciones, CRM relacional, DOMPurify y CI permanecen bajo la autoridad de `origin/main`.
- El Evaluador no tiene todavía backend canónico. Su pantalla declara `UNAVAILABLE` y nunca sustituye datos reales por mocks o `localStorage`.
- Pipeline usa únicamente `CrmPipelineApi`, `PipelineCase`, `PipelineCaseCommand`, `ownerRef`, versión e idempotencia del servidor. El adaptador moderno sólo cambia la forma visual del contrato público.

## Stack reproducible

Los secretos se cargan en la sesión de PowerShell desde un archivo local ignorado. No deben escribirse en scripts ni pasarse como argumentos.

Terminal API, desde este worktree:

```powershell
[Environment]::SetEnvironmentVariable('VITE_API_PROXY', $null, 'Process')
$env:DATABASE_URL = $env:V17_LOCAL_DATABASE_URL
$env:DIRECT_URL = $env:V17_LOCAL_DIRECT_URL
$env:MT01B_AUTH_MODE = 'LEGACY'
$env:MT01B_TENANT_SWITCH_ENABLED = 'false'
$env:CRM_PIPELINE_RUNTIME_MODE = 'DISABLED'
npx vercel dev --listen 127.0.0.1:3000
```

La eliminación explícita de `VITE_API_PROXY` en la terminal API evita que el Vite interno de `vercel dev` reenvíe `/api` de vuelta al mismo puerto.

Terminal frontend:

```powershell
$env:VITE_API_PROXY = 'http://127.0.0.1:3000'
$env:VITE_APP_ENV = 'development'
$env:VITE_CRM_PIPELINE_CLIENT_MODE = 'DISABLED'
$env:VITE_MT01B2_CLIENT_ENABLED = 'false'
npm run dev -- --host 127.0.0.1 --port 5173
```

`vite.config.ts` continúa siendo el de `main`; el frontend y la API usan puertos diferentes. No debe iniciarse `vercel dev` desde el worktree moderno histórico, porque su Vite interno también intentaría delegar `/api` al puerto 3000.

## Rutas

- `/sales/pipeline`: restaura `crm-pipeline` después del login y de una recarga. Con la compuerta CRM desactivada no renderiza ni descarga el chunk relacional y no hace solicitudes CRM.
- `/evaluator`: abre el Evaluador para roles autorizados. Hasta que exista backend, muestra un estado explícito no disponible.

## Contratos pendientes del Evaluador

1. `GET /api/evaluator/visits`
2. `GET /api/evaluator/visits/:visitId`
3. `GET /api/evaluator/catalog`
4. `PUT /api/evaluator/visits/:visitId/draft`
5. `POST /api/evaluator/visits/:visitId/submissions`

Todos requieren `Authorization: Bearer`, validación empresarial del lado servidor, respuestas `no-store`, control de versión e idempotencia en submission. No se permite autoridad mediante `x-osi-role`, `x-osi-userid`, query, body o storage del navegador.

## Alcance portado y rechazado

Portado: shell conceptual, entradas de Comercial/Evaluador/Administración/Materiales, navegación móvil del Evaluador, dominio puro de volumen/peso/acceso/riesgos y presentación explícita de indisponibilidad.

Adaptado: `/sales/pipeline` al módulo relacional existente y filas modernas al contrato público `CrmPipelineCase`.

Rechazado: `useCasesStore`, `caseBridge`, `salesStore`, `/cases`, `evaluatorVisitLocalStore`, `evaluatorVisitResolver`, `evaluatorVisitApi`, mocks del Evaluador y cualquier sincronización inventada hacia `PipelineCase`.
