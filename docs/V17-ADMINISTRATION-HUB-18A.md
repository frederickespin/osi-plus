# Administración del OSI Plus Hub — primer incremento

Fecha: 29 de octubre de 2026 (República Dominicana).

## Decisión y alcance

Se atiende la secuencia indicada por el usuario: Administración primero y Almacenes después. Este incremento organiza los consumidores administrativos existentes en un espacio propio, con una sola sección seleccionada y accesos independientes según permisos.

Base revisada: `9fb3a1a73a76b2c96598ba74a8d438c3f4dec29e`, árbol equivalente al merge `1234f3660ec638f6427c894261c4b95a3a9d03c3` de la rama consolidada. Rama de trabajo: `feature/v17-administration-hub-18a`.

## Secciones implementadas

| Sección | Ruta | Implementación reutilizada |
| --- | --- | --- |
| Usuarios y accesos | `/administration/access` | Membresías, consulta y edición autorizada de accesos e invitaciones existentes. |
| Servicios y paquetes | `/administration/services` | Catálogo de servicios, paquetes y políticas de materiales. |
| Motor Logístico | `/administration/logistics` | Configuración de reglas logísticas. |
| Costos y monedas | `/administration/costing` | Reglas de costos y tipos de cambio. |
| Plantillas y comunicaciones | `/administration/communications` | Administración de plantillas y versiones. |
| Políticas operativas | `/administration/policies` | Perfiles, capacidades, políticas de agenda y excepciones disponibles. |

`/administration` abre la primera sección disponible para esa persona. Las subrutas permiten recargar y usar Atrás/Adelante conservando el destino. La cabecera mantiene el retorno al Hub. La navegación de escritorio es una lista compacta; en móvil se usa un selector de sección.

Usuarios y accesos conserva el contrato existente de roles A/V y permisos administrativos. No constituye un editor universal de todos los roles del ERP. Políticas operativas conserva sus perfiles actuales y no equivale a RRHH completo.

## Problemas corregidos

- Administración dejaba Servicios y Costos subordinados al permiso para consultar membresías.
- Los usuarios con varias configuraciones autorizadas, pero sin membresías, recibían únicamente la primera pantalla de una cadena de alternativas.
- La página de membresías montaba simultáneamente las otras configuraciones, aun cuando el usuario no las estuviera utilizando.
- Servicios comenzaba por Catálogo y consultaba dependencias sin distinguir lectores de paquetes o políticas.
- Una combinación de permisos de gestión de Personal sin permiso de entrada podía producir un enlace visible hacia una ruta denegada.

## Contrato de acceso

El Hub mantiene la sesión validada por el servidor y la revalidación al navegar. Cada sección exige una compuerta funcional habilitada y al menos uno de sus permisos explícitos de entrada, excluyendo denegaciones. La disponibilidad general deriva de la lista final de secciones autorizadas.

Administración declara `denyScope: "PERMISSION"`: denegar Logística impide consultar esa sección, pero no impide consultar Costos si la persona conserva ese permiso. Las otras aplicaciones conservan su semántica previa de denegación del conjunto. El contrato del catálogo verifica esta distinción. Las subrutas se autorizan antes de cargar el Hub; el espacio administrativo comprueba además que la sección esté disponible antes de montar su consumidor.

La reorganización no otorga permisos ni cambia contratos de API, credenciales, datos o migraciones. Los controles de servidor siguen siendo la autoridad para cada operación.

## Servicios: dependencias de lectura

- Catálogo requiere `services:catalog:view`.
- Paquetes y modos requieren `services:packages:view`.
- Políticas requieren `services:materials:view`.
- La edición conserva los permisos de gestión y exige las lecturas necesarias para sus selectores. Si faltan, se mantiene la consulta y se explica la limitación; no se sustituyen referencias existentes por valores vacíos.
- Se descartan respuestas de cargas canceladas. Los errores de lectura ofrecen recarga y no se presentan como resultados vacíos correctos.

## Configuración general pendiente dentro de Administración

La pantalla histórica `SettingsModule` contiene General, Notificaciones, Seguridad y Apariencia, pero sus cambios viven en estado de React y el botón Guardar sólo emite una notificación. Incluye datos demostrativos que no corresponden a esta empresa.

Por ello, Empresa y preferencias requiere un incremento propio con persistencia y contrato definidos. Los parámetros de seguridad necesitan una integración real con autenticación. No se habilita el formulario histórico como si ya guardara cambios.

## Siguiente módulo: Almacenes

El usuario amplió el alcance: un área Almacenes debe organizar tanto recursos propios como bienes de clientes, con estas responsabilidades:

1. Espacios y ubicaciones: clasificación, disposición, jerarquía, capacidad y ocupación.
2. Almacenaje de clientes: bienes y documentos bajo custodia, relacionados con cliente y servicio, con movimientos e historial.
3. Materiales de embalaje: inventario de consumibles, reservas, entradas y salidas.
4. Herramientas y equipos: activos reutilizables, disponibilidad, entrega, devolución y custodia.

Los espacios físicos pueden ser comunes. La propiedad de los bienes, las existencias de consumibles y la identidad de los activos deben mantenerse diferenciadas. La futura organización reutilizará las implementaciones actuales de Materiales y Activos donde correspondan.

Referencia indicada por el usuario:

```text
C:\Users\espin\OneDrive - International Packers\aplicaciones ip\IP_Almacen_v0121_organizacion_simple.html
```

El archivo no está disponible en este entorno y no ha sido leído. Se necesita adjuntar esa versión exacta antes de afirmar qué contiene o decidir qué recuperar. No se sustituyó por una versión anterior ni se inició implementación de Almacenes.

## Verificación

- Compilación Vite: correcta.
- TypeScript focal `tsconfig.v17-commercial-crm.json`: correcto.
- ESLint de los archivos modificados: correcto.
- Pruebas puras de rutas, permisos y catálogo de Administración: 12 correctas.
- Guards existentes de Hub, autorización previa, membresías y composición administrativa: comprobados tras ajustar sólo las ubicaciones y rutas afectadas.
- Servicios: contratos y HTTP existentes comprobados; sin conexión a Neon.
- Se prepararon pruebas de navegador de navegación, permisos, carga por sección, historial y móvil. Su ejecución local está pendiente porque el navegador requerido no está instalado y su descarga devolvió un archivo inválido. La detección de casos no cuenta como ejecución aprobada.
- No se ha probado persistencia real en el Preview con estas modificaciones.

Comandos focales:

```bash
npm run test:v17-administration
npm run typecheck:v17-commercial-crm
npm run test:v17-administration:browser
```
