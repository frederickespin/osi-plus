export type TemplateFamily = "CONTRACTS" | "COMMUNICATIONS" | "OPERATIONAL";

export type TemplateMask = Readonly<{
  id: string;
  family: TemplateFamily;
  name: string;
  description: string;
  code: string;
  templateName: string;
  category: string;
  audiences: readonly string[];
  channels: readonly string[];
  subject: string;
  bodyText: string;
  variables: readonly string[];
}>;

export const TEMPLATE_FAMILY_LABELS: Readonly<Record<TemplateFamily, string>> = Object.freeze({
  CONTRACTS: "Contratos",
  COMMUNICATIONS: "Comunicaciones",
  OPERATIONAL: "Documentos operativos",
});

export const TEMPLATE_MASKS: readonly TemplateMask[] = Object.freeze([
  {
    id: "storage-contract",
    family: "CONTRACTS",
    name: "Contrato de almacenaje",
    description: "Base para guardamuebles, almacenaje comercial y custodia de bienes.",
    code: "CTR.STORAGE.BASE",
    templateName: "Contrato base de almacenaje",
    category: "DOCUMENT_REQUEST",
    audiences: ["CLIENT", "PAYER", "APPROVER"],
    channels: ["EMAIL", "PORTAL"],
    subject: "Contrato de almacenaje · {{case.reference}}",
    bodyText: `CONTRATO DE ALMACENAJE

Entre [NOMBRE LEGAL DE LA EMPRESA], en lo adelante “EL ALMACENISTA”, y {{client.name}}, en lo adelante “EL CLIENTE”, se acuerda el servicio relacionado con el caso {{case.reference}}.

1. OBJETO
Custodia de los bienes descritos en el inventario y sus anexos, en el espacio y bajo las condiciones aprobadas en la propuesta aceptada.

2. VIGENCIA Y FACTURACIÓN
Inicio: [FECHA DE INICIO]
Duración acordada: [MESES]
Tarifa mensual o fracción: [MONTO Y MONEDA]
Tarifa preferencial: [MONTO Y CONDICIÓN]
Regla por terminación anticipada: [REGLA TRANSPARENTE]

3. ENTRADAS, RETIROS Y SERVICIOS ADICIONALES
Toda entrada adicional, retiro parcial, remanejo o salida total requiere autorización vigente. Los servicios adicionales aprobados se incorporarán mediante adenda cuando corresponda.

4. IDENTIFICACIÓN Y FACTURACIÓN
Titular: [NOMBRE / CÉDULA / RNC]
Responsable de pago: [NOMBRE / CÉDULA / RNC]
Correo de facturación: [CORREO]

5. CONDICIONES DEL SERVICIO
Origen relacionado: {{origin.address}}
Destino relacionado: {{destination.address}}
Capacidad contratada: [VOLUMEN / ESPACIO]
Seguro y responsabilidad: [CONDICIONES]
Artículos prohibidos: [CONDICIONES]

6. ACEPTACIÓN
Las partes confirman que la propuesta, el inventario, las fotografías, las adendas y las autorizaciones vinculadas forman parte integral de este contrato.

Por EL CLIENTE: [NOMBRE, FIRMA Y FECHA]
Por EL ALMACENISTA: [NOMBRE, FIRMA Y FECHA]`,
    variables: ["case.reference", "client.name", "origin.address", "destination.address"],
  },
  {
    id: "moving-contract",
    family: "CONTRACTS",
    name: "Contrato de mudanza o transporte",
    description: "Base para servicios locales, nacionales o internacionales.",
    code: "CTR.MOVING.BASE",
    templateName: "Contrato base de mudanza y transporte",
    category: "DOCUMENT_REQUEST",
    audiences: ["CLIENT", "PAYER", "APPROVER"],
    channels: ["EMAIL", "PORTAL"],
    subject: "Contrato de servicio · {{case.reference}}",
    bodyText: `CONTRATO DE SERVICIO DE MUDANZA O TRANSPORTE

Cliente: {{client.name}}
Caso: {{case.reference}}
Origen: {{origin.address}}
Destino: {{destination.address}}

ALCANCE APROBADO
[SERVICIO PRINCIPAL, SERVICIOS ASOCIADOS, VOLUMEN, PESO Y EXCLUSIONES]

FECHAS Y RECURSOS
[FECHA PREVISTA, DURACIÓN ESTIMADA, PERSONAL, VEHÍCULOS Y EQUIPOS]

PRECIO Y PAGO
[MONEDA, PRECIO, IMPUESTOS Y CONDICIONES DE PAGO]

CAMBIOS Y ADENDAS
Los servicios adicionales surgidos durante la ejecución se documentarán, valorarán y aprobarán antes de incorporarse a la factura final, salvo una emergencia operativa o de seguridad que deba ratificarse posteriormente.

RESPONSABILIDAD, SEGURO Y RECLAMOS
[CONDICIONES APLICABLES]

ACEPTACIÓN
[NOMBRE, FIRMA, FECHA Y CANAL DE ACEPTACIÓN]`,
    variables: ["case.reference", "client.name", "origin.address", "destination.address"],
  },
  {
    id: "storage-personal-contract",
    family: "CONTRACTS",
    name: "Almacenaje de efectos personales",
    description: "Guardamuebles y custodia de bienes personales con inventario, capacidad y facturación mensual.",
    code: "CTR.STORAGE.PERSONAL",
    templateName: "Contrato de almacenaje de efectos personales",
    category: "DOCUMENT_REQUEST",
    audiences: ["CLIENT", "PAYER", "APPROVER"],
    channels: ["EMAIL", "PORTAL"],
    subject: "Contrato de almacenaje personal · {{case.reference}}",
    bodyText: `CONTRATO DE ALMACENAJE DE EFECTOS PERSONALES

Cliente: {{client.name}}
Caso: {{case.reference}}

OBJETO E INVENTARIO
Custodia de los bultos identificados mediante inventario, etiquetas, fotografías y movimientos registrados. [DETALLAR EXCLUSIONES Y ARTÍCULOS PROHIBIDOS]

CAPACIDAD Y PLAZO
Espacio o volumen contratado: [CAPACIDAD]
Inicio y duración: [FECHAS]
Tarifa regular y preferencial: [MONEDA Y MONTOS]
Terminación anticipada: [REGLA Y EJEMPLO TRANSPARENTE]

MOVIMIENTOS Y CARGOS
Entradas adicionales, retiros parciales, remanejos, búsquedas, materiales y permanencia de excedentes se cobran según autorización y tarifario vigente.

RESPONSABILIDAD Y EVIDENCIAS
[SEGURO, CONDICIONES, CADENA DE CUSTODIA Y RECLAMOS]

FACTURACIÓN Y ACEPTACIÓN
[PAGADOR, FRECUENCIA, VENCIMIENTO, IDENTIFICACIÓN, FIRMA Y FECHA]`,
    variables: ["case.reference", "client.name"],
  },
  {
    id: "storage-commercial-contract",
    family: "CONTRACTS",
    name: "Almacenaje comercial",
    description: "Mercancías, materias primas o embarques comerciales con responsables y reglas de despacho.",
    code: "CTR.STORAGE.COMMERCIAL",
    templateName: "Contrato de almacenaje comercial",
    category: "DOCUMENT_REQUEST",
    audiences: ["CLIENT", "PAYER", "APPROVER"],
    channels: ["EMAIL", "PORTAL"],
    subject: "Contrato de almacenaje comercial · {{case.reference}}",
    bodyText: `CONTRATO DE ALMACENAJE COMERCIAL

Cliente: {{client.name}}
Caso: {{case.reference}}

MERCANCÍA Y ALCANCE
[TIPO DE MERCANCÍA, LOTES, UNIDADES, DOCUMENTOS Y RESTRICCIONES]

CAPACIDAD, ROTACIÓN Y PLAZO
[VOLUMEN O ESPACIO, FECHAS, RECEPCIONES, DESPACHOS Y NIVELES DE SERVICIO]

TARIFAS
[RENTA, ENTRADA, SALIDA, MANIPULACIÓN, REMANEJO, ETIQUETADO, PERMANENCIA Y CARGOS EXTRAORDINARIOS]

AUTORIZADOS Y TRAZABILIDAD
[PERSONAS AUTORIZADAS, DOCUMENTOS, ESCANEO, INVENTARIO Y CADENA DE CUSTODIA]

FACTURACIÓN, RESPONSABILIDAD Y FIRMA
[PAGADOR, MONEDA, IMPUESTOS, SEGURO, RECLAMOS, FIRMAS Y FECHA]`,
    variables: ["case.reference", "client.name"],
  },
  {
    id: "local-moving-contract",
    family: "CONTRACTS",
    name: "Mudanza local o nacional",
    description: "Empaque, carga, transporte, descarga y servicios asociados dentro del país.",
    code: "CTR.MOVE.LOCAL",
    templateName: "Contrato de mudanza local o nacional",
    category: "DOCUMENT_REQUEST",
    audiences: ["CLIENT", "PAYER", "APPROVER"],
    channels: ["EMAIL", "PORTAL"],
    subject: "Contrato de mudanza · {{case.reference}}",
    bodyText: `CONTRATO DE MUDANZA LOCAL O NACIONAL

Cliente: {{client.name}}
Caso: {{case.reference}}
Origen: {{origin.address}}
Destino: {{destination.address}}

ALCANCE APROBADO
[VOLUMEN, EMPAQUE, PERSONAL, VEHÍCULOS, EQUIPOS, DESMONTAJE Y ORGANIZACIÓN]

FECHAS Y DURACIÓN ESTIMADA
[INICIO, VENTANA DE SERVICIO Y SUPUESTOS OPERATIVOS]

PRECIO Y CAMBIOS
[MONEDA, SERVICIOS, EXCLUSIONES, PAGO Y ADENDAS]

ACCESOS, RESPONSABILIDAD Y FIRMA
[ACCESOS, ARTÍCULOS ESPECIALES, SEGURO, RECLAMOS, FIRMAS Y FECHA]`,
    variables: ["case.reference", "client.name", "origin.address", "destination.address"],
  },
  {
    id: "import-moving-contract",
    family: "CONTRACTS",
    name: "Mudanza internacional de importación",
    description: "Recepción internacional, coordinación, aduanas, entrega y posibles almacenajes asociados.",
    code: "CTR.MOVE.IMPORT",
    templateName: "Contrato de importación de mudanza",
    category: "DOCUMENT_REQUEST",
    audiences: ["CLIENT", "PAYER", "APPROVER", "AGENT"],
    channels: ["EMAIL", "PORTAL"],
    subject: "Contrato de importación · {{case.reference}}",
    bodyText: `CONTRATO DE SERVICIO DE IMPORTACIÓN

Cliente: {{client.name}}
Caso: {{case.reference}}
Agente relacionado: {{agent.name}}
Destino: {{destination.address}}

ALCANCE Y DOCUMENTOS
[EMBARQUE, RECEPCIÓN, ADUANAS, PUERTO/AEROPUERTO, TRANSPORTE Y ENTREGA]

CARGOS INCLUIDOS Y EXCLUIDOS
[TARIFAS, GASTOS DE TERCEROS, DEMORA, INSPECCIÓN, ALMACENAJE Y TRIBUTOS]

RESPONSABILIDADES DEL CLIENTE Y DEL AGENTE
[DOCUMENTOS, DECLARACIONES, PLAZOS Y AUTORIZACIONES]

CAMBIOS, RECLAMOS Y FIRMA
[ADENDAS, SEGURO, RECLAMOS, FIRMAS Y FECHA]`,
    variables: ["case.reference", "client.name", "agent.name", "destination.address"],
  },
  {
    id: "export-moving-contract",
    family: "CONTRACTS",
    name: "Mudanza internacional de exportación",
    description: "Empaque de exportación, documentación, transporte, embarque y coordinación internacional.",
    code: "CTR.MOVE.EXPORT",
    templateName: "Contrato de exportación de mudanza",
    category: "DOCUMENT_REQUEST",
    audiences: ["CLIENT", "PAYER", "APPROVER", "AGENT"],
    channels: ["EMAIL", "PORTAL"],
    subject: "Contrato de exportación · {{case.reference}}",
    bodyText: `CONTRATO DE SERVICIO DE EXPORTACIÓN

Cliente: {{client.name}}
Caso: {{case.reference}}
Origen: {{origin.address}}
Destino: {{destination.address}}
Agente relacionado: {{agent.name}}

ALCANCE
[EMPAQUE, INVENTARIO, RECOGIDA, CONSOLIDACIÓN, DOCUMENTACIÓN Y EMBARQUE]

RUTA, PLAZOS Y TERCEROS
[MODO, PUERTOS/AEROPUERTOS, AGENTES, TIEMPOS ESTIMADOS Y EXCLUSIONES]

PRECIO Y EVENTUALIDADES
[MONEDA, FLETE, GASTOS, ALMACENAJE, DEMORA, ADUANAS Y ADENDAS]

SEGURO, RECLAMOS Y FIRMA
[COBERTURA, RESPONSABILIDAD, FIRMAS Y FECHA]`,
    variables: ["case.reference", "client.name", "origin.address", "destination.address", "agent.name"],
  },
  {
    id: "local-transport-contract",
    family: "CONTRACTS",
    name: "Transporte local o nacional",
    description: "Traslado sin asumir servicios de mudanza no incluidos expresamente.",
    code: "CTR.TRANSPORT.LOCAL",
    templateName: "Contrato de transporte local o nacional",
    category: "DOCUMENT_REQUEST",
    audiences: ["CLIENT", "PAYER", "APPROVER"],
    channels: ["EMAIL", "PORTAL"],
    subject: "Contrato de transporte · {{case.reference}}",
    bodyText: `CONTRATO DE TRANSPORTE LOCAL O NACIONAL

Cliente: {{client.name}}
Caso: {{case.reference}}
Origen: {{origin.address}}
Destino: {{destination.address}}

CARGA Y SERVICIO
[DESCRIPCIÓN, PESO/VOLUMEN, VEHÍCULO, VIAJES Y MANIPULACIÓN INCLUIDA]

FECHA, RUTA Y PRECIO
[VENTANA, DISTANCIA, RETORNO, PEAJES, COMBUSTIBLE, MONEDA Y PAGO]

EXCLUSIONES Y CAMBIOS
[EMPAQUE, ESPERAS, ACCESOS, EQUIPOS, ADENDAS Y CARGOS ADICIONALES]

RESPONSABILIDAD Y FIRMA
[CONDICIONES DE CARGA, SEGURO, RECLAMOS, FIRMAS Y FECHA]`,
    variables: ["case.reference", "client.name", "origin.address", "destination.address"],
  },
  {
    id: "contract-addendum",
    family: "CONTRACTS",
    name: "Adenda contractual",
    description: "Añade, elimina o modifica servicios, precio o plazo sin reemplazar el contrato original.",
    code: "CTR.ADDENDUM.BASE",
    templateName: "Adenda a contrato de servicio",
    category: "DOCUMENT_REQUEST",
    audiences: ["CLIENT", "PAYER", "APPROVER"],
    channels: ["EMAIL", "PORTAL"],
    subject: "Adenda contractual · {{case.reference}}",
    bodyText: `ADENDA A CONTRATO DE SERVICIO

Cliente: {{client.name}}
Caso: {{case.reference}}
Contrato original: [REFERENCIA Y VERSIÓN]

MOTIVO DEL CAMBIO
[SOLICITADO POR, FECHA, MOTIVO Y EVIDENCIA]

SERVICIOS, PLAZO Y DIFERENCIA ECONÓMICA
[AÑADIDOS, ELIMINADOS O MODIFICADOS; MONEDA; IMPUESTOS; NUEVO PLAZO]

VIGENCIA
Las cláusulas no modificadas del contrato original permanecen vigentes.

APROBACIONES
[CLIENTE, APROBACIÓN INTERNA, FIRMAS Y FECHA]`,
    variables: ["case.reference", "client.name"],
  },
  {
    id: "client-visit",
    family: "COMMUNICATIONS",
    name: "Confirmación de visita al cliente",
    description: "Confirma fecha, hora, lugar, evaluador, costo e instrucciones.",
    code: "COM.VISIT.CLIENT",
    templateName: "Confirmación de visita al cliente",
    category: "VISIT_CONFIRMATION",
    audiences: ["CLIENT"],
    channels: ["EMAIL", "WHATSAPP"],
    subject: "Visita confirmada · {{case.reference}}",
    bodyText: `Hola {{client.name}},

Confirmamos su visita para el {{survey.date}} a las {{survey.time}}.
Lugar: {{origin.address}}
Evaluador asignado: {{evaluator.name}}
Costo de la visita: {{visit.fee}}

Indicaciones: {{visit.instructions}}

Si necesita reprogramar, responda a este mensaje indicando una fecha alternativa.`,
    variables: ["case.reference", "client.name", "survey.date", "survey.time", "origin.address", "evaluator.name", "visit.fee", "visit.instructions"],
  },
  {
    id: "evaluator-assignment",
    family: "COMMUNICATIONS",
    name: "Asignación al evaluador",
    description: "Entrega al surveyor la cita, contactos y datos necesarios para llegar.",
    code: "COM.SURVEY.ASSIGNMENT",
    templateName: "Asignación de survey al evaluador",
    category: "EVALUATOR_ASSIGNMENT",
    audiences: ["EVALUATOR"],
    channels: ["INTERNAL", "WHATSAPP"],
    subject: "Nuevo survey asignado · {{case.reference}}",
    bodyText: `Hola {{evaluator.name}},

Se le ha asignado un survey para {{client.name}}.
Fecha y hora: {{survey.date}} · {{survey.time}}
Método: {{visit.method}}
Dirección: {{origin.address}}
Destino relacionado: {{destination.address}}
Booker: {{booker.name}}
Lead Account: {{leadAccount.name}}
Agente: {{agent.name}}

Qué se espera del levantamiento: {{visit.reason}}
Recursos o consideraciones: {{visit.resources}}
Instrucciones: {{visit.instructions}}`,
    variables: ["case.reference", "client.name", "evaluator.name", "survey.date", "survey.time", "visit.method", "origin.address", "destination.address", "booker.name", "leadAccount.name", "agent.name", "visit.reason", "visit.resources", "visit.instructions"],
  },
  {
    id: "staff-assignment",
    family: "COMMUNICATIONS",
    name: "Personal y vehículo asignados",
    description: "Notifica al cliente quién llegará y cómo identificar el equipo.",
    code: "COM.OPERATIONS.CREW",
    templateName: "Notificación de personal y vehículo",
    category: "CLIENT_INFORMATION_REQUEST",
    audiences: ["CLIENT"],
    channels: ["EMAIL", "WHATSAPP"],
    subject: "Equipo asignado · {{case.reference}}",
    bodyText: `Hola {{client.name}},

Para el servicio relacionado con el caso {{case.reference}} se ha asignado:

Jefe de grupo: [NOMBRE Y CONTACTO]
Personal: [NOMBRES O CANTIDAD]
Vehículo: [TIPO, MARCA, COLOR Y PLACA]
Fecha y hora prevista: [FECHA Y FRANJA HORARIA]
Dirección del servicio: {{origin.address}}

Por seguridad, valide estos datos antes de permitir el acceso.`,
    variables: ["case.reference", "client.name", "origin.address"],
  },
  {
    id: "service-evaluation",
    family: "COMMUNICATIONS",
    name: "Evaluación del servicio",
    description: "Solicita una evaluación al finalizar el servicio.",
    code: "COM.SERVICE.REVIEW",
    templateName: "Solicitud de evaluación del servicio",
    category: "CLIENT_INFORMATION_REQUEST",
    audiences: ["CLIENT"],
    channels: ["EMAIL", "WHATSAPP"],
    subject: "Cuéntenos su experiencia · {{case.reference}}",
    bodyText: `Hola {{client.name}},

El servicio correspondiente al caso {{case.reference}} ha finalizado. Su evaluación nos ayuda a mejorar.

Complete la evaluación aquí: [ENLACE DE EVALUACIÓN]

Gracias por confiar en nosotros.`,
    variables: ["case.reference", "client.name"],
  },
  {
    id: "storage-entry-authorization",
    family: "OPERATIONAL",
    name: "Autorización de entrada a almacén",
    description: "Documento interno para recibir bienes con contrato vigente.",
    code: "DOC.STORAGE.ENTRY",
    templateName: "Autorización operativa de entrada",
    category: "DOCUMENT_REQUEST",
    audiences: ["COORDINATOR", "INTERNAL_TEAM"],
    channels: ["INTERNAL"],
    subject: "Entrada autorizada · {{case.reference}}",
    bodyText: `AUTORIZACIÓN DE ENTRADA A ALMACÉN

Caso: {{case.reference}}
Cliente: {{client.name}}
Origen: {{origin.address}}

Tipo de entrada: [INICIAL / ADICIONAL]
Almacén autorizado: [ALMACÉN]
Fecha y franja: [FECHA Y HORA]
Capacidad autorizada: [VOLUMEN / ESPACIO]
Transportista, chofer, vehículo y placa: [DATOS]
Documentos esperados: [LISTADO]
Instrucciones especiales: [INSTRUCCIONES]
Responsable comercial: [NOMBRE]
Vigencia: [DESDE / HASTA]

Esta autorización no sustituye el escaneo, la inspección ni la cadena de custodia.`,
    variables: ["case.reference", "client.name", "origin.address"],
  },
]);

export function familyForTemplate(code: string): TemplateFamily {
  if (code.startsWith("CTR.")) return "CONTRACTS";
  if (code.startsWith("DOC.")) return "OPERATIONAL";
  return "COMMUNICATIONS";
}
