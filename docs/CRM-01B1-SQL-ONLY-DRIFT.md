# CRM-01B1 — Reconciliación de drift SQL-only

## Resultado

- Drift Prisma administrable: vacío para 1–15 contra `origin/main` y para 1–16 contra el datamodel del PR.
- Drift SQL-only histórico: esperado, inventariado y sin cambios.
- Diff estructural inicial contra revertido en Neon: vacío.
- Objetos CRM-01B1 después de la reversión: cero.
- Migración 16: SHA-256 `77db8b909def5731693d1c8b8e2fbe020ff31f0322b2c8a57a1e18d79fc685f8`, sin modificaciones.

Dos ejecuciones READ ONLY sobre `crm01b1-rehearsal-20260811` produjeron el mismo diff Prisma vacío, con firma `0983c8c2474f18152b093842104ef9aef25f03fb78861c9e681da2249a64a385`. La comparación usa la URL tanto para `--from-url` como para resolver el datasource de `--to-schema-datamodel`; omitir la segunda propagación evalúa por error el schema `public` y genera un falso diff de creación completa.

## Procedimiento normalizado

El inventario consulta `pg_attribute`, `pg_type`/`pg_enum`, `pg_constraint`, `pg_index`, `pg_proc` y `pg_trigger`, limitado al schema `osi`. Conserva nombres y objetos reales; sólo colapsa whitespace dentro de definiciones y ordena por tipo, schema, tabla, nombre y definición. La firma es SHA-256 sobre el JSON UTF-8 resultante. No se eliminan owners, comentarios, funciones, triggers, checks, índices ni nombres reales.

La baseline PostgreSQL 18 de 1–15 contiene 4,173 entradas y firma `cf48b58f82cdaa9f2ce4e7bb3f467848ee32a3b83043977d56a896f27888dd35`. La de 1–16 contiene 4,260 entradas y firma `f220349f2c2cbdd2ae083f57ba2ae18ee66716873ffbea8057ac60147853dc1d`. En Neon restaurado, PostgreSQL no publica como constraints separados los `NOT NULL` que PostgreSQL 18 sí cataloga; excluida esa diferencia de versión, columnas, enums, FK, checks, índices, funciones y triggers tienen conteos y firmas idénticos a la baseline local 1–15. La firma formal Neon es `4d5959dc99b03a7866bc3e038fcaea611fe665a5412cb235522cc05ab5e011d3`.

## Inventario SQL-only histórico

Prisma no representa completamente los 141 checks, 25 funciones, 30 triggers y 26 índices parciales o funcionales existentes después de 1–15. No son diferencias nuevas: todos se localizaron en una migración histórica y permanecieron idénticos después de la reversión.

| Migración | Checks | Funciones | Triggers | Índices especiales |
|---|---:|---:|---:|---:|
| `20260801000000_production_baseline` | 5 | 1 | 1 | 2 |
| `20260801001000_mt01a_tenant_memberships` | 3 | 0 | 0 | 1 |
| `20260801002000_commercial_audit_log` | 2 | 1 | 1 | 1 |
| `20260801003000_approval_requests` | 11 | 1 | 1 | 1 |
| `20260801004000_risk_engine_rules_evaluations` | 11 | 2 | 5 | 2 |
| `20260801005000_logistic_override_approvals` | 2 | 1 | 1 | 0 |
| `20260801006000_quote_change_orders` | 19 | 2 | 3 | 3 |
| `20260801007000_logistics_geography_zone_rules` | 21 | 5 | 5 | 7 |
| `20260801008000_vehicle_engine_settings` | 14 | 2 | 2 | 5 |
| `20260801009000_logistics_rate_metadata` | 4 | 2 | 2 | 0 |
| `20260801010000_crate_settings` | 13 | 3 | 4 | 2 |
| `20260801011000_mt01b_auth_sessions` | 6 | 0 | 0 | 1 |
| `20260801012000_mt01c1a_employee_profiles` | 8 | 1 | 1 | 0 |
| `20260801013000_mt01c1b1_provisioning_persistence` | 21 | 3 | 3 | 1 |
| `20260801014000_mt01c2b1_commercial_tenant_foundation` | 1 | 1 | 1 | 0 |

Cada objeto afecta sólo las restricciones o contratos definidos por su migración; el ensayo no los corrigió, eliminó ni recreó. La guardia canónica calcula también firmas de todas las columnas, enums, FK, constraints e índices normales, de modo que un objeto agregado, retirado o modificado falla aunque Prisma no lo modele.

## Delta exacto CRM-01B1

La migración 16 agrega 87 entradas de catálogo normalizadas: 25 columnas, 12 labels de enum, 13 checks, 19 constraints administrados por PostgreSQL 18, 6 FK, 6 índices, 3 funciones y 3 triggers. La baseline SQL-only aumenta en 19 objetos: 13 checks, las funciones `pipeline_case_commands_reject_mutation`, `pipeline_case_commands_validate_case_state` y `pipeline_cases_require_coherent_command`, y los triggers append-only, inmediato y diferido.

El delta local 1–15 → 1–16 no contiene objetos retirados ni definiciones históricas modificadas. Tras revertir el ensayo Neon, no existen la tabla `pipeline_case_commands`, los enums `PipelineCaseCommandType`/`PipelineCaseEvidenceType`, las columnas CRM-01B1, sus funciones o sus triggers. Los fingerprints independientes inicial/final son:

- Estructura: `d27983046c41ed270d3491510dd6bf6ec0bc439d6b3607b3ac97adada781c5b4`.
- Historia: `867f3ce3cb8110c0883874c70db77c87e9dd69a13c1f4940722bb9d192a36f82`.

## Autoridad temporal futura

El servicio futuro obtendrá `statusChangedAt` mediante `transaction_timestamp()` o equivalente dentro de PostgreSQL y dentro de la transacción de mutación. No aceptará el reloj del navegador, un timestamp del request ni el reloj del proceso Node como autoridad. La tolerancia de cinco segundos valida coherencia; no delega autoridad temporal al cliente.
