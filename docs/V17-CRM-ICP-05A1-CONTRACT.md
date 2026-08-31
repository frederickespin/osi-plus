# V17-CRM-ICP-05A1 — Fundación tenant-first del ICP v2

## Estado de este lote

Este lote publica únicamente esquema, reglas de dominio, guardias y pruebas. No conecta el contrato a una ruta HTTP ni a la UI. `CRM_ICP_V2_CONTRACT.productionApiEnabled` permanece en `false`; las mutaciones CRM productivas continúan desactivadas.

La migración `20260831010000_v17_crm_icp_foundation` es la migración 22. Es aditiva y no convierte los textos heredados de Client o PipelineCase en direcciones estructuradas. Los casos anteriores conservan contrato de ruta 1, revisión 0 y destino sin clasificar.

## Autoridades persistentes

### ClientAddress

`ClientAddress` pertenece obligatoriamente a un Tenant y un Client del mismo Tenant. Su `addressRef` es un UUID público, único tenant-first e inmutable. Conserva país ISO, provincia/estado, ciudad/municipio, sector, calle/número, edificio/residencial, piso/local, referencia, contacto y teléfono de ubicación, etiqueta y estado.

No depende de `Location`, `BusinessEntity`, `ServiceCase` ni de stores históricos. Una dirección guardada puede originar un snapshot, pero no es la autoridad del caso después de guardar.

### PipelineCaseRouteSnapshot

Cada fila pertenece a `(tenantId, PipelineCase)` y a una versión positiva. Los roles son `ORIGIN`, `DESTINATION` y `ADDITIONAL_STOP`. Origen y destino usan orden 0; las paradas adicionales usan órdenes 1–8.

- Existe como máximo un origen y un destino por versión.
- `sourceAddressRef` es opcional y sólo puede referir una ClientAddress del mismo Tenant.
- UPDATE y DELETE están bloqueados: el snapshot es inmutable.
- Sólo puede insertarse la revisión inmediatamente posterior a la vigente.
- El conjunto completo se valida al commit mediante trigger diferido.

Una modificación de ruta crea snapshots de una revisión nueva y avanza `PipelineCase.routeRevision` exactamente una vez. Nunca modifica una revisión anterior.

### PipelineCase

Los campos nuevos son compatibles y opcionales para datos anteriores: contacto, teléfono visible y normalizado, correo visible y normalizado, canal de entrada, tipo canónico del Client como snapshot y estado del destino. `routeContractVersion=1`/`routeRevision=0` representa el contrato legacy sin inferencia. El ICP v2 usa contrato 2 y una revisión positiva.

No se elimina `originLocation` ni `destinationLocation` en este lote, pero esos textos heredados no son autoridad para el ICP v2.

## Reglas de ruta

El modelo vigente de `PipelineMode` contiene `LOCAL`, `EXPORT` e `IMPORT`. No se inventa un cuarto valor `NATIONAL`: el servicio nacional interno se representa bajo el modo canónico `LOCAL` hasta que exista una decisión empresarial independiente.

- LOCAL: origen y destino completos dentro del país del Tenant. `PENDING` sólo es posible con una autoridad explícita y sin snapshot de destino.
- EXPORT: origen local completo y destino con, como mínimo, país y ciudad. Nunca admite `PENDING`.
- IMPORT: origen con, como mínimo, país y ciudad; destino local completo. Nunca admite `PENDING`.
- Cada parada adicional requiere dirección completa.
- Una cotización con estado `FINAL` queda bloqueada mientras el destino esté `PENDING`.

Las reglas se aplican en dominio antes de construir el plan atómico y en PostgreSQL al confirmar la transacción.

## Creación inline de Client

El contrato futuro de `POST /api/crm/pipeline-cases` tendrá una única transacción lógica:

`CASE + CLIENT opcional + ROUTE SNAPSHOTS + COMMAND + AUDIT`

El botón futuro `Crear cliente` sólo preparará datos en memoria. No persistirá nada hasta guardar el caso. `POST /api/clients` no obtiene una nueva autoridad en este lote.

- El código del Client procede de `osi.next_icp_client_code()` y una secuencia PostgreSQL; no usa `MAX+1`.
- RNC normalizado exacto dentro del Tenant bloquea la creación.
- Teléfono normalizado + correo normalizado exactos dentro del Tenant bloquean la creación.
- Una coincidencia parcial exige confirmación explícita ligada a un fingerprint y marca de auditoría.
- La idempotencia futura reutilizará `requestId` y `payloadHash` canónico; el plan exige un único comando y una única auditoría junto al caso.

La migración no rellena RNC, teléfono o correo normalizados en Client existentes. Esa decisión deberá ocurrir mediante flujos autoritativos, no por inferencia.

## Búsqueda de Client

El contrato de dominio reserva una búsqueda same-origin de sólo lectura mediante POST. El cuerpo cerrado contiene `query`, `page` y `pageSize`; nunca se coloca PII en query string.

La búsqueda:

- revalida User, Membership y Tenant activos;
- exige rol A o V y permiso efectivo `pipeline:view`;
- aplica `deniedPermissions` antes de consultar;
- fija `tenantId` desde la sesión, nunca desde el navegador;
- busca por nombre, RNC normalizado, teléfono normalizado o correo normalizado;
- limita la página en servidor;
- devuelve sólo `clientRef`, nombre visible, tipo, estado e indicios enmascarados.

No publica Client.id, `publicRef` con ese nombre, tenantId, documentos ni PII completa.

## PII, errores y auditoría

Los errores públicos son códigos estables y no contienen valores enviados. Direcciones, teléfonos, correo y RNC no pueden aparecer en URL, logs ni metadata de error. La auditoría del plan conserva acción, conteos y decisiones booleanas; no copia direcciones ni contacto.

No existe eliminación automática de ClientAddress o snapshots durante el piloto.

## Validación y rollback local

La suite focal cubre contrato cerrado, hash canónico, reglas LOCAL/EXPORT/IMPORT, destino pendiente, ocho paradas, selección tenant-first, duplicados, confirmación auditada, búsqueda POST, PII enmascarada y precedencia de denies.

La suite PostgreSQL 18 verifica desde una cadena de 22 migraciones: secuencia concurrente, índices de duplicados tenant-first, UUID inmutable, snapshots inmutables, límite de paradas, revisión consecutiva, FK cross-tenant, bloqueo de cotización final y ausencia de backfill inferido.

El rollback local autorizado exige una base aislada con cero datos ICP v2, elimina únicamente los objetos de la migración 22 y vuelve a 21. Después se reaplica la migración y se exige drift vacío. El script rechaza cualquier host, puerto o base fuera de su destino local exacto.

## Próximo lote

Un PR posterior podrá implementar API y UI de dos pasos. Antes deberá definir de manera explícita la autoridad para permitir destino pendiente, el endpoint POST de búsqueda y la transacción ejecutora de caso/Client/snapshots/comando/auditoría. Este lote no habilita ninguno de ellos.
