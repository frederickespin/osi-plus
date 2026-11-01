# Almacenes — espacios y ubicaciones

Fecha: 1 de noviembre de 2026, República Dominicana.

## Decisión y continuidad

El usuario dio por satisfactoria Administración para esta etapa y autorizó continuar con el siguiente módulo de la lista. La secuencia acordada en `V17-ADMINISTRATION-HUB-18A.md` es Administración → Almacenes.

Base: `0ace0b7a2a8dd3a1cef76905b86e2d4c925cbc37` de `feature/v17-consolidated-preview`. Rama de trabajo: `feature/v17-warehouses-spaces-20a`. La entrega se dirige al Preview consolidado.

Se volvió a consultar la referencia aportada `IP_Almacen_v0121_organizacion_simple.html`, titulada «IP · Almacén 0.12.1 · Organización simplificada». Se retoman la jerarquía plegable, la creación explícita de lugares reales y la conservación de identidades. La referencia permanece intacta.

## Entrega funcional

Almacenes reúne tres secciones disponibles según permisos:

| Sección | Ruta | Lectura requerida |
| --- | --- | --- |
| Espacios y ubicaciones | `/warehouses/spaces` | `inventory:stock:view` |
| Materiales de embalaje | `/warehouses/materials` | `inventory:catalog:view` y `inventory:stock:view` |
| Herramientas y equipos | `/warehouses/equipment` | `assets:instance:view` |

`/warehouses` abre la primera sección habilitada y autorizada. Se carga únicamente su consumidor. Las subrutas funcionan con recarga, Atrás y Adelante. El Hub agrupa los accesos disponibles de Materiales y Activos bajo Almacenes y conserva sus rutas anteriores `/materials` y `/assets`.

Espacios permite:

- Consultar almacenes y ubicaciones en un árbol compacto y plegable.
- Buscar por nombre o código conservando los antecesores del resultado.
- Filtrar por almacén y estado del registro.
- Registrar un almacén escribiendo su nombre; el servidor asigna el código.
- Agregar una ubicación interior con nombre, padre y tipo estructural explícitos.
- Corregir nombres conservando códigos, referencias, tipos y relaciones.

La raíz representa el propio almacén registrado. Un alta no genera zonas, pasillos, niveles, posiciones ni existencias adicionales. Los códigos anteriores se conservan. Los nuevos usan los prefijos `ALM-` y `UBI-`, seguidos de 16 caracteres derivados del comando y la empresa. El código es un identificador estable; la organización se expresa mediante relaciones entre referencias públicas.

La interfaz aplica campos de 28 px en escritorio y 32 px en pantallas pequeñas, ayudas contextuales, nombres accesibles en iconos y formularios breves. El alta de espacios no necesita introducir cantidades ni números de niveles.

## Persistencia y control de cambios

Se reutilizan `MaterialWarehouse` y `MaterialLocation`, que ya son ubicaciones compartidas por consumibles y activos. No hay cambios de esquema ni migraciones nuevas.

| Operación | Contrato |
| --- | --- |
| Alta de almacén | `POST /api/materials/warehouses`, `{name}` más `requestId` y `payloadHash` |
| Alta interior | `POST /api/materials/warehouses/locations`, referencias públicas del almacén y padre, nombre y tipo |
| Nombre de almacén | `PATCH /api/materials/warehouses/[warehouseRef]`, nombre y `expectedVersion` |
| Nombre de ubicación | `PATCH /api/materials/warehouses/locations/[locationRef]`, nombre y `expectedVersion` |

El contrato anterior de alta explícita de un almacén con árbol sigue disponible. La consulta añade `parentLocationRef` y `version` a cada ubicación; no se interpreta el código como identidad del padre.

Las escrituras exigen lectura de stock y gestión del catálogo, ambas explícitas. El servidor resuelve la empresa y la membresía; las denegaciones prevalecen. El padre debe pertenecer al mismo almacén y empresa, y tanto el almacén como todos los antecesores deben estar activos. La profundidad máxima es 32 y el recorrido no supera 600 caracteres.

Una corrección de nombre usa la versión consultada. Si otra persona ya modificó el registro, se solicita recargar. Cambiar el nombre del almacén también actualiza el nombre de su raíz. La raíz se edita desde el almacén.

El cambio, su comprobante y la auditoría son atómicos. La exclusión por solicitud y por almacén, junto con reintentos serializables acotados, permite recuperar un mismo comando concurrente sin duplicar registros. No se generan códigos por `MAX+1`.

## Recuperación de guardados interrumpidos

Cada intento conserva su solicitud y contenido exactos. Si no llega la respuesta, el formulario conserva los datos y permite repetir el mismo intento. El usuario puede cerrar y reabrir el formulario sin perderlo.

La intención pendiente se conserva por membresía en el almacenamiento de sesión del navegador, con respaldo en memoria. Sólo contiene la solicitud y los campos del cambio; no contiene credenciales, empresa ni autoridad. Al volver a la sección o recargar, se recupera un formulario bloqueado para comprobar explícitamente el mismo intento. No se envían escrituras automáticamente.

Un rechazo posterior de sesión, permisos o disponibilidad del módulo no demuestra que el intento anterior haya fallado: esas comprobaciones preceden a la consulta del comprobante. La intención se conserva hasta confirmar el resultado. Un conflicto de versión u otro rechazo de negocio posterior a la consulta protegida del comprobante permite resolver el intento fallido y actualizar el listado. Si el navegador impide el almacenamiento de sesión, el respaldo en memoria sólo dura mientras la página siga abierta.

## Consumidores existentes

Materiales y Herramientas/Equipos admiten presentación integrada, con una sola cabecera de Almacenes y un único área principal. Mantienen su persistencia y sus operaciones actuales.

Se corrigió la carga de dependencias: un lector no solicita reservas, recetas, modelos u ofertas externas sin sus permisos. Las pestañas cargan al seleccionarse; las respuestas anteriores no sobrescriben un cambio de sección o de usuario. Los errores de lectura ofrecen reintento y no aparentan listas vacías correctas. Los errores de una operación conservan el formulario y sus valores.

Los controles modificados siguen la densidad compacta. La cantidad de Materiales usa el control numérico compartido, con selección completa al entrar y sin incrementos por flechas. La vista integrada omite las sumas agregadas de cantidades de unidades diferentes.

## Alcance que continúa pendiente

El alcance empresarial de Almacenes sigue incluyendo bienes y documentos de clientes bajo custodia, capacidad y ocupación física, clasificación del uso de las áreas, movimientos por expediente y trazabilidad. Estas funciones necesitan sus propias autoridades y reglas; el modelo actual de ubicaciones no las representa.

La referencia v0.12.1 tampoco demuestra un cálculo general de ocupación: su capacidad es texto informativo y sus bienes de clientes siguen declarados pendientes. El catálogo histórico de almacenes marcado «Por validar» no se convirtió en datos reales.

Para la revisión posterior de Materiales y Equipos se conservan estas tareas concretas:

- Conteos físicos con revisión y aprobación única de diferencias. El ajuste positivo existente no equivale a ese flujo.
- QR de lectura e identidad de ubicaciones, artículos y unidades físicas, con conservación explícita de identificadores heredados.
- Formularios específicos de recursos y equipos, códigos automáticos de sus modelos y sustitución de referencias técnicas o valores demostrativos por selectores autorizados.
- Capacidad, ocupación y clasificación del uso separadas del estado operativo y de la propiedad de los bienes.

## Verificación

La validación usa respuestas y datos sintéticos. Los casos de PostgreSQL se ejecutan únicamente sobre una base local aislada, después de comprobar su identidad, esquema e historial de 37 migraciones. Las pruebas de navegador interceptan sus APIs; no crean almacenes de negocio.

Comandos focales:

```bash
npm run test:v17-warehouses
npm run test:v17-warehouses:db
npm run test:v17-warehouses:browser
npm run typecheck:v17-commercial-crm
npm run guard:v17-materials-inventory
npm run guard:v17-tools-equipment
```

El workflow `Almacenes` ejecuta contratos, autorización y las pruebas de navegador de espacios, Materiales y Equipos. El workflow canónico `CI` añade los casos de persistencia, identidad y concurrencia sobre PostgreSQL 18.

Resultado local antes de publicar:

- 34 pruebas de acceso, recuperación del borrador, contrato y HTTP correctas.
- 15 escenarios de persistencia en PostgreSQL 18 correctos, incluidos reintentos concurrentes, aislamiento y versiones obsoletas.
- 34 pruebas de navegador de Almacenes correctas: 17 escenarios en escritorio y móvil.
- 12 pruebas de Materiales y 10 de Herramientas/Equipos correctas, incluidos los flujos anteriores y lectores con permisos limitados.
- TypeScript focal y ESLint de los archivos modificados correctos.
- Guards de Hub, Materiales, Activos e inventario CORS comprobados; se conservan sus casos negativos.
- Capturas sintéticas de árbol y alta inspeccionadas visualmente; sin desbordamiento horizontal del documento.

Las ejecuciones remotas y la versión exacta desplegada se registran en la solicitud de integración. La comprobación del Preview no utiliza altas ni modificaciones de datos reales de la empresa.
