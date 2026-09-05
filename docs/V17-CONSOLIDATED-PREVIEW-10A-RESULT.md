# V17-CONSOLIDATED-PREVIEW-10A — Resultado

## Resultado ejecutivo

La integración local presenta una sola experiencia navegable: Hub → ERP azul → Inbox → ICP → Ficha → Servicios → Survey → Motor → Costing → Cotización. Los módulos operativos de recursos permanecen accesibles bajo `Recursos`. No se implementó Operaciones.

## Cambios realizados

- Rama aislada `feature/v17-consolidated-preview` desde `b7e0714cd6239581f2686835a59d716c3821402e`.
- Autoridad exacta de rama Preview compartida por los nueve dominios.
- Ficha reducida de once tabs históricos a los seis tabs canónicos.
- Resumen compacto con detalle ICP v2, selección de Servicios y estados publicados downstream.
- Indicador compacto y accionable del progreso real.
- Survey integrado como panel de estado y enlace a Survey App, sin selector de materiales.
- Recursos agregados al sidebar del ERP sin duplicar WMS ni convertirlos en tabs.
- ICP confirmado abre inmediatamente la Ficha, sin mostrar UUID.
- Cotización aceptada distingue la propuesta operativa, deja las otras como históricas y muestra readiness no accionable.
- Guard de integración con 12 negativas y E2E consolidado con escenario aceptado y deny pre-lazy.

## Estados de interfaz

Loading usa mensajes de dominio dentro de contenedores compactos; empty states explican el prerrequisito empresarial; retry conserva el contexto. El resumen no muestra códigos de error como encabezado principal. Los blockers permanecen en sus dominios de origen y Costing/Quote dirigen al prerequisito publicado correspondiente.

Las etiquetas de presentación son `LOCAL / NACIONAL`, `Exportación`, `Importación`, `Confirmado`, `Aproximado` y `Pendiente`; los códigos internos no cambian.

## Datos y escenarios

El arnés browser usa datos sintéticos en memoria y no escribe en una base persistente. Modela cuatro estados contractuales: mudanza local, exportación con Survey/receta/Crating, pendiente de proveedor y tres propuestas con una aceptada. La prueba integrada visible utiliza el cuarto escenario y verifica las seis superficies; las suites heredadas conservan las mutaciones completas de cada dominio.

No se publicó un Preview remoto porque no se encontró ni se autorizó una base Preview aislada compatible con las 29 migraciones. Reutilizar una base 19/19 habría violado el contrato. Las instrucciones exactas están en el contrato 10A.

## Validación

- Preflight: HEAD exacto, worktree inicial limpio y migraciones 1–29.
- Guardias heredadas de Auth, ICP, Servicios, Survey, Materiales, Activos, Motor, Costing y Quote ejecutadas.
- Guardia 10A: orden, gates, lazy, tenancy, no Production, Survey/materiales, Quote/Costing, Costing/Motor, ICP/volumen y 29 migraciones.
- Prisma schema válido con exactamente 29 migraciones; no existe migración 30.
- TypeScript, ESLint focalizado, `git diff --check` y build de producción local verdes.
- Browser integrado: 12/12 en Chromium, Firefox y WebKit, desktop y móvil, cero retries y cero omitidas.
- Deny: cero chunks de ERP/Ficha/Survey/Quote y cero requests de dominios protegidos.

Las capturas locales verificadas se conservan en `.artifacts/v17-consolidated-preview-10a/`: Resumen y Cotización, desktop y móvil.

Los resultados exactos de la última ejecución se registran en el informe de entrega; no se declara PostgreSQL remoto ni URL Preview porque no se accedió a infraestructura externa.

## Comparación con V17 histórica

### CONSERVADO

Shell azul, Hub, densidad empresarial, Inbox master-detail, Ficha enfocada, Survey mobile-first y navegación responsive.

### MEJORADO

Una sola cadena navegable, autoridad tenant-first, referencias públicas, permisos efectivos antes del lazy load, progreso real, separación costo/sugerido/cotizado y empty states con prerrequisitos.

### SUSTITUIDO

Stores/mocks/storage empresarial, ICP permanente como tab, módulos comerciales paralelos, WMS duplicado y navegación a pantallas vacías.

### AÚN PENDIENTE

Contratos publicados de Empresa/Lead Account/Booker, regreso contextual desde Survey con selección exacta del caso, base Preview 29/29 autorizada y handoff a Operaciones/OSI.

## Riesgos y siguiente lote

- La agenda Survey actual es del actor y el panel filtra el caso en cliente; el backend sigue siendo autoridad de alcance. Un endpoint de estado case-scoped sería más eficiente, pero no se inventó en 10A.
- El resumen dispara GET lazy de dominios autorizados al abrir `Resumen`; conserva seguridad pero debe observarse su coste con datos remotos reales.
- La base Preview debe ensayarse desde vacío a 29/29 antes de publicar.
- Operaciones sólo debe iniciarse después de aprobación visual/funcional de esta integración y de un contrato explícito de handoff; 10A no crea OSI ni persiste readiness adicional.
