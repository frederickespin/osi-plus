# MT-01C2B3C — Registro de cutover tenant productivo

Fecha de preparación: 2026-08-11.

Este documento registra el estado verificado y el procedimiento previsto para un cutover posterior. Su presencia no activa modos tenant, no ejecuta backfill, readiness, migraciones o SQL, y no modifica variables de Vercel.

## Identidades y estado previo a la activación

- Git `main`: `2a49b8017d0b992c2e3d5cd8a5e0f7e18475a798`.
- Deployment productivo estable: `dpl_A32uHU9HXVKH2FJ4FNxbsUZotcTX`.
- Modos efectivos: `LEGACY_ONLY/LEGACY_ONLY`.
- Las variables comerciales de activación están ausentes en Production, Preview y Development.
- Migraciones canónicas: 15; drift vacío.
- Batch aplicado: `MT-01C2B2-IPACKERS-DO-V1`.
- SHA-256 del manifiesto: `261d99f273814a6474ce458222d7ae8837dab15a4ec75d47711d33b1dcb86385`.
- Respaldo previo al cutover: `pre-mt01c2b3c-cutover-20260811` (`br-lat…gsrn`), derivado de `main`, intacto y sin compute.

## Estado anterior al backfill

- 7 Client con `tenantId=NULL`.
- 2 Project con `tenantId=NULL`.
- 51 PipelineCase con `tenantId=NULL`.
- Los 51 PipelineCase tenían `ownerMembershipId=NULL` y `ownerUserId=NULL`.
- Lead permanecía vacío.

## Estado posterior al backfill

- 7 Client tenantizados en `IPACKERS-DO`.
- 2 Project tenantizados en `IPACKERS-DO`.
- 51 PipelineCase tenantizados en `IPACKERS-DO`.
- 39 owners relacionales validados mediante una única TenantMembership activa y compatible.
- 12 oportunidades permanecen completamente sin owner y en la cola comercial sin asignar.
- 0 owners parciales.
- 0 relaciones cruzadas de tenant.
- 0 membresías incompatibles.
- 15 migraciones completas y drift vacío.

El backfill no modificó `ownerId` heredado, códigos, estados, importes, fechas, milestones, relaciones comerciales ni tablas ajenas al lote autorizado.

## Fingerprints posteriores

| Alcance | SHA-256 |
| --- | --- |
| Estructura | `9db69e347dcb1a96786cfec394c5bb54b21bc7f9c75296d3ce588cbfa13f8a70` |
| Historial | `e9b682c915b6d1146c81e1a7fa2ff7e7bc5510a38024c77471dfbfc11486d992` |
| Identidad | `5c3befaea772a9e52f7fc281af414fbe4aac3d69156a671905d2dc68a44fb777` |
| Comercial excluyendo campos C2B2 | `c7509e3a4a88b7562705437adbeba799156689d00a485d3de2f98d68589b4682` |
| Comercial completo | `ed43d50f43d7322ac23260d0a7a048bde393e62ff8a8d3e9100b5cc79a1b5bd8` |

## Variables para una autorización posterior

El cutover requerirá configurar conjuntamente y sólo en Production:

```env
COMMERCIAL_TENANCY_WRITE_MODE=TENANT_WRITE
COMMERCIAL_TENANCY_READ_MODE=TENANT_READ
COMMERCIAL_TENANCY_ACTIVATION_BATCH=MT-01C2B2-IPACKERS-DO-V1
```

Condiciones obligatorias:

- Enviar cada valor como UTF-8 sin BOM, whitespace, comillas ni salto final.
- Configurar las tres variables juntas; no admitir estados parciales.
- Mantenerlas ausentes en Preview y Development.
- Fusionar este PR sólo bajo una autorización posterior e independiente.
- Usar el deployment Git producido por el merge para capturar el snapshot ambiental completo.

## Plan de rollback de código y configuración

1. Reasignar el alias productivo al deployment estable `dpl_A32uHU9HXVKH2FJ4FNxbsUZotcTX`.
2. Confirmar que READ y WRITE vuelven a `LEGACY_ONLY/LEGACY_ONLY`.
3. Retirar conjuntamente las tres variables comerciales de Production.
4. No revertir automáticamente el backfill.
5. Mantener los datos tenantizados: son compatibles con `LEGACY_ONLY`.
6. Exigir autorización independiente y el manifiesto intacto antes de cualquier rollback de datos.

El respaldo `pre-mt01c2b3c-cutover-20260811` no debe promoverse, resetearse, eliminarse ni modificarse como parte de este rollback sin diagnóstico y autorización separados.

## Riesgos y límites conocidos

- PipelineCase y Lead todavía no tienen endpoints CRM activos.
- El frontend Pipeline continúa usando `localStorage`; no forma parte de este cutover.
- Las 12 oportunidades sin owner permanecen en la cola comercial sin asignar.
- OSI y PGD quedan fuera de esta activación.
- HYBRID, tenant switch y cliente V2 permanecen desactivados.
- Los riesgos P2 de dependencias continúan aceptados temporalmente, no corregidos.

La aceptación P2 expira en la primera de estas condiciones:

- 2026-09-15.
- Activación de HYBRID.
- Creación de endpoints runtime para PipelineCase o Lead.
- Introducción de configuración Prisma controlada externamente.
- Nuevos usos de lodash con paths o plantillas dinámicas.
- Publicación de un advisory P0 o P1 aplicable.

## Condición de salida

Este registro sólo prepara un PR auditable. Al fusionarse bajo autorización posterior deberá verificarse que los checks correspondan al merge SHA, que el deployment sea Production/main y que las tres variables estén presentes conjuntamente con los valores exactos. Hasta entonces, Production debe permanecer en `LEGACY_ONLY/LEGACY_ONLY`.
