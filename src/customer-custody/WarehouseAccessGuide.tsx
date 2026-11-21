import { ExampleFields, type SetupLesson } from "@/administration/AdministrationSetupGuide";

export const WAREHOUSE_GUIDE_TOPICS = ["ACCESS", "RECEPTION", "CATALOGS"] as const;
export type WarehouseGuideTopic = typeof WAREHOUSE_GUIDE_TOPICS[number];

export const WAREHOUSE_GUIDE_LABELS: Record<WarehouseGuideTopic, string> = {
  ACCESS: "Accesos",
  RECEPTION: "Recepción",
  CATALOGS: "Catálogos",
};

export const WAREHOUSE_GUIDE_LESSONS: Record<WarehouseGuideTopic, SetupLesson> = {
  ACCESS: {
    title: "Asigna permiso para una tarea",
    purpose: "Asigna el acceso operativo por inventario, aunque la persona ya tenga un rol general. Cada acceso especifica el alcance y los trabajos permitidos.",
    steps: [
      <>En <strong>Usuario</strong>, elige a la persona activa. En <strong>Inventario</strong>, elige <strong>Materiales internos</strong>, <strong>Herramientas y equipos</strong> o <strong>Efectos de clientes</strong> según lo que vaya a manejar.</>,
      <>Selecciona <strong>Almacén</strong> y, si el trabajo se limita a un área, selecciona <strong>Ubicación</strong>. Para toda esa sede, usa <strong>Todo el almacén</strong>. La opción <strong>Todos los almacenes</strong> amplía el alcance a todas las sedes.</>,
      <>Marca en <strong>Trabajos permitidos</strong> las tareas que correspondan y pulsa <strong>Asignar acceso</strong>. Incluye <strong>Consultar</strong> si la persona necesita ver el inventario.</>,
      <>Usa <strong>Desactivar</strong> en la fila cuando termine la asignación. Con <strong>Activar</strong> puedes restablecer el acceso de esa fila.</>,
    ],
    example: <ExampleFields rows={[
      ["Usuario", "Ana Pérez (ejemplo)"],
      ["Inventario", "Efectos de clientes"],
      ["Almacén", "Almacén Santo Domingo"],
      ["Ubicación", "Área de recepción"],
      ["Trabajos permitidos", "Consultar y Recibir"],
    ]} />,
    check: "Antes de cerrar, comprueba en la tabla que el inventario, el alcance y los trabajos coincidan con la asignación y que esté Activo.",
  },
  RECEPTION: {
    title: "Configura la descarga y los excedentes",
    purpose: "El tiempo de descarga y la política de excedentes se guardan por almacén.",
    steps: [
      <>Selecciona el <strong>Almacén</strong> y escribe en <strong>Descarga (min)</strong> el tiempo esperado de una descarga.</>,
      <>En <strong>Salida temporal de excedentes</strong>, selecciona la ubicación activa del almacén donde se retendrán los bultos que no caben en el espacio contratado.</>,
      <>Indica en <strong>Gracia (horas)</strong> cuánto tiempo tienen para retirar cada bulto desde que se coloca en el área temporal. Completa <strong>Cargo diario</strong> y <strong>Moneda</strong> y pulsa <strong>Guardar</strong>.</>,
    ],
    example: <ExampleFields rows={[
      ["Almacén", "Almacén Santo Domingo"],
      ["Descarga (min)", "90"],
      ["Salida temporal de excedentes", "Área temporal de excedentes"],
      ["Gracia (horas)", "24"],
      ["Cargo diario", "300"],
      ["Moneda", "DOP"],
    ]} />,
    check: "Vencida la gracia, el cargo se aplica por bulto y por cada día o fracción de demora. En el ejemplo, 25 horas desde que se coloca el bulto en el área son 24 horas de gracia y una hora de demora, con un cargo de RD$300.",
  },
  CATALOGS: {
    title: "Mantén las opciones de recepción",
    purpose: "Configura las opciones que el equipo elige al identificar artículos, empaques, condiciones y localizaciones de daños.",
    steps: [
      <>Abre <strong>Catálogos</strong> y elige <strong>Ubic.</strong> (localizaciones de daños), <strong>Cond.</strong> (condiciones), <strong>Artíc.</strong> (nombres de artículos) o <strong>Empaq.</strong> (formas de empaque).</>,
      <>Para agregar una opción, escríbela en <strong>Nueva opción</strong> y pulsa <strong>Agregar opción</strong> (+). Usa el lápiz para cambiar el nombre o el botón de encendido para desactivar la opción.</>,
      <>Para cargar varias opciones, pulsa <strong>Descargar plantilla del catálogo</strong>. Completa la columna <strong>Nombre</strong> y carga el archivo con <strong>Importar listado al catálogo activo</strong>.</>,
      <>Revisa en <strong>Vista previa de importación</strong> qué filas se crearán, actualizarán u omitirán. Corrige los errores del archivo antes de pulsar <strong>Importar</strong>.</>,
    ],
    example: <ExampleFields rows={[
      ["Catálogo", "Empaq. · Formas de empaque"],
      ["Nueva opción", "Caja especial"],
      ["Fila en la plantilla", "Caja especial · CAJA_ESPECIAL · OTHER · ACTIVO · 80"],
    ]} />,
    check: "Verifica que la opción quede en el catálogo esperado. Las recepciones anteriores conservan el texto con que se registraron.",
  },
};
