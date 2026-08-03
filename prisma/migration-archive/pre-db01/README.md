# Archivo histórico anterior a DB-01K

Este directorio conserva las migraciones que estaban activas antes de consolidar la cadena canónica DB-01K. Prisma no debe ejecutarlas.

`MANIFEST.json` registra nombre, tamaño, SHA-256, codificación, bytes nulos y procedencia Git. La migración histórica `20260219_ops_pst_flow` se preserva byte por byte en UTF-16LE con BOM; no fue recodificada ni corregida.

Las tres migraciones observadas únicamente como metadatos históricos se documentan en el manifiesto sin inventar SQL:

- `20260121211455_init`
- `20260123004649_add_crate_plan`
- `20260123005908_update_crate_plan_schema`

No modificar, renombrar ni reintroducir estos archivos en `prisma/migrations` sin una revisión formal de historia y checksums.
