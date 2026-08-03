# DB-01K — Consolidación final local

Fecha de cierre: 2026-08-01 (America/Santo_Domingo)

Ámbito: PostgreSQL local aislado en `127.0.0.1:55432`. Producción no fue consultada, conectada ni modificada durante DB-01K.

## 1. Nueva cadena activa

`prisma/migrations` contiene exclusivamente estas 11 migraciones, en orden:

1. `20260801000000_production_baseline`
2. `20260801001000_mt01a_tenant_memberships`
3. `20260801002000_commercial_audit_log`
4. `20260801003000_approval_requests`
5. `20260801004000_risk_engine_rules_evaluations`
6. `20260801005000_logistic_override_approvals`
7. `20260801006000_quote_change_orders`
8. `20260801007000_logistics_geography_zone_rules`
9. `20260801008000_vehicle_engine_settings`
10. `20260801009000_logistics_rate_metadata`
11. `20260801010000_crate_settings`

Los SQL definitivos son byte-idénticos a los SQL experimentales validados. El cambio fue de ubicación y nombre, no de semántica.

## 2. Protección del árbol de trabajo

- Rama auditada: `opt/phase-2-limpieza`; HEAD inicial `58a0db6fe937a25ba0e861b3a8de260cf7ff66d4`.
- El inventario previo registró 765 entradas existentes en el árbol sucio y 26 migraciones activas.
- No se hizo `commit`, `push`, reset ni limpieza de cambios ajenos.
- El inventario reproducible está en `DB-01K-PRECHANGE-INVENTORY.json`.
- `.env`, `.env.local`, `.env.*.local` y `.env.vercel*` permanecen ignorados por Git.
- Dos exportaciones locales ignoradas de Vercel recibieron únicamente el parámetro `schema=osi`; no se imprimieron ni cambiaron credenciales.

## 3. Archivo histórico

Las 26 migraciones anteriores se conservaron en `prisma/migration-archive/pre-db01`. `MANIFEST.json` registra tamaño, SHA-256, codificación, bytes nulos, Git blob cuando existe, evidencia histórica observada y motivo de archivo.

La migración `20260219_ops_pst_flow` conserva exactamente:

- SHA-256: `e4ebfed5843190e1e13f3d40cdce9db3ab2ff38e0e8659a06500e12216dd70f1`.
- 34,626 bytes.
- UTF-16LE con BOM.
- 17,312 bytes nulos.
- Git blob: `ff80953ff9f4790d82412aad609499dc69ec0d94`.

Las migraciones `20260121211455_init`, `20260123004649_add_crate_plan` y `20260123005908_update_crate_plan_schema` se registran solamente como metadatos; no se inventó SQL.

## 4. Mapa y hashes

- `DB-01K-MIGRATION-NAME-MAP.json` contiene las 11 correspondencias experimental → definitiva.
- `DB-01K-HASHES.sha256` contiene los hashes de las 11 migraciones, `schema.prisma` y el manifiesto.
- Hash del datamodel consolidado: `7d64c2d4e67b7f04ccc2e5d8dc24896da89d0183b6645fb6c66ab8d22e00d413`.
- Hash del manifiesto final: `d82d2273ed43e78c03645dc4911a115d7a5a21c37f9e57a8608038c8ca1f83f7`.

## 5. Datamodel principal

`prisma/schema.prisma` representa el baseline de producción reconstruido más MT-01A y DB-01D a DB-01J:

- 103 modelos del esquema `osi`.
- `QuoteV2` no existe en el datamodel activo.
- Se conservaron nombres de código, `@map` y `@@map` compatibles.
- Las siete tablas heredadas de `public` siguen en el SQL del baseline, sin modelos activos.
- La relación compuesta opcional de actor en `risk_engine_settings`, que Prisma no puede expresar fielmente, está documentada e ignorada solo a nivel de relación; la FK real permanece en SQL.
- El diff semántico entre la base reproducida y el datamodel es vacío.

La decisión sobre `QuoteV2` permanece documentada en `DB-01J-QUOTEV2-DECISION.md`.

## 6. Configuración y CI

- Las URLs locales Prisma auditadas usan `schema=osi`.
- CI usa Node 24 y URLs ficticias con `schema=osi`.
- CI ejecuta el validador de destino antes de `prisma validate` y build.
- `scripts/validate-prisma-schema-target.mjs` revisó 45 archivos activos y no encontró `schema=public` ni un `search_path` activo fijado a `public`.
- El lint excluye artefactos generados, exportaciones y el archivo histórico; esos archivos no forman parte del código desplegado.

## 7. Feature flags y activación

- `LEGACY_ONLY` continúa siendo el valor predeterminado en los modelos versionados.
- `SHADOW` no fue activado; los servicios de geografía, vehículos y cajas rechazan su activación salvo una autorización explícita de pruebas.
- `ENFORCED` continúa rechazado por los servicios.
- Los adaptadores de ApprovalRequest y QuoteChangeOrder retornan `LEGACY_ONLY` mientras sus flags explícitos estén apagados.
- `api/cases/_service.js` tiene un guard fijo de almacenamiento DB-01 apagado. Las rutas activas no consultan ni escriben CommercialAuditLog, ApprovalRequest, LogisticOverrideApproval o QuoteChangeOrder.
- No se habilitó escritura dual ni endpoint nuevo.
- No se insertaron reglas, configuraciones de riesgo ni CrateSettings en la base fresca.
- Los valores heredados 57, 55 y 220 continúan únicamente en fuentes legacy; no se importaron a las tablas relacionales.
- `COSNTANZA` solo existe como alias de compatibilidad/dry-run para `CONSTANZA`; no se importaron localidades ambiguas.

## 8. Reproducción desde base vacía

Base sintética: `osi_db01k_fresh_20260801`.

- `prisma migrate deploy`: 11/11 migraciones aplicadas.
- Segundo deploy: ninguna migración pendiente.
- `prisma migrate status`: base actualizada.
- `_prisma_migrations`: una tabla en `osi`, 11 registros completados.
- `public._prisma_migrations`: inexistente.
- Tablas base: 104 en `osi` contando `_prisma_migrations`; 7 heredadas en `public`.
- `prisma migrate diff`: `This is an empty migration`.
- No se cargaron datos reales.

## 9. Ensayo de adopción

Base sintética separada: `osi_db01c_db01k_adoption_20260801`.

Procedimiento ensayado:

1. Restauración del baseline estructural.
2. Creación de historias sintéticas equivalentes a los dos escenarios heredados.
3. Preservación de la historia antigua con nombre legacy.
4. Registro local del baseline como aplicado.
5. Deploy de las 10 migraciones posteriores.
6. Backfill de 18 usuarios sintéticos, repetido de forma idempotente.
7. Segundo deploy y diff.
8. Restauración del respaldo estructural/datos sintéticos previo al ensayo.

Resultado:

- Datos sintéticos comerciales previos intactos: 1 cliente, 1 caso y 18 usuarios.
- Historia canónica: 11 registros; historia legacy preservada: 3 registros.
- Segundo deploy sin pendientes.
- Cero diferencias inesperadas. La única diferencia esperada es la tabla preservada `_prisma_migrations_legacy_db01c`, deliberadamente fuera del datamodel.
- Rollback por restauración devolvió exactamente la historia y objetos previos y eliminó Tenant/TenantMembership de la simulación.
- Resultados completos: `DB-01K-ADOPTION-RESULTS.json` y `DB-01K-ADOPTION-DIFF.sql`.

## 10. Pruebas

Pasaron:

- `prisma validate`.
- `prisma generate` con Prisma 6.19.2.
- Build Vite: 3,870 módulos.
- TypeScript `tsc --noEmit`.
- Pruebas de dominio: 7 archivos, 24/24.
- Lint focalizado de los artefactos DB-01K y servicios DB-01 modificados.
- MT-01A: dos backfills (18 creados; luego 18 existentes) y 7/7 restricciones.
- DB-01D: 21/21.
- DB-01E: 37/37.
- DB-01F: 38/38.
- DB-01G: 46/46.
- DB-01H: 35/35.
- DB-01I: 36/36.
- DB-01J: 31/31.
- Total de aserciones DB locales reportadas: 251/251.

El lint global no está limpio por errores preexistentes fuera de DB-01K en el árbol compartido, entre ellos `api/_lib/simplePdf.js`, varias secciones ya modificadas de `api/cases/_service.js`, `api/leads/_gateway.js`, `api/surveys`, `src/App.tsx` y pruebas de rendimiento. No se alteraron esos comportamientos no relacionados. Los errores DB-01 detectados en `quoteChangeOrder.js` y `vehicleImport.js` sí fueron corregidos, y el conjunto focalizado termina sin errores ni advertencias.

## 11. Auditoría de código

- No hay referencia activa a `QuoteV2`.
- No hay consulta runtime directa a tablas `public`; el ensayo local sí consulta deliberadamente la historia legacy.
- No hay import de adaptadores experimentales desde endpoints activos.
- Los nombres experimentales `z/zz/...` solo aparecen en el mapa/finalizador y fuentes históricas.
- Los errores críticos de los servicios relacionales no se convierten en éxito silencioso; además, esos servicios permanecen desconectados de rutas activas.
- Los fallbacks P2021 existentes pertenecen a compatibilidad legacy y no activan DB-01.

## 12. Archivos DB-01K

Creados:

- `prisma/migrations/README.md` y las 11 carpetas definitivas.
- `prisma/migration-archive/pre-db01/README.md` y `MANIFEST.json`.
- `prisma/db01/DB-01K-PRECHANGE-INVENTORY.json`.
- `prisma/db01/DB-01K-MIGRATION-NAME-MAP.json`.
- `prisma/db01/DB-01K-HASHES.sha256`.
- `prisma/db01/DB-01K-ADOPTION-RESULTS.json`.
- `prisma/db01/DB-01K-ADOPTION-DIFF.sql`.
- `prisma/db01/schema.pre-db01k.prisma`.
- `scripts/db01k-inventory.mjs`.
- `scripts/db01k-finalize-artifacts.mjs`.
- `scripts/db01k-adoption-rehearsal.ps1`.
- `scripts/db01k-normalize-local-env-schema.mjs`.
- `scripts/validate-prisma-schema-target.mjs`.

Modificados dentro del alcance:

- `prisma/schema.prisma`.
- `.github/workflows/ci.yml`.
- `eslint.config.js`.
- `prisma/db01/canonical-migrations/README.md`.
- `api/cases/_service.js` (desconexión explícita de persistencia DB-01).
- `api/_lib/logisticsZoneRules.js` y `scripts/db01h-test.mjs` (moneda/unidad explícitas, sin inferir tasas).
- `api/_lib/quoteChangeOrder.js` y `api/_lib/vehicleImport.js` (limpieza de lint DB-01).
- `scripts/db01j-dry-run.mjs` (nombre definitivo de migración).

Movidos:

- Las 26 migraciones pre-DB-01 desde `prisma/migrations` hacia `prisma/migration-archive/pre-db01`; el detalle individual está en el manifiesto.

## 13. Riesgos y siguiente puerta de control

- El repositorio continúa con un árbol de trabajo ampliamente modificado; antes de integrar debe separarse cuidadosamente el cambio DB-01K de cambios ajenos.
- El lint global debe limpiarse en una tarea separada antes de convertirlo en bloqueo obligatorio de CI.
- La adopción real necesita una nueva autorización, respaldo verificable, ventana operativa, lectura previa de ambas historias `_prisma_migrations`, comparación de hashes y un ensayo actualizado sobre clon de producción.
- No debe ejecutarse el baseline sobre producción. La adopción usa registro administrativo controlado, no reejecución del DDL del baseline.
- No se inició MT-01B.
- No se activaron endpoints, escritura dual, SHADOW ni ENFORCED.

Confirmación final: DB-01K no utilizó la conexión de producción y no leyó ni modificó ninguna fila o estructura de producción.
