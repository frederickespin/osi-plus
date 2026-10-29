# V17 — Integración del Hub, ERP funcional y OSi Plus Mobile

## Objetivo solicitado

Reunir el recorrido del ERP de referencia con el Hub y OSi Plus Mobile, y eliminar los accesos operativos que sólo conducen a una ficha de «En integración».

Referencia visual indicada por el usuario:

https://osi-plus-v17-experience-preview-02a-hub.vercel.app/sales/pipeline

Ese despliegue presenta identidades y datos sintéticos. No es una fuente de identidad, permisos ni datos empresariales para el Hub autenticado.

## Fuentes y decisión de integración

| Fuente | Revisión | Uso |
| --- | --- | --- |
| ERP consolidado | `feature/v17-consolidated-preview` · `d5c86d9d23a8ce5aa8c8fea6af2830cb5122d294` | Base funcional: shell, auth, contratos, APIs y módulos actuales. |
| OSi Plus Mobile | Draft PR #81 · `2743fcef8f5fb21359e98050a2cc14cc3803340b` | Nombre, suite, mini-hub, acceso a Empaque y navegación de retorno. |
| Preview visual histórico | URL anterior | Referencia de capacidades y presentación; no se importa su bootstrap ni su almacenamiento de demostración. |

Se porta la navegación del PR #81 sobre la base consolidada. La rama de revisión es `feature/v17-hub-mobile-convergence-17a`, con base de PR `feature/v17-consolidated-preview`. No se reemplaza el Survey funcional por el MVP visual anterior ni se reintroducen sus stores.

Antes de implementar se revisaron la referencia, el inventario histórico, los consumidores de ambas ramas y sus contratos. Se presentó al usuario el esquema de un solo Hub con módulos disponibles, ERP Comercial, recursos y Mobile.

## Recorrido resultante

| Acceso | Destino |
| --- | --- |
| Hub → Comercial y CRM | Inbox y Ficha funcionales de la base consolidada. |
| Ficha | Resumen → Survey → Servicios → Costos → Cotización. |
| Comercial → Relaciones Comerciales | Catálogos y relaciones existentes, cuando su modo y permisos lo permiten. |
| Hub o menú ERP → Materiales e Inventario | Aplicación funcional existente, con permisos y modo propios. |
| Hub o menú ERP → Herramientas y Equipos | Aplicación funcional existente, con permisos y modo propios. |
| Hub o menú ERP → Administración | Paneles existentes autorizados; se añade retorno al Hub. |
| Hub o menú ERP → OSi Plus Mobile | Mini-hub `/mobile`. |
| Mobile → OSi Survey | `SurveyApp` funcional en `/mobile/survey`; `/survey` sigue siendo alias. |
| Survey → Mobile | Botón en Agenda, deshabilitado durante una operación en curso. |
| Mobile → Calculadora de Empaque | Lanzador `/mobile/packing`, con retorno a Mobile. |
| Abrir Calculadora de Empaque | Nueva pestaña en la calculadora publicada. |

El Inbox y la Ficha conservan su implementación consolidada, incluido el flujo de ICP, la programación, Servicios, Costos, Cotización y comunicaciones. Este incremento no reescribe sus reglas ni sus APIs.

## Disponibilidad y autorización

La disponibilidad se aplica después de obtener el catálogo autorizado. Nunca concede permisos.

- Comercial, Administración, Survey, Materiales y Activos requieren que su implementación esté habilitada por los modos existentes.
- El Hub y el menú del ERP muestran los mismos accesos disponibles.
- Coordinación, Operaciones, Taller/Carpintería y RR. HH. siguen pendientes de integración funcional en esta base. Se conservan en un apartado informativo, sin botones que lleven a pantallas vacías.
- Las rutas históricas de aplicaciones no disponibles muestran un estado explícito con retorno al Hub. No montan módulos heredados como sustituto.
- `/mobile` requiere al menos una hija autorizada. La tarjeta aparece cuando al menos una hija está también disponible.
- Survey conserva `survey:assignment:view`; el permiso antiguo del MVP visual, `survey:assigned:view`, no habilita el consumidor funcional.
- Empaque requiere `pipeline:view`, `permissionMode: ALL`, permisos explícitos y ningún rol baseline.
- Los denies conservan prioridad. El comportamiento conservador de los denies de Administración no cambia.
- La sesión se sigue revalidando antes de navegar, con abort/fencing y control de historial en `App`.
- El origen externo recibe una URL fija, sin credenciales ni contexto añadido, con `noopener noreferrer` y `referrerPolicy=no-referrer`.

## Qué se conserva, mejora y sustituye

**Conservado:** Hub autenticado, ERP azul y compacto, consumidores funcionales consolidados, aislamiento por empresa, cinco pestañas canónicas de Ficha, permisos, Survey con persistencia y publicación, calculadora externa y sus archivos actuales.

**Mejorado:** navegación compartida entre ERP y Mobile, retorno desde Survey y Administración, visibilidad basada en disponibilidad real y compatibilidad de `/survey`.

**Sustituido:** CTAs a descriptores vacíos y grupos inertes del menú ERP. El catálogo histórico permanece registrado para compatibilidad y diagnóstico de enlaces anteriores.

## Límites y publicación

Este incremento no modifica APIs, Auth, roles, grants/denies, Prisma, migraciones, datos, variables de Vercel ni los gates de entorno.

La rama consolidada tiene 35 migraciones y utiliza el destino aislado documentado `v17_consolidated_preview_10b` en `br-mute-credit-ahxnvfx0`. La base `crm01c1a_rehearsal` utilizada por el Preview Mobile actual es otro destino. No se intercambian conexiones ni se afirma que una comprobación local valide el estado remoto de esas bases.

La nueva rama de revisión no se agrega a las listas de activación Preview. Una compilación automática de esa rama no debe confundirse con la activación del ERP consolidado. El cambio se prepara para incorporarse a la rama consolidada mediante revisión, conservando su configuración exacta.

El botón propio de la calculadora externa sigue apuntando al Hub visual anterior. El lanzador mantiene el Hub integrado en la pestaña original; cambiar el enlace dentro de la calculadora requiere fijar primero la URL canónica que se publicará. No se presenta ese retorno externo como integrado en este incremento.

## Verificación

Las pruebas de navegador usan sesiones y respuestas sintéticas interceptadas. No conectan a Neon. El proxy de API del arnés apunta a un puerto local sin backend para evitar llamadas accidentales.

- Tipos y ESLint de los componentes afectados.
- Build completo Prisma + Vite; generar el cliente no ejecuta migraciones ni consultas.
- Guardia de integración consolidada y sus negativas.
- Guardia de autorización previa al lazy import, adaptada para leer el descriptor comercial mediante AST en vez de depender del formato de una línea; conserva y amplía sus pruebas negativas.
- Ocho casos nuevos para disponibilidad, Survey funcional, alias, retorno, calculadora, permisos, denies, revocación, historial y navegación ERP/Mobile.
- Suite comercial consolidada existente para las cinco pestañas y sus consumidores.
- Workflow focal `Hub and Mobile integration`, sin secretos ni base externa.

Los resultados ejecutados y cualquier limitación se registran en el PR. No se atribuyen pruebas de navegador o de base de datos a una revisión estática.
