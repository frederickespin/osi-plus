# Catálogo canónico 37: choferes de Flota 19F

## Alcance y procedencia

El perfil `canonical-37-fleet-drivers-19f` incorpora exclusivamente
`20261031010000_v17_fleet_driver_authority` a las 36 migraciones canónicas
anteriores. La medición se realizó en PostgreSQL local desechable, con datos
sintéticos, en `127.0.0.1:55432`, base `osi_db01n_ci`, esquema `osi`.

Se reconstruyeron primero las 36 migraciones anteriores y se reprodujo la
huella congelada del perfil 36. Después se aplicó el SQL 19F, se repitió
`prisma migrate deploy` sin migraciones pendientes y se obtuvo un diff Prisma
vacío con `DATABASE_URL` y `DIRECT_URL` dirigidas al mismo destino local.
Las capturas del catálogo se ejecutaron en transacciones de solo lectura.

| Dato | Valor |
| --- | --- |
| Fecha UTC de captura 37 | `2026-10-31T03:31:58.199Z` |
| Procedencia | `LOCAL_DISPOSABLE_POSTGRESQL` |
| Commit de la reconstrucción anterior de 36 migraciones | `66193dcf2388f01acf572a157a79af94e6898f74` |
| PostgreSQL | `18.6 (Ubuntu 18.6-1.pgdg24.04+2)`, `180006` |
| Collation / character type | `C.UTF-8` / `C.UTF-8` |
| Prisma CLI | `6.19.2` |
| SHA-256 del SQL 19F | `3a6db22d52441aa1614e13c0bd619ef4bba84230f9af91a3c794f31496d2bd14` |
| SHA-256 de `baseline36-evidence.json` | `4787992d99bb74507ac61c24c56203313a66f9a02b361cba84c6b38bf52317bd` |
| SHA-256 de `candidate37-evidence.json` | `47c75468b99b062ac9e22d75913fd3debdcc6e7f3bc6d6f87c6836cfae63bbd6` |

Esta es evidencia local medida; no se le atribuye un workflow ni un artifact
de CI. El fixture `tests/crm-01b1/fleet-drivers-19f-catalog.json` conserva la
procedencia, ambas huellas completas, los metadatos de la extensión y las
110 filas nuevas. Las capturas completas de esta sesión están en
`/tmp/osi-pg18/catalog-19f/`.

## Conservación del catálogo anterior

La reconstrucción previa produjo **10 569 objetos** y la firma
`481649e8c88db832d1f313f7e3a4a785f28a1d49c4277dc21eac179fef16cb54`.
Coincidieron también los ocho hashes por categoría y los 945 objetos del
inventario SQL específico, atribuidos a sus 36 migraciones.

Después de aplicar 19F se excluyeron únicamente las filas de las tablas
`osi.fleet_driver_primary_events` y `osi.fleet_driver_authorizations`,
incluidos sus triggers, y las funciones exactas
`osi.fleet_driver_primary_immutable()` y
`osi.fleet_driver_authorization_guard()`. El catálogo restante reprodujo
de nuevo el total y los ocho hashes del perfil 36, iguales a la captura
realizada antes de aplicar la migración. Los demás objetos permanecieron
intactos. Los perfiles congelados 22, 35 y 36 conservan sus constantes.

`CATALOG_SQL`, `SQL_ONLY_SQL` y la normalización de las definiciones no se
modificaron. La procedencia fija estas huellas de las consultas exactas:

| Consulta | SHA-256 |
| --- | --- |
| `CATALOG_SQL` | `04aea6b13957570b4939bf9362cfb7d64e6891da94f2ba6b2f3f1c48fd6ae0c4` |
| `SQL_ONLY_SQL` | `b0b5e65a1baa8098c2cbe50bb369e836d2446cdfac34ef0fb0e0ab4f8505dcfe` |

La extensión sigue siendo `btree_gist 1.8` en `osi`, con 212 miembros de
función según `pg_depend`. Su firma sigue siendo
`5768fa15ad9dc973614d90b162eeb87fbef323dc2b76e019e0f07a454623d5cc`.

## Huella del perfil 37

El catálogo completo contiene **10 679 objetos**, con SHA-256
`0431dfd8810a8ef68895b1b40c5e38ae1c06550249dff9b7f07c0a41b5951371`.

| Categoría | Perfil 36 | Perfil 37 | Diferencia |
| --- | ---: | ---: | ---: |
| `check` | 406 | 416 | 10 |
| `column` | 3 772 | 3 812 | 40 |
| `constraint` | 3 032 | 3 060 | 28 |
| `enum` | 1 102 | 1 102 | 0 |
| `foreign_key` | 661 | 672 | 11 |
| `function` | 299 | 301 | 2 |
| `index` | 1 114 | 1 131 | 17 |
| `trigger` | 183 | 185 | 2 |
| **Total** | **10 569** | **10 679** | **110** |

El delta de 110 filas tiene la firma
`e0adc18f825d2be5781a23bbe44cbb61a62c9e8e0560b49aa0a388130a6bdb8c`.
Las restricciones `NOT NULL` que PostgreSQL 18 incorpora al catálogo cuentan
dentro de `constraint`, como en las mediciones anteriores.

El inventario SQL que Prisma no describe completamente pasa de **945** a
**961** objetos: 19F añade 10 comprobaciones, dos funciones, dos índices
parciales y dos triggers. Los 16 objetos tienen atribución exacta a la nueva
migración; no queda ningún objeto sin fuente identificada.

El diff Prisma devuelto fue `-- This is an empty migration.` seguido de dos
saltos de línea. Su hash de bytes es
`e69c9f21be2b53770b13ea52bf6c4f304a9fc86b41f1e932729ec2de45574341`.
Con el único salto final utilizado por la huella histórica del diff, el hash
es `0983c8c2474f18152b093842104ef9aef25f03fb78861c9e681da2249a64a385`.
Ambas huellas quedan registradas; esto no modifica la normalización del
catálogo ni la constante histórica del diff.

## Reproducción y guardas

`scripts/canonical-migrations.mjs` exige ahora los 37 nombres exactos y sus
archivos SQL. Los checkpoints históricos conservan su último nombre de
migración; ninguno asciende al perfil actual por coincidir en un conteo.
`scripts/crm-01b1-sql-drift-baseline.mjs` selecciona el perfil 37 solo para
`osi_db01n_ci` y exige el catálogo completo, la atribución SQL específica,
la extensión, los checksums aplicados y los checksums revisados de 19C y 19F.

`scripts/capture-v17-fleet-drivers-catalog.mjs` captura evidencia, comprueba
que al retirar exclusivamente 19F reaparece el perfil 36 y no acepta ni
reescribe ninguna baseline. Exige `CANONICAL_DB_VALIDATION=true`, el destino
local permitido y PostgreSQL 18. El archivo completo de evidencia se escribe
en `V17_FLEET_DRIVERS_CATALOG_EVIDENCE_PATH` cuando está configurada esa
variable. El resultado siempre declara `evidenceOnly: true` y
`baselineAccepted: false`.

Las pruebas de baseline verifican la procedencia, las consultas exactas,
los checksums y las 110 filas medidas. Rechazan, entre otros cambios, eliminar
el trigger de autorización, permitir autorización propia, reducir el alcance
de una clave foránea de empresa, cambiar un índice parcial, debilitar una
comparación frente a `NULL` o invertir la relación temporal del sello. La
partición se prueba con nombres parecidos, funciones sobrecargadas y objetos
de otros esquemas para comprobar que conserva los objetos previos.

El inspector real del perfil 37 pasó después de la suite funcional de Flota
de 70 comprobaciones, con el mismo catálogo y SQL. La comprobación del
catálogo complementa esas pruebas funcionales y no las sustituye.

## Preview con extensión histórica de ingeniería

El Preview existente contiene además
`20260917010000_v17_engineering_crating`, cuya fuente SQL está ausente del
repositorio, como documenta el perfil 36. Ese destino tiene otro inventario
y otra huella global. Este perfil canónico no valida ni reconstruye esa
migración histórica.

El helper exportado `partitionFleetDriverCatalog` permite comparar los
objetos anteriores antes y después de incorporar 19F, conservando cualquier
extensión histórica. El delta 19F sí puede contrastarse con las 110 filas
medidas de este fixture. Una verificación aditiva en Preview debe conservar
su historial y demostrar igualdad de su propio catálogo previo; no debe
sustituirlo por el hash global del entorno canónico. La captura descrita en
este documento solo accedió a PostgreSQL local.
