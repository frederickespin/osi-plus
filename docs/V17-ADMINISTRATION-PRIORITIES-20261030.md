# Administración — prioridades y alcance

Fecha: 30 de octubre de 2026 (República Dominicana).

**Estado: plan actualizado; funciones nuevas pendientes de implementación.** Este documento actualiza el orden de trabajo posterior a la integración de Administración. No acredita funciones nuevas operativas ni cambios en registros de negocio.

## Decisiones y orden

- Posponer la adecuación de **crating** hasta trabajar la **calculadora de madera de OSI Plus Mobile**.
- Incluir **Usuarios y roles** y **Registro de flota vehicular** en Administración.
- Configurar en **Administración → Logística** los costos por distancia de **servicios y visitas fuera de la zona metropolitana establecida**.
- Mantener una interfaz minimalista, con tablas compactas, iconos consistentes y ayuda contextual; trabajar un módulo a la vez y abordar Almacenes después de Administración.

Orden propuesto para estas incorporaciones: **Usuarios y roles → Flota vehicular → Zonas y tarifas de distancia**. Empresa y preferencias conserva su planificación pendiente; ya no se presume el siguiente incremento inmediato.

| Área | Responsabilidad |
| --- | --- |
| Administración → Usuarios y roles | Personas de la empresa activa, rol, permisos y estado de acceso. |
| Administración → Flota vehicular | Registro único de vehículos, capacidades y estado operativo. |
| Administración → Logística | Zona metropolitana, cobertura fuera de zona, criterios de distancia y tarifas aplicables. |
| Logística y coordinación operativa | Utilizar la flota y las reglas al preparar servicios y visitas, conservando una única configuración. |
| OSI Plus Mobile → Calculadora de madera | Adecuación futura de crating y sus cálculos específicos. |
| Almacenes | Etapa posterior: materiales de embalaje, herramientas, almacenaje de clientes y organización de espacios. |

## 1. Usuarios y roles

La siguiente entrega debe reunir:

- Tabla compacta de personas, búsqueda y filtros por rol y estado.
- Roles existentes con nombres comprensibles y asignación autorizada. Los roles personalizados requieren una decisión posterior.
- Permisos agrupados por área, con distinción entre los heredados del rol, los adicionales, los denegados y el acceso efectivo.
- Edición sólo de campos autorizados y modificados, con detección de conflictos y conservación de la continuidad administrativa.
- Acciones con iconos, foco visible y ayuda accesible por teclado y toque.

La revisión del código confirma que existe una base persistente de administración de accesos, pero todavía no cubre el catálogo completo de roles y permisos del sistema. Hay que completar la compatibilidad de roles, corregir el envío de campos no modificados y preparar su disponibilidad autorizada en Preview. Las invitaciones actuales tienen un alcance limitado; no deben presentarse como alta general de usuarios hasta adaptar ese flujo.

Los datos laborales y de remuneración permanecen en sus áreas de personal. Este módulo administra identidad y acceso.

**Cierre:** roles existentes compatibles; cambios limitados a lo autorizado; aislamiento entre empresas; continuidad administrativa; navegación desde el Hub y retorno; cambios recuperables después de recargar. Las verificaciones con datos simulados se distinguirán de la comprobación real de persistencia.

## 2. Registro de flota vehicular

La primera entrega comprende una tabla con código, matrícula, tipo, marca/modelo, capacidades y estado; búsqueda y filtros; ficha persistente de alta y edición; cambio de estado y retiro con historial. Las unidades deben ser explícitas y coherentes con las que utiliza Logística.

La pantalla anterior de Flota guarda información en el navegador. Existe un registro relacional que Logística ya consulta, por lo que la integración debe conectar la interfaz a esa misma autoridad y conservar la separación por empresa. Añadir solamente un enlace a la pantalla anterior no completa el registro compartido.

Conductores, suplencias, combustible, mantenimiento y reservas vehiculares se tratarán como ampliaciones posteriores. La disponibilidad por estado no equivale a disponibilidad por calendario.

**Cierre:** ficha recuperable tras recarga, detección de duplicados, conflictos de edición, retiro sin perder historial y capacidades coherentes en Logística.

## 3. Logística: zonas y tarifas de distancia

La configuración se administra una sola vez en **Administración → Logística**. Servicios y visitas consumen esas reglas, con tarifas diferenciables y un desglose verificable.

| Configuración | Criterio |
| --- | --- |
| Zona metropolitana | Recuperar y revisar la delimitación establecida. No sustituirla por un radio supuesto. |
| Origen y recorrido | Base operativa, origen/destino y paradas cuando correspondan; fuente y fecha de la distancia. |
| Actividad | Reglas diferenciables para servicio y visita. |
| Distancia computable | Precisar ida o ida y vuelta, kilometraje total o tramo exterior y kilómetros incluidos cuando procedan. |
| Tarifa | Importe por km, moneda, vigencia y cargo mínimo si se ha definido. No activar importes de ejemplo. |
| Desglose | Zona aplicada, distancia medida, km computables, tarifa, mínimo aplicado y resultado. |
| Conceptos adicionales | Peajes, viáticos y otros conceptos separados cuando correspondan, evitando duplicidades. |
| Historial | Conservar la versión utilizada; un cambio de tarifa no reescribe automáticamente cálculos anteriores. |

La zona geográfica y los kilómetros incluidos son conceptos diferentes. Estar fuera de zona no determina por sí solo si se computa todo el recorrido, su tramo exterior o el exceso sobre una franquicia. También debe distinguirse **costo operativo** de **cargo al cliente**.

La interfaz propuesta reúne Zona metropolitana, Servicios y Visitas en áreas compactas. Una acción **Simular**, con icono y nombre accesible, permite revisar el desglose antes de activar una tarifa o generar un cargo.

La revisión del código encontró reglas y cálculos aprovechables, pero todavía falta conectar el recorrido completo de configuración, cálculo económico y uso en servicios y visitas. La distancia desconocida debe quedar pendiente, no convertirse en cero. El cargo de visita debe conservar su fuente de cálculo y su aprobación.

Antes de activar tarifas se revisarán la delimitación real de la zona, base de medición, ida/vuelta, tipo de kilometraje computable, valores, mínimos, redondeo y relación entre costo y precio. No hace falta fijar ahora esos importes para avanzar con Usuarios y Flota.

**Cierre:** casos dentro/fuera/en límite de zona; servicio/visita; ida/vuelta; kilómetros incluidos; mínimos; moneda; distancia pendiente; cambios de versión; ausencia de doble cómputo y trazabilidad del resultado.

## 4. Crating, diseño y trabajo posterior

Crating se adecuará junto con la calculadora de madera en OSI Plus Mobile. Su desarrollo funcional no es requisito para diseñar Usuarios, Flota ni esta configuración de distancia. La revisión técnica del historial del esquema se conserva como tarea previa a cualquier ampliación que requiera una migración.

Todas las entregas siguen el mismo criterio visual: una sección activa, tablas compactas, detalles bajo demanda, iconos con nombres accesibles, textos breves cuando eviten ambigüedad y ayuda contextual mediante interrogación. Estados, errores y confirmaciones necesarios permanecen visibles.

Después se abordará Almacenes con la referencia HTML ya recibida, manteniendo diferenciados materiales consumibles, herramientas, bienes de clientes y espacios de almacenaje.

Esta actualización es documental. Cada incremento requiere implementación y evidencia de cierre propia antes de declararse operativo.
