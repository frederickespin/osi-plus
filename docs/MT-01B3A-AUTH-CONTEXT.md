# MT-01B3A — Contrato del contexto empresarial

## `resolveAuthContext(request, options)`

La función recibe la solicitud y permite inyectar `prisma`, `env` y `now` sólo para pruebas. Devuelve un objeto congelado con `authType`, identidad global, sesión, tenant, membership, rol efectivo, permisos efectivos, versión de autorización y estados. Las listas internas también están congeladas.

En V2 se ejecuta una consulta SQL parametrizada que enlaza `AuthSession → TenantMembership → Tenant → User` mediante las claves compuestas. Se verifican firma HS256, issuer, audience, versión, tipo, expiración, `iat`, `exp`, `jti`, `sid`, estados, vencimiento de sesión, correspondencia exacta y `authorizationVersion`. El rol procede de la membresía; los permisos efectivos son `(permisos base del rol ∪ concedidos) − denegados`.

En LEGACY se conserva el JWT y rol global existentes, sin consultar TenantMembership ni tablas Auth. Un token con forma V2 que falla validación no puede degradarse a LEGACY en HYBRID.

## Middleware preparado

| Función | Éxito | Error |
|---|---|---|
| `requireAuthContext` | Adjunta `req.authContext` y evita una segunda resolución | 401 para identidad ausente/inválida |
| `requireRole` | Exige rol efectivo del contexto | 403 |
| `requirePermission` | Exige permiso efectivo | 403 |
| `requireTenantResource` | Compara el tenant del contexto con el recurso | 404 si pertenece a otra empresa; 403 si LEGACY carece de tenant |

Las respuestas contienen sólo un código estable y, cuando corresponde, `recoverable`/`retryAfterMs`. Nunca incluyen JWT, SQL, URL, claims crudos ni mensajes internos.

## `/auth/me`

En `MT01B_AUTH_MODE=LEGACY` la forma JSON permanece idéntica. En un futuro HYBRID con JWT V2 válido agrega `tenant`, `membership` y `sessionId`; el rol y permisos se obtienen del backend. No devuelve refresh token, hashes ni datos internos.

## Matriz LEGACY/V2

| Aspecto | LEGACY actual | V2 preparado |
|---|---|---|
| Autoridad de rol | Claim del JWT global | TenantMembership actual |
| Permisos | Tabla estática por rol global | Base de rol + grants − denies |
| Tenant | No disponible | Claim firmado validado contra sesión y DB |
| Headers `x-osi-*` | Se mantienen en rutas heredadas | Se ignoran; no participan en el contexto |
| Estado | Usuario consultado por rutas actuales | Usuario + tenant + membership + sesión |
| Cambio de tenant | No existe | Desactivado |
| Persistencia frontend | Contrato heredado intacto | Sigue inactivo; B3A no conecta clientes |

## Rendimiento y límites

La resolución V2 requiere una consulta/round-trip. `/auth/me` agrega dos lecturas paralelas para construir su DTO; las rutas futuras deben reutilizar `req.authContext`. Las pruebas registran latencia media, p95 y máxima sobre PostgreSQL local. No se agrega caché antes de definir invalidación por `authorizationVersion`.

## Riesgos reservados para B3B

- Migrar las rutas de headers sin romper LEGACY ni el frontend activo.
- Agregar `tenantId` a recursos empresariales en MT-01C antes de prometer 404 cruzado real.
- Retirar `ensureActorUserId`, que actualmente adivina usuarios por correo.
- Separar la escritura idempotente que hoy ocurre en `GET /api/k/dashboard`.
- Definir CSP y completar el token broker antes de activar HYBRID.
- Revisar CORS heredado `*`; B3A no lo cambia para evitar alterar contratos activos.
