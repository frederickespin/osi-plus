# V17 Herramientas · Integración consolidada 11B

## Alcance aprobado

El Hub incorpora una suite **Herramientas** independiente de **OSi Plus Mobile**. La suite presenta dos utilidades:

| Herramienta | Ruta canónica | Estado |
| --- | --- | --- |
| Calculadora de empaque arqueológico | `/tools/archaeological-packing` | Interna, autónoma y sin conexión ERP |
| Calculadora de empaque y cajas de madera | `/tools/packing` | Interna, autónoma y sin conexión ERP |

`/mobile/packing` se conserva solamente como alias histórico de la calculadora general de empaque. La calculadora arqueológica mantiene su ruta propia y ninguna de las dos pertenece a OSi Plus Mobile.

## Aislamiento funcional

- Cada calculadora se monta sólo después de la autorización de ruta y mediante importación diferida.
- Sus documentos se integran como recursos internos y se ejecutan dentro de `iframe` aislados.
- No recibe sesión, token, cliente, caso, Survey, Cotización ni datos del ERP.
- No ejecuta `fetch`, XHR, WebSocket, EventSource, beacon ni puente `postMessage`.
- La persistencia sigue siendo exclusivamente local al navegador, con la clave histórica `embalaje-arq-estado-v16`.
- Importar, exportar, imprimir y descargar permanecen dentro de la herramienta autónoma.
- La conexión futura al flujo operativo se realizará en otro lote y requerirá un contrato de datos aprobado.

## Dependencia reproducible

La única biblioteca de la calculadora es SheetJS 0.20.3, fijada dentro del repositorio para eliminar la dependencia de CDN.

- Documento integrado 3.19 SHA-256: `FF74CC4424891058AFF9D19E875229B03F7AE616CB6BFCC76D4B364603C54F6E`.
- Calculadora general integrada 4.19.1 SHA-256: `D64FD3D0AFF6D55719634A9D140C08E121DDF770FFD57C9082E7974557E56E4C`.
- SheetJS fijado SHA-256: `CC015130AA8521E7F088F88898EBA949CCDCBFB38DF0BD129B44B7273C3A6F41`.
- Archivo fuente recibido SHA-256: `970B5EE8EA418B09FB3509C69A253628D307E73F745EB991C6CADA155AACA1EF`; la única corrección funcional previa a integrarlo fue actualizar el título visible de 3.18 a 3.19 y sustituir el CDN por la copia fijada.

## Acceso y Preview

- Ambas herramientas reutilizan temporalmente el permiso explícito `pipeline:view` y no conceden acceso por rol implícito.
- La rama exacta `feature/v17-tools-consolidated-11b` expone el ensayo visual aislado `/experience-preview/tools` únicamente en Preview.
- En ese ensayo, Comercial, Almacenes y Administración abren las aplicaciones funcionales de la base consolidada `bb4db4` en otra pestaña; OSi Survey abre el Preview Mobile aprobado `642495`. El Hub permanece abierto.
- Production no se modifica ni se habilita.
- CRM, Survey, ICP, Cotización, APIs y migraciones permanecen sin cambios funcionales.

## Decisión de producto

Esta fase conserva las aplicaciones aprobadas dentro del ecosistema OSi Plus. La calculadora general fijada corresponde exactamente al archivo entregado `calculadora_empaque_v4191_importacion_separada.html` y permanece sin conexión al ERP. Las mejoras visuales o la integración con casos, inventario, cajas de madera y cotización se evaluarán previamente y se implementarán en lotes separados.

El Hub queda establecido como la entrada principal de la nueva versión. En incrementos posteriores se continuará separando del bloque Comercial y CRM cada módulo que tenga responsabilidad empresarial propia, conservando contratos, permisos y datos hasta que su aplicación independiente sea aprobada.
