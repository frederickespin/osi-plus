# OSi-plus: Roles, Módulos y Estructura (Guion)

Este documento es el "guion" operativo de la app y está basado en lo que realmente está cableado hoy en el código:

- **Fuente de verdad de módulos por rol:** `src/lib/roleModuleMap.ts` (`MODULES_BY_ROLE`, `canAccessModule`).
- Menú: `src/components/layout/Sidebar.tsx` (filtra por `canAccessModule`).
- Registro y render de módulos: `src/App.tsx`.

## 1. Roles (código, nombre, qué ve, qué puede hacer, módulos permitidos)

Notas:
- `A` (Admin) ve todo: `canAccessModule('A', id)` devuelve siempre true.
- En la app el rol se toma desde sesión local (`localStorage`), ver `src/lib/sessionStore.ts`.
- Mapeo alineado al PDF "Matriz de Acceso y Visibilidad".

### Roles estratégicos (Web)

| Rol | Nombre | Qué ve / hace (resumen) | Módulos permitidos (roleModuleMap) |
| --- | --- | --- | --- |
| `A` | Administrador | Acceso total. Configura y audita. | Todos los módulos. |
| `V` | Ventas | Pipeline, Cotizador con Nesting, Agenda, Historial Cliente. | `clients`, `sales-quote`, `commercial-calendar`, `commercial-config`, `projects`, `osi-editor`, `crate-wood`, `disenacotiza` |
| `K` | Coordinador | Gestor Proyectos Sombrilla, Editor Plantillas (PGD/PIC/NPS), Visor Nesting, Dashboard. | `k-dashboard`, `k-project`, `clients`, `projects`, `commercial-calendar`, `k-templates`, `osi-editor`, `tracking`, `nesting`, `nestingv2` |
| `B` | Operaciones | Muro Liquidación, Gestor de OSIs, Calendario, PTF/PET, Validación Documental. | `operations`, `tracking`, `calendar`, `wall`, `projects`, `osi-editor` |
| `C` | Materiales | Inventario Maestro, Smart Match (en inventory), Editor PTF, Aprobación Costos Carpintería. | `wms`, `inventory`, `purchases`, `carpentry` |
| `I` | RRHH | Dashboard KPIs 360°, Módulo Ecológico, Nómina Variable, Gestión de Personal (solo reactivación). | `hr`, `kpi`, `nota`, `badges`, `users` |

### Roles operativos (App móvil / ejecución)

| Rol | Nombre | Qué ve / hace (resumen) | Módulos permitidos (según menú) |
| --- | --- | --- | --- |
| `C1` | Despachador | Despacho y handoff. | `dispatch` |
| `D` | Supervisor | Gestión de equipo/campo y NOTA de supervisor. | `supervisor`, `supervisor-nota` |
| `E` | Chofer | Módulo chofer (rutas / viajes). | `driver` |
| `G` | Portería | Control de acceso. | `security` |
| `N` | Personal de Campo | Ejecución en campo. | `field` |
| `PB` | Mecánico | Mecánica. | `mechanic` |
| `PD` | Mantenimiento | Mantenimiento (separado de PB). | `maintenance` |

Otros roles existen en tipos (`src/types/osi.types.ts`) pero aún no tienen módulos propios en el menú: `PA`, `PC`, `PF`, `PE`, `RB`.

## 2. Módulos (objetivo, pantallas, entradas/salidas, estados, APIs)

Esta lista está basada en `ModuleId` (ver `src/App.tsx`) y el menú de `src/components/layout/Sidebar.tsx`.

Convenciones actuales:
- Los módulos son componentes React (casi todos en `src/components/modules/`).
- Algunos módulos viven en `src/modules/` (sub-sistemas más grandes): Comercial calendar, QuoteBuilder, Crate*.
- Los “estados” suelen ser locales (store en `src/lib/*Store.ts`) y/o `localStorage`.
- Backend existente (Vercel Functions): `api/*` (ver sección 4).

### General

| Módulo | Id | Objetivo | APIs |
| --- | --- | --- | --- |
| Centro de Comando | `dashboard` | Panel general / torre de control. | (pendiente de integrar) |

### Administración

| Módulo | Id | Objetivo | APIs |
| --- | --- | --- | --- |
| Usuarios y Roles | `users` | Gestión/visualización de usuarios (A). I: Gestión de Personal (solo reactivación de suspendidos). | `GET /api/users`; reactivación con `USERS_REACTIVATE` |
| Configuración | `settings` | Configuración global. | (pendiente) |
| Registro de Flota | `fleet` | Gestión flota. | (pendiente) |

### Comercial (Ventas: V) – PDF: Pipeline, Cotizador Nesting, Agenda, Historial Cliente

| Módulo | Id | Objetivo | Entradas/Salidas | Estados | APIs |
| --- | --- | --- | --- | --- | --- |
| Clientes | `clients` | CRM básico de clientes. | Entrada: búsqueda/selección cliente. Salida: contexto hacia ventas/proyecto. | Stores: `src/lib/customersStore.ts`, `src/lib/customerHistoryStore.ts` (según versión actual). | `GET /api/clients` (cuando DB esté activa) |
| Cotizador Técnico | `sales-quote` | Cotización técnica: alcance -> cajas -> recursos -> resumen. | Entrada: contexto (evento `osi:salesquote:open`). Salida: cotización/alcance. | Store: `src/lib/salesStore.ts`, `src/lib/quoteAuditStore.ts` | (pendiente) |
| Cotizador con Nesting | `crate-wood` | Diseño de cajas y pies tablares (PDF: dueño del módulo). | Entrada: artículos. Salida: nesting, ingeniería, costos. | Store: `src/lib/crateDraftStore.ts`, `src/lib/crateSettingsStore.ts` | (pendiente) |
| Diseña y Cotiza | `disenacotiza` | Nesting + ingeniería + costos. | Entrada: items. Salida: cotización técnica. | (pendiente) | (pendiente) |
| Calendario Comercial | `commercial-calendar` | Propuestas/proyectos en calendario. | Entrada: bookings y límites. Salida: agenda/fechas. | Store: `src/lib/commercialCalendarStore.ts` | (pendiente) |
| Config Comercial | `commercial-config` | Config de cajas (desde CrateWood settings-only). | Entrada: settings. Salida: parámetros de cálculo. | Store: `src/lib/crateSettingsStore.ts` | (pendiente) |
| Proyectos | `projects` | Expedientes “sombrilla”. | Entrada: búsqueda proyecto. Salida: detalle/OSI. | Store: `src/lib/projectsStore.ts` | `GET /api/projects` (cuando DB esté activa) |

### Coordinación (K) – PDF: Gestor Proyectos, Editor Plantillas, Visor Nesting, Dashboard

Incluye: `k-dashboard`, `k-project`, `k-templates`, `nesting`/`nestingv2` (visor), `clients`, `projects`, `commercial-calendar`, `osi-editor`, `tracking`.

### Operaciones (B) – PDF: Muro, Gestor OSIs, Calendario, PTF/PET, Validación Documental

| Módulo | Id | Objetivo | APIs |
| --- | --- | --- | --- |
| Tablero Ops | `operations` | Gestión de operaciones y/o tablero principal de OSIs. | `GET /api/osis` (cuando DB esté activa) |
| Gestor de OSIs | `osi-editor` | Creación de órdenes externas e internas (B). | (pendiente) |
| Despacho | `dispatch` | Flujo despacho / handoff (C1). | (pendiente) |
| Rastreo | `tracking` | Rastreo OSI por código. | (pendiente) |
| Calendario Ops | `calendar` | Calendario dinámico (asignación flota/personal). | (pendiente) |
| Muro Liquidación | `wall` | Kanban/estado de OSIs (semáforo Rojo/Amarillo/Verde). | (pendiente) |
| Portería | `security` | Control de accesos (G). | (pendiente) |

### Campo y Taller

| Módulo | Id | Objetivo |
| --- | --- | --- |
| Personal Campo | `field` | Tareas/campo. |
| Supervisor | `supervisor` | Supervisión de equipos. |
| Sup. NOTA | `supervisor-nota` | Registro/validación NOTA de supervisor. |
| Mecánica | `mechanic` | Órdenes y mantenimiento mecánico. |
| Mantenimiento | `maintenance` | Mantenimiento general. |
| Taller Madera | `carpentry` | Taller/órdenes madera. |

### Logística

| Módulo | Id | Objetivo |
| --- | --- | --- |
| WMS Inventario | `wms` | Inventario WMS. |
| Stock General | `inventory` | Stock general. |
| Compras | `purchases` | Compras. |

### RRHH (I) – PDF: KPIs 360°, Ecológico, Nómina Variable, Gestión de Personal

| Módulo | Id | Objetivo |
| --- | --- | --- |
| Dashboard RRHH | `hr` | KPIs RRHH / analítica. |
| Ranking KPI | `kpi` | Ranking KPIs. |
| Nómina NOTA | `nota` | Nómina variable NOTA. |
| Eco Badges | `badges` | Módulo ecológico / badges. |
| Usuarios (I) | `users` | Gestión de Personal: solo reactivación de usuarios suspendidos. |

### Herramientas / módulos técnicos

| Módulo | Id | Objetivo | Notas (PDF ↔ roleModuleMap) |
| --- | --- | --- | --- |
| Editor OSI | `osi-editor` | Editor y acciones OSI (tooling). | Acceso: `A`, `V`, `K`, `B` (B = Gestor de OSIs). |
| Nesting | `nesting` | Algoritmos nesting v1. | V: dueño (vía crate-wood/disenacotiza). K: visor (solo lectura). |
| Nesting V2 | `nestingv2` | Algoritmos nesting v2. | K: visor. |
| Diseña y Cotiza | `disenacotiza` | Diseño/ingeniería + costos. | V (Cotizador con Nesting). |
| Crate Wood | `crate-wood` | Motor de cajones/huacales / Cotizador con Nesting. | V. Puede abrirse con evento `osi:cratewood:open`. |
| Crate Settings | `crate-settings` | Ajustes del motor crate. | V (commercial-config). |
| Gestor Proyectos Sombrilla | `k-project` | Expediente maestro del servicio vendido. | K. |

## 3. Estructura del proyecto (carpetas importantes)

Raíz:
- `api/`: backend en Vercel Functions (serverless).
- `prisma/`: schema/seed para base de datos.
- `src/`: frontend (Vite + React).
- `app/`: carpeta histórica/alternativa (se usó como fuente para sincronizar a `src/`).

Frontend (`src/`):
- `src/App.tsx`: registro de `ModuleId`, sesión/rol y enrutado interno por módulo.
- `src/components/layout/Sidebar.tsx`: menú por grupos y permisos por rol.
- `src/components/modules/`: módulos principales del ERP (UI).
- `src/modules/`: sub-sistemas (comercial/sales/crate) con más lógica.
- `src/lib/`: stores y lógica de negocio local (persistencia, cálculos, auditoría).
- `src/types/`: tipos TS del dominio.
- `src/data/`: seeds/mocks locales.
- `src/docs/`: documentación interna del proyecto.

## 4. Backend (APIs disponibles hoy)

Base URL (mismo dominio): `/api`

### Salud/Info
- `GET /api/health`
- `GET /api/info`

### Auth
- `POST /api/auth/login`
- `GET /api/auth/me`

### CRUD base (requiere `DATABASE_URL` en Vercel para funcionar sin 500)
- `GET/POST /api/users`
- `GET/POST /api/clients`
- `GET/POST /api/projects`
- `GET/POST /api/osis`

## 5. Cómo mantener este guion actualizado

Cuando cambies qué módulos ve cada rol:
- Actualiza `src/lib/roleModuleMap.ts` (`MODULES_BY_ROLE`). Es la fuente de verdad.
- Opcionalmente ajusta ítems y grupos en `src/components/layout/Sidebar.tsx` (etiquetas, descripciones, en qué grupo aparece cada módulo).

Cuando agregues o renombres módulos:
- Actualiza `ModuleId` en `src/lib/roleModuleMap.ts` y en `src/App.tsx`, y `renderModule()` en `src/App.tsx`.

