# V17-ADMIN-TENANT-FIRST-04E1A — Resultado

Estado: `DRAFT_NOT_APPLIED`. Esta rama está apilada sobre el HEAD `6fb23a1381670315ac5fa9b2536e798aabefe78d` de PR #58. No crea identidades, no cambia datos externos y no activa Administración.

## Arquitectura de identidad

El dominio de aprovisionamiento existente persiste solicitudes e invitaciones, pero su ejecutor crea un `User` inactivo con un hash centinela. No existe todavía un consumidor runtime que complete credenciales LEGACY de forma autenticable. Por esa razón, una cuenta corporativa nueva no puede incorporarse de manera segura en este lote.

El bootstrap controlado sólo acepta un `User` existente, activo y con hash bcrypt LEGACY verificable. Su modo predeterminado es `--dry-run`; para aplicar exige recibo separado, vigente y coincidente con batch, branch, tenant, actor y hash del correo. Crea únicamente una `TenantMembership` A con los cuatro permisos explícitos y una auditoría. No crea `User`, contraseña ni credencial, y una repetición exacta es idempotente.

Bloqueador para el segundo A: completar primero un flujo canónico de invitación/enrolamiento de credenciales o confirmar una identidad corporativa ya autenticable. Después hará falta autorización independiente para ejecutar el bootstrap.

## Migración 20

`20260827010000_v17_tenant_membership_public_ref` agrega `TenantMembership.publicRef` como UUID PostgreSQL, con backfill técnico, `NOT NULL`, default `gen_random_uuid()`, unicidad tenant-first `(tenant_id, public_ref)` y trigger de inmutabilidad. Es aditiva y el runtime anterior puede ignorar la columna.

El ensayo poblado partió de 19 migraciones y verificó 12 Membership: UUID v4 no nulos y únicos, datos empresariales intactos, referencia inmutable, posibilidad de repetir el UUID en otro tenant, rechazo dentro del mismo tenant, segundo deploy limpio y drift vacío.

## Autoridad y API

Permisos explícitos, nunca concedidos sólo por rol A:

- `membership:view`
- `membership:update:role`
- `membership:update:permissions`
- `membership:update:status`

Rutas nuevas:

- `GET|HEAD /api/admin/memberships`
- `GET|HEAD|PATCH /api/admin/memberships/:membershipRef`

La compuerta admite sólo `DISABLED` y `LOCAL_ONLY`; el default es `DISABLED`, y cualquier marcador Vercel impide `LOCAL_ONLY`. La compuerta corre antes de auth, body y Prisma. Cada request revalida `User + TenantMembership + Tenant`, rol A, permiso explícito y denies. Los objetivos se resuelven con `tenantId + publicRef`; cross-tenant e inexistente producen el mismo 404.

El PATCH cerrado usa `authorizationVersion`, bloqueo del tenant y objetivo, una transacción para actualización/auditoría/revocación, y preserva al menos dos A activos una vez configurados. Mientras sólo existe uno, únicamente permite mantener o aumentar el conteo. Autosuspensión y autodegradación están bloqueadas.

Las respuestas usan `Cache-Control: private, no-store` y `Vary: Authorization, Origin`, sin CORS permisivo. El DTO no publica CUID, tenantId, userId ni IDs internos.

## Interfaz

Administración es un módulo lazy separado que usa exclusivamente la API nueva. La tarjeta exige rol baseline A más `membership:view`; la decisión efectiva y `deniedPermissions` se aplican antes del lazy load. La lista compacta muestra sólo nombre, correo, rol, estado, grants, denies y actualización. El drawer permite cambios autorizados sin `/api/users`, mocks o storage empresarial.

Evidencias locales ignoradas por Git:

- `.local/v17-admin-evidence/v17-admin-desktop.png`
- `.local/v17-admin-evidence/v17-admin-mobile.png`

## Validación local

- Dominio administrativo: 17/17.
- HTTP administrativo: 21/21.
- Bootstrap: 4/4.
- Guardia: 13 invariantes y 12 negativas.
- Migración poblada: 9/9.
- Hub/lazy: 23/23 negativas y matriz Hub 114/114 en Chromium, Firefox y WebKit, desktop y móvil.
- PostgreSQL 18 desde vacío: 20/20, segundo deploy limpio, drift vacío y baseline SQL-only reproducible.
- Suite canónica completa: verde.
- Build, TypeScript, ESLint focalizado y `git diff --check`: verdes.

## Inventario Neon READ ONLY — 2026-08-27 UTC

Sólo se consultó control plane. No se abrió PostgreSQL y no se crearon, reactivaron, suspendieron o eliminaron recursos.

| Rama | ID enmascarado | Parent | Creada UTC | Estado/compute | Protección | Uso verificable |
|---|---|---|---|---|---|---|
| `main` | `br-fra…3s12` | — | 2026-01-21 | ready; endpoint idle | primaria/default | Production |
| `crm01b3a-http-rehearsal-20260812` | `br-mut…vfx0` | main | 2026-08-12 | ready; endpoint idle | no protegida | Preview funcional; actividad 2026-08-26 |
| `pre-crm01b1-adoption-20260812` | `br-you…lifw` | main | 2026-08-12 | archived; sin endpoint | no protegida | respaldo CRM-01B1 |
| `pre-mt01c2b3c-cutover-20260811` | `br-lat…gsrn` | main | 2026-08-11 | archived; sin endpoint | no protegida | respaldo de cutover MT-01C2B3C |
| `pre-mt01c2b1-adoption-20260810` | `br-dar…bf8u` | main | 2026-08-10 | archived; endpoint idle | no protegida | último uso endpoint 2026-08-10 |
| `pre-v17-pipeline-case-public-ref-adoption-20260822` | `br-rap…whvw` | main | 2026-08-22 | ready; sin endpoint | no protegida | respaldo previo a migración 18 |
| `pre-c1b2b-incident-cleanup-20260807` | `br-res…j257` | main | 2026-08-07 | archived; sin endpoint | no protegida | respaldo de incidente C1B2B |
| `pre-mt01c1b1-adoption-20260807` | `br-squ…5hqs` | main | 2026-08-07 | archived; endpoint idle | no protegida | último uso endpoint 2026-08-07 |
| `pre-v17-synthetic-cleanup-20260818` | `br-pur…t78r` | main | 2026-08-18 | ready; sin endpoint | no protegida | estado previo a limpieza de 170 filas; conservar |
| `pre-v17-case-client-adoption-20260815` | `br-fan…3ji1` | main | 2026-08-15 | ready; sin endpoint | no protegida | respaldo previo a adopción Client |

Todas las ramas no primarias tienen parent `main` y cero hijos. El inventario de variables Vercel por nombre/scope encontró referencias branch-scoped sólo a ramas Git de Preview; ninguna referencia usa el nombre o ID de la candidata. No se le atribuyó una variable global cifrada a una rama sin revelar o descargar su valor.

Única candidata recomendada: `pre-mt01c1b1-adoption-20260807` (`br-squ…5hqs`). Protegía la adopción MT-01C1B1, operación ya superada por múltiples respaldos posteriores; está archivada, sin hijos, no es primaria/default, no tiene integración branch-scoped y su endpoint está idle desde 2026-08-07. Eliminarla perdería ese punto histórico y su endpoint `ep-liv…n2zw`; por eso requiere una autorización independiente y una revalidación final de referencias inmediatamente antes de eliminar.

## Pendientes

1. Diseñar o autorizar el enrolamiento autenticable de la segunda cuenta corporativa A.
2. Auditar y autorizar por separado cualquier eliminación de rama Neon.
3. Aplicar y ensayar la migración 20 en infraestructura aislada antes de Production.
4. Activar Administración sólo mediante un lote separado; el Draft PR permanece inactivo.
