# SEC-DEP-01 — Remediación focalizada de DOMPurify

## Alcance

DOMPurify se actualiza de 3.3.1 a 3.4.13 sin modificar otros paquetes. Los únicos renderizados de HTML editable permanecen en `TemplatesCenterModule` y `TemplateEditorModule`; ambos utilizan la configuración segura predeterminada. El uso de `dangerouslySetInnerHTML` en `ui/chart.tsx` genera únicamente CSS estructurado desde la configuración interna del gráfico.

La suite de navegador renderiza los componentes activos en Chromium, Firefox y WebKit. El reporter de CI exige exactamente 5 pruebas aprobadas y cero omitidas por motor. Junto con las 60 pruebas existentes, `browser-session-validation` exige 75/75.

## Riesgo residual aceptable sólo mediante decisión posterior

`npm audit --omit=dev` conserva cinco nodos de severidad alta. No se consideran remediados por este cambio:

- `lodash`, transitivo de `recharts`: está instalado en el grafo frontend, pero SEC-DEP-01-Q1 no identificó una entrada controlada por usuarios que alcance el comportamiento vulnerable. Debe reevaluarse si se agregan plantillas lodash, interpretación de paths controlados, merges de objetos no confiables o una nueva ruta de datos hacia Recharts.
- `prisma`, `@prisma/config`, `effect` y `defu`: aparecen bajo Prisma CLI/configuración. El runtime serverless importa `@prisma/client`, no la CLI ni su cargador de configuración. Deben reevaluarse si una función runtime empieza a importar `prisma`, `@prisma/config`, `c12`, `effect` o `defu`, o si configuración Prisma pasa a procesar entrada no confiable durante build/deploy.

Los demás hallazgos de la auditoría completa pertenecen a build, CI, pruebas o desarrollo. Ninguno de estos riesgos puede darse por aceptado implícitamente: la decisión de cutover debe registrar alcance, vigencia y condiciones de reevaluación.

## Controles

- Guardia de versión mínima y lockfile.
- Inventario cerrado de `dangerouslySetInnerHTML`.
- Prohibición de configuraciones permisivas de DOMPurify.
- Render real con fixtures mXSS, SVG/MathML, raw-text, eventos y URLs ejecutables.
- Bloqueo de navegación y solicitudes externas.
- Validación exacta de cantidad, motores y pruebas omitidas en CI.
