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

No se normaliza el identificador de lote. BOM, espacios, comillas, saltos o casing alternativo se rechazan con `503 COMMERCIAL_TENANCY_CONFIGURATION_INVALID`. Los modos parciales también se rechazan. Preview permanece bloqueado. Development local conserva el mecanismo de pruebas tenant existente.

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
| Par tenant + lote exacto en Production/`main` | Permitida |
| Par tenant en development local | Permitida sólo para pruebas |

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
