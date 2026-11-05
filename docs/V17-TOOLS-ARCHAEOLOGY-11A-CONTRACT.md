# V17 Herramientas · Calculadora de empaque arqueológico 11A

## Alcance aprobado

El Hub incorpora una suite **Herramientas** independiente de **OSi Plus Mobile**. La suite presenta dos utilidades:

| Herramienta | Ruta canónica | Estado |
| --- | --- | --- |
| Calculadora de empaque arqueológico | `/tools/archaeological-packing` | Interna, autónoma y sin conexión ERP |
| Calculadora de cajas de madera | `/tools/wood-crates` | Módulo existente dentro de OSi Plus |

`/mobile/packing` se conserva solamente como alias compatible de la calculadora arqueológica. La herramienta ya no abre ni depende de una aplicación externa.

## Aislamiento funcional

- La calculadora arqueológica se monta sólo después de la autorización de ruta y mediante importación diferida.
- Su documento se integra como recurso interno y se ejecuta dentro de un `iframe` aislado.
- No recibe sesión, token, cliente, caso, Survey, Cotización ni datos del ERP.
- No ejecuta `fetch`, XHR, WebSocket, EventSource, beacon ni puente `postMessage`.
- La persistencia sigue siendo exclusivamente local al navegador, con la clave histórica `embalaje-arq-estado-v16`.
- Importar, exportar, imprimir y descargar permanecen dentro de la herramienta autónoma.
- La conexión futura al flujo operativo se realizará en otro lote y requerirá un contrato de datos aprobado.

## Dependencia reproducible

La única biblioteca de la calculadora es SheetJS 0.20.3, fijada dentro del repositorio para eliminar la dependencia de CDN.

- Documento integrado 3.19 SHA-256: `FF74CC4424891058AFF9D19E875229B03F7AE616CB6BFCC76D4B364603C54F6E`.
- SheetJS fijado SHA-256: `CC015130AA8521E7F088F88898EBA949CCDCBFB38DF0BD129B44B7273C3A6F41`.
- Archivo fuente recibido SHA-256: `970B5EE8EA418B09FB3509C69A253628D307E73F745EB991C6CADA155AACA1EF`; la única corrección funcional previa a integrarlo fue actualizar el título visible de 3.18 a 3.19 y sustituir el CDN por la copia fijada.

## Acceso y Preview

- Ambas herramientas reutilizan temporalmente el permiso explícito `pipeline:view` y no conceden acceso por rol implícito.
- La rama exacta `feature/v17-tools-archaeology-calculator-11a` admite únicamente el ensayo Preview autenticado y de sólo lectura.
- Production no se modifica ni se habilita.
- CRM, Survey, ICP, Cotización, APIs y migraciones permanecen sin cambios funcionales.

## Decisión de producto

Esta fase conserva la aplicación aprobada tal como fue entregada, dentro del ecosistema OSi Plus. Las mejoras visuales o la integración con casos, inventario, cajas de madera y cotización se evaluarán previamente y se implementarán en lotes separados.
