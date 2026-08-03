# DB-01M — Runbook propuesto de adopción en producción

Estado: **propuesta; no ejecutado**. Requiere aprobación administrativa independiente.

## Objetivo y alcance

Adoptar la cadena canónica de Prisma sin recrear las 77 tablas empresariales existentes, preservar las dos historias anteriores en `db01_legacy`, registrar el baseline en `osi`, desplegar las diez migraciones posteriores y ejecutar el backfill idempotente de MT-01A.

Este procedimiento no activa MT-01B, endpoints nuevos, escritura dual, modos SHADOW/ENFORCED ni comunicaciones externas.

## Responsables y autorizaciones

| Función | Responsabilidad |
| --- | --- |
| Dueño de producto | Aprueba ventana, alcance y reactivación |
| DBA / operador de migración | Verifica identidad, snapshot, ejecuta SQL y Prisma |
| Líder backend | Verifica artefactos, hashes, dry-run, build y smoke tests |
| Seguridad / auditoría | Custodia credenciales, revisa permisos e historias preservadas |
| Operaciones | Confirma ventana y ausencia de procesos que escriban |

Se requieren dos aprobaciones explícitas antes de escribir: DBA y dueño de producto. La misma persona no debe aprobar y ejecutar sin revisión independiente.

## Ventana estimada

- Preparación y snapshot: 20–30 minutos.
- Identidad y captura inicial: 15 minutos.
- Preservación, baseline y migraciones: 15–25 minutos.
- Backfill y validaciones: 15–25 minutos.
- Reserva para rollback: 30 minutos.
- Ventana recomendada: 90 minutos, con 30 minutos adicionales de contingencia.

## Requisitos previos

1. Commit/artefacto de despliegue fijado y revisado; no usar una copia de trabajo sucia.
2. Hashes aprobados para el baseline, las diez migraciones, los dos SQL administrativos y los scripts MT-01A.
3. Credenciales temporales de migración obtenidas desde el gestor de secretos; nunca escribirlas en archivos versionados ni en la consola.
4. `DATABASE_URL` y `DIRECT_URL` deben señalar inequívocamente producción y `schema=osi`.
5. `psql`, `pg_dump`, Node, npm y Prisma en las versiones aprobadas.
6. Snapshot/restauración probados por el proveedor y exportación `pg_dump --schema-only` disponible.
7. Correo, WhatsApp, webhooks, notificaciones y cron deshabilitados durante el smoke test.
8. Deploys bloqueados y aplicación en modo mantenimiento de escritura.
9. Confirmar que ninguna migración posterior ni tablas DB-01 funcionales se han usado en producción.

## Punto de control 0 — Identidad inequívoca

Abrir primero una sesión SQL de solo lectura con `statement_timeout` corto. Las credenciales se inyectan mediante variables protegidas o `.pgpass` temporal con permisos restrictivos; no se incluyen en el comando ni en el informe.

```sql
BEGIN READ ONLY;
SET LOCAL statement_timeout = '5s';
SELECT current_database(), current_user, current_schema(), current_setting('search_path');
SELECT inet_server_addr(), inet_server_port();
SELECT current_setting('neon.branch_id', true);
SELECT current_setting('neon.project_id', true);
COMMIT;
```

Comparar host, base, proyecto, branch ID y endpoint contra el registro productivo aprobado por dos personas. **Detenerse** si cualquier valor falta, coincide con una rama de ensayo o no coincide exactamente con la ficha de producción.

Confirmar que no se utiliza `db01l-canonical-rehearsal` ni sus fingerprints de ensayo:

- branch fingerprint de ensayo: `00cd7cc6d4408640`
- endpoint fingerprint de ensayo: `23a6b5b9ea47f9e3`

## Punto de control 1 — Snapshot y captura inicial

1. Crear snapshot administrado de producción y registrar su identificador.
2. Exportar únicamente estructura de `public` y `osi`, sin propietarios ni privilegios dependientes del ambiente:

```powershell
pg_dump --schema-only --no-owner --no-privileges --schema=public --schema=osi --file=.local/db01m-production-before.sql
Get-FileHash .local/db01m-production-before.sql -Algorithm SHA256
```

3. Ejecutar las consultas de conteos y fingerprints aprobadas en modo `READ ONLY`.
4. Capturar conteos y hashes de ambas `_prisma_migrations`, sin mostrar `logs`:

```sql
BEGIN READ ONLY;
SET LOCAL statement_timeout = '10s';
SELECT 'public' AS source_schema, count(*) AS rows,
       md5(string_agg(concat_ws('|', id, checksum, migration_name,
         started_at, finished_at, rolled_back_at, applied_steps_count,
         coalesce(logs, '')), E'\n' ORDER BY migration_name, id)) AS content_hash
FROM public._prisma_migrations
UNION ALL
SELECT 'osi', count(*),
       md5(string_agg(concat_ws('|', id, checksum, migration_name,
         started_at, finished_at, rolled_back_at, applied_steps_count,
         coalesce(logs, '')), E'\n' ORDER BY migration_name, id))
FROM osi._prisma_migrations;
COMMIT;
```

**Detenerse** si faltan tablas, hay filas fallidas/incompletas no explicadas, los conteos difieren de la auditoría aprobada o los fingerprints comerciales cambian durante la ventana.

## Punto de control 2 — Preservar historias anteriores

Ejecutar una sola vez, con `ON_ERROR_STOP`, el SQL revisado:

```powershell
psql -X -v ON_ERROR_STOP=1 -f prisma/db01m/preserve-histories-db01-legacy.sql
```

Resultado esperado:

- `db01_legacy.public_prisma_migrations_pre_db01` conserva todas las filas de `public`.
- `db01_legacy.osi_prisma_migrations_pre_db01` conserva todas las filas históricas de `osi`.
- conteos y hashes antes/después son idénticos.
- `PUBLIC` no tiene `USAGE` en `db01_legacy` ni privilegios sobre sus tablas.
- no existe `_prisma_migrations` activa en `public`.

**Detenerse y revertir** si cambia una fila, hash o estado; si queda una tercera historia activa; o si los permisos no son restrictivos.

## Punto de control 3 — Crear historia canónica y registrar baseline

```powershell
npx prisma migrate resolve --schema prisma/schema.prisma --applied 20260801000000_production_baseline
npx prisma migrate status --schema prisma/schema.prisma
```

Resultado esperado del `status`: baseline registrado y exactamente estas diez migraciones pendientes:

1. `20260801001000_mt01a_tenant_memberships`
2. `20260801002000_commercial_audit_log`
3. `20260801003000_approval_requests`
4. `20260801004000_risk_engine_rules_evaluations`
5. `20260801005000_logistic_override_approvals`
6. `20260801006000_quote_change_orders`
7. `20260801007000_logistics_geography_zone_rules`
8. `20260801008000_vehicle_engine_settings`
9. `20260801009000_logistics_rate_metadata`
10. `20260801010000_crate_settings`

**Detenerse** ante cualquier nombre adicional, faltante, checksum divergente o error de esquema.

## Punto de control 4 — Desplegar la cadena posterior

```powershell
npx prisma migrate deploy --schema prisma/schema.prisma
```

Resultado esperado: se aplican exactamente diez migraciones, en el orden anterior, y no se modifica ninguna tabla empresarial preexistente salvo los cambios explícitos revisados de la cadena.

Verificar inmediatamente que los feature flags continúan en `LEGACY_ONLY`, con SHADOW, ENFORCED y escritura dual deshabilitados.

## Punto de control 5 — MT-01A dry-run y backfill idempotente

```powershell
node scripts/mt-01a-dry-run.mjs --json
node scripts/mt-01a-backfill.mjs --json
node scripts/mt-01a-backfill.mjs --json
```

Resultados esperados, ajustados a la captura real aprobada de producción:

- cero roles o estados inválidos;
- cero correos/códigos duplicados que impidan restricciones;
- cero usuarios no migrables;
- primera ejecución crea una membresía por usuario;
- segunda ejecución crea cero y reconoce todas como existentes;
- un solo tenant inicial y una sola membresía predeterminada por usuario;
- `User.role` y `employeeProfile` permanecen intactos como compatibilidad.

**Detenerse** si el dry-run reporta conflictos o si la segunda ejecución crea filas.

## Punto de control 6 — Idempotencia y diff final

```powershell
npx prisma migrate deploy --schema prisma/schema.prisma
npx prisma migrate status --schema prisma/schema.prisma
npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script --exit-code > .local/db01m-production-diff.sql
```

Resultados obligatorios:

- segundo deploy: ninguna migración pendiente;
- status: base actualizada;
- diff: `-- This is an empty migration.`;
- ninguna sentencia `DROP`, incluida ninguna eliminación de historia legacy;
- una sola `_prisma_migrations` activa, en `osi`;
- ambas historias anteriores en `db01_legacy`.

Si el diff no está vacío, **no reactivar la aplicación**.

## Punto de control 7 — Validaciones y smoke tests

1. Repetir conteos/fingerprints iniciales de datos comerciales.
2. Confirmar sin cambios: owners, roles heredados, KPI, SLA, estados, cotizaciones y `milestonesJson`.
3. Confirmar intactas las siete tablas empresariales heredadas de `public`.
4. Confirmar que todas las tablas funcionales nuevas están vacías salvo `Tenant` y `TenantMembership`.
5. Ejecutar smoke tests con registros sintéticos y limpieza transaccional; no leer ni imprimir PII.
6. Verificar login heredado, lecturas comerciales y creación/limpieza sintética.
7. Confirmar que no se emitió correo, WhatsApp, webhook, notificación ni cron.
8. Ejecutar:

```powershell
npx prisma validate --schema prisma/schema.prisma
npm run build
```

## Reactivación

Solo después de la firma de DBA, backend y dueño de producto:

1. Retirar el modo mantenimiento.
2. Reanudar despliegues normales.
3. Mantener feature flags nuevos desactivados.
4. Monitorizar errores de Prisma, latencia, conexiones y endpoints heredados durante al menos una hora.
5. Conservar snapshot, dumps, hashes y evidencias según retención de auditoría.

## Rollback

El rollback SQL es válido únicamente antes de que las tablas funcionales DB-01 reciban datos reales. Contiene guardas que abortan si detecta uso.

```powershell
psql -X -v ON_ERROR_STOP=1 -f prisma/db01m/rollback-db01-adoption.sql
```

Resultado esperado:

- elimina solo historia canónica y estructuras nuevas DB-01/MT-01A;
- restaura las dos `_prisma_migrations` a `public` y `osi` con sus nombres y contenidos originales;
- elimina `db01_legacy` solo si queda vacío;
- estructura normalizada y fingerprints comerciales coinciden con el punto de control 1.

Si ya existen datos funcionales posteriores a la adopción, **no ejecutar este rollback lógico**: restaurar el snapshot completo en una instancia nueva, validar allí y efectuar conmutación controlada según el procedimiento del proveedor.

## Condiciones absolutas de detención

- Identidad de producción dudosa o no verificada por dos personas.
- Snapshot inexistente o restauración no comprobable.
- Historia/conteos/hashes distintos a los aprobados.
- Migración inesperada, checksum divergente o fila fallida.
- Dry-run MT-01A con conflictos.
- Backfill no idempotente.
- Diff final no vacío.
- Cambio en fingerprints comerciales protegidos.
- Activación accidental de SHADOW, ENFORCED, escritura dual o comunicaciones externas.
- Cualquier error sin una causa y recuperación demostradas en la rama aislada.
