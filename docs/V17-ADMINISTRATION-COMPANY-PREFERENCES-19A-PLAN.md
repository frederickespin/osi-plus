# Administración — Empresa y preferencias: plan 19A

Fecha: 29 de octubre de 2026 (República Dominicana).

**Estado: diseño preparado; no implementado ni activado.** Se incorpora al PR 83 como contrato del siguiente incremento. La UI actual conserva las seis secciones de 18A. Este documento no agrega rutas, permisos, tablas, migraciones, variables de entorno ni formularios operativos.

## 1. Alcance y decisiones

Propuesta: agregar **Empresa y preferencias** en `/administration/settings`, con dos áreas independientes según permisos: Empresa y Mis preferencias. Empresa pertenece al `Tenant` activo; las preferencias pertenecen a la cuenta `User` y se conservan al entrar en sus otras empresas.

La primera entrega permanece **en español**, con configuración regional `es-DO` y formato personal de fecha editable. Idioma de interfaz, configuración regional y formato de fecha son distintos. No ofrecer un selector de idioma sin traducción completa del área, ni un selector regional sin consumidores reales. No se inicia un proyecto de traducción global.

El `SettingsModule` histórico conserva datos demostrativos en React y Guardar sólo muestra una notificación. No se habilita como persistente. Notificaciones, seguridad, apariencia, moneda principal, roles universales y Almacenes quedan fuera de 19A.

## 2. Campos y propietarios

Reutilizar `Tenant` / `osi.tenants`; no duplicar la empresa en otro modelo.

| Campo de Empresa | Almacenamiento y validación propuestos |
| --- | --- |
| `name` | Existente; obligatorio, recortado, 1–160 caracteres. |
| `legalName` | Existente; opcional, hasta 200 caracteres. |
| `contactEmail` | Nueva columna `contact_email`; opcional, formato de correo y máximo 320 caracteres. No modifica el correo de una cuenta. |
| `contactPhone` | Nueva columna `contact_phone`; texto opcional, máximo 40 caracteres, conservando prefijo internacional. |
| `contactAddress` | Nueva columna `contact_address`; texto opcional, máximo 500 caracteres. |
| `timezone` | Existente; identificador IANA válido admitido por el runtime, máximo 64 caracteres, sin etiquetas `GMT-4`. |
| `version` | Nueva columna `settings_version`, entero positivo, inicial 1; independiente de autorización. |
| `updatedAt` | Existente; fecha del servidor, DTO ISO 8601; no editable. |

Los contactos nuevos comienzan en `null`, sin copiar ejemplos. Campo omitido conserva su valor; `null` borra sólo campos opcionales. Normalizar blancos opcionales a `null`, rechazar caracteres de control y mostrar texto sin interpretar HTML. `code`, país, moneda, estado y provisión no son editables aquí. La zona de empresa se usa para presentar instantes administrativos; no reescribe zonas de políticas versionadas, citas o publicaciones.

Crear `UserPreferences` / `osi.user_preferences`: `user_id` como clave primaria y foránea a `osi.osi_users.id`, `date_format` cerrado a `DD/MM/YYYY`, `MM/DD/YYYY` o `YYYY-MM-DD`, `version` positiva y `updated_at` del servidor. Primera escritura: versión 1. Sin fila: devolver `DD/MM/YYYY`, versión 0 y `updatedAt: null`, sin insertar durante GET/HEAD.

`language: "es"` y `locale: "es-DO"` son valores efectivos de sólo lectura, sin columnas ni edición en 19A. No reutilizar `employeeProfile`, configuraciones comerciales o de compensación, ni `TenantMembership.authorizationVersion`. Nombre, razón social y zona ya pueden persistirse en columnas existentes; contacto, versión y preferencias requieren una migración aditiva para completar este alcance.

## 3. Endpoints y permisos propuestos

| Recurso | Métodos | Permisos efectivos y autoridad |
| --- | --- | --- |
| `/api/admin/company` | GET, HEAD | `administration:company:view`; empresa activa de la sesión. |
| `/api/admin/company` | PATCH | Lectura anterior + `administration:company:manage` y rol de membresía A. |
| `/api/me/preferences` | GET, HEAD | `preferences:own:view`; sólo cuenta autenticada. |
| `/api/me/preferences` | PATCH | Lectura anterior + `preferences:own:manage`; no exige rol A. |

Revalidar usuario, membresía y empresa activos. Denegar prevalece; gestión sin lectura no habilita edición. El permiso de membresías no sustituye estos permisos. El rol A se construye desde `Object.values(PERMS)` excluyendo conjuntos explícitos: los cuatro permisos nuevos deben quedar en un conjunto explícito excluido de la concesión automática. No concederlos a cuentas al incorporar este plan o código desactivado.

Archivos propuestos: `api/admin/company/index.js` y `api/me/preferences/index.js`, con factoría HTTP propia e inscripción exacta `TENANT` en `scripts/validate-mt01b3a-auth-guard.mjs`. La ruta de interfaz se habilita si la compuerta y algún permiso de lectura correspondiente lo permiten; cada área se monta y consulta de manera independiente.

Contrato HTTP: cabeceras privadas y `no-store`, CORS cerrado, métodos exactos y HEAD sin cuerpo. Si llega Origin debe coincidir exactamente con el origen de la petición; ausencia de Origin no sustituye Bearer ni autorización. Resolver contexto canónico con `resolveCrmPipelineContext`; rechazar Authorization malformado o duplicado. La compuerta precede a autenticación, lectura del cuerpo y Prisma.

PATCH exige `requestId` UUID, `expectedVersion` y algún campo editable; JSON máximo 16 KiB, lista cerrada de campos y sin query no definida. Rechazar `tenantId`, `userId`, `membershipId`, roles o versiones de autorización como autoridad aportada por el cliente. Usar 400 para entrada inválida, 401 para autenticación, 403 para autoridad, 409 para conflicto de versión y errores de disponibilidad sin SQL ni trazas internas.

GET/PATCH devuelven el DTO y versión vigente, sin identificadores internos. Preferencias añade `displayContext` de sólo lectura con idioma, locale y zona de la empresa activa; así un lector de preferencias no necesita acceso a los contactos de Empresa para presentar fechas.

## 4. Compuerta propia, cerrada por defecto

Propuesta: `ADMIN_SETTINGS_API_MODE` y disponibilidad cliente `VITE_ADMIN_SETTINGS_MODE`, sin configurar todavía. Modos: `DISABLED` predeterminado; `LOCAL_ONLY` con loopback real y sin marcadores Vercel; `PREVIEW_REHEARSAL` sólo después de conciliar el esquema. Producción permanece cerrada. Valores inválidos fallan antes de consultar datos.

Preview exige `VERCEL=1`, `VERCEL_ENV=preview`, batch fijo propuesto `V17-ADMINISTRATION-SETTINGS-19A-PREVIEW` y rama exacta autorizada: futura `feature/v17-administration-company-preferences-19a` o, al integrar, `feature/v17-consolidated-preview`. No habilitar la rama 18A por publicar este documento. Mantener modo de autenticación LEGACY, cambio de empresa deshabilitado y cliente de transición MT01B2 deshabilitado, conforme al Preview consolidado actual.

Después de resolver contexto, exigir empresa activa `V17-CONSOLIDATED-PREVIEW-10B`. El batch de la funcionalidad no se presume igual al batch de provisión. Antes de activar, verificar base `v17_consolidated_preview_10b`, rama Neon `br-mute-credit-ahxnvfx0`, esquema `osi`, despliegue exacto e historial conciliado; no inferir destino por el nombre de proyecto Vercel.

No reutilizar `ADMIN_TENANT_MEMBERSHIP_MODE`: sólo admite DISABLED, LOCAL_ONLY y PRODUCTION_PILOT. Ni otra funcionalidad habilitada ni la bandera cliente autorizan esta API. La futura concesión de permisos será específica y revisada; este plan no modifica permisos ni secretos.

## 5. Transacciones, versiones y auditoría

Empresa: validar entrada y permisos preliminares; abrir transacción; bloquear Tenant con `FOR UPDATE` **antes** de `revalidateAdminActor`, que adquiere bloqueos compartidos; revalidar estado, rol A, permisos y denegaciones; comparar `settings_version`; actualizar únicamente campos permitidos e incrementar versión; auditar en la misma transacción. Una versión obsoleta devuelve 409 sin cambios. Un error de auditoría revierte también la escritura.

Preferencias: revalidar identidad, membresía y empresa activas sin imponer rol A; `revalidateAdminActor` no sirve para este recurso por esa restricción. Mantener orden de bloqueos compatible; bloquear la fila de preferencias y comparar su versión. Primera creación con `expectedVersion: 0`: inserción con conflicto controlado y relectura bloqueada; dos peticiones no pueden sobrescribirse ni crear dos filas. La segunda recibe 409. Probar también escrituras desde empresas distintas de la misma cuenta.

Sin diferencias de valores, devolver DTO actual y `changed: false`, sin incrementar versión ni inventar un evento. No modificar `authorizationVersion`, contraseñas ni sesiones por estos ajustes.

Reutilizar `appendCommercialAudit` en la misma transacción: acciones propuestas `ADMIN_COMPANY_SETTINGS_UPDATED` y `USER_PREFERENCES_UPDATED`, actor canónico, campos cambiados, valores permitidos, versiones anterior/posterior y requestId. Lista de campos explícita y saneamiento existente; no registrar cuerpo HTTP completo. En preferencias, la empresa del evento es el contexto de la operación; la preferencia sigue perteneciendo a la cuenta.

**No prometer replay idempotente del PATCH.** Deduplicar un evento no reproduce el resultado de una orden completa. Una respuesta perdida exige GET de confirmación; el cliente no reenvía automáticamente. Reutilizar requestId con otro contenido debe producir conflicto y rollback, no una segunda escritura. Un replay completo requeriría un contrato y registro de orden adicionales.

## 6. Efecto real de preferencias e interfaz

Un proveedor pequeño de presentación consulta preferencias sólo con compuerta y lectura autorizadas, descarta respuestas obsoletas al cambiar de cuenta/contexto y ofrece recarga ante error. Sin permiso usa valores predeterminados y no consulta la API; no presenta una carga fallida como preferencias personales recuperadas.

El formato debe aplicarse a fechas visibles de: membresías (`AdminTenantMembershipModule`), historial de servicios (`ServiceCatalogAdmin`), vigencia de tasas (`CostingRulesAdmin`), vencimiento de perfil y comienzo solicitado de excepciones (`PersonnelPoliciesAdmin`), además de última actualización y ejemplo en la nueva sección.

Distinguir fecha de calendario `YYYY-MM-DD` —conserva exactamente su día— de instante ISO —se presenta en zona de empresa—. Orden de fecha según preferencia, locale es-DO y hora de 24 horas cuando corresponda. Fecha inválida muestra un estado claro. No cambiar almacenamiento, payloads, ordenación ni valores tipados de controles; no desplazar un día de calendario por convertirlo a UTC. Políticas con zona propia conservan su autoridad.

Tras guardar, actualizar el proveedor desde la respuesta confirmada y recuperar el valor al recargar o entrar desde otro navegador. Nombre y zona de empresa se revalidan mediante mecanismos existentes de contexto, sin modificar tokens. UI compacta, acciones con iconos accesibles, ayuda `?`, errores junto al campo y estado de guardado. Empresa y preferencias se cargan independientemente; con la compuerta cerrada permanecen las seis secciones actuales.

## 7. Bloqueo de fuente SQL y migración futura

El repositorio tiene **35 migraciones canónicas**, hasta `20260916010000_v17_client_temporary_portal`; referencia Git `9fb3a1a73a76b2c96598ba74a8d438c3f4dec29e`. El historial Neon aportado por el usuario el 29 de octubre de 2026 declara esta extensión:

```text
migration_name: 20260917010000_v17_engineering_crating
checksum: b437aae3600a23c655d97e674c3bfaa9a1721e0d54a26dcccc1181d90fdf2d0f
fuente: historial Neon proporcionado por el usuario; no archivo SQL
SQL recuperado y revisado: no
```

Ese checksum es el esperado según el historial, no una verificación de fuente disponible. La búsqueda de esta sesión no recuperó el SQL localmente; la referencia indicada con prefijo `e74d45d1` no estuvo disponible, la consulta remota del archivo devolvió 404 y la búsqueda de ramas por `engineering` no encontró una fuente recuperable. Esto no demuestra que el SQL nunca existiera. El restablecimiento de acceso verificado previamente no recuperó ni revisó esta extensión.

Requisitos antes de implementar o activar persistencia:

1. Recuperar el `migration.sql` exacto, documentar procedencia y comprobar SHA-256 sin reconstruir ni editar SQL para forzar coincidencia.
2. Revisar DDL, modelos, relaciones y posibles conflictos; conciliar Prisma y las 36 entradas observadas por nombre, checksum y estado aplicado. Resolver cualquier discrepancia de linaje explícitamente.
3. Actualizar inventarios y perfiles dependientes sólo con fuentes revisadas: `canonical-migrations.mjs`, guards de Preview y verificación de base. Mantener intactos los archivos SQL históricos.
4. Preparar **después** una migración aditiva nueva: contactos nulos y versión inicial de Tenant, tabla vacía de preferencias, restricciones y claves foráneas. Fijar nombre y posición sobre la cadena conciliada; no reservar posición por conteo.
5. Probar base limpia con cadena completa y actualización desde el checkpoint anterior a 19A, conservando empresas, cuentas, membresías, sesiones y objetos de Engineering Crating.

No ampliar manifiestos por aceptar 36/37 como conteo, modificar checksums, usar `db push` ni marcar migraciones resueltas para superar el bloqueo. No sembrar datos demostrativos, permisos o identidades. La UI 18A puede integrarse por separado; persistencia 19A espera la fuente de la extensión.

## 8. Verificación y cierre previstos

| Nivel | Evidencia requerida |
| --- | --- |
| Migración | Cadena exacta conciliada; SQL nuevo revisado; base limpia y actualización desde checkpoint; datos y autoridad conservados. |
| API y permisos | Gate cerrado antes de leer datos; Preview incorrecto y producción rechazados; origen/métodos/body/Authorization inválidos; denegación prevalece; A sin concesión no escribe; gestión sin lectura no basta; ninguna identidad objetivo inyectable. |
| Transacción | Dos editores, dos primeras creaciones, misma cuenta en dos empresas, 409 sin pérdida, evento atómico y rollback; requestId reutilizado y respuesta perdida sin escritura duplicada. |
| Presentación | Tres formatos, año bisiesto, medianoche, cambio de zona, calendario sin desplazamiento, entrada inválida; efecto visible y persistencia tras recarga/otra sesión. |
| UI y regresión | Áreas independientes por permiso, enlaces directos, teclado, móvil, ayuda y errores; seis secciones, Hub y contratos actuales conservados. |
| Preview real | Tras activar destino exacto: lectura, cambio mínimo confirmado, recarga, auditoría y aislamiento con cuentas de ensayo autorizadas; distinguirlo de APIs interceptadas. |

**Estas pruebas de migración, persistencia y Preview no se han ejecutado como parte del plan.** Cierre 19A exige su evidencia; publicar el documento no equivale a implementar el contrato.

## 9. Fuentes locales del contrato

- `docs/V17-ADMINISTRATION-HUB-18A.md`, `src/administration/administrationSections.ts` y `src/components/modules/SettingsModule.tsx`: alcance actual y formulario histórico.
- `prisma/schema.prisma`: Tenant, User, TenantMembership y CommercialAuditLog.
- `api/_lib/authorizationContext.js`, `api/_lib/crmPipelineAccess.js`, `api/_lib/adminMembershipDomain.js`, `api/_lib/adminMembershipHttp.js`, `api/_lib/adminMembershipAccess.js`: contexto, revalidación, bloqueos, HTTP y límites de compuerta.
- `api/_lib/crmServicesHttp.js`, `shared/v17ConsolidatedPreview.js`, `api/_lib/rbac.js` y `api/_lib/commercialAuditLog.js`: patrones de Preview, concesiones explícitas y auditoría.
- `scripts/validate-mt01b3a-auth-guard.mjs`, `scripts/canonical-migrations.mjs`, `scripts/verify-v17-consolidated-preview-db.mjs`: rutas exactas, cadena cerrada y verificación de destino.
