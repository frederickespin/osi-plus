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

## Primer intento de activación y contención

El primer intento controlado se realizó después del merge
`95080ae453be1c3380ab8c4829070eb4b1bdc5c8`. Vercel creó el deployment Git
Production `dpl_BMhBLGWW6Vs5LUb6p5NVwk2NNXKF`, asociado a `main` y al merge SHA
correcto. Antes de cualquier autenticación o escritura, `GET /api/clients` y
`GET /api/projects` respondieron de forma controlada con `503
COMMERCIAL_TENANCY_CONFIGURATION_INVALID`.

La causa raíz fue un BOM UTF-8 (`EF BB BF`) antepuesto por el `StreamWriter`
de PowerShell al transmitir cada valor por stdin. Las longitudes observadas
fueron:

| Variable | Longitud esperada | Longitud transmitida | Primer carácter decodificado |
| --- | ---: | ---: | --- |
| WRITE | 12 bytes | 15 bytes | `U+FEFF` |
| READ | 11 bytes | 14 bytes | `U+FEFF` |
| BATCH | 24 bytes | 27 bytes | `U+FEFF` |

Vercel CLI 58.9.1 retiraba únicamente un salto de línea final y conservaba el
BOM. La validación exacta rechazó correctamente la configuración corrupta; no
debe añadirse `trim`, tolerancia al BOM ni normalización al validador.

La contención se completó sin escrituras empresariales:

- El dominio productivo principal fue restaurado al deployment LEGACY
  `dpl_A32uHU9HXVKH2FJ4FNxbsUZotcTX`.
- Las tres variables comerciales fueron retiradas de Production.
- Los aliases mutables secundarios y `git-main` que todavía resolvían al
  deployment rechazado fueron reasignados al mismo deployment LEGACY.
- Cada alias restaurado sirve el SHA
  `2a49b8017d0b992c2e3d5cd8a5e0f7e18475a798`; Clients y Projects anónimos
  responden 401, sin 503 ni 500.
- No se crearon Client, Project, sesiones u otros datos sintéticos.
- El backfill y sus fingerprints no cambiaron.
- El respaldo `pre-mt01c2b3c-cutover-20260811` (`br-lat…gsrn`) permanece
  intacto y sin compute.

## Transporte obligatorio para un próximo intento

Un próximo intento deberá crear un runner Node temporal fuera del repositorio.
El runner debe:

1. Ejecutar Vercel CLI con `shell: false`.
2. Construir cada entrada con `Buffer.from(value, "utf8")` y enviarla mediante
   stdin, sin usar `StreamWriter`.
3. No colocar nombres acompañados de valores ni valores solos en argumentos del
   proceso.
4. Antes de enviar, comprobar la longitud exacta, primer y último byte, ausencia
   del prefijo `EF BB BF`, ausencia de CR/LF y un SHA-256 sanitizado.
5. Cerrar stdin inmediatamente después del buffer y exigir código de salida
   cero.
6. Eliminar el runner temporal después de utilizarlo.

Este procedimiento operativo no cambia la validación estricta en
`commercialTenancyWrite.js` y no autoriza por sí solo otra activación.

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
