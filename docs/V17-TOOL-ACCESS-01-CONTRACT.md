# V17-TOOL-ACCESS-01 — Accesos a cotización y procesos móviles

## Alcance y procedencia

Este incremento incorpora al Hub dos entradas de trabajo: **Herramientas de cotización**, para abrir la calculadora de empaque existente, y **Procesos móviles**, para abrir Inventario Visual y conservar el acceso a la agenda de Survey de OSI.

La base de implementación es `feature/v17-consolidated-preview`, commit `d5c86d9d23a8ce5aa8c8fea6af2830cb5122d294` del repositorio `frederickespin/osi-plus`. Se utiliza el catálogo y el shell autenticado de esa base, con sus decisiones de acceso y sus compuertas existentes.

El [Hub Experience Preview 02A](https://osi-plus-v17-experience-preview-02a-cxp80thtn.vercel.app/hub) es una referencia visual anterior y separada. Sus personas sintéticas y su almacenamiento efímero no se incorporan al Hub autenticado ni a las aplicaciones operativas. Este lote no modifica ese despliegue.

El resultado funcional de este lote es **navegación hacia las aplicaciones actuales**. No crea una segunda calculadora, no copia sus archivos al Hub y no introduce sincronización de expedientes. La publicación de una revisión visual, el commit final y una eventual activación del Hub autenticado se registran por separado; este contrato no declara esos pasos completados.

## Catálogo, rutas y permisos

| Entrada | Identidad en el catálogo | Ruta | Permiso explícito | Condiciones |
| --- | --- | --- | --- | --- |
| Herramientas de cotización | `quotation-tools` | `/quotation-tools` | `pipeline:view` | `permissionMode: ALL`, `requiresExplicitPermissions: true`, `baselineRoles: []` |
| Procesos móviles | `osi-survey` | `/mobile-processes` | `survey:assignment:view` | `permissionMode: ALL`, `requiresExplicitPermissions: true`, `baselineRoles: []` |
| Agenda de Survey de OSI | Alias del mismo `osi-survey` | `/survey` | `survey:assignment:view` | Conserva las compuertas de Survey y su comprobación de autorización |

La calculadora queda fuera de Taller y Carpintería. El catálogo de Herramientas y Equipos físicos, identificado por `tools-equipment`, conserva su función y su ruta `/assets`.

Procesos móviles reutiliza la identidad de Survey; no se registra una segunda aplicación principal para la misma agenda. Sus iconos de navegación son `calculator` y `smartphone`, respectivamente.

### Delegación deliberada de `pipeline:view`

El acceso a Herramientas de cotización se delega mediante el permiso efectivo `pipeline:view`, independientemente del rol del usuario. `baselineRoles: []` es una decisión deliberada para este lanzador: no concede acceso anónimo, no asigna el permiso a todos los roles y no convierte un rol administrativo en autorización suficiente.

Un usuario de otro rol con `pipeline:view` explícito puede abrir este lanzador. Eso no modifica el requisito de rol A/V y permiso de Comercial y CRM, ni habilita sus APIs. La prueba focal incluye un actor de rol G que puede abrir el lanzador con el permiso delegado y continúa sin acceso a `/commercial`.

Las denegaciones explícitas prevalecen. Si falta el permiso, si no hay permisos efectivos o si el permiso está denegado, el acceso se rechaza. No se modifican grants, roles, permisos del servidor ni compuertas de entorno.

### Autoridad de navegación

`App` conserva la revalidación de sesión y la decisión de ruta antes del límite de carga diferida del Hub. `HubWorkspace` comprueba además que `quotation-tools` o `osi-survey`, según corresponda, esté entre las aplicaciones visibles antes de montar el lanzador.

Los parámetros de URL, el fragmento, el almacenamiento del navegador y la selección visual de un rol no conceden permisos. Una revocación recibida al revalidar la navegación impide abrir el módulo.

Los modos y las ramas autorizadas del Hub consolidado permanecen intactos. Crear una rama de desarrollo o publicar la revisión estática no habilita automáticamente los dominios empresariales en Preview o Production.

## Aplicaciones de destino

Los destinos están definidos como metadatos inmutables en `src/hub/externalTools.ts`:

| Herramienta | Destino fijo | Versión o referencia al preparar el lote |
| --- | --- | --- |
| Calculadora de empaque | [Empaque](https://ip-suite-inventario-empaquee.vercel.app/empaque/index.html) | Aplicación publicada v4.19.3; el acceso utiliza la versión vigente |
| Inventario Visual | [Inventario Visual](https://ip-suite-inventario-empaquee.vercel.app/inventario/index.html) | Aplicación actual de la misma Suite |

El acceso abre la URL vigente; no fija una copia de esa versión ni realiza un cambio de versión del destino. Las interfaces, motores, reportes, materiales habituales, artículos, fotografías y datos de las aplicaciones se mantienen bajo su funcionamiento actual.

La apertura utiliza un enlace HTML normal con `target="_blank"`, `rel="noopener noreferrer"` y `referrerPolicy="no-referrer"`. No utiliza iframe, `window.open`, `postMessage` ni llamadas a las APIs de la Suite. El enlace no contiene query ni fragmento y no transmite cliente, expediente, tenant, credenciales o contexto de demostración.

Mantener el mismo origen de destino permite que la aplicación acceda a los datos y sesiones que ya tenga disponibles en ese navegador conforme a sus propias reglas. Este comportamiento no crea SSO, no comparte el almacenamiento de OSI, no sincroniza datos entre equipos y no sustituye la autenticación que requiera cada aplicación.

El lanzador informa expresamente:

> Se abre la aplicación que ya utilizas, con sus datos y diseño actuales.

> La vinculación automática con el expediente de OSI está pendiente.

## Conservación del recorrido de Survey

`/mobile-processes` muestra el acceso a Inventario Visual sin montar `SurveyApp`, incluso cuando Survey está habilitado. La opción **Agenda de OSI** se muestra únicamente cuando `surveyEnabled` es verdadero dentro del contexto autorizado.

`SurveyApp` se monta sólo cuando coinciden la identidad `osi-survey`, la ruta exacta `/survey`, el modo habilitado y la autorización. El alias conserva los enlaces existentes. Si Survey está deshabilitado, `/survey` mantiene su descriptor inactivo; no activa el dominio ni redirige silenciosamente a Inventario Visual.

La denegación de `survey:assignment:view` protege tanto `/mobile-processes` como `/survey`. Abrir Inventario Visual no crea una asignación, una visita ni una publicación de Survey en OSI.

## Revisión estática aislada

La revisión de accesos tiene una entrada independiente en `review/tool-access/index.html` y `src/review/ToolAccessReview.tsx`. Reutiliza `ExternalToolLauncher` y los mismos destinos del Hub autenticado. Muestra únicamente las nuevas entradas y un enlace al Hub completo de demostración; no reemplaza ese Hub ni se presenta como una sesión operativa.

Su alcance es el siguiente:

- Rutas permitidas: `/`, `/hub`, `/quotation-tools` y `/mobile-processes`.
- No monta `App`, `HubWorkspace`, autenticación, personas sintéticas ni módulos empresariales.
- No lee ni escribe almacenamiento operativo; tampoco reemplaza `localStorage` o `sessionStorage` por implementaciones de demostración.
- No ofrece captura de fotos, cámara, subida de archivos, agenda de OSI ni formularios empresariales.
- No necesita una cuenta para revisar la navegación. La autenticación del destino conserva su funcionamiento independiente al abrirlo.

`scripts/build-v17-tool-access-preview.mjs` usa una configuración propia de Vite, `publicDir: false` y el prefijo de entorno `TOOL_ACCESS_REVIEW_PUBLIC_`. Genera `.tool-access-dist` y rechaza explícitamente `VERCEL_ENV=production`. La salida no incorpora la configuración de APIs del proyecto.

La configuración generada devuelve 404 con `NAVIGATION_REVIEW_ONLY` para `/api` y sus subrutas. `/survey` no forma parte de esta revisión y devuelve 404. Sólo las rutas previstas tienen fallback al documento de entrada; las demás rutas son 404.

La revisión aplica CSP con `connect-src 'none'`, `worker-src 'none'`, `frame-src 'none'`, `object-src 'none'`, `base-uri 'none'`, `form-action 'none'` y `frame-ancestors 'none'`. Su política de permisos deshabilita cámara, micrófono, geolocalización y pagos. Incluye `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, exclusión de indexación y `Cache-Control: no-store`. Estas políticas pertenecen a la revisión estática; no se trasladan a las aplicaciones operativas de destino.

## Integraciones de datos pendientes

| Área | Trabajo posterior requerido |
| --- | --- |
| Identidad y SSO | Definir el acceso compartido entre OSI y la Suite sin transmitir credenciales en enlaces ni reutilizar personas de demostración. |
| Cliente y expediente | Relacionar de forma explícita el cliente único, sus múltiples solicitudes y cada caso de OSI, con referencia y nombre del trabajo; resolver duplicados e historia antes de migrar. |
| Captura directa y Excel | Vincular esas entradas al caso sin fabricar una visita o una asignación de evaluador; conservar la procedencia de las medidas y pesos. |
| Inventario y fotografías | Adaptar retornos, revisiones, verificación de archivos y reintentos al contrato central, conservando las capacidades funcionales del inventario actual. |
| Materiales habituales | Integrar el catálogo reutilizable con la autoridad central de Materiales y sus costos versionados; no presentar el catálogo local como sincronizado. |
| BOM y diseño de empaque | Definir un adaptador de lista de materiales y resultados técnicos hacia necesidades de Materiales e Ingeniería/Carpintería, con versiones y fuentes explícitas. |
| Costos y cotización | Encajar los resultados en las autoridades publicadas de Motor Logístico, Costing y Cotización; evitar duplicar márgenes, comisiones, impuestos o propuestas oficiales. |
| Datos existentes y dispositivos | Preparar y comprobar cualquier migración posterior, conservación de respaldos, comportamiento móvil real y recorrido completo entre aplicaciones. |

Los accesos de este lote no ejecutan ninguno de esos traspasos. Cada aplicación sigue siendo responsable de sus datos y de sus operaciones actuales.

## Validación realizada

| Comprobación | Resultado de este lote |
| --- | --- |
| `npm run typecheck:v17-tool-access` | Correcto para metadatos, lanzador y revisión estática |
| `npm run build:v17-tool-access-preview` | Correcto; salida estática aislada generada |
| Build del frontend completo con Vite | Correcto; no equivale a validar migraciones o APIs de producción |
| `npm run test:v17-tool-access:browser` | 18 pruebas correctas: 9 en el proyecto de escritorio y 9 en el proyecto móvil |
| Reejecución focal de Survey tras corregir su respuesta simulada | 2 pruebas correctas, escritorio y móvil; comprueba respuesta 200, encabezado y agenda vacía |
| Inspección visual de las tres rutas de revisión | Correcta en escritorio y móvil; sin errores de JavaScript ni desbordamiento horizontal |

La matriz focal está en `tests/v17-tool-access/tool-access.spec.ts` y `playwright.v17-tool-access.config.ts`. Comprueba:

1. Permiso comercial explícito y enlace fijo, incluso al recibir parámetros o fragmentos ajenos.
2. Rechazo de permisos ausentes o denegados, sin cargar el lanzador ni el destino.
3. Delegación a un rol no comercial sin abrir Comercial y CRM.
4. Separación de `/mobile-processes` y `/survey`, y carga autorizada de la agenda existente.
5. Denegación de ambas rutas móviles.
6. Revalidación de permisos revocados antes de navegar.
7. Navegación de revisión con teclado, recarga, historial, ausencia de escrituras de almacenamiento y de peticiones API, sin desbordamiento horizontal en la vista comprobada.
8. Apertura en pestaña nueva, `window.opener` nulo, ausencia de referrer y preservación exacta de los destinos sin contexto añadido.
9. APIs y ruta Survey cerradas en la revisión, con políticas de aislamiento presentes.

### Límites de la verificación

La ejecución utiliza **Playwright 1.62 con Google Chrome 156**, suministrado mediante `TOOL_ACCESS_BROWSER_PATH`. Los proyectos incluyen escritorio de 1440 × 1000 y un perfil móvil Pixel 7 de 390 × 844. La emulación móvil no constituye una prueba en un teléfono físico ni una validación de Safari/WebKit o Firefox.

Las respuestas de autenticación son simuladas con actores y permisos sintéticos. La prueba de apertura intercepta los destinos y responde con una página de prueba; verifica la URL y las propiedades de navegación, no una sesión real de la Suite. La comprobación de Survey cubre su acceso y montaje autorizado, no el ciclo completo de levantamiento.

No se registraron clientes reales, no se enviaron fotografías y no se comprobó SSO, sincronización, migración de datos, cálculo económico completo o persistencia entre aplicaciones mediante esta matriz. El typecheck focal y el build de frontend tampoco certifican por sí solos todos los dominios del repositorio ni un despliegue autenticado remoto.

## Archivos de referencia

- `src/hub/appCatalog.ts`: entradas, rutas y permisos del catálogo.
- `src/hub/HubWorkspace.tsx`: comprobación de visibilidad, montaje diferido y separación de la ruta Survey.
- `src/hub/externalTools.ts`: destinos y mensajes compartidos.
- `src/hub/ExternalToolLauncher.tsx`: presentación y enlaces.
- `src/review/ToolAccessReview.tsx`: revisión independiente de navegación.
- `scripts/build-v17-tool-access-preview.mjs`: generación y aislamiento de la revisión.
- `scripts/serve-v17-tool-access-preview.mjs`: servidor local para verificar esa salida.
- `tests/v17-tool-access/tool-access.spec.ts`: matriz focal de comportamiento.
- `playwright.v17-tool-access.config.ts` y `tsconfig.v17-tool-access.json`: configuración de verificación.
