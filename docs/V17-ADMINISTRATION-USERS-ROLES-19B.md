# Administración — Usuarios y roles

Fecha: 30 de octubre de 2026 (República Dominicana).

## Resultado del incremento

La sección `/administration/access` pasa a llamarse **Usuarios y roles**. Permite consultar y administrar los accesos existentes de la empresa activa desde el Hub, con una tabla compacta y permisos agrupados por área.

La primera entrega se centra en cuentas existentes. Crear roles personalizados y ampliar las invitaciones a altas generales permanecen fuera de este incremento. La flota, las tarifas por distancia y la calculadora de madera conservan sus etapas posteriores.

## Comportamiento

- Catálogo de 17 roles compatibles con el modelo de membresías, con nombres comprensibles.
- Los 157 permisos conocidos se presentan con etiquetas en español y grupos funcionales.
- La API obtiene los permisos heredados del RBAC canónico del servidor. La interfaz no utiliza el catálogo histórico del navegador para decidir accesos.
- La matriz distingue herencia, concesión adicional, denegación y resultado efectivo; las denegaciones prevalecen.
- La edición envía únicamente los campos modificados y autorizados. Guardar permanece deshabilitado cuando no hay cambios.
- Los permisos históricos desconocidos se conservan al editar otros campos; no se incorporan permisos desconocidos nuevos ni se trasladan entre concesiones y denegaciones.
- Un conflicto de versión o un resultado incierto exige recarga explícita. La interfaz no reenvía automáticamente el cambio.
- Cambiar cuenta o contexto descarta el editor y las respuestas anteriores.
- Iconos con nombres accesibles, ayuda contextual y controles utilizables con teclado y en móvil.

## Autoridad y persistencia

La consulta exige permiso de lectura y un administrador activo de la empresa. Cada cambio exige además su permiso específico de rol, estado o permisos, comprobado nuevamente en la transacción.

Se conservan el aislamiento entre empresas, los bloqueos, el control de versión, la continuidad administrativa, la auditoría y las revocaciones de sesión correspondientes a un cambio real. Un cambio sin diferencias no incrementa la versión, no genera un evento ficticio y no revoca sesiones.

El incremento reutiliza las tablas existentes; no incorpora migraciones ni concede permisos a cuentas por publicarse. La autorización efectiva de cada cuenta sigue siendo la del servidor.

## Preview

Usuarios y roles incorpora una habilitación propia para Preview, cerrada por defecto y limitada a las ramas autorizadas. El servidor comprueba ambiente, configuración de sesión, destino real de la base y empresa activa. Los destinos se configuran en el servidor; no proceden de la petición del navegador.

Habilitar membresías no habilita invitaciones. Los contratos anteriores de ejecución local y del piloto de producción conservan sus verificaciones independientes.

## Verificación

La validación incluye:

- Catálogo coherente con los roles del modelo y los permisos del servidor.
- Listado, filtro y edición de roles distintos de Administrador/Ventas.
- Edición parcial por permiso, ausencia de cambios y conservación de excepciones históricas.
- Conflictos, auditoría atómica, revocación de sesiones, continuidad administrativa y aislamiento entre empresas.
- Rechazo de ambientes, ramas, destinos y contextos no autorizados.
- Navegación, permisos, ayuda, cancelación, recarga y presentación de escritorio y móvil.
- Regresión de invitaciones, Hub y contratos existentes.

Las pruebas de base de datos se ejecutan sobre una base efímera de CI. Las pruebas de navegador usan datos sintéticos; la comprobación del despliegue real se registra por separado. La evidencia final de ejecución y publicación se adjunta al PR del incremento.
