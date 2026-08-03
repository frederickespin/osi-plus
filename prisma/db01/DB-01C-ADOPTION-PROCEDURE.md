# DB-01C — Procedimiento propuesto de adopción futura

Este procedimiento fue ensayado sólo localmente. No está autorizado para producción.

## Precondiciones obligatorias

1. Ventana de mantenimiento aprobada y escrituras de la aplicación detenidas.
2. Backup lógico y snapshot recuperable de la base.
3. Dump nuevo `--schema-only --no-owner --no-privileges` de `public` y `osi`.
4. Comparación semántica con el baseline aprobado: cero diferencias inesperadas.
5. Hash aprobado del baseline experimental compatible con Prisma.
6. Conteo y hash de ambas tablas `_prisma_migrations`, sin exponer `logs`.
7. Conexión inyectada por el servidor; nunca recibida del navegador ni guardada en Git.
8. Runner de backfill de producción revisado y aprobado. Los scripts `db01c-*` rechazan correctamente producción y no deben alterarse para evadir esa protección.

## Cadena y hashes del ensayo

```text
00000000000000_production_baseline
20260801_mt_01a_tenant_memberships
```

El baseline de la cadena elimina únicamente el cambio de sesión `search_path=''` emitido por `pg_dump`; no cambia DDL. Prisma necesita conservar visible `osi._prisma_migrations` después de ejecutar la migración.

## Operaciones propuestas

### 1. Registrar las historias anteriores

Consultas de control, dentro de una transacción `READ ONLY`:

```sql
SELECT 'public' AS schema_name, count(*) AS rows
FROM public._prisma_migrations
UNION ALL
SELECT 'osi', count(*)
FROM osi._prisma_migrations;

SELECT migration_name, checksum, started_at, finished_at,
       rolled_back_at, applied_steps_count,
       length(coalesce(logs, '')) AS logs_length
FROM public._prisma_migrations
ORDER BY started_at, migration_name;

SELECT migration_name, checksum, started_at, finished_at,
       rolled_back_at, applied_steps_count,
       length(coalesce(logs, '')) AS logs_length
FROM osi._prisma_migrations
ORDER BY started_at, migration_name;
```

### 2. Preservar las historias como legado

Sólo después de aprobar los hashes:

```sql
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public._prisma_migrations
  RENAME TO _prisma_migrations_legacy_db01;

ALTER TABLE osi._prisma_migrations
  RENAME TO _prisma_migrations_legacy_db01;

COMMENT ON TABLE public._prisma_migrations_legacy_db01 IS
  'Legacy Prisma history preserved during canonical baseline adoption; inactive.';

COMMENT ON TABLE osi._prisma_migrations_legacy_db01 IS
  'Legacy Prisma history preserved during canonical baseline adoption; inactive.';

COMMIT;
```

Los nombres definitivos deberán aprobarse antes de producción. El ensayo usó el sufijo `_db01c` para impedir que se confunda con una adopción real.

### 3. Crear la historia canónica sin repetir DDL

Con `DATABASE_URL` apuntando al esquema `osi` y el hash del baseline confirmado:

```powershell
npx prisma migrate resolve `
  --applied 00000000000000_production_baseline `
  --schema prisma/db01/canonical-migrations/schema.prisma
```

Esto crea la nueva `osi._prisma_migrations` y registra administrativamente el baseline; no ejecuta su DDL. Inmediatamente deben verificarse:

```sql
SELECT migration_name, checksum, finished_at, rolled_back_at, applied_steps_count
FROM osi._prisma_migrations
ORDER BY started_at;
```

Debe existir una historia activa y dos tablas legacy inactivas.

### 4. Verificar la migración pendiente

```powershell
npx prisma migrate status `
  --schema prisma/db01/canonical-migrations/schema.prisma
```

El único pendiente permitido es `20260801_mt_01a_tenant_memberships`.

### 5. Aplicar MT-01A

```powershell
npx prisma migrate deploy `
  --schema prisma/db01/canonical-migrations/schema.prisma
```

Después se comprueban las dos tablas, cuatro enums, once índices físicos, checks y FK. No se acepta ninguna alteración de `osi_users` ni de tablas comerciales.

### 6. Backfill

Antes de producción debe aprobarse un runner separado que conserve las garantías ya ensayadas:

- bloqueo asesor transaccional;
- aislamiento serializable;
- validación completa de los roles y estados antes de escribir;
- clave única `(tenant_id, user_id)`;
- un solo tenant predeterminado por usuario;
- lote `MT-01A-IPACKERS-DO-V1`;
- segunda ejecución con `created = 0`;
- hash completo de `osi_users` idéntico antes y después.

No se incluye aquí un comando que eluda la protección local de los scripts DB-01C. Desplegar el runner de producción requiere autorización independiente.

### 7. Cierre

```powershell
npx prisma migrate deploy `
  --schema prisma/db01/canonical-migrations/schema.prisma

npx prisma migrate status `
  --schema prisma/db01/canonical-migrations/schema.prisma
```

Resultados exigidos: `No pending migrations to apply` y `Database schema is up to date`.

## Reversión propuesta

Antes de reabrir tráfico, si falla cualquier comprobación:

1. Eliminar sólo membresías y tenant con `provisioning_source='BACKFILL'` y el lote aprobado.
2. Eliminar en este orden `tenant_memberships`, `tenants` y los cuatro enums, sólo si no existen filas ajenas al lote.
3. Eliminar la nueva `osi._prisma_migrations` canónica.
4. Renombrar las dos tablas legacy a sus nombres originales.
5. Repetir fingerprint estructural y hashes de usuarios/historias.
6. Si alguna verificación falla, restaurar el snapshot completo en vez de intentar reparaciones manuales.

Después de reabrir tráfico, no se recomienda una migración descendente. Debe usarse una migración correctiva hacia adelante o restauración coordinada del snapshot.

## Condiciones de rechazo

- Hash del baseline distinto.
- Más de una migración funcional pendiente.
- Historia previa ausente o con filas nuevas desde la auditoría.
- Cualquier diferencia fuera de Tenant/TenantMembership.
- Usuarios con rol o estado no reconocido.
- Cambio del hash de `osi_users`.
- Falta de backup probado o de runner de backfill aprobado.
