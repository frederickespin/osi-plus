# CRM-01B3B3 — Autoridad criptográfica de ownerRef

`ownerRef` usa exclusivamente `CRM_PIPELINE_OWNER_REF_SECRET`. Esta autoridad es independiente de `JWT_SECRET`: no modifica la firma o validación de sesiones LEGACY y no tiene fallback hacia secretos de autenticación, V2, comerciales o locales.

La variable debe contener exactamente 64 caracteres ASCII base64url sin padding. La generación recomendada para cada ambiente autorizado es `crypto.randomBytes(48).toString("base64url")`. No se aceptan BOM, espacios, controles, saltos, comillas, `+`, `/` ni `=`.

| Lectura CRM | Mutación CRM | Secreto requerido |
|---|---|---|
| `DISABLED` | `DISABLED` | No |
| `READ_ONLY` | `DISABLED` | No |
| `PRODUCTION_READ` | `DISABLED` | No |
| `READ_ONLY` | `LOCAL_ONLY` | Sí |
| `PRODUCTION_READ` | `PRODUCTION_WRITE` | Sí |

La validación ocurre en el resolver canónico de modos antes de autenticación, lectura del body o Prisma. Si las mutaciones están activas y la autoridad falta o es inválida, el contrato es `503 CRM_PIPELINE_CONFIGURATION_INVALID`. Con CRM desactivado, la ausencia de la variable no altera los `409` de las ocho rutas.

La derivación conserva HKDF-SHA-256 con etiqueta `osi-plus/crm/pipeline-owner-ref/v1`; cada referencia usa AES-256-GCM, IV aleatorio de 12 bytes, tag de 16 bytes, TTL de 300 segundos y clock skew de 30 segundos. La clave derivada no se cachea globalmente.

## Rotación futura

Rotar `CRM_PIPELINE_OWNER_REF_SECRET` invalida las referencias emitidas durante los cinco minutos anteriores, pero no afecta sesiones LEGACY ni exige logout. Debe hacerse fuera de operaciones activas de asignación. El frontend debe cerrar o refrescar el catálogo y exigir una nueva selección explícita; no puede reintentar usando el nombre del vendedor como autoridad. No se conservan claves anteriores.
