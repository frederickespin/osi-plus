# Reparación del CI de la integración Hub y Mobile

## Alcance

Este incremento atiende el punto 1 de la revisión del Draft PR #82: hacer que el CI general valide la rama consolidada actual. Continúa sobre `feature/v17-hub-mobile-convergence-17a` y mantiene como destino `feature/v17-consolidated-preview`.

Los tres primeros bloqueos reproducidos eran una prueba negativa detectada como configuración Prisma real, rutas API aprobadas ausentes del inventario de autenticación y validadores que sólo reconocían 22–24 migraciones frente a las 35 existentes. Al superarlos aparecieron dependencias de esos mismos inventarios en ICP, referencias públicas, Vary y pruebas históricas del Hub.

Los cambios de este incremento se limitan a validadores, pruebas, su ejecución en CI y esta documentación. No modifican los consumidores de la aplicación, las APIs, el datamodel, los SQL de migraciones, las variables de entorno ni las compuertas de activación.

## Contratos actualizados

### Esquema e inventario de migraciones

- `validate-prisma-schema-target.mjs` admite únicamente el rango del literal inválido en la prueba negativa de Portal cuyo cuerpo comprueba el error y estado esperados. Un cambio de archivo, de aserción, de importación o de uso invalida la excepción. El resto del archivo continúa bajo inspección.
- `canonical-migrations.mjs` reúne los 35 nombres aprobados. Los validadores históricos consumen ese inventario en lugar de tolerar cualquier conteo superior o rechazar extensiones ya aprobadas.
- La validación exige archivos SQL regulares, presentes, no vacíos y UTF-8; rechaza enlaces simbólicos, entradas adicionales, sustituciones y duplicados. Permanecen las comprobaciones especializadas de checksums históricos.
- Costing y Scheduling distinguen el historial completo de CI de sus fixtures aislados, que finalizan en checkpoints nombrados. En ambos casos se exige igualdad del inventario y estados de aplicación válidos.

### Autenticación y referencias públicas

- Las 153 rutas activas tienen clasificación explícita. Una ruta nueva requiere declarar su contrato: contexto empresarial, credenciales, cookie de refresh, invitación, Portal con token/código, metadata pública o endpoint retirado/deshabilitado.
- La guardia comprueba que el handler exportado está conectado al adaptador autorizado. Un import o comentario sin uso no satisface el contrato; tampoco se admiten opciones que sustituyan la autoridad.
- `/api/users` conserva su respuesta 410. Las rutas migradas siguen dependiendo del contexto canónico y hay cero excepciones de autoridad por headers heredados.
- Los 23 consumidores de referencias públicas se clasifican por CASE, CLIENT, MEMBERSHIP e INVITATION. Las consultas deben conservar el límite de tenant o el vínculo canónico de sesión; las comprobaciones de UUID, 404 indistinguible y migraciones históricas permanecen.
- ICP y el runner de base de datos consumen los inventarios exportados y sus clasificaciones. Ya no inspeccionan texto incidental de otras guardias.
- El contrato de Vary cubre las 31 rutas CRM actuales y sus siete adaptadores. Se ejercitan también sus respuestas reales con modos deshabilitados o configuración inválida, antes de leer credenciales o cuerpo.

### Hub, Comercial y Preview

- El catálogo se interpreta mediante AST y mantiene un inventario cerrado de aplicaciones, rutas, alias, permisos, roles y destinos externos. Se rechazan propiedades duplicadas, spreads y valores dinámicos.
- La comparación global contra el SHA del primer Hub se sustituye por contratos vigentes: cadena canónica, autoridad antes de carga lazy, catálogo autorizado, disponibilidad que sólo restringe ese catálogo y aislamiento del enlace externo. Los validadores especializados siguen verificando los dominios del servidor.
- Comercial conserva las cinco pestañas consolidadas y sus compuertas. Las expectativas de pantallas futuras o textos históricos se sustituyen por el comportamiento vigente.
- La selección pública de membresía en los adaptadores del piloto es una excepción específica, validada por AST: clase, método, proveedor, comprobaciones previas y objeto de headers con Bearer. Otros headers de autoridad, métodos u objetos no quedan autorizados por esa excepción.
- Las tres lecturas aprobadas del modo Preview siguen requiriendo los prerrequisitos completos y la delegación al contexto central; no se permiten lecturas arbitrarias del modo en otros consumidores.

## Cobertura de regresión

El job `build` ejecuta ahora las pruebas de la excepción de esquema, del inventario canónico, de MT01C1B2A y de los contratos Hub/Comercial. No se retiran pasos del CI ni se convierten fallos obligatorios en opcionales.

La suite del Hub conserva sus 17 casos en seis proyectos de navegador. Los módulos pendientes se verifican como información sin acceso operativo; Mobile y Empaque sirven como destinos disponibles para probar navegación, revocación, errores de red, logout y cancelación de solicitudes anteriores.

Las comprobaciones de PostgreSQL continúan ejecutándose contra la instancia efímera local de GitHub Actions. No se utiliza la conexión Neon del Preview para estas pruebas.

## Evidencia y límites

La compilación Prisma/Vite y los dos chequeos de TypeScript focalizados pasan localmente. El lint focal de los archivos modificados pasa; el lint global conserva deuda previa fuera de este cambio y su estado informativo preexistente en el workflow.

Las ejecuciones y resultados definitivos del CI se registran en el PR #82 y en sus checks asociados a cada commit. La publicación del Preview consolidado y el retorno dentro de la calculadora externa corresponden a los puntos 2 y 3 del recorrido, respectivamente.
