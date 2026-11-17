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
