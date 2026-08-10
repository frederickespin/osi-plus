# SEC-COM-01A — Cierre de lecturas OSI y pureza de GET K Dashboard

## Alcance aplicado

No se modificó el datamodel ni se creó una migración. El cambio se limita a:

- `GET /api/osis`;
- `GET /api/osis/:id`;
- autenticar y eliminar la inicialización persistente de señales desde `GET /api/k/dashboard`;
- enviar el JWT LEGACY en los tres GET protegidos desde el cliente central.

`POST/PATCH`, handshakes, retornos, las demás rutas por headers y el aislamiento empresarial quedan fuera de SEC-COM-01A.

## Inventario OSI

| Ruta | Consumidor | Datos expuestos antes | Autoridad nueva |
| --- | --- | --- | --- |
| `GET /api/osis` | `getOsis` → `useOpsOsis` → `OperationsModule` | Toda fila OSI: cliente, origen/destino, agenda, responsables, equipo, vehículos, valor, notas, planes PTF/PET, NPS y notas de supervisión | Bearer; `requirePilotPermission(PERMS.OSI_VIEW)` |
| `GET /api/osis/:id` | `getOsiById`; actualmente sin consumidor frontend | Todo lo anterior más hasta 50 change logs, 20 handshakes y 20 devoluciones: snapshots before/after, razones, actores, notas de custodia, materiales y desviaciones | Bearer; `requirePilotPermission(PERMS.OSI_VIEW)` |

Las respuestas exitosas y los errores 401/403/503 establecen `Cache-Control: private, no-store` y `Vary: Authorization` antes de resolver la autenticación. El token viaja únicamente en `Authorization: Bearer`; no aparece en URL, respuesta ni logs. Esto impide que Vercel/CDN o un cache HTTP reutilicen datos OSI entre usuarios.

El permiso `osi:view` ya existía en `api/_lib/rbac.js`; no se creó un código nuevo. En LEGACY, el adaptador usa `requireAuth`, verifica firma/expiración y vuelve a consultar `User.status`. En HYBRID/MEMBERSHIP_ONLY preparado, delega exclusivamente a `resolveAuthContext`. Los headers `x-osi-role`, `x-osi-userid` y campos tenant/membership del navegador no intervienen en los bloques GET.

Respuestas controladas:

- identidad ausente, JWT inválido o User no activo: `401`;
- identidad válida sin `osi:view`: `403`;
- fallo al revalidar identidad en base: `503 AUTH_DATABASE_UNAVAILABLE` sin detalle interno.

No se agrega filtrado tenant porque `Osi`, `Project` y `Client` todavía no poseen `tenantId`. Un usuario con `osi:view` continúa viendo el conjunto global; tenantizar la raíz y convertir el lookup a `(tenantId,id)` con 404 indistinguible es bloqueo obligatorio de MT-01C2B.

## Consumidor LEGACY

`requestJson` sólo adjuntaba Authorization cuando el método llamador entregaba `options.token`. Para no cambiar todos los clientes, únicamente `getOsis`, `getOsiById` y `getKDashboard` leen el token de la sesión LEGACY vigente mediante `getToken()` y lo entregan al wrapper. No cambia login, localStorage ni otras rutas.

## Escritura retirada de GET /api/k/dashboard

Antes, cada lectura:

1. consultaba hasta 50 Project con Signal/PGD;
2. ejecutaba `ensureDefaultSignals` para cada Project;
3. `ensureDefaultSignals` consultaba `ProjectSignal` y ejecutaba `createMany(skipDuplicates)` para PAYMENT, PERMITS_PARKING, CRATES y THIRD_PARTIES faltantes;
4. repetía la consulta completa para devolver las filas recién creadas.

Ahora existe una sola lectura de Project. `effectiveSignalMap` combina las señales persistidas con defaults efímeros calculados desde `startDate`; una fecha heredada inválida usa una referencia fija y no el reloj de la solicitud. Los defaults sólo alimentan los semáforos de la respuesta y nunca se escriben. Dos GET consecutivos conservan respuesta, filas, hashes y timestamps.

El dashboard dejó de confiar en `x-osi-role` y `x-osi-userid`. Usa `requirePilotPermission(PERMS.PROJECTS_VIEW)` y conserva la restricción funcional histórica a roles `A` y `K`. En LEGACY se revalida `User.status`; en V2 preparado, sesión, tenant, membresía, versión de autorización, rol y permisos provienen del servidor. Sus respuestas usan la misma política anti-cache de OSI.

La futura inicialización persistente, si sigue siendo necesaria, debe ser un comando administrativo explícito, idempotente, autenticado y auditado. SEC-COM-01A no crea ese endpoint.

## Guardias

`validate-sec-com-01a-guard.mjs` congela:

- los dos GET OSI con `requirePilotPermission` y `PERMS.OSI_VIEW`;
- dashboard con `projects:view`, roles `A/K` y sin headers de autoridad;
- política `private, no-store` y `Vary: Authorization` antes de autenticar;
- ausencia de headers manipulables dentro de esos bloques GET;
- cliente LEGACY enviando Bearer;
- dashboard GET sin métodos Prisma mutables, SQL de escritura, `ensureDefaultSignals` ni segunda lectura de Project;
- modos predeterminados LEGACY, tenant switch false y cliente V2 false.

La allowlist heredada baja de 25 a 24 archivos porque dashboard ya no confía en headers. `api/osis/index.js` conserva POST por headers y `api/osis/[id].js` conserva PATCH por headers, por lo que esos dos archivos permanecen inventariados.

## Riesgos trasladados a MT-01C2B

- agregar tenant directo a Osi, Project y Client;
- lookup y listas por tenant con 404 cruzado;
- reemplazar actores textuales por TenantMembership;
- migrar POST/PATCH, handshake y return fuera de headers manipulables;
- retirar `ensureActorUserId`, que todavía busca actores mediante heurística legacy;
- definir el comando administrativo para materializar señales predeterminadas.
