# DB-01L — Ensayo de adopción canónica

Fecha: 2026-08-02
Resultado: **APROBADO EN RAMA AISLADA Y REVERTIDO**
Producción: **no consultada por SQL y no modificada**
Rama conservada: `db01l-canonical-rehearsal`

## 1. Identificación segura del destino

- La configuración se cargó únicamente desde `.env.db01l.local`, archivo ignorado por Git.
- El nombre declarado y verificado fue `db01l-canonical-rehearsal`.
- El `branch_id` informado por PostgreSQL coincidió exactamente con el declarado localmente.
- Fingerprint del branch ID: `00cd7cc6d4408640`.
- Fingerprint del endpoint efectivo: `23a6b5b9ea47f9e3`.
- La URL contenía `schema=osi`.
- Se comparó contra siete URLs productivas conocidas: cero URLs iguales y cero hosts iguales.
- El nombre lógico de la base es el mismo que el de la copia de origen, como corresponde a una rama Neon, pero host y branch ID son distintos.
- La URL suministrada inicialmente apuntaba a la base predeterminada de la rama, donde sólo existía `public`. El arnés seleccionó el nombre lógico canónico dentro del mismo host y branch ID aislados y volvió a verificar `neon.branch_id` antes de cada operación.
- No se vinculó la rama a Vercel ni se habilitó acceso de usuarios reales.

## 2. Estado inicial

- Tamaño aproximado: 62,595,072 bytes.
- Tablas: 78 en `osi` y 8 en `public`, incluida una historia Prisma por esquema.
- Filas principales:
  - Usuarios: 18, todos activos.
  - Clientes: 7.
  - Leads: 0.
  - `PipelineCase`: 51.
  - `ServiceCase`: 9.
  - Cotizaciones de pipeline: 11.
- Catálogo estructural: 1 función, 1 trigger, 227 índices, 97 FK y 304 etiquetas enum.
- Historias Prisma: 3 filas en `public` y 32 filas en `osi`.
- Hash bruto del dump estructural inicial: `7113DEC12D64ED39BAE00B6BB9DB8B5CEDE10FD9515D390F2E0C33F3EAEF566D`.
- Hash estructural normalizado, sin tokens aleatorios de `pg_dump`: `eda5871fc20c00372ccfd858ef06f6d5ad92274493e2956f0a496956914aaaca`.
- No se descargaron ni imprimieron nombres, correos, teléfonos, direcciones ni contenidos comerciales.

## 3. Comandos ejecutados

La URL fue inyectada en memoria por el guard de identidad; nunca se incluyó en los comandos registrados.

```text
node scripts/db01l-capture.mjs initial
node scripts/db01l-public-audit.mjs
pg_dump --schema-only --no-owner --no-privileges --schema=public --schema=osi
node scripts/db01l-normalize-structure.mjs initial
psql -f prisma/db01l/preserve-legacy-histories.sql
npx prisma migrate resolve --applied 20260801000000_production_baseline
npx prisma migrate status
npx prisma migrate deploy
node scripts/db01l-dry-run.mjs
node scripts/db01l-backfill.mjs
node scripts/db01l-backfill.mjs
npx prisma migrate deploy
npx prisma migrate status
npx prisma migrate diff --from-url <rama-verificada> --to-schema-datamodel prisma/schema.prisma --script
node scripts/db01l-capture.mjs post-adoption
node scripts/db01l-history-check.mjs post-adoption-histories
node scripts/db01l-validate.mjs
node scripts/db01l-smoke.mjs
npx prisma validate
npx eslint <scripts DB-01L>
npm run build
node scripts/db01l-rollback.mjs
node scripts/db01l-capture.mjs post-rollback
node scripts/db01l-history-check.mjs post-rollback-histories
node scripts/db01l-structure-dump.mjs post-rollback
node scripts/db01l-normalize-structure.mjs post-rollback
node scripts/db01l-rollback-validate.mjs final
```

La primera invocación del rollback fue rechazada por PostgreSQL porque Prisma no permite múltiples comandos en un prepared statement. La transacción completa se revirtió sin aplicar cambios. El ejecutor se corrigió para emitir una sentencia por llamada dentro de una única transacción y el segundo intento pasó.

## 4. Resultado de adopción

- Las dos historias previas se preservaron íntegramente como:
  - `public._prisma_migrations_legacy_pre_db01`
  - `osi._prisma_migrations_legacy_pre_db01`
- Se creó una única historia canónica activa en `osi`.
- El baseline fue registrado como aplicado sin ejecutar nuevamente su DDL.
- Las diez migraciones posteriores se aplicaron en orden.
- El segundo `migrate deploy` no encontró pendientes.
- `migrate status` terminó actualizado con 11 migraciones canónicas.
- Las 24 tablas funcionales P0/P1 quedaron vacías.
- No se importaron reglas, tasas, vehículos, cajas ni históricos ambiguos.
- El modo efectivo permaneció `LEGACY_ONLY`; `SHADOW`, `ENFORCED` y escritura dual quedaron desactivados.
- El diff de objetos gestionados fue cero. Prisma reportó solamente la tabla intencionalmente preservada `osi._prisma_migrations_legacy_pre_db01` como candidata a eliminación; no se eliminó.

## 5. Resultado de MT-01A

- Dry-run: 18 usuarios, 18 membresías por crear, 0 roles inválidos, 0 estados inválidos, 0 duplicados de código/correo y 0 filas inmigrables.
- Primer backfill: 18 creadas, 0 existentes.
- Segundo backfill: 0 creadas, 18 existentes.
- Resultado final: tenant `IPACKERS-DO`, 18 membresías y 18 predeterminadas.
- Cero diferencias de rol y estado entre `User` y `TenantMembership`.
- Las historias legacy conservaron conteos y fingerprints originales.

## 6. Smoke tests de aplicación

- Login heredado: ruta HTTP real aprobada con usuario sintético temporal, además de bcrypt y JWT round-trip.
- Lecturas agregadas aprobadas: usuarios, clientes, leads, pipeline, cotizaciones, survey, crating, aprobaciones heredadas y relacionales.
- KPI: total de pipeline consistente; 4 aprobados y 3 cotizaciones enviadas.
- Se creó un caso sintético identificable con una cotización y una solicitud de crating.
- El caso sintético y todos sus hijos fueron eliminados; el usuario sintético de login también fue eliminado.
- Correo, WhatsApp, webhooks, notificaciones y cron permanecieron desactivados.
- `prisma validate`, ESLint de scripts y `npm run build` pasaron.
- Advertencias no bloqueantes: bundle principal/vendor superior a 500 kB y catálogo Browserslist desactualizado.

## 7. Auditoría de `public`

| Tabla | Filas | Clasificación provisional |
|---|---:|---|
| `CratePlan` | 0 | Legado vacío |
| `CratePlanItem` | 0 | Legado vacío |
| `Invitation` | 3 | Requiere revisión separada |
| `Membership` | 1 | Requiere revisión separada |
| `Project` | 0 | Legado vacío |
| `Tenant` | 1 | Requiere revisión separada |
| `User` | 1 | Requiere revisión separada |

Las seis FK internas fueron identificadas. No se consultaron campos personales. Clasificación general: `AMBIGUOUS_LEGACY_REQUIRES_SEPARATE_DATA_REVIEW`; no se eliminó ni migró ninguna fila.

## 8. Comparación antes/después de adopción

- Hashes de usuarios, clientes, leads, pipeline y control comercial: sin cambios.
- Conteos de todas las tablas preexistentes: sin cambios.
- Owner, estados, SLA, KPI, cotizaciones y `milestonesJson`: sin cambios.
- Historias preservadas: 3 + 32 filas, mismos fingerprints.
- Nuevos datos: únicamente tenant y 18 membresías técnicas de MT-01A.
- Nuevas tablas funcionales: vacías.

## 9. Resultado de reversión

- Se retiraron 26 tablas DB-01, 19 funciones de protección, 21 enums y la restricción agregada a cotizaciones.
- Se retiró la historia canónica experimental.
- Se restauraron los nombres originales de las dos historias Prisma.
- Conteos, fingerprints comerciales, status aggregates y catálogo estructural volvieron a coincidir.
- Hash estructural normalizado inicial y final:
  `eda5871fc20c00372ccfd858ef06f6d5ad92274493e2956f0a496956914aaaca`.
- La rama quedó en su estado estructural y comercial inicial y no fue eliminada.

## 10. Propuesta de privilegios mínimos

### Rol de aplicación

- `LOGIN` y `CONNECT` únicamente a la base de la aplicación.
- `USAGE` sobre `osi`.
- CRUD sólo sobre tablas que utiliza la aplicación.
- Sin `CREATE`, `ALTER`, `DROP`, ownership ni acceso administrativo a `_prisma_migrations`.
- Sin acceso directo a tablas legacy de `public`, salvo una excepción documentada y temporal.

### Rol de migraciones

- Credencial independiente y no disponible para el runtime.
- `USAGE`/`CREATE` sobre `osi`, ownership o privilegios explícitos para DDL canónico y acceso a `osi._prisma_migrations`.
- Uso limitado a CI/CD protegido, con aprobación manual y ventana de mantenimiento.
- Sin reutilizar el secreto del rol de aplicación.

### Rol de auditoría read-only

- `CONNECT`, `USAGE` y `SELECT` explícito sobre vistas/tablas autorizadas.
- `default_transaction_read_only=on` y `statement_timeout` corto.
- Sin acceso por defecto a columnas sensibles; preferir vistas sanitizadas.
- Sin DDL, DML, ejecución de jobs ni secretos.

## 11. Riesgos pendientes

1. La producción original conserva su historia divergente; este ensayo no la reparó ni la adoptó.
2. El objeto legacy preservado seguirá apareciendo en `prisma migrate diff`; debe aprobarse como excepción conocida o excluirse de la comparación administrativa, nunca borrarse automáticamente.
3. `.env.db01l.local` identifica correctamente la rama pero su ruta inicial de base era la predeterminada vacía. Conviene actualizarla localmente para apuntar directamente al nombre lógico canónico y eliminar la derivación del arnés.
4. Las siete tablas de `public` continúan ambiguas y requieren auditoría de datos separada antes de decidir archivo o migración.
5. El smoke test no habilitó una interfaz para usuarios reales ni envió comunicaciones; fue un arnés local controlado con datos sintéticos.
6. Las advertencias de tamaño de bundle no bloquean DB-01L, pero deben tratarse como deuda de rendimiento del frontend.
7. MT-01B y todas las activaciones de nuevas funciones continúan detenidas.

## 12. Confirmación de seguridad

La base productiva original **no fue consultada mediante SQL, no recibió migraciones y no fue modificada**. Sólo se leyeron localmente las URLs productivas conocidas para comparar fingerprints de destino, sin imprimirlas. Todas las escrituras ocurrieron en la rama Neon aislada `db01l-canonical-rehearsal`; la rama se conserva y quedó revertida al estado inicial.
