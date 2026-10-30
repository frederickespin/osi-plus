# Administración — Identidad y alta de usuarios

Fecha: 30 de octubre de 2026 (República Dominicana).

## Objetivo

Completar Usuarios y roles con una ficha de identidad persistente: fotografía, nombre completo, documento, teléfono y correo. El listado y los formularios mantienen el diseño compacto, los iconos accesibles y la ayuda contextual del incremento 19B.

La ficha presenta dos pestañas, Identidad y Acceso. Los cambios de identidad y de autorización se guardan por separado, con control de versión y recarga explícita después de un conflicto. La cédula completa se consulta dentro del detalle autorizado.

## Datos e identidad compartida

La identidad empresarial se vincula a la membresía existente mediante las tres claves de empresa, membresía y usuario. La cédula dispone de un campo independiente y nunca sustituye el identificador interno. Su normalización valida formato; no constituye una verificación ante un organismo emisor.

El correo de inicio de sesión permanece de sólo lectura para cuentas existentes. Los datos empresariales no sobrescriben el nombre, correo ni contraseña global de una persona vinculada a otras empresas. El perfil laboral canónico de Recursos Humanos puede consultar esta ficha mediante la membresía; este incremento no inventa contratos, puestos ni relaciones laborales.

## Fotografía

El navegador convierte la imagen seleccionada a un avatar PNG de hasta 512 píxeles y 256 KiB. El servidor valida nuevamente el archivo y lo conserva en la base como contenido privado. La entrega de la imagen exige la autorización y el contexto empresarial correspondientes, y utiliza cabeceras que impiden su almacenamiento en cachés compartidas. Las vistas previas del navegador se descartan al cerrar la ficha o cambiar de contexto.

## Alta y activación

Nuevo usuario prepara un alta con los datos de identidad y un rol operativo del catálogo canónico. Produce un enlace de activación de un solo uso y vencimiento limitado; sólo su hash se guarda en la base. El administrador entrega el enlace por el canal que corresponda. Este incremento no envía correos ni mensajes automáticamente.

La nueva cuenta define su contraseña durante la activación. Una identidad global ya existente debe acreditar su sesión para aceptar el acceso a la empresa; su contraseña y sus otras membresías se conservan. La activación se completa de forma transaccional y requiere después el inicio de sesión normal.

El alta general admite los 16 roles distintos de Administrador. Las altas administrativas conservan el procedimiento específico y las comprobaciones existentes. Los permisos adicionales se gestionan después mediante Acceso, con la autorización que ya exige el servidor.

## Persistencia y publicación

La migración aditiva `20261030010000_v17_user_identity_enrollment` incorpora las tablas `tenant_user_identities` y `user_enrollments`, con referencias empresariales, controles de duplicados, versiones y límites de fotografía. No modifica el SQL de migraciones anteriores.

La función tiene una activación propia, cerrada por defecto, para ejecución local controlada y Preview. La nueva interfaz debe habilitarse sólo después de comprobar el destino y aplicar la migración. Con la función apagada se mantiene el comportamiento 19B.

El historial del Preview debe verificarse por separado del catálogo canónico de CI. El antecedente compartido por el usuario incluye una extensión histórica de Ingeniería cuyo SQL no pertenece a esta rama; no debe reconstruirse, ejecutarse ni darse por revisado a partir de su checksum. Cualquier diferencia distinta del manifiesto revisado detiene la adopción.

### Comprobación del Preview

El destino de este incremento es exclusivamente la base `v17_consolidated_preview_10b`, rama Neon `br-mute-credit-ahxnvfx0`, esquema `osi` y empresa `V17-CONSOLIDATED-PREVIEW-10B`.

El comprobador operativo `v17-admin-user-identity-preview-check.mjs` se entrega por separado y no forma parte del código de la aplicación ni de CI. Desde una copia del commit revisado, con las dependencias bloqueadas ya instaladas, ejecutar en una terminal privada indicando la ruta del archivo descargado:

```powershell
node "$env:USERPROFILE\Downloads\v17-admin-user-identity-preview-check.mjs" --check
```

El comprobador solicita la conexión sin mostrarla. No acepta secretos como argumentos ni lee la conexión de archivos o variables. Contrasta los archivos de migración con sus checksums fijados, el destino real, la empresa, el historial aplicado y la presencia o ausencia de las nuevas tablas. No escribe en la base.

- `VERIFICADO_19C_PENDIENTE_SIN_CAMBIOS`: historial previo y ausencia de tablas 19C compatibles con la adopción pendiente.
- `VERIFICADO_19C_APLICADA_SIN_CAMBIOS`: historial 19C presente y catálogo estructural comprobado. La comprobación de columnas, nombres y tipos de restricciones e índices no compara todas sus definiciones SQL.
- Cualquier otro resultado requiere revisar la diferencia antes de aplicar cambios.

La aplicación debe utilizar Prisma 6.19.2 del proyecto y únicamente la migración pendiente 19C, después de verificar el plan. El historial esperado de este Preview pasa de 36 a 37 registros, porque incluye la extensión histórica de Ingeniería además de las migraciones del repositorio. No se reconstruye esa extensión ni se modifica su registro.

Después de la aplicación, repetir el comprobador y habilitar sólo en la rama Preview `feature/v17-consolidated-preview` las variables `ADMIN_USER_IDENTITY_MODE` y `VITE_ADMIN_USER_IDENTITY_MODE` con valor `PREVIEW_REHEARSAL`, y `ADMIN_USER_IDENTITY_BATCH` y `VITE_ADMIN_USER_IDENTITY_BATCH` con valor `V17-ADMINISTRATION-IDENTITY-19C`. Las compuertas de membresías 19B y la autenticación existente siguen siendo requisitos. Verificar finalmente guardar/recargar una ficha, su foto privada y el recorrido de activación.

## Evidencia requerida

- Compilación, tipos y análisis focal.
- Identidad, fotografía, permisos por empresa, duplicados, versiones, ausencia de cambios y errores HTTP.
- Alta y activación nuevas, aceptación autenticada de identidad existente, vencimiento, revocación, consumo concurrente y ausencia de elevación a Administrador.
- Auditoría con referencias y campos cambiados, sin documento, teléfono, fotografía, contraseña o token.
- Migración desde cero, segunda aplicación idempotente y catálogo medido con PostgreSQL efímero.
- Navegación, formularios y regresión de Usuarios y roles 19B, en escritorio y móvil.

El PR registra los resultados ejecutados y el estado de adopción del Preview; este documento no constituye por sí mismo evidencia de pruebas o despliegue.
