# Catálogo canónico 36: identidad de usuarios 19C

## Alcance y procedencia

Este perfil corresponde a las 35 migraciones canónicas anteriores más
`20261030010000_v17_user_identity_enrollment`. Su destino es la base desechable
de CI `osi_db01n_ci`, esquema `osi`, en `127.0.0.1:55432`.

La medición se obtuvo después de desplegar desde cero, repetir el despliegue
sin migraciones pendientes y comprobar que Prisma devolvía una migración vacía.
La captura se hizo en una transacción de sólo lectura. Estos datos identifican
la evidencia revisada:

| Dato | Valor |
| --- | --- |
| Fecha UTC | 2026-10-30, 12:59 |
| Workflow | [CI 41059351747](https://github.com/frederickespin/osi-plus/actions/runs/41059351747) |
| Job | `124074868798`, `canonical-database-validation` |
| Head revisado | `6db6c366f5bb61b9f11cd8cfe0d2336b75df7324` |
| Artifact | `12978656029`, `v17-user-identity-catalog-evidence` |
| SHA-256 del ZIP descargado | `4f6093b29d4c05291e0655f8d7f3c86b1dc07985508a8b05c4fadd709d62d04b` |
| PostgreSQL | `18.6 (Debian 18.6-1.pgdg13+2)`, `180006` |
| Collation / character type | `en_US.utf8` / `en_US.utf8` |
| SHA-256 de SQL 19C | `328529a4c68c8203d279c148c33bb70562c1b9fb6024b0d9f09c390976d3ca50` |

El ZIP se verificó contra el digest publicado por GitHub antes de extraer el
JSON. Se comprobaron los nombres y estados de las 36 migraciones y sus
checksums contra los archivos del repositorio. La captura no aceptó ni
reescribió automáticamente una baseline.

## Huella aprobada

Perfil: `canonical-36-user-identity-19c`.

- Objetos del catálogo: **10 569**.
- SHA-256 total: `481649e8c88db832d1f313f7e3a4a785f28a1d49c4277dc21eac179fef16cb54`.
- Inventario SQL que Prisma no describe completamente: **945 objetos**,
  atribuidos a sus 36 migraciones.
- Extensión conservada: `btree_gist 1.8`, esquema `osi`, 212 miembros;
  huella `5768fa15ad9dc973614d90b162eeb87fbef323dc2b76e019e0f07a454623d5cc`.

| Categoría | Perfil 35 | Perfil 36 | Diferencia |
| --- | ---: | ---: | ---: |
| `check` | 390 | 406 | 16 |
| `column` | 3 732 | 3 772 | 40 |
| `constraint` | 2 996 | 3 032 | 36 |
| `enum` | 1 102 | 1 102 | 0 |
| `foreign_key` | 656 | 661 | 5 |
| `function` | 299 | 299 | 0 |
| `index` | 1 103 | 1 114 | 11 |
| `trigger` | 183 | 183 | 0 |
| **Total** | **10 461** | **10 569** | **108** |

Los 108 objetos añadidos pertenecen exclusivamente a
`osi.tenant_user_identities` y `osi.user_enrollments`. PostgreSQL 18 incluye
las restricciones `NOT NULL` en la categoría `constraint`; por eso esta
categoría supera la suma de claves primarias y únicas.

Al excluir únicamente las filas de esas dos tablas de la captura, se
reprodujeron **el total y los ocho hashes de categorías** del perfil 35,
incluida su huella total
`2edda06f3606ce0546fcf4ed7435153e5b77986e0cc2d54c3d661785f06002a3`.
Las consultas del catálogo y su normalización permanecen iguales. Los
perfiles históricos, las migraciones anteriores y sus huellas se conservan.

La migración 19C añade al inventario SQL específico 16 comprobaciones y dos
índices parciales. El inventario anterior de 927 objetos se reprodujo sin
diferencias; los miembros de la extensión conservaron su atribución mediante
`pg_depend`.

## Comprobaciones y límites

`scripts/crm-01b1-sql-drift-baseline.mjs` selecciona el nuevo perfil sólo para
el destino canónico de CI. Exige el inventario cerrado de nombres, los
checksums aplicados, el checksum exacto revisado del SQL 19C, el catálogo
completo y el inventario SQL específico. Los destinos históricos de 22
migraciones siguen exigiendo su checkpoint; el perfil 35 mantiene su
checkpoint nominal y sus constantes congeladas. El inspector no admite
reemplazos de baseline ni selección por el conteo observado.

`tests/crm-01b1/user-identity-19c-catalog.json` conserva la procedencia y las
108 filas nuevas de la medición para pruebas sin conexión. La suite de
baseline comprueba que eliminar el `CHECK` de fotografía o cambiar una
condición de rol, tamaño de foto, clave foránea, índice parcial o tipo de
columna altera la huella y se rechaza. También rechaza cambios de categorías,
un historial con nombres distintos y SQL 19C modificado aunque el checksum
aplicado se altere para coincidir con él.

La captura inicial de catálogo se completó antes de la suite funcional de
identidad. Esa primera suite se detuvo por un fixture de revocación que
incluía un mismo permiso en `grantedPermissions` y `deniedPermissions`; la
restricción histórica lo rechazó. El fixture se corrigió retirando el
permiso concedido al negarlo. El resultado de una medición de catálogo no
sustituye la posterior ejecución completa de las suites funcionales.

## Separación del Preview existente

Este perfil de 36 migraciones significa **35 canónicas + identidad 19C**.
El historial del Preview aportado por el usuario incluía además
`20260917010000_v17_engineering_crating`, cuyo SQL no está en este repositorio
y no fue reconstruido ni revisado. Ese destino es diferente y no se acepta
por coincidir en el número 36. Su posible adopción de 19C requiere su propia
comprobación del historial y del destino; la captura descrita aquí no accedió
a Neon ni modificó un Preview o Production.
