# V17 Services tenant-first 03A — resultado

## Resumen

Servicios queda implementado localmente como dominio tenant-first, sin seed empresarial ni consumidores productivos. El catálogo administrable, compatibilidades, combinaciones y selecciones versionadas usan referencias públicas opacas, autorización consolidada, idempotencia, concurrencia optimista y auditoría.

## Decisiones

- Migración: `20260904010000_v17_services_tenant_first` (migración 23, aditiva).
- Historia: revisiones append-only por caso; no se agregó un estado de borrador innecesario.
- Catálogo inicial: pendiente de mapping empresarial; cero inserts de seed en la migración.
- “Otro”: descripción obligatoria, `PENDING`, sin crear catálogo.
- Modo: sólo lectura desde ICP (`LOCAL`, `EXPORT`, `IMPORT`; LOCAL se presenta como LOCAL/NACIONAL).
- Permisos: cuatro grants explícitos; roles baseline no los conceden.
- Production: apagada y sin modo de activación admitido.

## Autoridades futuras preservadas

Survey consumirá la selección; Costing la referenciará como fuente SERVICE; Cotización conservará referencias y versión. Ninguno de esos dominios fue implementado ni modificado.

## Validación

- PostgreSQL 18 local aislado: `22→23`, segundo deploy sin pendientes, `23/23`, drift vacío.
- Rollback local: `23→22`, cero artefactos del lote; reaplicación posterior limpia.
- Migración 23 SHA-256: `3eaf8c7b3ff6b21b6223758ca292a9d8f4f898d6376eb1f027f563ac031c6e65` (LF, sin BOM).
- Dominio/HTTP: `8/8` + `18/18`; PostgreSQL real: `21/21`; guardia propia: `13/13` negativas.
- Browser: `12/12`, Chromium/Firefox/WebKit en desktop y móvil, sin retries.
- Auth 01B, ICP, TypeScript, build, ESLint focalizado y `git diff --check`: verdes.

No se consultó ni modificó Production, Neon, Vercel, variables o datos externos.

## Próximo lote

`Survey / Survey App`, sólo tras revisión y autorización independiente.
