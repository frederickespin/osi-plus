# MT-01C2B2 — Backfill empresarial comercial

## Decisión aprobada

Los 7 `Client`, 2 `Project` y 51 `PipelineCase` de calibración pertenecen exclusivamente a `IPACKERS-DO`. `Lead` debe permanecer vacío. Esta fase sólo prepara y prueba el lote localmente; no autoriza ejecutarlo en producción.

De los 51 casos, 39 pueden relacionarse porque su `ownerId` tiene exactamente una `TenantMembership` `ACTIVE` en todo el sistema y ésta pertenece a `IPACKERS-DO`. Los otros 12 conservan `ownerMembershipId` y `ownerUserId` nulos y constituyen la cola comercial sin asignar. Nombre, correo, rol, teléfono o similitud nunca son evidencia.

## Operación

El lote estable es `MT-01C2B2-IPACKERS-DO-V1`. No incorpora una migración 16, endpoints, filtros runtime o cambios al datamodel.

El nivel de aislamiento es `READ COMMITTED`. El orden transaccional obligatorio es:

1. advisory lock del lote;
2. bloquear y asignar `tenant_id` a los 7 Client;
3. bloquear y asignar `tenant_id` a los 2 Project;
4. bloquear los 51 PipelineCase;
5. releer y bloquear de forma compartida las membresías ACTIVE y exigir los conteos 7/2/0/51 y 39/12;
6. asignar tenant y owner relacional a los 39 casos;
7. asignar sólo tenant a los 12 casos sin evidencia;
8. verificar nuevamente el manifiesto, el estado completo y los hashes antes del commit.

Un estado parcial, tenant distinto, owner distinto, membresía ambigua/suspendida o cambio de cualquier dato empresarial detiene y revierte toda la transacción. Veinte ejecuciones idénticas se serializan por el mismo advisory lock; una sola modifica filas y las demás reconocen el resultado aplicado.

El SQL actualiza exclusivamente `tenant_id`, `owner_membership_id` y `owner_user_id`. No toca `updatedAt`, estados, códigos, importes, fechas, cotizaciones, milestones, clientes, relaciones ni el `ownerId` heredado.

## Manifiesto y rollback

Antes de aplicar, el CLI exige `MT01C2B2_MANIFEST_PATH` con el patrón estable `.mt01c2b2-*.json` en la raíz del worktree. El manifiesto contiene únicamente batch ID y, por fila, PK, hash previo, asignación propuesta y hash posterior esperado. Se escribe con archivo temporal exclusivo, `fsync` y renombre atómico; queda ignorado y fuera de Git. Una modificación del manifiesto o de una fila detiene el lote.

El rollback adquiere los mismos locks antes de escribir y se detiene si una fila cambió después del lote. Si todo coincide, retira únicamente tenant y owner relacional, en orden inverso. Su segunda ejecución es idempotente. No elimina filas ni modifica migraciones.

## Seguridad

Todos los ejecutores aceptan exclusivamente `MT01C2B2_TEST_DATABASE_URL` con PostgreSQL local en `127.0.0.1:55432`, `schema=osi` y una base allowlisted. Rechazan Neon, pooler, hosts externos, `DATABASE_URL` genérica y cualquier `neon.branch_id`.

LEGACY permanece activo. HYBRID, tenant switch, cliente V2 y consumidores runtime basados en tenant continúan desactivados.

## Bloqueo de activación

Los POST activos de `/api/clients` y `/api/projects` todavía crean raíces con `tenantId = NULL`; no existe un endpoint Prisma activo para crear `PipelineCase`. Por tanto, este lote es una herramienta administrativa local de una sola adopción y no puede conectarse a build, deploy, seed, endpoint o runtime. MT-01C2B3 debe definir primero la creación empresarial de las tres raíces y sus owners; hasta entonces cualquier backfill productivo permanece bloqueado.

## Validación Q1

- Cadena nueva: 15 migraciones aplicadas; segundo deploy sin pendientes; `migrate status` actualizado y `migrate diff` vacío.
- C2B2: 47 pruebas transaccionales, 14 pruebas negativas de conexión y 5 pruebas de guardias.
- Regresión canónica: 299/299; MT-01B1: 124/124; navegadores: 36/36 (12 Chromium, 12 Firefox y 12 WebKit).
- Build, TypeScript, ESLint focalizado, escaneo canónico de secretos y `git diff --check`: aprobados.
- Diferencial MT-01B1: Base y Candidato ejecutaron tres muestras de 50 rondas por 20 refresh simultáneos. Ambos obtuvieron 62/62 por muestra, cero timeouts y máximo 21 conexiones. El p95 total local fue 13.27–14.46 ms en Base y 12.87–13.43 ms en Candidato. La variación de máximos (104.85–109.91 ms frente a 113.41–155.55 ms) no produjo errores ni cambia código de autenticación; ningún archivo MT-01B1 fue modificado.
