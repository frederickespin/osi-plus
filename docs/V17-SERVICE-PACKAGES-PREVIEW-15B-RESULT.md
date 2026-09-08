# V17-SERVICE-PACKAGES-PREVIEW-15B — Resultado

## A. Resumen

Preview integrada de Configuración de Servicios 15A y correcciones UX Comercial. El flujo publicado queda `ICP → Survey → Servicios → Costos → Cotización`, sin Portal Cliente, Ingeniería/Carpintería ni activación productiva.

## B. Rama/base/HEAD

- Rama: `feature/v17-consolidated-preview`.
- Base aprobada: `a6a27e8bdebf140057727e399cf7aacfea1f1b56`.
- HEAD publicado: registrado en el informe de entrega de 15B.

## C. Preview DB

- Branch: `br-mute-credit-ahxnvfx0`.
- Base aislada: `v17_consolidated_preview_10b`.
- Fixtures: seis casos sintéticos, seis Client, tres identidades, tres paquetes y tres políticas.

## D. Migraciones

- Aplicación: `33 → 34`.
- Estado final: 34 aplicadas, 0 pendientes, 0 fallidas, 0 checksum mismatches.
- Drift: vacío.
- Migración 35: ausente.

## E. URL Preview

La URL inmutable se registra en el informe de entrega después del build remoto.

## F. Inbox

Conserva la cola compacta, supervisión master-detail y acciones hermanas accesibles. La tarjeta selecciona el resumen; la única acción `Ficha del caso` abre el workspace completo.

## G. Dir. origen

Publica exclusivamente la dirección compacta estructurada de `PipelineCaseRouteSnapshot`; no usa `originLocation` legacy.

## H. Dir. destino

Publica exclusivamente el snapshot estructurado vigente y representa de forma explícita la ausencia de destino.

## I. METRO/INTERIOR

Para LOCAL consume la clasificación del último Logistics Plan publicado. `INTERIOR` muestra icono, texto y rojo accesible; no existe geometría ni límite hard-coded en frontend. IMPORT/EXPORT permanecen neutrales.

## J. Ficha button

Se eliminó el CTA duplicado del resumen. La fila conserva una sola acción natural `Ficha del caso`.

## K. Edit policy

`Editar` general existe solamente en el resumen seleccionado del Inbox y sujeto a permisos. No aparece dentro de Resumen, Survey, Servicios, Costos o Cotización.

## L. Survey tab

La etiqueta principal es `Survey`. La Ficha publica exactamente: Resumen, Survey, Servicios, Costos y Cotización.

## M. Survey methods

Labels consolidados: Visita presencial, Visita virtual, Listado + fotografías, Reporte escrito, Voxme, Mini-visita y No requiere Survey.

## N. Presencial

Permanece conectado a Scheduling, evaluador, agenda, zona, buffers, Visit Fee y comunicaciones.

## O. Virtual

Permite cita, preparación y evaluador sin traslado físico ni Visit Fee de viaje inferido.

## P. Listado/fotos

Se representa como información aportada por el cliente y procesada dentro de la misma autoridad Survey; no crea un Survey paralelo.

## Q. Mini-visita

El fixture E contiene cinco tipos y once unidades. El dominio acepta hasta diez tipos distintos, rechaza el tipo once y permite editar líneas existentes.

## R. Peso/volumen

Cada línea conserva versión de catálogo, métricas unitarias, cantidad y fuente; totales publicados como `Estimado / Aproximado` con fuente `MINI_SURVEY`.

## S. Upgrade Survey

La captura Mini queda como información inicial del mismo caso y puede ser sucedida por Presencial, Virtual o Listado + fotografías sin duplicar Client o PipelineCase.

## T. Comunicaciones

Existe una sola superficie completa en Resumen. Survey y Cotización sólo ofrecen accesos contextuales a esa autoridad.

## U. Servicios

La configuración por caso muestra modo, principal, complementarios, paquete, personal, materiales, equipos, duración, precedencia y política.

## V. Packages

Fixtures publicados: Local estándar, Exportación con Crating y Local Premium; código, nombre y versión se muestran en formato compacto.

## W. Material policies

LOCAL demuestra consumible nuevo, contenedor reutilizable, `SALE`, `RENTAL/USAGE`, `RETURNABLE` y mantenimiento/reposición. EXPORT demuestra mezcla sintética configurada 70/30, no global.

## X. Client override

El escenario D publica `100% material nuevo` como override del snapshot del caso; el paquete maestro permanece inmutable.

## Y. Crating requirement

El escenario EXPORT muestra `Crating requerido` como requirement. Ingeniería/Carpintería continúa fuera de este lote.

## Z. Costing

Consume el Logistics Plan y la configuración publicada; los escenarios configurables avanzan y el proveedor sin precio conserva blocker explícito.

## AA. Quote

Se conservan tres propuestas sintéticas y una aceptación en el escenario D. No se duplicó el panel de Comunicaciones.

## AB. Hub/OSi-Mobile

Hub mantiene Comercial CRM y Administración como autoridades separadas. La App Evaluador continúa accesible desde OSi-Mobile y desde el caso autorizado.

## AC. Browser

- Preview integrada: 30/30, seis proyectos, cero retries.
- Servicios: 18/18, seis proyectos, cero retries.
- Regresión Comercial focal corregida y verde.

## AD. Mobile

Chromium, Firefox y WebKit móvil conservaron lista, Ficha, tabs, dirección estructurada, alerta INTERIOR y navegación ERP sin overflow funcional.

## AE. Guards

Guard 15B: 13 negativas. Consolidated Preview: 14 negativas. 12C: 12 negativas. Servicios 15A: 17 negativas. Cubren Survey, Mini >10, fuente, Communications única, Ruta legacy, CTAs duplicados, Edit interno, clasificación hard-coded, migración 35 y activación Production.

## AF. Comparación histórica

### CONSERVADO

- `SalesQuoteWorkspace`: secuencia Survey/Costing/Cotización y contexto comercial.
- Scheduling/Visit: agenda, evaluador, métodos y Visit Fee.
- NewCase/Inbox: densidad, selección y acceso a Ficha.
- Precarga Mini: inventario por tipo y cantidad.
- Templates/communications: plantillas y comunicación contextual.

### MEJORADO

- Autoridades tenant-first, DTO cerrados, snapshots publicados, fuente de métricas y lazy authorization.
- Mini limitada por tipos, no unidades; direcciones estructuradas; una sola autoridad de Comunicaciones.
- Paquetes y políticas versionados reemplazan porcentajes o recursos implícitos.

### FALTANTE

- Upgrade transaccional Mini → Survey formal asistido.
- Ingeniería/Carpintería para Crating, Portal Cliente y transportes externos.
- Planeación operacional detallada posterior a Comercial.

### DEGRADADO

- Ninguna capacidad aprobada fue degradada. Los textos legacy de ruta se omiten deliberadamente cuando no existe snapshot estructurado.

## AG. Production verification

No se consultó ni modificó Production, variables, deployments o aliases. `productionApiEnabled=false`.

## AH. Riesgos

- Casos sin Logistics Plan publicado no pueden recibir una clasificación METRO/INTERIOR autoritativa y se muestran neutrales.
- Mini-visita sigue siendo aproximada; no sustituye una publicación formal cuando la política la exige.
- El override del cliente requiere futura experiencia administrativa para comparación y aprobación avanzada.

## AI. Worktree

Se entregará limpio después de commits y push normal.

## AJ. Push/PR

Se actualizará la rama consolidada existente mediante push normal. No se crea migración 35 ni se fusiona a Production.

## AK. Recomendación visual

Revisar especialmente en la URL inmutable: alerta INTERIOR del escenario B, método Mini del escenario E, pestaña Servicios del escenario C y override 100% nuevo del escenario D. Detener el siguiente módulo hasta aprobación visual.
