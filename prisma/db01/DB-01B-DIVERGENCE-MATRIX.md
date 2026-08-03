# DB-01B — Matriz de 52 divergencias

Comparación: estructura real de producción restaurada localmente → `prisma/schema.prisma` deseado. Esta matriz no autoriza ningún DDL.

Clases:

- **P→Prisma:** Prisma está desactualizado y debe adaptarse a producción.
- **Futura:** producción está desactualizada; requiere migración futura.
- **Representacional:** no cambia la semántica del objeto.
- **Destructiva:** el diff automático perdería o reinterpretaría datos.
- **Decisión:** requiere decisión empresarial o de arquitectura.

| # | Tabla | Diferencia observada | Clasificación y tratamiento |
|---:|---|---|---|
| 1 | `QuoteV2` | Tabla ausente; Prisma añade índices, unique de propuesta y FK a lead | **Futura / Decisión.** No hay consumidor activo: no desplegar; decidir retiro del prototipo. |
| 2 | `account_contacts` | Falta índice `(account_id, relationship_role)` | **Futura.** Índice no destructivo; justificar con plan de consulta antes de crearlo. |
| 3 | `account_pricing_profiles` | Nombre del índice largo difiere por truncado de PostgreSQL | **Representacional.** Conservar nombre real introspectado. |
| 4 | `accounts` | Producción tiene default `now()` en `updated_at`; Prisma lo quitaría. Falta índice `legal_name` | **P→Prisma + Futura.** Preservar default; índice sólo con evidencia de consulta. |
| 5 | `approval_requests` | Tabla ausente; Prisma espera índice `quote_id` | **Futura.** Crear con migración de aprobaciones y backfill desde `milestonesJson`. |
| 6 | `catalog_assumptions` | Prisma quitaría default `now()` de `updated_at` | **P→Prisma.** Mantener default existente. |
| 7 | `catalog_materials` | Prisma quitaría default `now()` de `updated_at` | **P→Prisma.** Mantener default existente. |
| 8 | `catalog_service_flags` | Prisma quitaría default `now()` de `updated_at` | **P→Prisma.** Mantener default existente. |
| 9 | `catalog_service_types` | Prisma quitaría default `now()` de `updated_at` | **P→Prisma.** Mantener default existente. |
| 10 | `catalog_special_handling` | Prisma quitaría default `now()` de `updated_at` | **P→Prisma.** Mantener default existente. |
| 11 | `catalog_surcharges` | Prisma quitaría default `now()` de `updated_at` | **P→Prisma.** Mantener default existente. |
| 12 | `code_sequences` | Cambio de tipo en `created_at` y `updated_at`; además se quitaría default `now()` | **Destructiva / Decisión.** No convertir timestamps automáticamente; definir zona horaria y consumidores antes. |
| 13 | `commercial_audit_logs` | Tabla ausente; Prisma espera índice `(entity, entity_id, created_at)` | **Futura.** Migración de auditoría con retención/inmutabilidad definidas. |
| 14 | `contacts` | Se quitaría default `updated_at`; se añadiría índice `full_name` | **P→Prisma + Futura.** Preservar default; evaluar índice para búsqueda. |
| 15 | `crating_requests` | Se quitaría default `updated_at`; se añadiría índice `(case_id, status)` | **P→Prisma + Futura.** Preservar default; índice no destructivo posterior. |
| 16 | `events` | Prisma quitaría default `now()` de `updated_at` | **P→Prisma.** Mantener default existente. |
| 17 | `location_access_profiles` | Prisma quitaría default `now()` de `updated_at` | **P→Prisma.** Mantener default existente. |
| 18 | `locations` | Se quitaría default `updated_at`; se añadiría índice `(country, city)` | **P→Prisma + Futura.** Preservar default; medir consulta geográfica antes del índice. |
| 19 | `logistic_override_approvals` | Tabla ausente; Prisma espera índice `(case_id, quote_id, approved_at)` | **Futura.** Migración de aprobaciones; riesgo alto de trazabilidad. |
| 20 | `osi_escalation_events` | Sustituye `suggestionId`, `targetRoles`, `type`, resolución y `metadataJson` por tenant/ref/target/kind; quita FK e índices existentes | **Destructiva / Decisión.** Son dos modelos funcionales distintos; conservar producción y diseñar migración aditiva con mapeo explícito. |
| 21 | `osi_geo_regions` | Tabla ausente; Prisma espera unique `(country, code)` e índice `(country, active, name)` | **Futura.** Migración geográfica con seed versionado. |
| 22 | `osi_lead_volume_estimates` | Prisma quitaría default `now()` de `updatedAt` | **P→Prisma.** Mantener default existente. |
| 23 | `osi_leads` | Prisma añade `cotizadorMode`, `tipoServicio` y quitaría default de `updatedAt` | **Futura + P→Prisma.** Columnas sólo con backfill/default de negocio; preservar timestamp. |
| 24 | `osi_osi_change_logs` | Reemplaza action/actor role+user/before+after/fieldPath por tenant/actor/field/from/to; añade FK | **Destructiva / Decisión.** No sustituir auditoría histórica; modelo nuevo debe ser aditivo o migrado con evidencia. |
| 25 | `osi_osi_handshakes` | Elimina estado, roles, usuarios, payload y tiempos; introduce driver/supervisor/location/scannedAt/tenant | **Destructiva / Decisión.** Semántica incompatible; separar handshake de escaneo si ambos procesos siguen vigentes. |
| 26 | `osi_osis` | Cambia enums `kind/custodyStatus/type`, hace cuatro campos requeridos nullable, añade servicio/duración/custodia e intercambia FKs | **Destructiva / Decisión.** Bloquear diff automático; reconciliar estado por estado y validar integridad de proyecto/cliente. |
| 27 | `osi_pipeline_case_quotes` | Prisma quitaría default `now()` de `updatedAt` | **P→Prisma.** Mantener default existente. |
| 28 | `osi_pipeline_cases` | Prisma quitaría defaults de `flags=[]` y `updatedAt=now()` | **P→Prisma / Decisión.** Preservar ambos hasta demostrar que todas las escrituras envían valores. |
| 29 | `osi_pipeline_crating_requests` | Prisma quitaría default `now()` de `updatedAt` | **P→Prisma.** Mantener default existente. |
| 30 | `osi_pipeline_events` | Prisma quitaría default `now()` de `updatedAt` | **P→Prisma.** Mantener default existente. |
| 31 | `osi_project_coordination_communications` | Sólo difiere el nombre truncado del índice `(coordination_id, sent_at)` | **Representacional.** Conservar nombre real. |
| 32 | `osi_ptf_adjustment_suggestions` | Sustituye evidencia operacional y estado `PENDING` por tenant/mensaje/evidence/asignación y estado `OPEN`; quita índice | **Destructiva / Decisión.** Mantener modelo real; cualquier V2 debe ser aditivo y tener tabla de mapeo de estados. |
| 33 | `osi_survey_item_nesting` | Prisma quitaría default `now()` de `updatedAt` | **P→Prisma.** Mantener default existente. |
| 34 | `osi_survey_items` | Prisma quitaría default `now()` de `updatedAt` | **P→Prisma.** Mantener default existente. |
| 35 | `osi_survey_rooms` | Prisma quitaría default `now()` de `updatedAt` | **P→Prisma.** Mantener default existente. |
| 36 | `osi_survey_signatures` | Prisma quitaría default `now()` de `updatedAt` | **P→Prisma.** Mantener default existente. |
| 37 | `osi_survey_site_access` | Prisma quitaría default `now()` de `updatedAt` | **P→Prisma.** Mantener default existente. |
| 38 | `osi_surveys` | Prisma quitaría default `now()` de `updatedAt` | **P→Prisma.** Mantener default existente. |
| 39 | `osi_tipos_servicio_config` | Prisma quitaría default `now()` de `updatedAt` | **P→Prisma.** Mantener default existente. |
| 40 | `osi_transport_zone_rules` | Tabla ausente; Prisma espera unique `zone_type` | **Futura.** Migrar junto al motor logístico desde archivo versionado. |
| 41 | `osi_vehicles` | Tabla ausente; Prisma espera unique `plate`, índice hub/estado y FK a hub | **Futura / Decisión.** Migración de flota separada; definir unicidad por tenant antes de crear. |
| 42 | `osi_volume_area_profiles` | Prisma quitaría default `now()` de `updatedAt` | **P→Prisma.** Mantener default existente. |
| 43 | `osi_zone_rules` | Tabla ausente; Prisma espera unique `zone_type` | **Futura.** Migrar configuración, sin activar como autoridad de inmediato. |
| 44 | `quote_addendums` | Prisma reemplazaría índice `(quote_id, status)` por sólo `quote_id` | **P→Prisma / Decisión.** Preservar índice compuesto; añadir uno simple sólo si el plan lo necesita. |
| 45 | `quote_change_orders` | Tabla ausente; Prisma espera índice `quote_id` | **Futura.** Backfill desde `milestonesJson` y escritura dual. |
| 46 | `quote_line_items` | Falta índice `(quote_id, block)` | **Futura.** Índice no destructivo tras medir consultas. |
| 47 | `quote_versions` | Prisma eliminaría FK de `quote_id` | **Destructiva.** Mantener FK real; corregir la relación en Prisma. |
| 48 | `quotes` | Prisma añade moneda bloqueada, tasa/snapshots, bloqueo survey y versión tarifaria | **Futura / Decisión.** Migración de versionado monetario con columnas nullable, backfill comprobable y activación posterior. |
| 49 | `service_cases` | Prisma quitaría índice `service_flags` y default `updated_at` | **P→Prisma / Destructiva.** Preservar ambos; retirar índice sólo con evidencia de no uso. |
| 50 | `surveys` | Falta índice `(case_id, performed_at)` | **Futura.** Índice no destructivo sujeto a plan de consulta. |
| 51 | `tenant_memberships` | Tabla MT-01A ausente; índices, unique y FKs todavía no desplegados | **Futura.** Aplicar únicamente después del baseline y autorización MT-01A de despliegue. |
| 52 | `tenants` | Tabla MT-01A ausente; unique de código e índices de estado/lote | **Futura.** Aplicar únicamente después del baseline y autorización MT-01A de despliegue. |

## Reglas de reconciliación

1. Todos los cambios que sólo quitarían defaults de actualización se corrigen en Prisma, no mediante DDL destructivo.
2. Ninguna de las cinco sustituciones de modelo operacional (`osi_osis` y sus cuatro tablas de control) puede entrar en una migración generada automáticamente.
3. Los índices nuevos se agrupan en una migración posterior y se validan con planes de consulta y tamaño real.
4. Las tablas ausentes se agrupan por función empresarial, nunca dentro del baseline.
5. Los cambios de tipo, enum, required/nullable y FK exigen un dry-run de datos separado antes de proponer SQL.
