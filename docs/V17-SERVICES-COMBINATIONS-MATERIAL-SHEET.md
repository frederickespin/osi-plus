# Configuración de servicios: códigos automáticos y hoja de materiales

Actualización solicitada el 31 de octubre de 2026. Destino: Preview consolidado.

## Cambios de uso

La sección administrativa se presenta como **Servicios y combinaciones**. Sus pestañas conservan el catálogo y las modalidades, las combinaciones reutilizables y las políticas de materiales. El selector de la configuración del caso usa **Combinación publicada**. Las rutas, los permisos y las referencias persistidas mantienen su identidad.

Las altas de servicios, combinaciones y políticas ya no exigen escribir un código. El servidor lo asigna al guardar. Las combinaciones predeterminadas siguen el mismo criterio. En una edición, el código existente se conserva y se muestra sólo como referencia.

Las modalidades representan los alcances operativos Local / Nacional, Exportación e Importación. Al crear una se elige el alcance por su nombre; el servidor asigna automáticamente su código canónico. Sólo se ofrecen alcances aún no configurados. Los códigos anteriores, incluidos los de modalidades históricas, no se renumeran.

## Hoja de políticas de materiales

**Administración → Servicios y combinaciones → Políticas de materiales → Nueva política** abre una sola ventana con una tabla editable.

1. Indicar el nombre y el ámbito de aplicación: combinación, modalidad o servicio específico.
2. Seleccionar materiales o recursos activos por nombre desde el catálogo de la empresa.
3. Completar en cada fila la clase o condición, porcentaje si corresponde, uso y tratamiento del cargo.
4. Agregar, duplicar o eliminar filas sin abrir una ventana adicional. Tab avanza entre los controles.
5. Revisar el total y guardar como borrador o versión publicada.

Los porcentajes se muestran de 0 a 100, con hasta dos decimales. Se convierten a las razones persistidas con cuatro decimales. Una celda vacía conserva la ausencia de proporción; un cero explícito conserva el cero. El total respeta la tolerancia del contrato existente. Los errores se indican junto a las filas y dentro de la ventana.

La tabla mantiene su propio desplazamiento horizontal en pantallas pequeñas. Los campos numéricos tienen ancho acotado; las opciones adicionales de ámbito, estándar y preferencia quedan agrupadas bajo demanda.

Al editar una combinación también se conservan sus etiquetas, vigencia, fases y configuración de requerimientos.

La edición de una política conserva las cinco reglas existentes de cada línea —preparación, mantenimiento, deterioro, reposición y condiciones—, además del ámbito, la vigencia y el código de la política. Un recurso que dejó de estar disponible permanece en la fila con una indicación explícita; no se borra ni se sustituye automáticamente.

## Contratos y persistencia

- `CATALOG_CREATE`, `DEFAULTS_SAVE`, `PACKAGE_SAVE` y `MATERIAL_POLICY_SAVE` aceptan `code: null` para generar una identidad estable dentro de la transacción. Los códigos explícitos anteriores siguen siendo compatibles.
- El código automático usa prefijo de entidad y un sufijo determinista ligado a empresa, operación y `requestId`. La restricción única por empresa y código sigue vigente.
- `MODE_SAVE` automático exige `code: null` y `scope: LOCAL | EXPORT | IMPORT` en el alta. Las solicitudes anteriores y las ediciones conservan su forma sin `scope`; una edición no cambia el código.
- Los requerimientos nuevos de una combinación admiten código automático a partir de su autoridad de catálogo o del concepto; los requerimientos existentes conservan su código.
- Cada borrador mantiene su `requestId` durante los reintentos, incluso cuando cambia su contenido. Si un guardado previo se confirmó pero su respuesta se perdió, un contenido modificado produce conflicto y exige revisar el registro, en vez de generar otra alta.
- Los objetos y referencias se guardan mediante los contratos, versiones, auditoría y transacciones existentes. No se agregan modelos ni migraciones.

## Selector de recursos

`GET /api/crm/services/material-policies?view=resources` admite búsqueda, tipo y cursor. Devuelve únicamente tipo, referencia pública, código, nombre y familia, en páginas de hasta 100 elementos.

La consulta relee los permisos actuales y requiere consulta y gestión de políticas. Cada página se limita a la empresa y a recursos activos. No expone inventario, precios, costos, proveedores ni identidades privadas. El cliente carga todas las páginas y rechaza respuestas parciales, cursores repetidos, referencias duplicadas o estructuras inesperadas.

## Verificación incorporada

- Contratos de códigos nulos, alcances canónicos, hashes, identidades históricas y rechazos de campos ajenos.
- Integración PostgreSQL18 con las 37 migraciones canónicas: creación, reintentos, concurrencia, versiones, recursos derivados y aplicación de una combinación al alcance del caso.
- Selector de recursos con más de una página, separación de empresas, recursos inactivos, revocación de permisos y respuestas privadas.
- Conversión de porcentajes, preservación de reglas y vigencia, validación por fila y reintentos sin duplicados.
- Navegador de escritorio y móvil: altas sin códigos manuales, edición, tabla completa, recuperación de errores, lectura sin gestión y ausencia de desbordamiento de página.

Las pruebas usan datos sintéticos aislados. Esta actualización no carga servicios, materiales, políticas ni combinaciones empresariales de ejemplo en Preview.
