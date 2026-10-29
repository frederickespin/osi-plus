# Catálogo SQL de CI: perfiles históricos y cadena consolidada

## Motivo del cambio

La cadena canónica consolidada contiene 35 migraciones. El paso de CI
`Verify explicit SQL-only catalog baseline` todavía exigía el historial y el
catálogo del checkpoint de 22 migraciones. El despliegue de las 35 migraciones,
su segunda ejecución idempotente y el diff de Prisma ya habían pasado en
[CI #287](https://github.com/frederickespin/osi-plus/actions/runs/40817285802),
pero ese paso rechazaba el historial antes de inspeccionar el catálogo.

El inspector ahora elige un perfil cerrado mediante el nombre de la base que
ya validó `createCrm01b1LocalPrisma`:

| Destino local aprobado | Perfil | Migraciones | Objetos del catálogo | Objetos SQL-only |
| --- | --- | ---: | ---: | ---: |
| `osi_db01n_ci` | `canonical-35` | 35 | 10461 | 927 |
| `osi_crm01b_local` | `historical-22` | 22 | 4486 | 285 |
| `osi_v17_case_client_local` | `historical-22` | 22 | 4486 | 285 |
| `osi_v17_case_public_ref_local` | `historical-22` | 22 | 4486 | 285 |

El destino debe seguir siendo `127.0.0.1:55432`, esquema `osi`, con identidad
real de base/servidor coincidente y sin `neon.branch_id`. El perfil no se decide
por el conteo observado ni por una variable de activación. Una base canónica
con 22 migraciones falla; una base histórica con 35 también falla.

## Reconstrucción independiente

La evidencia se produjo el 29 de octubre de 2026 utilizando exclusivamente un
PostgreSQL local efímero, sin conexiones a Neon ni datos de usuario:

- PostgreSQL `18.6 (Ubuntu 18.6-1.pgdg24.04+2)`.
- `LC_COLLATE` y `LC_CTYPE`: `en_US.utf8`; zona horaria UTC.
- Fuentes SQL del commit
  [`845626f7cc6229629170b71cec4b003cd4ed78d1`](https://github.com/frederickespin/osi-plus/commit/845626f7cc6229629170b71cec4b003cd4ed78d1).
- Las 35 fuentes SQL y `prisma/schema.prisma` permanecieron intactas.
- Cada despliegue se hizo con Prisma sobre una base vacía, sin crear objetos
  esperados a partir de un catálogo preexistente.

Secuencia realizada:

1. Copiar sólo las primeras 22 migraciones a un directorio temporal, sin editar
   el repositorio. Aplicarlas a una base histórica vacía.
2. Comparar su catálogo con las firmas históricas ya congeladas: coinciden el
   total, las ocho categorías y los 285 objetos SQL-only.
3. Aplicar las 35 migraciones aprobadas a `osi_db01n_ci` vacía. Capturar el
   historial, los checksums, las filas completas del catálogo, el inventario
   SQL-only y las dependencias de extensión en una transacción de solo lectura.
4. Recrear únicamente esa base efímera, nuevamente vacía, y aplicar las mismas
   35 migraciones. Comparar las filas completas y las dependencias, además de
   las firmas y conteos. Ambas reconstrucciones coinciden.
5. Ejecutar el inspector con los dos perfiles congelados. Ambos aceptan sus
   respectivos destinos y todos los objetos SQL-only quedan atribuidos.

| Reconstrucción | SHA-256 del catálogo normalizado |
| --- | --- |
| Histórica 22, coincide con la firma previa | `ddf3e8851410807ce123160010ef727ff8c1e757f545b299a871f5bc9ab7427e` |
| Canónica 35, primera base vacía | `2edda06f3606ce0546fcf4ed7435153e5b77986e0cc2d54c3d661785f06002a3` |
| Canónica 35, segunda base vacía | `2edda06f3606ce0546fcf4ed7435153e5b77986e0cc2d54c3d661785f06002a3` |

El manifiesto de fuentes ordenado por nombre de migración tiene SHA-256
`d1ff869dab90b80768bfaf1c833201d424e184c8a22ae195f87ce762315d1b95`.
Su material exacto es la concatenación UTF-8 de una línea por migración:
`nombre + " " + sha256(bytes_de_migration.sql) + "\n"`.

## Se conserva la medición histórica

`CATALOG_SQL` y `SQL_ONLY_SQL` se compararon byte por byte con las consultas del
commit fuente. Sus textos y la normalización de definiciones no cambiaron:

| Consulta | SHA-256 del texto |
| --- | --- |
| `CATALOG_SQL` | `04aea6b13957570b4939bf9362cfb7d64e6891da94f2ba6b2f3f1c48fd6ae0c4` |
| `SQL_ONLY_SQL` | `b0b5e65a1baa8098c2cbe50bb369e836d2446cdfac34ef0fb0e0ab4f8505dcfe` |

El perfil de 35 migraciones conserva todas las categorías y congela sus
definiciones completas, además del total:

| Categoría | Histórica 22 | Canónica 35 |
| --- | ---: | ---: |
| `check` | 172 | 390 |
| `column` | 1773 | 3732 |
| `constraint` | 1303 | 2996 |
| `enum` | 471 | 1102 |
| `foreign_key` | 219 | 656 |
| `function` | 39 | 299 |
| `index` | 466 | 1103 |
| `trigger` | 43 | 183 |

Las firmas individuales están en `CANONICAL_35_CATALOG`, dentro de
`scripts/crm-01b1-sql-drift-baseline.mjs`. No se omiten funciones ni triggers
para adaptar el conteo.

## Extensión `btree_gist`

La migración aprobada
`20260907010000_v17_tools_equipment` contiene
`CREATE EXTENSION IF NOT EXISTS btree_gist;`. En la reconstrucción instala
`btree_gist` versión `1.8` en el esquema `osi`.

Sus 212 funciones no aparecen literalmente en el SQL de la migración porque
PostgreSQL las instala mediante la extensión. El mapeo histórico por nombre
de objeto las dejaba sin atribución. Se añadió una consulta complementaria
de `pg_depend` para demostrar la pertenencia real de cada función a esa
extensión; las dos consultas históricas permanecen intactas.

El inspector exige simultáneamente:

- Extensión, versión y esquema exactos: `btree_gist`, `1.8`, `osi`.
- Los 212 miembros de función, con su identidad y atribución exactas.
- SHA-256 del inventario de miembros:
  `5768fa15ad9dc973614d90b162eeb87fbef323dc2b76e019e0f07a454623d5cc`.
- La sentencia de instalación en la migración exacta aprobada.
- El catálogo completo de funciones y sus definiciones, incluida la extensión.

Las 212 funciones se atribuyen a la migración de herramientas junto con sus
cinco funciones de aplicación. El inventario canónico cuenta 217 funciones
en esa migración y 927 objetos SQL-only en las 35 migraciones. Ningún objeto
adicional o desconocido se acepta por un prefijo de nombre.

`tests/crm-01b1/btree-gist-1.8-members.json` conserva sólo las identidades
necesarias para las regresiones, capturadas y comparadas en ambas
reconstrucciones; no contiene datos de aplicación ni un dump del catálogo.

## Validación y límites del inspector

`collectCrm01b1SqlDriftEvidence` valida el destino local, PostgreSQL 18 y el
historial exacto de migraciones. Comprueba nombres, finalización, ausencia de
rollback, un paso aplicado y checksum coincidente con cada fuente SQL. Sus
lecturas se realizan en una transacción `READ ONLY`, con límites de tiempo.
Su resultado siempre es evidencia (`evidenceOnly: true`); no declara una
baseline aceptada.

`inspectCrm01b1SqlDriftBaseline` aplica los perfiles congelados. No admite
`expectedCatalog`, `validateInventory: false` ni un perfil suministrado por
el llamador. La comprobación independiente de drift de Prisma permanece en
el paso previo del workflow.

Comprobaciones realizadas para este cambio:

- Inspector real: perfil histórico22 y perfil canónico35 aceptados.
- `node scripts/crm-01b1-sql-drift-baseline-test.mjs`: 79 comprobaciones.
- `node scripts/validate-crm-01b1-guard.mjs`: aceptado con cadena35.
- `node scripts/validate-crm-01b1-guard-test.mjs`: 18 comprobaciones.
- ESLint focal de los dos archivos JavaScript: sin errores.

Las regresiones cubren sustitución de migraciones sin cambiar el conteo,
estados incompletos/revertidos, checksums distintos, categorías alteradas,
extensiones desconocidas o de otra versión/esquema, atribución incorrecta,
miembros faltantes/adicionales, objetos SQL-only desconocidos y los antiguos
parámetros que podían desactivar la validación.
