# V17-AUTH-USERS-TENANT-FIRST-01B — Resultado local

## Resumen

La administración empresarial conserva a `User` como identidad global y opera sobre `TenantMembership` mediante los contratos tenant-first existentes. El endpoint legacy `/api/users` queda retirado con HTTP 410 y remite a `/api/admin/memberships` y `AdminIdentityInvitation`; ya no lista identidades ni crea usuarios con contraseña.

La selección empresarial LEGACY usa `TenantMembership.publicRef` como `membershipRef`. Es una preferencia cliente transportada en `X-OSI-Membership-Ref`, nunca una autorización: cada request vuelve a resolver el User autenticado y comprueba Membership activa, pertenencia al User y Tenant activo antes de construir `AuthorizationContext`.

## Contratos finales

- Login con cero Membership activas: denegado.
- Login con una Membership activa: selección automática y revalidación mediante `/api/auth/me`.
- Login con más de una Membership activa: selector explícito; `isDefault` sólo ordena/preselecciona la opción y nunca resuelve silenciosamente el contexto.
- Cambio de organización: valida primero la nueva `membershipRef`, limpia caches y estado de formularios tenant-specific, conserva token/sesión estrictamente necesarios y vuelve a `/hub`.
- `/api/auth/me`: publica nombre, estado, rol de Membership, permisos/denies efectivos, Membership elegida y lista mínima seleccionable (`membershipRef`, `tenantName`, `role`, `preferred`). No publica PK de User, Membership o Tenant.
- Clientes centrales, CRM y Administración transportan `membershipRef`; los clientes focales fallan cerrado si falta.
- Administración: lista, detalle y cambios se resuelven por tenant interno + `membershipRef`; rol, permisos, denies, estado y `authorizationVersion` siguen el contrato administrativo existente.
- Identidades nuevas: exclusivamente `AdminIdentityInvitation` con `NEW_IDENTITY`/`EXISTING_IDENTITY`; no existe password administrativo.

## Referencias públicas y esquema

Se reutilizó `TenantMembership.publicRef`. No se encontró una necesidad funcional independiente de `User.publicRef` ni `Tenant.publicRef`, por lo que no se propone ni implementa migración. El repositorio conserva 21 migraciones y `prisma/schema.prisma` no cambia.

`User.normalizedEmail` continúa nullable y sin unique por restricción del lote. El login nuevo busca de forma canónica y case-insensitive, limita la detección a dos coincidencias y falla cerrado si el resultado no es exactamente uno. No aparecieron colisiones en los fixtures sintéticos ejecutados; la ausencia de PostgreSQL local impidió auditar una base persistente de pruebas.

## `User.role` y RBAC legacy

`User.role` no participa en las nuevas decisiones ni en los DTO de login/me. El rol efectivo procede de `TenantMembership.role`; grants se agregan y `deniedPermissions` prevalece. La columna permanece por compatibilidad y el único uso deliberado del login es el claim JWT LEGACY requerido por la ventana existente, que el servidor ignora al reconstruir el contexto.

El Sidebar legacy y `roleModuleMap` permanecen como presentación compatible, pero se retiró la superficie Users. Hub y rutas protegidas continúan usando capacidades revalidadas antes de los imports lazy.

## Auditoría

El dominio administrativo existente registra de forma append-only `MEMBERSHIP_AUTHORIZATION_CHANGED` para cambios de rol, permisos, suspensión y reactivación, con before/after cerrados, request/correlation ID y revocación de sesiones afectadas. Las invitaciones conservan emisión, revocación, consumo único y activación auditadas.

El cambio de organización no muta autoridad ni datos server-side: es una selección de contexto revalidada en cada request y por eso no se añadió una escritura de auditoría desde el navegador. Si se requiere trazabilidad de selecciones de sesión, deberá diseñarse posteriormente como evento server-side de sesión, no como dato local autoritativo.

## Validación local

- Build y TypeScript: verdes.
- ESLint focalizado/diferencial: verde, cero warnings.
- Guardia 01B: 17/17 (16 negativas más baseline); test de dominio 01B: 15/15.
- AuthorizationContext 01A y su guardia: verdes tras exigir selección multi-Membership explícita.
- Auth privado: 196 assertions; CORS protegido: 17 assertions.
- Administración HTTP: 21/21; guardia: 13 assertions y 12 negativas.
- Identity HTTP: 19/19; guardia: 25/25.
- Hub: 168/168, Chromium/Firefox/WebKit, desktop/móvil, cero retries u omitidas.
- Comercial V17: 114/114, tres motores y dos viewports.
- Cliente CRM relacional: 210/210, tres motores y dos viewports.
- Auth anónimo/LEGACY: 24/24, tres motores.
- Coordinación Auth V2/LEGACY: 36/36, tres motores; Auth V2 permanece apagado.
- `git diff --check`: verde.

## PostgreSQL

No se validó contra PostgreSQL local: el equipo no dispone de `docker`, `psql`, `postgres`, `DATABASE_URL` ni `TEST_DATABASE_URL`. No se usó Production ni ningún servicio externo como sustituto. CI ya dispone de PostgreSQL aislado y ejecuta la suite canónica, administración, bootstrap e invitaciones; esa ejecución debe mantenerse como requisito antes de integrar.

## Riesgos y siguiente integración

- La constraint unique de `normalizedEmail` sigue siendo una migración futura potencial; este lote sólo falla cerrado ante ambigüedad.
- Las preferencias globales no tienen todavía un catálogo explícito. La limpieza conservadora mantiene únicamente token/sesión y elimina el resto del storage al cambiar tenant para impedir fuga visual.
- Los módulos legacy que no consumen APIs tenant-first siguen siendo compatibilidad visual, no nuevas autoridades.
- ICP debe integrarse después sobre este HEAD, consumir el mismo `AuthorizationContext` y transportar `membershipRef` por el cliente central. No debe introducir `tenantId`, User PK, storage empresarial ni otra selección paralela.

## Límites respetados

Auth V2 continúa OFF. No hubo migraciones, acceso a Production/Neon/Vercel, cambios de variables, push, PR ni modificación de los Draft PR #73–#79. ICP no fue iniciado.
