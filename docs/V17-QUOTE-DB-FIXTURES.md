# Quote: fixtures de base de datos independientes

## Problema corregido

`scripts/v17-quote-db-test.mjs` seleccionaba globalmente las revisiones Costing
publicadas y exigía encontrar al menos dos. Una base canónica creada desde
cero no contiene esas revisiones; ejecutar antes la suite Costing crea una
sola. El resultado dependía de datos dejados por ejecuciones anteriores y el
test podía elegir casos de otros fixtures.

La suite ahora crea sus dos fuentes económicas de forma explícita. Cada
ejecución usa dos tenants, usuarios, membresías y casos nuevos con sufijos
aleatorios. `scripts/v17-quote-db-fixture.mjs` prepara cada caso con:

1. Un servicio primario y las rutas de origen/destino confirmadas.
2. Una regla logística mediante `versionLogisticsRule`.
3. Una logística calculada y publicada mediante `calculateLogistics` y
   `publishLogistics`.
4. Una regla de costo mediante `versionCostingRule`.
5. Un Costing calculado y publicado mediante `calculateCosting` y
   `publishCosting`.

El fixture recupera únicamente la revisión que acaba de publicar, filtrando
por su tenant, caso y referencia. Comprueba que la revisión pertenece a los
actores creados, tiene precio sugerido y no tiene blockers abiertos. No crea
snapshots económicos publicados directamente con Prisma ni cambia la
autoridad del dominio Quote.

Las 22 aserciones originales del lifecycle Quote se conservan: tres posiciones,
idempotencia, concurrencia, publicación/envío/aceptación, aceptación única,
proyección cliente sin costo interno, blockers, vencimiento, precio inferior,
inmutabilidad y comando auditado. Se añaden cuatro comprobaciones: tenants y
casos distintos, y rechazo de lectura/creación de propuestas entre tenants.

## Destinos locales cerrados

La suite exige `V17_QUOTE_TEST_DATABASE_URL`. No utiliza `DATABASE_URL` ni
`DIRECT_URL` como fallback. Antes de crear el cliente Prisma se valida la URL;
antes de insertar fixtures se verifica la identidad real del servidor y el
historial de migraciones.

Todos los destinos deben usar PostgreSQL 18 en `127.0.0.1:55432`, credenciales
locales explícitas y únicamente el parámetro `schema=osi`. Se rechazan
parámetros de conexión alternativos, fragmentos, URLs externas, poolers y una
identidad que presente `neon.branch_id`.

| Base | Requisito adicional | Historial exacto |
| --- | --- | --- |
| `osi_db01n_ci` | `CANONICAL_DB_VALIDATION=true` | Las 35 migraciones canónicas |
| `v17_quote_test` | Base local aislada | 29, hasta `20260910010000_v17_quote` |
| `v17_quote_replay` | Base local aislada | 29, hasta `20260910010000_v17_quote` |
| `v17_quote_empty` | Base local aislada | 29, hasta `20260910010000_v17_quote` |

Los tres nombres aislados proceden del contrato de rollback local existente;
este cambio fija también su puerto y valida su identidad antes de escribir.
La suite no ejecuta rollback, reset, migraciones ni eliminación de fixtures.
Las nuevas identidades permiten repetirla sobre una base de prueba sin elegir
ni modificar casos creados por otras suites.

## Comprobaciones

```sh
node scripts/v17-quote-local-target-test.mjs
node scripts/validate-v17-quote-guard.mjs
node scripts/validate-v17-quote-guard-test.mjs
npm run test:v17-quote:db
```

Las pruebas puras de destino cubren 32 escenarios, incluida la identidad
posterior a la conexión. El comando de base de datos exige la variable local
indicada arriba; no debe recibir una conexión de Preview o producción.

Validación realizada el 29 de octubre de 2026 en PostgreSQL 18.6 local con
las 35 migraciones canónicas: dos ejecuciones consecutivas de Quote pasaron
`26/26`. La base ya contenía fixtures de bootstrap de otras suites. Cada
ejecución creó sus dos tenants/casos nuevos y completó el lifecycle sin
seleccionar revisiones económicas ni propuestas de los fixtures anteriores.
