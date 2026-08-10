# MT-01B3A — Inventario de autenticación de rutas

Estado levantado sobre `f84b5f9377dcdd4f8e842455611cebb49fc05628`. Este documento describe el riesgo actual; no autoriza el cutover de ninguna ruta. `LEGACY` continúa siendo el modo predeterminado.

## Clasificación

| Ruta / métodos | Clasificación actual | Middleware y headers | Rol o permiso | Datos utilizados | Compatibilidad LEGACY | Política V2 posterior | Riesgo |
|---|---|---|---|---|---|---|---|
| `/api/health` GET | Pública deliberada | Ninguno | Ninguno | Salud del proceso | Sin cambios | Pública | Bajo |
| `/api/info` GET | Pública deliberada | Ninguno | Ninguno | Metadatos de build | Sin cambios | Pública, respuesta limitada | Bajo |
| `/api/auth/login` POST | Pública deliberada | Credenciales en body | Usuario global activo | `osi_users` | Contrato idéntico | Entrada LEGACY/HYBRID controlada | Medio |
| `/api/auth/me` GET | JWT LEGACY; V2 preparada | Bearer; `resolveAuthContext` | Usuario autenticado | Usuario; en V2 tenant, membership y sesión | Respuesta LEGACY idéntica | Contexto V2 autoritativo | Medio |
| `/api/auth/refresh` POST | Auth V2 preparada | Cookie HttpOnly, Origin/Referer | Sesión V2 | AuthSession/AuthRefreshToken | 409 desactivado | Rotación V2 | Alto |
| `/api/auth/logout` POST | Auth V2 preparada | Cookie HttpOnly, Origin/Referer | Sesión V2 | AuthSession/AuthRefreshToken | 409 desactivado | Revocación V2 | Alto |
| `/api/auth/session/upgrade` POST | Auth V2 preparada | Bearer LEGACY, Origin/Referer | Membresía única activa | User/Tenant/Membership/AuthSession | 409 desactivado | Upgrade transitorio | Alto |
| `/api/users` GET/POST | JWT LEGACY | `requireAuth`; Bearer | `users:view` / `users:create` por rol global | Usuarios globales | Sin cambios | Migrar segundo; rol membership | Alto |
| `/api/clients` GET/POST | JWT LEGACY | `requireAuth`; Bearer | `clients:view` / `clients:create` | Clientes sin `tenantId` | Sin cambios | Migrar tercero tras MT-01C | Alto |
| `/api/projects` GET/POST | JWT LEGACY | `requireAuth`; Bearer | `projects:view` / `projects:create` | Proyectos/pipeline sin `tenantId` | Sin cambios | Migrar cuarto tras MT-01C | Alto |
| `/api/osis` GET | JWT LEGACY vigente / V2 preparada | Bearer; `requirePilotPermission` | `osi:view` | Todas las OSI; aún sin tenant | Bearer añadido al consumidor LEGACY | Agregar tenant y 404 cruzado en MT-01C2B | Alto |
| `/api/osis` POST | Headers manipulables | `x-osi-role`, `x-osi-userid` | A,B,K,V,D,E,C1 | OSI/proyecto/cliente | Sin cambios temporal | `osi:create` + tenant | Crítico |
| `/api/osis/:id` GET | JWT LEGACY vigente / V2 preparada | Bearer; `requirePilotPermission` | `osi:view` | OSI y bitácoras; aún sin tenant | Cliente preparado aunque sin consumidor activo | Agregar tenant y 404 cruzado en MT-01C2B | Alto |
| `/api/osis/:id` PATCH | Headers manipulables | `x-osi-role`, `x-osi-userid` | A,B,K,V,D,E,C1 | OSI y bitácoras | Sin cambios temporal | `osi:edit` + tenant | Crítico |
| `/api/osis/:id/handshake` POST | Headers manipulables | `x-osi-role`, `x-osi-userid` | A,B,D,E,G,C1,K | Custodia OSI | Sin cambios temporal | Permiso de custodia + tenant | Crítico |
| `/api/osis/:id/return` POST | Headers manipulables | `x-osi-role`, `x-osi-userid` | A,B,C1,C,D | Retorno de materiales | Sin cambios temporal | Permiso de retorno + tenant | Crítico |
| `/api/pst/active` GET | Headers manipulables | `x-osi-role`, `x-osi-userid` | `templates:view` | PST activo | Sin cambios temporal | Permiso membership | Alto |
| `/api/pst/:serviceCode` GET | Headers manipulables | `x-osi-role`, `x-osi-userid` | `templates:view` | PST por servicio | Sin cambios temporal | Permiso membership | Alto |
| `/api/templates/list` GET | Headers manipulables | `x-osi-role`, `x-osi-userid` | `templates:view` | Plantillas | Sin cambios temporal | Permiso membership | Alto |
| `/api/templates/version` GET | Headers manipulables | `x-osi-role`, `x-osi-userid` | `templates:view` | Versiones | Sin cambios temporal | Permiso membership | Alto |
| `/api/templates/pending` GET | Headers manipulables | `x-osi-role`, `x-osi-userid` | `templates:approve` | Pendientes | Sin cambios temporal | Permiso membership | Alto |
| `/api/templates/draft` POST | Headers manipulables | `x-osi-role`, `x-osi-userid` | `templates:edit_draft` | Borrador PST | Sin cambios temporal | Permiso membership + tenant | Crítico |
| `/api/templates/submit` POST | Headers manipulables | `x-osi-role`, `x-osi-userid` | `templates:submit_for_approval` | Plantilla/versión | Sin cambios temporal | Permiso membership + tenant | Crítico |
| `/api/templates/approve` POST | Headers manipulables | `x-osi-role`, `x-osi-userid` | `templates:approve` | Aprobación | Sin cambios temporal | Permiso membership + auditoría | Crítico |
| `/api/templates/approve-batch` POST | Headers manipulables | `x-osi-role`, `x-osi-userid` | `templates:approve` | Aprobación masiva | Sin cambios temporal | Permiso membership + auditoría | Crítico |
| `/api/templates/reject` POST | Headers manipulables | `x-osi-role`, `x-osi-userid` | `templates:reject` | Rechazo | Sin cambios temporal | Permiso membership + auditoría | Crítico |
| `/api/templates/publish` POST | Headers manipulables | `x-osi-role`, `x-osi-userid` | `templates:publish` | Publicación | Sin cambios temporal | Permiso membership + auditoría | Crítico |
| `/api/ptf/suggestions` GET | Headers manipulables | `x-osi-role`, `x-osi-userid` | A,B,C,C1,I,K | Sugerencias PTF | Sin cambios temporal | Permiso membership + tenant | Alto |
| `/api/ptf/suggestions/action` POST | Headers manipulables | `x-osi-role`, `x-osi-userid` | A,C,I,B | Decisión PTF | Sin cambios temporal | Permiso membership + auditoría | Crítico |
| `/api/ptf/suggestions/recompute` POST | Headers manipulables | `x-osi-role`, `x-osi-userid` | A,C,I,B | Recálculo PTF | Sin cambios temporal | Permiso membership + auditoría | Crítico |
| `/api/k/dashboard` GET | Bearer dual | `requirePilotPermission(projects:view)` + rol servidor A/K | K,A | Proyectos/PGD; estrictamente lectura desde SEC-COM-01A | Respuesta conserva semáforos con fallback determinista en memoria y no-store | Agregar tenantId y 404 empresarial en MT-01C2B | Alto |
| `/api/k/project` GET | Headers manipulables | `x-osi-role`, `x-osi-userid` | K,A | Proyecto/coord./PGD | Sin cambios temporal | `projects:view` + tenant | Alto |
| `/api/k/project-validate` POST | Headers manipulables | `x-osi-role`, `x-osi-userid` | K,A | Validación proyecto | Sin cambios temporal | `projects:validate` + auditoría | Crítico |
| `/api/k/project-release` POST | Headers manipulables | `x-osi-role`, `x-osi-userid` | K,A | Liberación proyecto | Sin cambios temporal | `projects:release` + auditoría | Crítico |
| `/api/k/signal` POST | Headers manipulables | `x-osi-role`, `x-osi-userid` | K,A | Señales de coordinación | Sin cambios temporal | Permiso membership + tenant | Crítico |
| `/api/k/pgd/apply` POST | Headers manipulables | `x-osi-role`, `x-osi-userid` | K,A | PGD | Sin cambios temporal | Permiso membership + tenant | Crítico |
| `/api/k/pgd/item` POST | Headers manipulables | `x-osi-role`, `x-osi-userid` | A | Ítem PGD | Sin cambios temporal | Permiso administrativo + tenant | Crítico |

Los archivos `api/k/_lib.js`, `api/osis/_helpers.js` y `api/templates/_pst.js` son auxiliares, no endpoints. `api/_disabled/**` permanece fuera del runtime.

## Orden de migración acordado

1. `/auth/me` (preparado en B3A, sin activar HYBRID).
2. Users.
3. Clients.
4. Projects/pipeline.
5. OSI.
6. PST/templates.
7. K/PTF.
8. Rutas administrativas.
9. Eliminación final de confianza en headers heredados.

Clients, Projects, OSI, PST/PTF y K no pueden aplicar aislamiento real hasta que sus recursos tengan pertenencia empresarial formal en MT-01C. El cutover se hará ruta por ruta en B3B/MT-01C, con pruebas de 404 cruzado.

SEC-COM-01A cerró los dos GET de OSI a nivel de método y migró `GET /api/k/dashboard` al adaptador Bearer dual. La allowlist heredada baja de 25 a 24 archivos; `api/osis/index.js` conserva POST por headers y `api/osis/[id].js` conserva PATCH por headers. Dashboard no escribe: la creación persistente de defaults requerirá un comando administrativo explícito posterior.
