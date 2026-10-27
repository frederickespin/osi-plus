# V17 OSi Plus Mobile 10A — contrato de integración del Hub

## Propósito

Este lote incorpora el MVP visual aprobado de OSi Survey al Hub autenticado sin convertir el Preview en autoridad empresarial. El nombre canónico de la suite es **OSi Plus Mobile** y reemplaza cualquier referencia de navegación a “Procesos móviles”.

## Navegación aprobada

```text
OSi Plus Hub
└── OSi Plus Mobile
    └── OSi Survey
```

- El Hub principal muestra una sola tarjeta `OSi Plus Mobile` cuando el actor tiene acceso a por lo menos una de sus aplicaciones.
- Las aplicaciones móviles no se duplican como tarjetas de primer nivel.
- `/mobile` abre el mini-hub.
- `/mobile/survey` es la ruta canónica de Survey.
- `/survey` permanece como alias compatible y pasa por la misma autorización.
- Survey se monta a pantalla completa para conservar la experiencia móvil.
- El regreso desde Survey lleva a `OSi Plus Mobile`. Un flujo futuro abierto desde una Ficha del Caso podrá suministrar un regreso específico sin duplicar el componente.

## Autorización

- La suite no concede permisos propios: es visible sólo cuando al menos una aplicación hija fue autorizada por la decisión canónica del servidor.
- OSi Survey requiere `survey:assigned:view` y no obtiene autorización por parámetros, storage, encabezados manipulables ni por aparecer dentro de la suite.
- Administración incluye el permiso dentro de su autoridad de rol. Los demás actores requieren concesión explícita; las asignaciones concretas se conectarán con la futura API de Survey.
- `deniedPermissions` prevalece y evita incluso la descarga del chunk de Survey.
- Deep links, alias, reload, back y forward revalidan la sesión antes de montar el módulo protegido.

## Estado funcional

- El componente utilizado es el mismo MVP visual aprobado en `V17-CRM-SURVEY-09A-PREVIEW-CONTRACT.md`; no se usa iframe ni una copia divergente.
- La ruta visual aislada `/experience-preview/survey` del PR #79 se conserva para comparación.
- Dentro del Hub, Survey continúa identificado como `MVP visual` y `Datos visuales · no productivos`.
- No consume API de Survey, no persiste borradores, fotos, firmas o PDFs y no usa almacenamiento del navegador.
- No añade migraciones ni modifica datos empresariales.

## Preview y Production

- La rama exacta `feature/v17-osi-plus-mobile-hub-10a` puede utilizar el ensayo Preview autenticado existente.
- En esta rama, las mutaciones CRM permanecen obligatoriamente desactivadas.
- Production no se habilita ni cambia y `productionApiEnabled=false` se mantiene conceptualmente sin alteración.

## Extensión futura

El mini-hub podrá incorporar otras aplicaciones móviles —por ejemplo Mini Survey, supervisión, despacho, inventario o taller— únicamente después de definir su contrato, permiso y autoridad. Una aplicación futura no aparecerá como tarjeta vacía o no autorizada.
