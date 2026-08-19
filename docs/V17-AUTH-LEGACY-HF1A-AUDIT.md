# V17-AUTH-LEGACY-HF1A — Auditoría de headers privados

## Alcance

Las cinco rutas activas del namespace Auth son:

- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `POST /api/auth/session/upgrade`

`login` y `me` son los consumidores LEGACY activos. Las otras tres rutas
permanecen preparadas para Auth V2, pero la política vigente las detiene con
`MT01B_AUTH_V2_DISABLED`.

## Causa

Había dos fuentes independientes de CORS permisivo:

1. `vercel.json` aplicaba una regla global a todo `/api/**` excepto CRM. Esa
   regla emitía `Access-Control-Allow-Origin: *` y
   `Access-Control-Allow-Credentials: true` también sobre Auth.
2. `withCommonHeaders` repetía el wildcard en `login` y `me`. El wrapper de
   Auth V2 también podía reflejar un origen permitido y emitir credenciales.

Además, Auth no imponía de forma uniforme caché privada ni variación por
`Authorization` y `Origin`.

## Contrato resultante

Todo `/api/auth/**` queda excluido de la regla global de Vercel y pasa por un
wrapper Auth explícito. Cada respuesta fija:

- `Cache-Control: private, no-store`
- `Vary: Authorization, Origin`
- ausencia de `Access-Control-Allow-Origin`
- ausencia de `Access-Control-Allow-Credentials`
- ausencia de `Set-Cookie`

La aplicación Auth continúa siendo de mismo origen. No se refleja `Origin` ni
se introduce una allowlist dinámica. `OPTIONS` y métodos ajenos se resuelven
antes de body, autenticación o Prisma. `HEAD` nunca contiene cuerpo.

El login conserva JWT, hashing y respuesta LEGACY, pero exige un objeto JSON
con exactamente `email` y `password` de tipo string. No se modifican secretos,
contraseñas, sesiones, permisos, tenants ni membresías.

## Guardias y regresión

La guardia recursiva inventaría las cinco rutas y una ruta Auth futura
hipotética. Falla si reaparece una regla global, wildcard, credenciales CORS,
caché pública, wrapper omitido u `OPTIONS 204` permisivo.

La prueba HTTP real cubre respuestas `200`, `400`, `401`, `405`, `409` y `503`,
origen externo, headers `Authorization` duplicados, JSON inválido, Content-Type
incorrecto, HEAD/OPTIONS y fallos Prisma sanitizados. Las suites canónicas
mantienen los contratos de Clients, Projects y rutas no Auth.
