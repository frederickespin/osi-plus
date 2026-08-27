# V17-ADMIN-IDENTITY-04E1A1 — Resultado

## Alcance

Esta rama añade el enrolamiento seguro de una segunda identidad Administradora sobre la fundación tenant-first de PR #59. La compuerta administrativa conserva `DISABLED` como valor predeterminado y no se creó, invitó ni modificó ninguna cuenta real.

## Autenticación reutilizada

- El login LEGACY normaliza el email mediante `trim().toLowerCase()`, exige una coincidencia única y revalida User, TenantMembership y Tenant.
- Las contraseñas continúan usando `bcryptjs` mediante `hashPassword`, con factor de coste 10, y se validan posteriormente con el mismo login canónico.
- La activación no emite token, sesión ni cookie: obliga a iniciar sesión normalmente después.
- Las sesiones V2 continúan separadas e inactivas. El bootstrap revoca cualquier sesión/refresh token previo del A afectado cuando cambia su versión de autorización.
- La persistencia histórica de provisión de empleados no cumple este contrato de identidad: está ligada a aprobaciones y a una credencial centinela inactiva. Se reutilizaron el hash, login, autorización, auditoría y modelo de Membership canónicos; no se creó un segundo autenticador.

## Arquitectura de activación

1. Un A con los cuatro permisos explícitos emite una invitación tenant-first.
2. Se generan 32 bytes aleatorios y se guarda únicamente SHA-256 del token. El enlace con fragmento se devuelve una sola vez y nunca puede recuperarse desde la API.
3. La invitación queda vinculada a tenant, email normalizado, rol A, permisos exactos, Membership/User emisor, request y payload canónico. Expira como máximo en 24 horas, es revocable y sólo puede existir una pendiente por tenant/email.
4. La ruta pública retira inmediatamente el fragmento de la URL. Token inválido, vencido, revocado, consumido o manipulado produce el mismo error público.
5. Para una identidad nueva, User + Membership A + auditoría + consumo se confirman en una transacción serializable. La contraseña se calcula con el hasher LEGACY fuera de SQL.
6. Para un User existente, se exige un Bearer LEGACY válido con el mismo email; no se cambia su contraseña ni se duplica el User, y sólo se crea la Membership faltante.

Los endpoints privados usan `private, no-store`, `Vary: Authorization, Origin`, mismo origen y ningún CORS permisivo. La compuerta se evalúa antes de autenticación, body o Prisma.

## Persistencia

- Migración 21: `20260827020000_v17_admin_identity_invitation`.
- SHA-256: `9ee56aaee53d5629db8dada22bcf86511d10c837c4ad61fb37fbd0b4caf53808`.
- Tabla aditiva `admin_identity_invitations`, UUID público tenant-first e inmutable, hash de token único, constraints de estado/expiración y FK compuestas de emisor/activación.
- PostgreSQL 18 desde vacío: 21/21; segundo deploy sin pendientes; drift vacío.
- Baseline SQL-only: 4,346 objetos, SHA-256 `a1a4da277070269bbad2452471717ef588c6c58cc2bc0cf55203835abb0cd930`.

## Bootstrap inicial

La herramienta `v17-admin-initial-permissions-bootstrap.mjs` es `DRY_RUN` por defecto. Localiza exactamente tenant code + Membership pública + `authorizationVersion`, sólo puede agregar los cuatro permisos de PR #59 y genera un manifiesto canónico. `--apply` exige un recibo independiente que coincida con batch, branch, tenant, Membership, versión y hash, además de autorización explícita vigente. No toca email, contraseña, rol o tenant; es idempotente, audita 1:1 y revoca sesiones anteriores. No se ejecutó contra Production.

## Validación local

- Dominio de invitación/activación: 23/23.
- HTTP privado/público: 11/11.
- Bootstrap: 8/8.
- Guardia específica y negativas: 14/14.
- Matriz Hub/Admin: 126/126, Chromium/Firefox/WebKit, desktop y móvil, cero omitidas.
- Suite canónica completa: PASS.
- Build, TypeScript, ESLint focalizado, secretos y `git diff --check`: PASS.
- Evidencias locales ignoradas: `.local/v17-admin-identity-04e1a1-evidence/`; no contienen token, contraseña ni ID interno.

## Capacidad Neon

Se revalidó y eliminó exclusivamente `pre-mt01c1b1-adoption-20260807` (`br-square-block-ahk35hqs`). Estaba archivada, no primaria/protegida, sin hijos ni referencias vigentes; su único endpoint estaba idle desde 2026-08-07. La rama y el endpoint ya no existen y la capacidad quedó en 9/10. El manifiesto sanitizado e ignorado está en `.local/.v17-admin-identity-04e1a1-neon-capacity-manifest.json`.

## Bloqueos restantes

- Ejecutar el bootstrap real requiere un manifiesto y una autorización independiente para el destino exacto.
- Crear o entregar una invitación corporativa real requiere autorización separada.
- La migración 21 no fue aplicada en Production.
- Administración continúa desactivada y no existe integración de email/WhatsApp.
