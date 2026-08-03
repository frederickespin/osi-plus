# DB-01M — Informe final del ensayo aislado

Fecha: 2 de agosto de 2026
Destino exclusivo: rama Neon `db01l-canonical-rehearsal`
Estado final de la rama: restaurada al estado estructural y comercial inicial; rama conservada.

## 1. Causa exacta del drift

La tabla que Prisma proponía eliminar era:

`osi._prisma_migrations_legacy_pre_db01`

El drift se detectaba con:

```powershell
npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script --exit-code
```

SQL observado antes de DB-01M:

```sql
DROP TABLE "_prisma_migrations_legacy_pre_db01";
```

La tabla seguía visible porque se había conservado dentro de `osi`, el mismo esquema administrado por el datasource Prisma, pero no formaba parte del datamodel. No era una tabla empresarial; era la historia Prisma anterior renombrada. Moverla a un esquema dedicado elimina la ambigüedad sin perder la historia.

## 2. Identidad del destino

La guarda verificó antes de escribir:

- nombre de rama: `db01l-canonical-rehearsal`;
- branch fingerprint: `00cd7cc6d4408640`;
- endpoint fingerprint: `23a6b5b9ea47f9e3`;
- URL configurada con `schema=osi`;
- endpoint, branch ID y base diferentes de los valores productivos conocidos;
- `productionUsed: false` en todas las evidencias.

Aunque PostgreSQL devolvió `current_schema() = public` por el `search_path` de la sesión SQL, Prisma usó explícitamente los mappings y el esquema `osi`; la guarda validó el parámetro `schema=osi` de la conexión antes de permitir cualquier operación.

## 3. Preservación en db01_legacy

Se movieron transaccionalmente, sin reescribir filas:

- `public._prisma_migrations` → `db01_legacy.public_prisma_migrations_pre_db01`;
- `osi._prisma_migrations` → `db01_legacy.osi_prisma_migrations_pre_db01`.

| Historia | Filas antes/después | Fingerprint antes/después |
| --- | ---: | --- |
| public | 3 / 3 | `895b3f577a52e51cdb0107238d50516c9ff420228ca0277ca39eefbcb08381f8` |
| osi | 32 / 32 | `b1fed8ced3b5e9c138599f069c652d96fac0a58b83925f88419ec1f9d10202f5` |

Los cuatro controles de conteo y fingerprint pasaron. Se retiró acceso `PUBLIC` al esquema y a ambas tablas; su uso queda limitado a administración/auditoría.

## 4. Adopción y diff final

Se registró el baseline `20260801000000_production_baseline` y se aplicaron exactamente las diez migraciones `20260801001000` a `20260801010000`.

MT-01A:

- usuarios detectados: 18;
- membresías a crear: 18;
- roles/estados inválidos: 0;
- duplicados bloqueantes: 0;
- registros no migrables: 0;
- primer backfill: 18 creadas;
- segundo backfill: 0 creadas, 18 existentes.

La segunda ejecución de `migrate deploy` no encontró cambios. `migrate status` terminó actualizado. El diff final tuvo 32 bytes y contenía únicamente:

```sql
-- This is an empty migration.
```

No hubo propuesta de eliminación ni excepción administrativa conocida. Quedó una sola historia activa en `osi`; las dos anteriores quedaron fuera del esquema gestionado por Prisma.

## 5. Comparación estructural y comercial

Pasaron todos los controles:

- conteos de tablas preexistentes sin cambios;
- fingerprints protegidos sin cambios;
- owners, estados, SLA, KPI y milestones sin cambios;
- agregados por estado sin cambios;
- roles y estados heredados preservados;
- 18 membresías, 18 predeterminadas, cero discrepancias;
- tablas funcionales DB-01 vacías;
- `LEGACY_ONLY=true`; SHADOW, ENFORCED y escritura dual desactivados;
- historia activa ausente de `public` y única en `osi`;
- siete tablas empresariales heredadas de `public` intactas.

## 6. Smoke tests

Se verificó con datos sintéticos y limpieza posterior:

- login heredado: password, JWT y ruta HTTP correctos;
- lecturas: 18 usuarios, 7 clientes, 0 leads, 51 oportunidades, 11 cotizaciones;
- KPI: total consistente, 4 aprobadas y 3 enviadas;
- creación y limpieza de caso, cotización y crating sintéticos;
- cero comunicaciones externas: correo, WhatsApp, webhooks, notificaciones y cron deshabilitados;
- no se imprimieron ni descargaron datos personales.

También pasaron `prisma validate`, lint de los scripts DB-01M y `npm run build`. El build solo informó advertencias no bloqueantes de tamaño de chunks y Browserslist.

## 7. Reversión

La reversión ensayada:

1. eliminó únicamente las estructuras nuevas y la historia canónica;
2. restauró las historias de `public` y `osi` con sus nombres originales;
3. eliminó `db01_legacy` después de comprobar que quedó vacío;
4. conservó todos los fingerprints comerciales;
5. restauró exactamente el hash estructural normalizado.

Hash inicial y posterior a rollback:

`eda5871fc20c00372ccfd858ef06f6d5ad92274493e2956f0a496956914aaaca`

La rama aislada no fue eliminada.

## 8. Estado de Git

La copia de trabajo ya estaba ampliamente modificada por trabajo previo. Auditoría capturada:

- rama Git actual: `opt/phase-2-limpieza` (distinta del nombre de la rama de base de datos Neon);
- cambios totales: 717;
- relacionados con DB-01/MT-01A: 82;
- ajenos: 635;
- archivo de entorno versionado: `.env.example` únicamente;
- dos coincidencias de patrón URL con credenciales son ejemplos no secretos: `.env.example` y el PostgreSQL local de CI en `.github/workflows/ci.yml`.

No se hizo commit, push, merge ni despliegue. El listado completo está en `prisma/db01m/artifacts/git-audit.json`; los 635 cambios ajenos se preservaron sin revertirlos. La auditoría final refleja 717 entradas, incluyendo los dos documentos DB-01M creados al cierre.

Propuesta de commits separados, después de revisar y limpiar la rama:

1. `db01: baseline canónico y archivo histórico` — baseline, archivo de migraciones y documentación DB-01A/B/C/K.
2. `mt01a: tenant y membresías` — migración, scripts y documentación MT-01A.
3. `db01: migraciones funcionales experimentales` — DB-01D a DB-01J, agrupadas por migración si se desea trazabilidad máxima.
4. `db01l: ensayo de adopción aislado` — scripts y reporte DB-01L.
5. `db01m: eliminar drift legacy y runbook` — scripts, SQL, evidencias no sensibles y estos documentos.

No deben mezclarse los 635 cambios ajenos con esos commits.

## 9. Riesgos restantes

- Producción debe repetir identidad, hashes y fingerprints; el éxito de la rama no sustituye esa verificación.
- El rollback lógico solo es seguro mientras las tablas nuevas no contengan datos funcionales; después se requiere restauración de snapshot/control de forward migration.
- Las historias archivadas contienen logs históricos; aunque no se mostraron, deben conservar permisos administrativos restrictivos.
- La aplicación sigue con MT-01B detenido; User.role/JWT/RBAC siguen siendo la autoridad heredada.
- La rama contiene una gran cantidad de cambios ajenos; se requiere separación de commits antes de cualquier revisión o despliegue.
- Las URL de ejemplo versionadas deben continuar siendo claramente ficticias/locales; el pipeline debe mantener escaneo de secretos.

## 10. Confirmación

La base productiva original no fue consultada ni modificada durante DB-01M. Todas las escrituras, migraciones, backfills, smoke tests y la reversión se ejecutaron exclusivamente sobre `db01l-canonical-rehearsal`. La rama permanece disponible para revisión.
