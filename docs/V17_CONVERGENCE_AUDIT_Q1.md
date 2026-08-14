# V17-CONVERGENCE-01-Q1 — auditoría de la convergencia moderna

## Alcance y autoridades

La rama conserva como autoridades canónicas el login LEGACY, `User`, `TenantMembership`, `roleModuleMap`, Prisma, las 16 migraciones y el dominio CRM de `main`. El snapshot moderno sólo aporta presentación y vocabulario. El Evaluador continúa sin backend y CRM continúa desactivado.

No se portaron stores, colas offline, mocks, Service Worker, PWA ni headers `x-osi-*`. No se modificaron Prisma, migraciones, endpoints, dominio CRM, dependencias ni estilos globales.

## Hallazgos adversariales corregidos

1. Un ambiente desconocido se etiquetaba como Producción. Ahora queda como `Ambiente desconocido`; loopback, Preview y Production se reconocen de forma explícita.
2. El proxy local de Vite podía caer en el dominio productivo. El fallback ahora es exclusivamente `http://127.0.0.1:3000`.
3. Pipeline desaparecía del menú cuando CRM estaba apagado y el deep link mostraba Torre de Control. Ahora permanece visible con un estado inactivo explícito, sin datos, solicitudes ni carga del chunk relacional.
4. Una ruta profunda desconocida o no autorizada podía conservarse en la barra del navegador. Ahora vuelve a `/`; no se aceptan URLs externas, protocol-relative, traversal ni rutas desconocidas.
5. Los grupos del Sidebar dependían del hover y contenían botones anidados en modo colapsado. Ahora tienen controles semánticos, foco visible, expansión por teclado y navegación móvil etiquetada.
6. El selector heredado de credenciales de demostración estaba disponible en cualquier ambiente no productivo y sus literales podían entrar al bundle Preview. Ahora sólo existe bajo `import.meta.env.DEV`; se verifica su ausencia del build.

## Matriz efectiva de acceso

| Rol | Pipeline | Evaluador | Administración | Materiales |
| --- | --- | --- | --- | --- |
| A | Sí | Sí | Sí | Sí |
| V | Sí | Sí | No | No |
| K | No | Sí | No | No |
| D | No | Sí | No | No |
| C | No | No | No | Sí |
| I | No | No | Usuarios con alcance heredado | No |
| B/C1/E/G/N/PA/PB/PC/PD/PE/PF/RB | Según su catálogo canónico; sin acceso nuevo | No | No | Sólo los módulos ya asignados en `roleModuleMap` |

La query, el path, `localStorage`, el body y los headers del navegador no amplían esta matriz. Un rol no autorizado que llega a `/sales/pipeline` o `/evaluator` es normalizado a `/`.

## Evaluador y Pipeline

- Evaluador muestra `Backend del Evaluador no disponible` y diferencia 401, 403, 404, 409 y 503 en su contrato sanitizado.
- No consulta endpoints, no guarda drafts, no envía fotografías o respuestas y no simula submissions exitosas.
- Su dominio puro no importa Prisma, sesión, storage, transporte ni mocks.
- El adaptador Pipeline sólo consume `CrmPipelineCase`; no inventa owner, versión, estado o identidad.
- `APPROVED` permanece congelado y `OPS_HANDOFF` terminal.
- Con CRM apagado hay cero solicitudes y el chunk `RelationalPipelineModule` no se descarga.

## Comparación visual

Las capturas desktop y móvil se generaron con APIs locales interceptadas y datos de identidad exclusivamente sintéticos; no se contactó ningún servicio externo. Los artefactos permanecen fuera del repositorio en `.artifacts/v17-convergence-q1`.

| Vista | Resultado | Decisión |
| --- | --- | --- |
| Login | Equivalente | Conserva el contrato y layout canónicos; las credenciales demo quedan sólo en desarrollo local. |
| Shell y Sidebar | Adaptado deliberadamente | Conserva la jerarquía visual moderna con autoridad de `roleModuleMap`, navegación por teclado y drawer móvil. |
| Inbox Comercial / Pipeline | Adaptado deliberadamente | Presentación moderna, pero estado inactivo explícito y sin datos hasta activar el cliente CRM en una fase autorizada. |
| Evaluador | Adaptado deliberadamente | Presentación moderna y dominio puro; backend, catálogo, drafts y submissions siguen pendientes. |
| Administración | Equivalente | Se conservan los módulos canónicos; no se portaron stores ni permisos del snapshot. |
| Materiales | Equivalente | Se conservan WMS, inventario, compras y carpintería actuales según rol. |

En desktop no se observaron desbordamientos del shell. En móvil el contenido usa el drawer y navegación inferior del Evaluador; los controles mantienen foco visible y etiquetas accesibles.

## Bundles locales de producción

| Artefacto | Tamaño raw | Gzip |
| --- | ---: | ---: |
| Entrada `index` | 47,920 B | 13.96 kB |
| Pipeline inactivo | 2,926 B | 1.00 kB |
| Evaluador | 4,441 B | 1.50 kB |
| Pipeline relacional lazy | 42,904 B | 10.59 kB |
| Vendor | 800,930 B | 246.86 kB |

No se agregaron dependencias ni duplicados. DOMPurify resuelve 3.4.13; 3.3.1, PWA y Service Worker están ausentes.

## Validación local

- 16 migraciones desde PostgreSQL 18 vacío; segundo deploy sin pendientes; status y drift vacíos.
- Suite canónica: 299 validaciones, 0 fallos.
- Guardias V17: 37/37.
- Navegadores existentes: 75/75 (Chromium, Firefox y WebKit).
- Navegadores V17: 30/30 (desktop y móvil en los tres motores).
- Build, TypeScript focalizado y ESLint focalizado aprobados.
- Escaneo de secretos y `git diff --check` aprobados.

El Evaluador sigue sin backend. CRM, HYBRID, tenant switch y cliente V2 permanecen desactivados. No hubo acceso a Production o Neon y el PR #40 no fue modificado.
