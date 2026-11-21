import { ExampleFields, type SetupLesson } from "@/administration/AdministrationSetupGuide";

export const TEMPLATE_SETUP_LABELS = {
  templates: "Plantillas y versiones",
  masks: "Máscaras",
  content: "Contenido y variables",
  preview: "Vista previa",
} as const;

export type TemplateSetupTopic = keyof typeof TEMPLATE_SETUP_LABELS;

export const TEMPLATE_SETUP_TOPICS: readonly TemplateSetupTopic[] = ["templates", "masks", "content", "preview"];

export const TEMPLATE_SETUP_LESSONS: Record<TemplateSetupTopic, SetupLesson> = {
  templates: {
    title: "Encuentra, actualiza y publica una plantilla",
    purpose: "El Centro de plantillas organiza los contratos, las comunicaciones y los documentos operativos por el código que identifica cada plantilla.",
    steps: [
      <>Busca en <strong>Todas</strong> o filtra por familia. Los códigos que empiezan con <strong>CTR.</strong> aparecen en Contratos y los que empiezan con <strong>DOC.</strong> en Documentos operativos. Los demás aparecen en Comunicaciones.</>,
      <>Pulsa <strong>Editar</strong> si la plantilla está en borrador. Si ya está publicada, pulsa <strong>Nueva versión</strong>, ajusta el texto y guarda el nuevo borrador con el mismo código.</>,
      <>Revisa el borrador con <strong>Vista previa</strong>. En el listado, pulsa <strong>Publicar</strong> cuando esté listo para usarse.</>,
    ],
    example: <ExampleFields rows={[
      ["Comunicaciones", "COM.VISIT.CLIENT · Confirmación de visita"],
      ["Contratos", "CTR.STORAGE.BASE · Contrato de almacenaje"],
      ["Documentos operativos", "DOC.STORAGE.ENTRY · Autorización de entrada a almacén"],
    ]} />,
    check: "Si ajustas una plantilla publicada en v1, guarda y revisa el borrador v2 antes de publicarlo.",
  },
  masks: {
    title: "Empieza con una máscara editable",
    purpose: "Una máscara trae un ejemplo de asunto, contenido, destinatarios, canales y variables para un uso concreto.",
    steps: [
      <>Pulsa <strong>Nueva plantilla</strong>. Elige la máscara que se parezca a lo que necesitas o pulsa <strong>Crear en blanco</strong> para escribir desde el inicio.</>,
      <>Comprueba el <strong>Código</strong>, el <strong>Nombre</strong> y el <strong>Tipo de uso</strong>. Si el código ya existe, edita su borrador o crea una nueva versión desde el listado. Para otra plantilla, usa un código distinto.</>,
      <>En <strong>Contenido editable</strong>, reemplaza los textos entre corchetes con las condiciones o indicaciones que correspondan.</>,
    ],
    example: <ExampleFields rows={[
      ["Máscara", "Confirmación de visita al cliente"],
      ["Código", "COM.VISIT.CLIENT"],
      ["Tipo de uso", "Confirmación de visita"],
      ["Destinatario", "Cliente"],
      ["Canales", "Correo y WhatsApp"],
    ]} />,
    check: "En una máscara de almacenaje, completa puntos como la capacidad y las condiciones de facturación. Los corchetes son recordatorios de edición.",
  },
  content: {
    title: "Personaliza el contenido con datos del caso",
    purpose: "Las variables entre llaves completan datos como el nombre del cliente, la referencia del caso o la fecha de visita.",
    steps: [
      <>Selecciona los <strong>Destinatarios</strong> y <strong>Canales</strong> que correspondan a tu mensaje. Para una confirmación, puedes marcar Cliente y Correo.</>,
      <>En <strong>Variables automáticas</strong>, marca el dato que quieres insertar. El editor añade su variable al final de <strong>Contenido editable</strong>. Muévela a la parte del texto donde se necesita.</>,
      <>Escribe el <strong>Asunto</strong> y revisa que todas las variables marcadas aparezcan en el contenido o el asunto con sus llaves completas.</>,
    ],
    example: <ExampleFields rows={[
      ["Asunto", "Visita confirmada · {{case.reference}}"],
      ["Saludo", "Hola {{client.name}},"],
      ["Mensaje", "Confirmamos su visita el {{survey.date}} a las {{survey.time}}."],
    ]} />,
    check: "Usa fecha y hora en una plantilla de visita. Para una propuesta, usa los datos de cotización, como su referencia y vigencia.",
  },
  preview: {
    title: "Revisa el resultado antes de publicar",
    purpose: "La vista previa sustituye las variables con datos de ejemplo para que puedas leer el mensaje completo.",
    steps: [
      <>Pulsa <strong>Vista previa</strong> y lee el resultado debajo del editor. Revisa el asunto, el saludo y los datos que se completaron.</>,
      <>Si queda texto entre corchetes, complétalo. Si el mensaje necesita datos de otro hito, ajusta las variables y vuelve a abrir la vista previa.</>,
      <>Pulsa <strong>Guardar borrador</strong>. Al volver al listado, usa <strong>Publicar</strong> si la versión está revisada.</>,
    ],
    example: <ExampleFields rows={[
      ["Asunto", "Visita confirmada · CASO-DEMO"],
      ["Saludo", "Hola Cliente de ejemplo,"],
      ["Mensaje", "Confirmamos su visita el 15 sep 2026 a las 09:30."],
    ]} />,
    check: "El estado Publicada indica que la versión está disponible para preparar comunicaciones.",
  },
};
