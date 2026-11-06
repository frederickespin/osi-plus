# V17 Customer Custody 21A

## Decisión aprobada

OSI Plus mantiene dos autoridades de inventario separadas:

1. **Inventarios internos:** materiales de mudanza, herramientas, equipos, retornables y repuestos propiedad de la empresa.
2. **Efectos de clientes:** mobiliario, cajas, obras, documentos y demás bienes recibidos bajo custodia.

Un movimiento de efectos de clientes nunca modifica existencias internas. Ambos inventarios pueden usar la misma estructura física de almacenes y ubicaciones, pero conservan registros, permisos y movimientos independientes.

## Alcance del PR

- Recepción tenant-first vinculada a cliente y, opcionalmente, a un expediente comercial.
- Lote de almacenamiento, artículos, condición, cantidades, peso, volumen, evidencia y notas.
- Cadena de movimientos append-only: recepción, ubicación, traslado, conteo, preparación, salida, retorno, ajuste y retención.
- Idempotencia por comando y control de versión por artículo.
- Búsqueda y consulta limitadas por los accesos del usuario.
- Configuración administrativa por usuario, inventario, almacén, ubicación y trabajos permitidos.
- Activación y desactivación de accesos sin eliminar su historial.
- Interfaz compacta dentro de `Almacenes > Efectos de clientes` y `Administración > Accesos a almacenes`.

## Autoridad y seguridad

Los permisos generales son explícitos y no se heredan solamente por tener rol Administrador:

- `customer-custody:view`
- `customer-custody:receive`
- `customer-custody:operate`
- `warehouse-access:manage`

Además, cada operación exige un `WarehouseAccessGrant` activo para el inventario `CUSTOMER_CUSTODY` y su alcance físico. El servidor resuelve el tenant, la membresía y el usuario autenticados; no acepta estas autoridades desde el cuerpo de la solicitud.

## Activación

La API y la UI fallan cerradas. Sólo se habilitan en Preview con:

- `CUSTOMER_CUSTODY_API_MODE=PREVIEW_REHEARSAL`
- `CUSTOMER_CUSTODY_API_BATCH=V17-CUSTOMER-CUSTODY-21A-PREVIEW`
- `VITE_CUSTOMER_CUSTODY_UI_MODE=PREVIEW_REHEARSAL`
- `VITE_CUSTOMER_CUSTODY_UI_BATCH=V17-CUSTOMER-CUSTODY-21A-PREVIEW`

Producción permanece desactivada y no se modifica en este PR.

## Base de datos

- Migración: `20261106010000_v17_customer_custody`
- SHA-256: `b6676ee3460edbd64f39879a5658989c2efe32b54ff080059071b46a7e30efeb`
- Inventario canónico esperado: `42/42`

## Fuera de alcance

- Facturación del almacenaje e impuestos.
- Reclamos, seguros y valoración económica de daños.
- Órdenes de mantenimiento mecánico/general.
- Órdenes de carpintería y fabricación de cajas.
- Integración automática con cotizaciones.

Esos bloques deben construirse encima de esta autoridad, sin fusionar los efectos de clientes con el inventario interno.
