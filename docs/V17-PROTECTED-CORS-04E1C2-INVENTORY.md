# V17-PROTECTED-CORS-04E1C2 — Inventario de rutas

Inventario recursivo del árbol actual. La política de plataforma no aplica headers a `/api/**`; cada ruta usa un wrapper explícito. Las rutas same-origin y legacy cerradas usan `withPrivateApiHeaders`: sin CORS, `Cache-Control: private, no-store` y `Vary: Authorization, Origin`. Las dos rutas públicas usan `withPublicReadCorsHeaders`, sin credenciales.

## Protegidas same-origin (25)

| Familia | Rutas | Métodos reales | Autoridad |
|---|---|---|---|
| Admin | `/api/admin/memberships`, `/api/admin/memberships/[membershipRef]` | GET, HEAD, PATCH, OPTIONS controlado | Authorization; sin CORS externo |
| Auth | `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`, `/api/auth/refresh`, `/api/auth/session/upgrade` | Métodos propios, HEAD y OPTIONS controlados | Authorization donde corresponde; sin cookies ni CORS externo |
| Clients | `/api/clients` | GET, HEAD, POST, OPTIONS controlado | Authorization; POST conserva gate previo |
| Projects | `/api/projects` | GET, HEAD, POST, OPTIONS controlado | Authorization; POST conserva gate previo |
| CRM | `/api/crm/client-options`, `/api/crm/pipeline-cases`, `/api/crm/pipeline-cases/[caseKey]`, `/api/crm/pipeline-cases/[caseKey]/allowed-transitions`, `/api/crm/pipeline-cases/[caseKey]/assign-owner`, `/api/crm/pipeline-cases/[caseKey]/transition`, `/api/crm/pipeline-cases/[caseKey]/unassign-owner`, `/api/crm/pipeline-owner-options`, `/api/crm/pipeline-summary` | GET, HEAD, POST, PATCH y OPTIONS según ruta | Authorization; mismo origen; gate antes de auth/body/Prisma cuando está desactivada |
| K | `/api/k/dashboard`, `/api/k/pgd/apply`, `/api/k/pgd/item`, `/api/k/project`, `/api/k/project-release`, `/api/k/project-validate`, `/api/k/signal` | GET/POST y OPTIONS controlado según ruta | Authorization; gates de escritura conservados |

## Públicas deliberadas (2)

| Ruta | Métodos | CORS documentado | Credenciales |
|---|---|---|---|
| `/api/health` | GET, OPTIONS | `*`, sólo lectura | No |
| `/api/info` | GET, OPTIONS | `*`, sólo lectura | No |

No existen webhooks con autenticación propia en el árbol actual.

## Legacy pendientes de migrar, cerradas ahora (25)

Estas rutas conservan su lógica y métodos históricos, pero ya no heredan ni emiten CORS permisivo:

- `/api/_disabled/modules`, `/api/_disabled/pgd/apply`, `/api/_disabled/pgd/item`, `/api/_disabled/project-release`, `/api/_disabled/project-validate`, `/api/_disabled/signal`.
- `/api/osis`, `/api/osis/[id]`, `/api/osis/[id]/handshake`, `/api/osis/[id]/return`.
- `/api/pst/[serviceCode]`, `/api/pst/active`.
- `/api/ptf/suggestions`, `/api/ptf/suggestions/action`, `/api/ptf/suggestions/recompute`.
- `/api/templates/approve`, `/api/templates/approve-batch`, `/api/templates/draft`, `/api/templates/list`, `/api/templates/pending`, `/api/templates/publish`, `/api/templates/reject`, `/api/templates/submit`, `/api/templates/version`.
- `/api/users`.

## Fuentes de headers

- `vercel.json`: cero reglas de headers para `/api/**`.
- `api/_lib/http.js`: wrapper privado explícito y wrapper público allowlisted separados; no existe booleano `cors`.
- Wrappers Auth, CRM y Admin: conservan sus validaciones de origen y headers privados especializados encima del wrapper privado.
- CRM local: el único reflejo permitido continúa limitado por la allowlist exacta de loopback y no aplica en Vercel.

La guardia falla ante una ruta nueva sin clasificación, wildcard o credenciales en handlers/wrappers/plataforma, reflejo automático de `Origin`, OPTIONS privado permisivo o uso del wrapper público fuera de la allowlist.
