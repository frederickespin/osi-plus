# OSI Plus V17 — Esquema Comercial de Almacenaje 23A

## Decisiones aprobadas

- El caso selecciona un servicio principal para identificar la necesidad central del cliente.
- Los demás servicios son secundarios, pero cada servicio conserva costos, precio, margen y aprobación propios.
- Almacenaje puede ser principal o secundario de una mudanza local, importación, exportación, transporte u otro servicio.
- Los valores iniciales pueden ser declarados por el cliente o estimados por Comercial; Survey publica una estimación más precisa y Almacén confirma la realidad operativa.
- La facturación de almacenaje es mensual o por fracción de mes.
- Los servicios y movimientos pueden originarse en la entrada o durante la vigencia del almacenaje.
- La tarifa recurrente distingue capacidad contratada, ubicación física y movimientos ejecutados.

## Flujo

```text
Cliente → Caso → Modo/alcance → Principal + secundarios
       → Datos iniciales → Visita/Survey cuando aplique
       → Tarifa base por m³/espacio + servicios individuales
       → Ajustes explícitos de relación comercial o referido
       → Propuesta → Aceptación → Identidad/facturación
       → Contrato → Reserva de capacidad → Autorización
       → Recepción/custodia → Facturación mensual
       → Entradas adicionales, remanejos, retiros o salida total
```

## Fuentes de los valores

Cada valor conserva fuente y revisión: `CLIENT_DECLARED`, `COMMERCIAL_ESTIMATE`, `SURVEY_VERIFIED` o `WAREHOUSE_CONFIRMED`. Ninguna actualización borra silenciosamente la anterior.

## Catálogo común e idioma de entrega

En **Administración → Catálogo de artículos**, cada empresa mantiene un catálogo común en español. Cada artículo tiene un código estable, nombre, sinónimos y volumen de referencia.

Comercial asigna la visita desde el caso. Survey y Mini Survey consultan el catálogo para estimar el volumen del inventario. Recepción consulta los mismos artículos al describir bultos y conserva el contenido registrado. Cotización usa el volumen del servicio y el factor configurado en su perfil del Tarifario para determinar los kilogramos volumétricos. El perfil registra un divisor para aéreo o una densidad en kg/m³ para marítimo o terrestre. El peso bruto medido se registra por separado.

Cuando se habiliten otros idiomas, el idioma se elegirá al generar el resultado para el destinatario. El español será el idioma inicial de entrega. El sistema tomará el texto de la revisión correspondiente y generará la traducción con un glosario de la empresa. Esta traducción se guardará asociada a la misma ficha y revisión para reutilizarla en otras entregas. Si el texto original cambia, la revisión siguiente podrá generar su propia traducción. Cada documento emitido conservará el idioma y el texto que se entregaron.

Por ejemplo, la ficha `ART-001` se redacta como «Sofá de 3 plazas». Una entrega en inglés puede mostrar «Three-seat sofa», con el mismo código y el mismo volumen de referencia. Las cantidades y mediciones conservan su fuente y el peso volumétrico conserva la regla del servicio.

Al habilitar la traducción automática, la vista previa mostrará qué textos del catálogo se traducirán. El sistema señalará las traducciones pendientes antes de emitir el resultado y permitirá elegir una entrega en español.

## Tarifas y permanencia

- El tarifario puede incluir planes mes a mes y compromisos de 3, 6, 9, 12, 24 meses u otros configurables.
- El contrato publica tarifa regular, tarifa preferencial, descuento mensual, plazo, facturación por mes o fracción, preaviso, reintegro de descuento y penalidad adicional.
- Reintegro del descuento y penalidad por terminación anticipada son conceptos separados.
- Contratos de más de doce meses deben indicar si el reintegro cubre el año contractual en curso, una ventana móvil máxima de doce meses o un período fijo explícito. No se infiere la fórmula.

## Relaciones Comerciales y Referidos

- Empresa, Lead Account, Booker, pagador, aprobador y referidor son roles distintos y explícitos.
- Primero se resuelve la tarifa regular del servicio.
- Después se aplica el acuerdo comercial versionado: descuento o cargo administrativo según servicio, modo, vigencia y base acordada.
- El referido usa un acuerdo independiente; no se confunde con una comisión interna.
- Costing conserva el costo operativo. El acuerdo comercial modifica pricing y Quote guarda el snapshot aplicado.
- La propuesta muestra tarifa base, ajuste, motivo/acuerdo y precio final. Ningún ajuste se infiere por nombre del cliente o de la empresa.
- La actividad y rendimiento por relación comercial se medirá con casos, propuestas, aceptación, ingresos, margen, volumen/peso, incidencias y servicios, sin alterar documentos históricos.

## Autoridad operativa

Almacén no selecciona clientes ni crea precios. Ejecuta una autorización vigente emitida desde Comercial y vinculada a cliente, caso, propuesta aceptada, contrato, servicio, almacén y movimiento permitido.

## Entregas por partes

1. Reconocer Almacenaje como servicio principal o secundario. **Implementado.**
2. Configurar modalidad, estimaciones, fuente y necesidad de visita. **Implementado en revisión versionada previa a Survey/Cotización.**
3. Publicar tarifarios por m³/espacio y conceptos de movimiento.
4. Aplicar Relaciones Comerciales y Referidos sobre la tarifa base.
5. Contrato transparente, permanencia y liquidación anticipada.
6. Reserva, autorizaciones, cobros mensuales y movimientos posteriores.
