# CRM-01C1A — Preview integrado aislado

Esta fase habilita una compuerta exclusiva de ensayo. Su estado predeterminado
continúa siendo `DISABLED`; no modifica Production, aliases, migraciones ni
datos reales.

## Autoridad del ensayo

Los modos `PREVIEW_READ`, `PREVIEW_WRITE` y `PREVIEW_REHEARSAL` sólo son
válidos cuando coinciden simultáneamente el ambiente Preview, la rama Git
`feature/crm01c1a-integrated-preview-rehearsal`, el SHA configurado, el batch
`CRM-01C1A-PREVIEW-20260813-V1`, la base `crm01c1a_rehearsal`, la rama Neon
aislada autorizada, el puente comercial tenantizado y autenticación LEGACY.

Antes de autenticación o acceso empresarial, el backend valida la URL de base
y consulta `current_database()`, `current_schema()` y `neon.branch_id`. Una
diferencia produce un 503 sanitizado sin fallback.

El CORS CRM del ensayo acepta solamente el origen directo derivado de
`VERCEL_URL`, sin wildcard ni credenciales. El cliente no recibe batches,
identidad Neon ni secretos.

## Separación

- No existe migración 17.
- LeadLite y sus claves locales no se leen ni escriben desde CRM relacional.
- La suite y las guardias se ejecutan con el cliente desactivado.
- Production y Development rechazan los modos Preview.
- Las credenciales y URLs del ensayo se conservan sólo en el archivo local
  ignorado `.env.crm01c1a-preview.local`.

La base y el Preview se conservarán como máximo 24 horas después de completar
el ensayo y requerirán autorización separada para su limpieza.
