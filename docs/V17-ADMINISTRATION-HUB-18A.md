# Administración del OSI Plus Hub — primer incremento

Fecha: 29 de octubre de 2026 (República Dominicana).

## Decisión y alcance

Se atiende la secuencia indicada por el usuario: Administración primero y Almacenes después. Este incremento organiza los consumidores administrativos existentes en un espacio propio, con una sola sección seleccionada y accesos independientes según permisos.

Base revisada: `9fb3a1a73a76b2c96598ba74a8d438c3f4dec29e`, árbol equivalente al merge `1234f3660ec638f6427c894261c4b95a3a9d03c3` de la rama consolidada. Rama de trabajo: `feature/v17-administration-hub-18a`.

## Preferencias de interfaz para OSI Plus

El usuario reiteró el 29 de octubre de 2026 que desea interfaces minimalistas y el máximo uso posible de iconos. Estos criterios se aplican a Administración y a los módulos siguientes:

- Usar listas y tablas compactas como vista principal; evitar tarjetas repetidas, cabeceras grandes y espacios decorativos que reduzcan el área de trabajo.
- Priorizar iconos consistentes en acciones frecuentes: buscar, filtrar, añadir, editar, guardar, recargar, exportar y volver. Mantener textos breves cuando ayuden a distinguir el destino o una acción de negocio.
- Cada control de solo icono debe tener nombre accesible y una ayuda identificable con ratón y teclado. En móvil, la comprensión no puede depender de pasar el cursor.
- Mostrar los campos y acciones necesarios para la tarea actual; abrir los detalles y opciones secundarias cuando se soliciten.
- Colocar las explicaciones extensas en ayuda contextual mediante el icono de interrogación. Conservar visibles estados, errores, campos obligatorios y confirmaciones necesarias para la operación.
- Mantener filas de una o dos líneas cuando el contenido lo permita, jerarquía visual sobria y un único patrón de navegación y acciones entre módulos.
- Conservar controles cómodos para uso táctil, foco visible y acceso por teclado al compactar la presentación.

La estructura de Administración utiliza una lista con iconos, una sección activa y selector en móvil. Se revisó la presentación de las seis secciones: cabeceras compactas, tablas y listas, ayudas contextuales con cierre por teclado o toque y acciones frecuentes con iconos accesibles. Se conservan textos breves en acciones de negocio y en controles móviles que los necesitan. Esta revisión mantiene los formularios y las reglas existentes; quedan para su propio alcance los campos manuales de referencias de catálogo y algunos estados técnicos heredados.

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

El contrato propuesto se documenta en `V17-ADMINISTRATION-COMPANY-PREFERENCES-19A-PLAN.md`. El repositorio conserva 35 migraciones y el historial de Neon aportado por el usuario incluye una extensión 36 de Ingeniería cuyo SQL aún no se recuperó. Antes de ampliar la persistencia es necesario recuperar y revisar ese archivo exacto, conciliar el esquema y verificar la nueva migración sobre la cadena completa. No se alteró la base de datos ni se relajó el inventario canónico.

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

El usuario adjuntó la versión exacta `IP_Almacen_v0121_organizacion_simple.html`, cuyo título es «IP · Almacén 0.12.1 · Organización simplificada». Se revisó su código como referencia, sin modificar ni ejecutar el archivo y sin iniciar la implementación de Almacenes.

Patrones confirmados en esa versión:

- Navegación agrupada y plegable, tablas compactas y acciones con iconos SVG.
- Almacenes principales y ubicaciones interiores, creación explícita del recorrido, reglas de codificación y conservación de la identidad interna y del QR.
- Clasificación del uso del área separada de su estado operativo y de las reglas de disponibilidad.
- Ayuda contextual que reúne orientación extensa y mantiene visibles advertencias, errores y confirmaciones.

El campo «Capacidad / características» del HTML es texto informativo; no demuestra un cálculo general de capacidad u ocupación del almacén.

La aplicación guarda su estado en `localStorage` con la clave `ip_warehouse_v0121` y ofrece respaldos JSON. Sus perfiles simulan responsabilidades; no constituyen autenticación del servidor ni sincronización entre dispositivos. El propio HTML declara pendiente la gestión de artículos de clientes, bultos, cajas de almacenaje, contenedores y salidas por expediente. Su catálogo de usos es una guía para esas funciones, no prueba de que ya estén implementadas. Al integrarlo se conservarán los contratos de sesión, empresa, permisos y persistencia del Hub.

## Verificación

- Compilación Vite: correcta.
- TypeScript focal `tsconfig.v17-commercial-crm.json`: correcto.
- ESLint de los archivos modificados: correcto.
- Pruebas puras de rutas, permisos y catálogo de Administración: 12 correctas.
- Guards existentes de Hub, autorización previa, membresías y composición administrativa: comprobados tras ajustar sólo las ubicaciones y rutas afectadas.
- Servicios: contratos y HTTP existentes comprobados; sin conexión a Neon.
- Las 22 pruebas de navegador de navegación, permisos, carga por sección, historial y móvil pasaron en el workflow [Administration Hub, ejecución 40991600736](https://github.com/frederickespin/osi-plus/actions/runs/40991600736), sobre los cambios del commit `2b5746887348abced76fc8b4386709d51d498b0f`. Usaron APIs interceptadas y datos sintéticos. La descarga local de Chromium falló; no se atribuye ese resultado a una ejecución local.
- No se ha probado persistencia real en el Preview con estas modificaciones.

La prueba negativa de denegación de permisos del guard de CRM se corrigió sin cambiar el guard ni la autorización: se distinguen la eliminación de todas las comprobaciones y la pérdida de precedencia respecto del rol. Las 29 comprobaciones locales de ese guard pasan. El acabado visual añade un escenario de ayuda y restauración del foco en escritorio y móvil; su resultado remoto debe revisarse en el commit que se integre.

Comandos focales:

```bash
npm run test:v17-administration
npm run typecheck:v17-commercial-crm
npm run test:v17-administration:browser
```
