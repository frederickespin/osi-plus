# Reparación del CI de la integración Hub y Mobile

## Alcance

Este incremento atiende el punto 1 de la revisión del Draft PR #82: hacer que el CI general valide la rama consolidada actual. Continúa sobre `feature/v17-hub-mobile-convergence-17a` y mantiene como destino `feature/v17-consolidated-preview`.

Los tres primeros bloqueos reproducidos eran una prueba negativa detectada como configuración Prisma real, rutas API aprobadas ausentes del inventario de autenticación y validadores que sólo reconocían 22–24 migraciones frente a las 35 existentes. Al superarlos aparecieron dependencias de esos mismos inventarios en ICP, referencias públicas, Vary y pruebas históricas del Hub.

Los cambios de este incremento se limitan a validadores, pruebas, su ejecución en CI y esta documentación. No modifican los consumidores de la aplicación, las APIs, el datamodel, los SQL de migraciones, la configuración de Vercel ni las compuertas de activación. Las conexiones declaradas en el workflow corresponden únicamente al PostgreSQL efímero local de las pruebas.

## Contratos actualizados

### Esquema e inventario de migraciones

- `validate-prisma-schema-target.mjs` admite únicamente el rango del literal inválido en la prueba negativa de Portal cuyo cuerpo comprueba el error y estado esperados. Un cambio de archivo, de aserción, de importación o de uso invalida la excepción. El resto del archivo continúa bajo inspección.
- `canonical-migrations.mjs` reúne los 35 nombres aprobados. Los validadores históricos consumen ese inventario en lugar de tolerar cualquier conteo superior o rechazar extensiones ya aprobadas.
- La validación exige archivos SQL regulares, presentes, no vacíos y UTF-8; rechaza enlaces simbólicos, entradas adicionales, sustituciones y duplicados. Permanecen las comprobaciones especializadas de checksums históricos.
- Costing y Scheduling distinguen el historial completo de CI de sus fixtures aislados, que finalizan en checkpoints nombrados. En ambos casos se exige igualdad del inventario y estados de aplicación válidos.

### Catálogo SQL y fixtures de base de datos

- El inspector de catálogo conserva el perfil histórico de 22 migraciones y añade un perfil cerrado de 35 para el destino canónico. El histórico se reconstruyó primero y reprodujo su huella; las 35 migraciones se reconstruyeron dos veces desde bases vacías, con resultados idénticos.
- Las consultas y la normalización históricas permanecen intactas. Se verifica la huella completa de 10.461 objetos, sus ocho categorías y 927 objetos SQL-only. Las 212 funciones de `btree_gist 1.8` se atribuyen por dependencia de catálogo a la migración aprobada que instala la extensión. No se excluyen del inventario.
- El inspector exige nombres, estados, pasos y checksums de las migraciones. Sus perfiles no pueden sustituirse ni desactivarse mediante parámetros. El recolector de evidencia separado no puede declarar una baseline válida. La procedencia y las huellas están documentadas en [V17-SQL-CATALOG-BASELINE-35.md](V17-SQL-CATALOG-BASELINE-35.md).
- El bootstrap MT-01A se ejecuta antes de los fixtures de los módulos: su comprobación de base sin usuarios se conserva. Se reordenan los pasos del job, sin omitir pruebas ni relajar esa condición.
- Los destinos de Servicios conservan el perfil histórico y admiten el canónico sólo con activación explícita; se verifican la identidad real de PostgreSQL 18 y el esquema dentro de una transacción de sólo lectura antes de escribir o limpiar fixtures. Las variables locales de Quote y Scheduling están disponibles también en la verificación final del job.
- Los fixtures de cotizaciones incorporan el tenant exigido por la migración consolidada. ICP conserva su fixture histórico y comprueba el código y mensaje concretos del rechazo de una cotización FINAL con destino pendiente.
- Quote crea dos fuentes económicas propias mediante los dominios de Logística y Costos, y consulta únicamente las identidades que acaba de crear. Conserva su recorrido y añade pruebas de aislamiento entre tenants. Ya no depende de Costings dejados por otra suite; véase [V17-QUOTE-DB-FIXTURES.md](V17-QUOTE-DB-FIXTURES.md).

### Autenticación y referencias públicas

- Las 153 rutas inventariadas tienen clasificación explícita. Una ruta nueva requiere declarar su contrato: contexto empresarial, credenciales, cookie de refresh, invitación, Portal con token/código, metadata pública o endpoint retirado/deshabilitado.
- La guardia comprueba que el handler exportado está conectado al adaptador autorizado. Un import o comentario sin uso no satisface el contrato; tampoco se admiten opciones que sustituyan la autoridad.
- `/api/users` conserva su respuesta 410. Las rutas migradas siguen dependiendo del contexto canónico y hay cero excepciones de autoridad por headers heredados.
- Los 23 consumidores de referencias públicas se clasifican por CASE, CLIENT, MEMBERSHIP e INVITATION. Las consultas deben conservar el límite de tenant o el vínculo canónico de sesión; las comprobaciones de UUID, 404 indistinguible y migraciones históricas permanecen.
- ICP y el runner de base de datos consumen los inventarios exportados y sus clasificaciones. Ya no inspeccionan texto incidental de otras guardias.
- El contrato de Vary cubre las 31 rutas CRM actuales y sus siete adaptadores. Se ejercitan también sus respuestas reales con modos deshabilitados o configuración inválida, antes de leer credenciales o cuerpo.
- Las suites históricas LEGACY usan membresías activas y comprueban su autoridad actual, incluidos grants y denies distintos del rol global. Se conserva el rechazo cuando falta membresía, los códigos actuales de autenticación y la respuesta privada de las rutas retiradas. Los snapshots de login y `/auth/me` siguen siendo cerrados y ahora incluyen todas sus cabeceras.

### Hub, Comercial y Preview

- El catálogo se interpreta mediante AST y mantiene un inventario cerrado de aplicaciones, rutas, alias, permisos, roles y destinos externos. Se rechazan propiedades duplicadas, spreads y valores dinámicos.
- La comparación global contra el SHA del primer Hub se sustituye por contratos vigentes: cadena canónica, autoridad antes de carga lazy, catálogo autorizado, disponibilidad que sólo restringe ese catálogo y aislamiento del enlace externo. Los validadores especializados siguen verificando los dominios del servidor.
- Comercial conserva las cinco pestañas consolidadas y sus compuertas. Las expectativas de pantallas futuras o textos históricos se sustituyen por el comportamiento vigente.
- La selección pública de membresía en los adaptadores del piloto es una excepción específica, validada por AST: clase, método, proveedor, comprobaciones previas y objeto de headers con Bearer. Otros headers de autoridad, métodos u objetos no quedan autorizados por esa excepción.
- Las tres lecturas aprobadas del modo Preview siguen requiriendo los prerrequisitos completos y la delegación al contexto central; no se permiten lecturas arbitrarias del modo en otros consumidores.
- La prueba de acceso a Administración verifica Coordinación como información pendiente, conserva el recorrido de membresías e invitación y comprueba que el módulo administrativo se descargue después del clic autorizado.
- En el Inbox móvil, seleccionar un caso muestra su resumen y oculta la cola; volver desde Ficha conserva esa selección. Las pruebas regresan a la cola mediante el botón visible del resumen antes de volver a seleccionar o abrir una ficha, y conservan las comprobaciones de escrituras, permisos, owner, filtros y barreras de solicitudes.

## Cobertura de regresión

El job `build` ejecuta ahora las pruebas de la excepción de esquema, del inventario canónico, de la baseline SQL, de los destinos locales de Quote y Servicios, de MT01C1B2A y de los contratos Hub/Comercial. No se retiran pasos del CI ni se convierten fallos obligatorios en opcionales.

El archivo `hub.spec.ts` conserva sus 17 casos en seis proyectos de navegador. La configuración completa incluye también Administración y selección de membresía, para un total de 168 ejecuciones. Los módulos pendientes se verifican como información sin acceso operativo; Mobile y Empaque sirven como destinos disponibles para probar navegación, revocación, errores de red, logout y cancelación de solicitudes anteriores. Production Read verifica las pestañas disponibles y la ausencia de chunks y APIs de Survey/Quote cuando sus compuertas están deshabilitadas.

El job general de navegadores dispone de 45 minutos para sus 730 casos. La ejecución anterior se interrumpió tras 30 minutos y 16 segundos mientras acumulaba timeouts de acciones móviles, antes de emitir su resumen completo. Se corrigen esos recorridos y se amplía el margen del job; no cambian los timeouts de cada prueba, los reintentos ni las suites obligatorias.

Las comprobaciones de PostgreSQL continúan ejecutándose contra la instancia efímera local de GitHub Actions. No se utiliza la conexión Neon del Preview para estas pruebas.

## Evidencia y límites

La compilación Prisma/Vite y los dos chequeos de TypeScript focalizados pasan localmente. El lint focal de los archivos modificados pasa; el lint global conserva deuda previa fuera de este cambio y su estado informativo preexistente en el workflow.

Las ejecuciones y resultados definitivos del CI se registran en el PR #82 y en sus checks asociados a cada commit. La publicación del Preview consolidado y el retorno dentro de la calculadora externa corresponden a los puntos 2 y 3 del recorrido, respectivamente.
