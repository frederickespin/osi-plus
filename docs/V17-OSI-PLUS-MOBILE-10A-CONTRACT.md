# V17 OSi Plus Mobile 10A — contrato de integración del Hub

## Propósito

Este lote incorpora el MVP visual aprobado de OSi Survey al Hub autenticado y un acceso a la Calculadora de Empaque ya publicada, sin convertir el Preview en autoridad empresarial. El nombre canónico de la suite es **OSi Plus Mobile** y reemplaza cualquier referencia de navegación a “Procesos móviles”. La ampliación de la calculadora continúa dentro del Draft PR #81.

## Navegación aprobada

| Acceso | Ruta dentro de OSI Plus | Destino |
| --- | --- | --- |
| OSi Plus Mobile | `/mobile` | Mini-hub de aplicaciones autorizadas. |
| OSi Survey | `/mobile/survey` | MVP visual aprobado, dentro de la suite. |
| Calculadora de Empaque | `/mobile/packing` | Lanzador de la calculadora externa publicada. |

- El Hub principal muestra una sola tarjeta `OSi Plus Mobile` cuando el actor tiene acceso a por lo menos una de sus aplicaciones.
- Las aplicaciones móviles no se duplican como tarjetas de primer nivel.
- `/mobile` abre el mini-hub.
- La tarjeta de la suite utiliza la etiqueta neutral `Aplicaciones`; cada aplicación conserva su propio estado funcional.
- `/mobile/survey` es la ruta canónica de Survey.
- `/survey` permanece como alias compatible y pasa por la misma autorización.
- Survey se monta a pantalla completa para conservar la experiencia móvil.
- El regreso desde Survey lleva a `OSi Plus Mobile`. Un flujo futuro abierto desde una Ficha del Caso podrá suministrar un regreso específico sin duplicar el componente.
- La tarjeta `Calculadora de Empaque` abre primero `/mobile/packing`, mediante la misma navegación autenticada que revalida la sesión antes de montar el lanzador.
- El lanzador permite volver a `OSi Plus Mobile` o abrir la calculadora en otra pestaña, conservando la suite en la pestaña original.
- El botón `Volver al Hub` de OSi Plus Mobile mantiene su destino `/hub`.

## Autorización

- La suite no concede permisos propios: es visible sólo cuando al menos una aplicación hija fue autorizada por la decisión canónica del servidor.
- OSi Survey requiere `survey:assigned:view` y no obtiene autorización por parámetros, storage, encabezados manipulables ni por aparecer dentro de la suite.
- Administración incluye el permiso dentro de su autoridad de rol. Los demás actores requieren concesión explícita; las asignaciones concretas se conectarán con la futura API de Survey.
- La Calculadora de Empaque se registra como `packing-calculator` dentro de `osi-plus-mobile` y reutiliza el permiso comercial existente `pipeline:view`, con `permissionMode: "ALL"`, `requiresExplicitPermissions: true` y `baselineRoles: []`. La pertenencia a un rol sin permisos efectivos no habilita el acceso.
- `survey:assigned:view` no concede acceso a la calculadora, y `pipeline:view` no concede acceso a Survey. La suite puede mostrar una o ambas aplicaciones según los permisos efectivos del actor.
- `deniedPermissions` prevalece para ambas aplicaciones; bloquea el lanzador de la calculadora y evita incluso la descarga del chunk de Survey cuando corresponda.
- Deep links, alias, reload, back y forward revalidan la sesión antes de montar el módulo protegido.
- La autorización del Hub controla la visibilidad y el lanzador internos. Este acceso no modifica el mecanismo de acceso de la aplicación externa ni le transmite la sesión de OSI Plus.

## Estado funcional

- El componente de Survey utilizado es el mismo MVP visual aprobado en `V17-CRM-SURVEY-09A-PREVIEW-CONTRACT.md`; no se usa iframe ni una copia divergente.
- La ruta visual aislada `/experience-preview/survey` del PR #79 se conserva para comparación.
- Dentro del Hub, Survey continúa identificado como `MVP visual` y `Datos visuales · no productivos`.
- Survey no consume API de Survey, no persiste borradores, fotos, firmas o PDFs y no usa almacenamiento del navegador.
- La Calculadora de Empaque tiene estado `EXTERNAL_AVAILABLE`, icono de calculadora y etiqueta `Aplicación externa`; no se presenta como el MVP visual de Survey.
- Su destino es literal: `https://ip-suite-inventario-empaquee.vercel.app/empaque/index.html`. El enlace utiliza `target="_blank"`, `rel="noopener noreferrer"` y `referrerPolicy="no-referrer"`, sin parámetros de contexto.
- La calculadora sólo se abre cuando el usuario pulsa el enlace del lanzador. No se incrusta con iframe, no se copia su código al Hub y no se precarga su contenido.
- El Hub y el lanzador no transfieren automáticamente expedientes, datos, credenciales ni sesión, ni añaden persistencia propia. La calculadora externa conserva su funcionamiento y almacenamiento existentes; las restricciones del MVP visual de Survey no se extienden a ella.
- Este lote añade el acceso solicitado dentro de la suite; no cambia el botón de retorno que ya existe en la calculadora externa.
- No añade APIs, cambios de autenticación, migraciones ni modificaciones de datos empresariales.

## Preview y Production

- La rama exacta `feature/v17-osi-plus-mobile-hub-10a` puede utilizar el ensayo Preview autenticado existente.
- En esta rama, las mutaciones CRM permanecen obligatoriamente desactivadas.
- Production no se habilita ni cambia y `productionApiEnabled=false` se mantiene conceptualmente sin alteración.

## Extensión futura

El mini-hub podrá incorporar otras aplicaciones móviles —por ejemplo Mini Survey, supervisión, despacho, inventario o taller— únicamente después de definir su contrato, permiso y autoridad. Una aplicación futura no aparecerá como tarjeta vacía o no autorizada.
