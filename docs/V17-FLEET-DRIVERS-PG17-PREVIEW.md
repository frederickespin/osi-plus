# Flota 19F: compatibilidad del Preview con PostgreSQL 17

## Versión observada y decisión

El Preview consolidado utiliza **PostgreSQL 17.11** (`server_version_num=170011`). La versión se obtuvo el 31 de octubre de 2026 mediante una única consulta de metadata `SHOW server_version_num`, ejecutada con la conexión existente del build del commit `17ebc387625c0761d254a22f17db27f8efd16274`. El deployment de diagnóstico fue `dpl_Ey9rHVfBPMBgcd7E2si5Pvq9odyu`, target Preview y rama `feature/v17-consolidated-preview`.

El CHECK anterior confirmó la base `v17_consolidated_preview_10b` y la rama Neon `br-mute-credit-ahxnvfx0`, y se detuvo antes de migrar al exigir PostgreSQL 18. Esa exigencia provenía del entorno canónico de pruebas, no de una medición previa del servidor del Preview. El diagnóstico consultó sólo la versión y no extrajo credenciales ni registros empresariales.

La migración 19F se valida ahora contra 17.11 en una base sintética independiente. El runner admite únicamente los majors con evidencia medida propia: 17 y 18. Selecciona la fixture por la versión real del servidor y valida su procedencia, el checksum de la migración, la consulta de catálogo y el delta. La versión y major observados se incluyen como números no secretos en la salida del CHECK.

## Evidencia separada

`tests/crm-01b1/fleet-drivers-19f-pg17-catalog.json` contiene la medición propia de 17.11. No se obtiene filtrando o recalculando la fixture 18. Se conserva sin cambios el perfil canónico 37 de PostgreSQL 18, sus baselines anteriores y sus consultas y normalizadores.

PostgreSQL 17 representa los `NOT NULL` en los atributos de las columnas; PostgreSQL 18 también los registra como restricciones del catálogo. Por eso sus huellas no son intercambiables. La captura conserva las verificaciones de nulabilidad mediante el mismo `CATALOG_SQL` usado por los perfiles existentes. Referencias oficiales: [pg_constraint en PostgreSQL 17](https://www.postgresql.org/docs/17/catalog-pg-constraint.html) y [pg_constraint en PostgreSQL 18](https://www.postgresql.org/docs/18/catalog-pg-constraint.html).

| Captura medida en 17.11 | Filas | SHA-256 |
| --- | ---: | --- |
| Antes, 36 migraciones | 7835 | `df3ed7f1e49155adb21d0a7022138759e5e1950dacb5667ce7b8b47698b07dd3` |
| Después, 37 migraciones | 7919 | `58bcc913ef4b0f19fda14ef3f3b2a88e00b47926d4c63996f4a78b749f72e1bc` |
| Delta 19F | 84 | `8cf9da443408d0b68af2913407fa1d0b3d6cdeff5830d89dbfc56c0b72f412a4` |

El delta contiene 40 columnas, 2 restricciones de PK, 10 checks, 11 FK, 2 funciones, 17 índices y 2 triggers. En esta instancia se midió `btree_gist` 1.7 con 188 miembros. La extensión y el catálogo previo permanecieron idénticos después de aplicar 19F.

El ensayo usa `127.0.0.1:55433`, base `osi_fleet_17_compat`, esquema `osi`, locale `C.UTF-8` y timezone UTC. Las credenciales son sintéticas. El helper local exige el modo explícito `V17_FLEET_DRIVERS_LOCAL_COMPAT=PG17` y la URL dedicada `V17_FLEET_DRIVERS_PG17_DATABASE_URL`; valida URL, identidad real, puerto, major 17 y ausencia de Neon. No toma una conexión genérica como alternativa.

## Ensayo reproducible

El workflow `fleet-preview-pg17.yml` utiliza PostgreSQL 17.11 y una imagen oficial fijada por digest. Antes de aplicar SQL confirma una base local vacía con la identidad esperada. Copia sin modificar las 36 migraciones anteriores a una carpeta temporal y ejecuta:

1. Aplicación de 36 migraciones y captura `--before`.
2. Aplicación de la migración 19F original, con su checksum fijo.
3. Captura `--after --previous`, que debe reproducir íntegramente el catálogo anterior al retirar únicamente los objetos nuevos 19F y debe coincidir con el delta medido para 17.
4. Segundo deploy sin nuevas migraciones y otra captura de replay.
5. Suite completa de asignaciones y autorizaciones de Flota en el modo local 17.

El mismo test conserva su entrada canónica de PostgreSQL 18 cuando el modo de compatibilidad no está seleccionado. Los guards generales de esquema y de la cadena canónica permanecen intactos.

## Adopción del Preview

Se mantienen la identidad de base y branch, transacciones de lectura, selección temporal del esquema, tenant activo, historial cerrado y checksum SQL. APPLY continúa ligado al commit integrado y a la huella del catálogo previo devuelta por CHECK, con las compuertas 19F apagadas. Tras aplicar se verifican el delta del major correspondiente y la conservación del catálogo e historial anteriores.

La extensión histórica de ingeniería del Preview conserva su registro y catálogo. Su SQL ausente no se reconstruye ni se declara revisado. Las pruebas de datos siguen siendo sintéticas y locales/CI; la adopción del Preview no crea choferes, vehículos, solicitudes ni concesiones de permisos.
