# MT-01C2B3C — Compuerta de activación comercial

## Estado

La compuerta queda preparada pero inactiva. Los valores predeterminados siguen siendo `LEGACY_ONLY` para lectura y escritura. Este cambio no ejecuta backfill, readiness, cron, migraciones ni comprobaciones automáticas de datos.

## Bloqueo anterior y alcance

`resolveCommercialTenancyModes` en `api/_lib/commercialTenancyWrite.js` rechazaba el par `TENANT_WRITE`/`TENANT_READ` en cualquier runtime de Vercel. En `LEGACY_ONLY`, las rutas mantienen sus consultas y respuestas heredadas: `Client` y `Project` se crean sin autoridad tenant, las lecturas no se filtran por tenant y no se agregan consultas empresariales.

Al habilitarse en una operación futura, el par afecta:

| Ruta | Método | Comportamiento tenant preparado |
| --- | --- | --- |
| `/api/clients` | GET | Lectura filtrada por tenant |
| `/api/clients` | POST | Escritura con tenant derivado del servidor |
| `/api/projects` | GET | Lectura filtrada por tenant |
| `/api/projects` | POST | Escritura con tenant derivado del servidor |
| `/api/k/dashboard` | GET | Lecturas tenantizadas |
| `/api/k/project` | GET | Detalle tenantizado sin inicialización persistente |
| `/api/k/project-validate` | POST | Transición optimista dentro del tenant |
| `/api/k/project-release` | POST | Transición optimista dentro del tenant |

`PipelineCase`, `Lead`, OSI y los hijos comerciales sin autoridad tenant continúan bloqueados para nuevos consumidores runtime.

## Contrato de activación

Production sólo admite el modo tenant cuando las cinco condiciones son exactas:

1. `COMMERCIAL_TENANCY_WRITE_MODE=TENANT_WRITE`.
2. `COMMERCIAL_TENANCY_READ_MODE=TENANT_READ`.
3. `COMMERCIAL_TENANCY_ACTIVATION_BATCH=MT-01C2B2-IPACKERS-DO-V1`.
4. `VERCEL_ENV=production`.
5. `VERCEL_GIT_COMMIT_REF=main`.

No se normaliza el identificador de lote. BOM, espacios, comillas, saltos o casing alternativo se rechazan con `503 COMMERCIAL_TENANCY_CONFIGURATION_INVALID`. El lote también se rechaza si los modos están ausentes o en `LEGACY_ONLY`, y el par tenant lo exige incluso en pruebas locales. Los modos parciales también se rechazan. Preview permanece bloqueado. Development local conserva el mecanismo de pruebas tenant usando el lote exacto.

La variable de lote no es secreta, pero es exclusivamente servidor: no se devuelve, no se registra y no se expone al frontend.

## Matriz resumida

| Configuración | Resultado |
| --- | --- |
| Variables ausentes | `LEGACY_ONLY` |
| Ambos modos `LEGACY_ONLY` | Permitida |
| Un modo tenant y otro legacy | 503 |
| Par tenant sin lote o con lote no exacto | 503 |
| Par tenant correcto en Preview | 503 |
| Par tenant correcto en Production fuera de `main` | 503 |
| Batch presente con modos ausentes o LEGACY | 503 |
| Par tenant + lote exacto en Production/`main` | Permitida |
| Par tenant + lote exacto en development local | Permitida sólo para pruebas |

## Autoridad de configuración

El único intérprete de los modos, lote y condiciones Vercel es `resolveCommercialTenancyModes`. Las rutas preparadas sólo consumen su resultado y lo invocan antes de autenticación, lectura de body o acceso Prisma. `api/info.js` lee `VERCEL_ENV` y `VERCEL_GIT_COMMIT_REF` únicamente como metadatos generales del deployment; `auth.js` y `authOrigin.js` usan `VERCEL_ENV` para la política independiente de autenticación. Ninguno interpreta modos comerciales ni el lote.

Las lecturas directas residuales de `COMMERCIAL_TENANCY_WRITE_MODE` y `COMMERCIAL_TENANCY_READ_MODE` fueron retiradas de Client, Project y K. La guardia CI impide reintroducirlas y verifica que las seis rutas preparadas validen configuración antes de cualquier autoridad o dato empresarial.

## Auditoría de dependencias

`npm audit` reportó 19 paquetes vulnerables ya presentes: 15 high, 2 moderate y 2 low; no se modificaron dependencias en este trabajo.

- Producción, directos: `dompurify` (moderate) y `prisma` (high; instalado también por el peer de `@prisma/client`).
- Producción, transitivos: `@prisma/config`, `defu`, `effect` y `lodash` (high).
- Desarrollo/build, directos: `postcss` y `vite` (high).
- Desarrollo/build, transitivos: `@babel/plugin-transform-modules-systemjs`, `brace-expansion`, `flatted`, `js-yaml`, `minimatch`, `nanoid`, `picomatch` y `rollup` (high); `ajv` (moderate); `@babel/core` y `esbuild` (low).

No existe una dependencia nueva ni un defecto específico de la compuerta. Antes del cutover debe existir una aceptación o remediación separada, especialmente para `dompurify`, que se usa para HTML de templates. Prisma/config y las dependencias de build requieren actualización ensayada separadamente; no deben mezclarse con este PR.

## Rollback operativo futuro

1. Restaurar el deployment LEGACY anterior o retirar las tres variables de modo/lote.
2. Confirmar que Production sirve `LEGACY_ONLY` para lectura y escritura.
3. Confirmar el funcionamiento heredado de `Client` y `Project`.
4. Sólo entonces evaluar el rollback C2B2 usando su manifiesto validado.
5. Nunca revertir datos mientras un deployment con `TENANT_READ`/`TENANT_WRITE` continúe activo.

Este procedimiento no se ejecutó como parte de MT-01C2B3C-Q2.

## Riesgos reservados

- La activación requiere que C2B2 haya terminado y haya sido verificado por separado.
- Preview necesita una autorización independiente futura.
- PipelineCase y Lead todavía no tienen endpoints tenantizados activos.
- Las excepciones heredadas de autenticación continúan congeladas en 24 archivos.
- La operación futura debe verificar variables, deployment, fingerprints y smoke tests antes de habilitar tráfico.
