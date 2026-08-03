# DB-01N — Aislamiento Git y validación reproducible

Fecha: 2 de agosto de 2026
Estado: extracción preparada en worktree separado; **sin commits** porque build y TypeScript del HEAD limpio no pasan.

## 1. Protección del árbol original

Antes de crear el worktree se registró:

- rama: `opt/phase-2-limpieza`;
- HEAD: `58a0db6fe937a25ba0e861b3a8de260cf7ff66d4`;
- entradas de `git status`: 717;
- cambios atribuidos por la auditoría anterior a DB-01/MT-01A: 82;
- cambios ajenos: 635.

No se ejecutó `git reset`, `git checkout`, `git restore`, `git clean` ni `git stash`. Al cierre, el árbol original conserva la misma rama, HEAD y 717 entradas.

## 2. Worktree

- Ruta: `C:\Users\espin\osi-plus-v17\osi-plus-erp-v17-db01-canonical`
- Rama: `chore/db01-canonical-migrations`
- HEAD de origen: `58a0db6fe937a25ba0e861b3a8de260cf7ff66d4`
- Commits por delante del origen: 0

El worktree se creó directamente desde el HEAD, sin copiar cambios sin seguimiento. La extracción se agregó después de forma explícita.

## 3. Inventario y clasificación

Las 82 entradas originales se expanden a 438 archivos porque Git agrupaba directorios sin seguimiento.

De esos 438:

- 92 se conservaron en la extracción;
- 346 se excluyeron.

El candidato completo contiene 136 cambios de archivo: 122 archivos presentes y 14 migraciones históricas retiradas del directorio activo. Tamaño de archivos conservados: aproximadamente 1.35 MiB.

Clasificación del candidato:

| Clasificación | Archivos |
| --- | ---: |
| Runtime requerido | 27 |
| Migración requerida | 55 |
| Prueba requerida | 33 |
| Documentación operativa | 17 |
| Evidencia útil | 4 |

El inventario individual está en `docs/DB-01N_FILE_INVENTORY.json`.

### Evidencia conservada

- Manifiesto del archivo histórico y hashes de cada migración.
- Hashes y mapa de nombres DB-01K.
- Decisiones de modelo, RiskEngineRule y QuoteV2.
- Datamodel reconstruido de producción como evidencia.
- Runbook DB-01M y reportes finales DB-01L/M.
- SQL administrativo de preservación y rollback.
- Este inventario reproducible.

### Artefactos excluidos

| Motivo | Archivos |
| --- | ---: |
| Clientes Prisma generados | 189 |
| Resultados locales DB-01L/M regenerables o voluminosos | 64 |
| Herramientas experimentales o específicas de una rama | 28 |
| Evidencia histórica no esencial | 27 |
| Cadena experimental duplicada | 14 |
| Resultados JSON de pruebas regenerables | 11 |
| Datamodels/SQL intermedios | 10 |
| Ensayo experimental sustituido por DB-01M | 3 |

No se incluyeron dumps, bases, URLs reales, credenciales, `.env.db01l.local`, `.env.db01n.local`, `.env.mt01a.local`, logs, clientes generados ni resultados de ejecución masivos.

## 4. Archivos compartidos y hunks

### Incluidos por hunk

- `.gitignore`: se agregaron solo `.local/mt01a-postgres-18/` y `prisma/db01/generated/`. Se excluyó el cambio ajeno `*.log`.
- `eslint.config.js`: se agregaron solo los ignores de clientes Prisma generados y archivo histórico. Se excluyeron `exports/**` y `domain/runtime/**`.
- `.github/workflows/ci.yml`: se cambió el esquema ficticio de CI a `osi`, Node a 24 para coincidir con `package.json`, y se añadieron `prisma validate` y la guarda del esquema.

### Datamodel

`prisma/schema.prisma` se incorporó como un artefacto DB-01 consolidado completo, no como mezcla de hunks. Su SHA-256 coincide con el cierre DB-01K:

`7d64c2d4e67b7f04ccc2e5d8dc24896da89d0183b6645fb6c66ab8d22e00d413`

### Excluidos por riesgo de mezclar trabajo ajeno

- `api/cases/_service.js`: contiene miles de líneas de cambios comerciales, cotización, coordinación y addendum junto a pequeños guards DB-01. No se copió ningún hunk.
- `api/_domain/logisticEngine.js`: contiene modificaciones funcionales de cálculo no necesarias para persistencia DB-01H. Se dejó en HEAD.
- `src/lib/crateSettingsStore.ts`: cambio UI/legacy no necesario para DB-01J. Se dejó en HEAD.
- Archivos de frontend y configuración logística del árbol sucio: no se copiaron para hacer pasar pruebas.

Los servicios DB-01 permanecen desconectados de endpoints activos por defecto. Las pruebas llaman directamente los servicios relacionales.

### Ajustes de reproducibilidad hechos solo en los archivos DB-01

- Los clientes de prueba DB-01G–J ahora usan `@prisma/client` generado desde el datamodel final, en vez de clientes experimentales versionados.
- Las guardas de las pruebas aceptan bases locales canónicas `osi_db01n_*`, manteniendo host local y puerto 55432 obligatorios.
- DB-01H usa fixtures sintéticos explícitos en la prueba de alias; ya no depende de archivos logísticos modificados fuera del alcance.
- Se añadieron dos comprobaciones faltantes que eliminaban variables sin usar en DB-01F/G.

## 5. Validación local

Base aislada: `osi_db01n_clean_20260802`, PostgreSQL local `127.0.0.1:55432`, `schema=osi`. No contiene datos personales.

| Validación | Resultado |
| --- | --- |
| `npm ci --ignore-scripts` | Pasó; no cambió versiones |
| Primer `prisma migrate deploy` | Pasó, 11/11 migraciones |
| Segundo deploy | Pasó, ninguna pendiente |
| `prisma validate` | Pasó |
| `prisma generate` | Pasó, Prisma 6.19.2 |
| `prisma migrate status` | Actualizado |
| `prisma migrate diff` | Vacío |
| Guarda de esquema | 36 archivos activos, ninguno con `schema=public` |
| `git diff --check` | Pasó |
| ESLint focalizado | 0 errores; 8 warnings de salida `console` en scripts CLI |
| MT-01A | 7/7 restricciones; backfills 18/0 |
| DB-01D | 21/21 |
| DB-01E | 37/37 |
| DB-01F | 38/38 |
| DB-01G | 47/47 |
| DB-01H | 35/35 |
| DB-01I | 36/36 |
| DB-01J | 31/31 |
| Total DB-01/MT-01A | 252/252 |
| Pruebas de dominio | 5 archivos, 16/16 |
| Build | **Falló por dependencia ajena ausente del HEAD** |
| TypeScript | **Falló con 448 errores fuera del conjunto aislado** |

### Bloqueo de build confirmado

`src/components/modules/UsersModule.tsx`, presente en HEAD, importa:

`src/modules/evaluator-app/utils/evaluatorPhoto`

Ese archivo no existe en HEAD; está agregado solamente en el árbol sucio original (`A src/modules/evaluator-app/utils/evaluatorPhoto.ts`). Copiarlo habría introducido uno de los 635 cambios ajenos. La extracción lo rechazó correctamente y el build falló con `ENOENT`.

TypeScript informa 448 errores en archivos de aplicación no incluidos; los principales están en `QuoteBuilder.tsx`, `SalesQuoteWorkspace.tsx`, `SeedData.ts` y componentes comerciales. No se copiaron sus cambios complementarios desde el árbol compartido.

### Dependencias

`npm ci` utilizó el lockfile existente. El host tiene Node 25.2.1, mientras el proyecto exige Node 24.x; CI quedó configurado con Node 24. npm reportó 19 vulnerabilidades existentes (2 bajas, 2 moderadas, 14 altas y 1 crítica). No se ejecutó `npm audit fix` ni se modificaron versiones.

### Secretos

- Cero dominios Neon detectados.
- Cero claves privadas detectadas.
- La única URL con usuario/contraseña dentro del candidato es la URL ficticia de PostgreSQL local en CI.
- Cinco coincidencias genéricas `password/secret/token` pertenecen a archivos del HEAD y no fueron introducidas por DB-01N.
- Los dos archivos de entorno usados localmente están ignorados.

## 6. Commits

No se creó ningún commit. La autorización exigía que todas las pruebas pasaran y el build/TypeScript del HEAD limpio no cumplen ese umbral.

División propuesta cuando se resuelva el bloqueo ajeno:

| Commit propuesto | Archivos | Tamaño aproximado |
| --- | ---: | ---: |
| Cadena canónica, archivo y configuración | 73 | 742,869 bytes |
| MT-01A | 8 | 17,318 bytes |
| Auditoría, aprobaciones, riesgo y adendas | 20 | 254,010 bytes |
| Geografía, flota y cajas | 25 | 231,995 bytes |
| Runbooks e inventario | 10 | 169,506 bytes |

La cadena de migraciones y `schema.prisma` deben revisarse como una unidad consistente; no conviene dejar commits intermedios donde el datamodel final no tenga todas sus migraciones.

## 7. Comparación final

- Rama limpia contra HEAD: 0 commits por delante.
- Candidato no confirmado: 136 cambios de archivo.
- Archivos presentes: 122.
- Migraciones históricas retiradas del directorio activo: 14.
- Archivos DB-01 originales excluidos: 346.
- Dependencia ajena necesaria para build: `evaluatorPhoto.ts`, deliberadamente no incluida.
- Ningún secreto real encontrado en el candidato.

## 8. Garantías

- Los 635 cambios ajenos no se modificaron, restauraron, guardaron ni limpiaron.
- No se hizo commit, push, merge ni despliegue.
- No se ejecutó ningún runbook de producción.
- No se inició MT-01B.
- Producción no fue consultada ni modificada.
