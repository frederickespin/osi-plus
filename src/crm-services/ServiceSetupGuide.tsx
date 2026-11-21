import { ExampleFields, type SetupLesson } from "@/administration/AdministrationSetupGuide";

export const SERVICE_SETUP_LABELS = {
  PRICING: "Tarifario",
  COSTS: "Costos",
  CATALOG: "Servicios",
  MODES: "Modalidades",
  PACKAGES: "Operación",
  MATERIALS: "Políticas de materiales",
} as const;

export type ServiceSetupTab = keyof typeof SERVICE_SETUP_LABELS;

const EXAMPLE_PACKAGE = "Mudanza local de 1 a 6 m³";
export const SERVICE_SETUP_ORDER: readonly ServiceSetupTab[] = ["MODES", "CATALOG", "COSTS", "PACKAGES", "MATERIALS", "PRICING"];

export const SERVICE_SETUP_LESSONS: Record<ServiceSetupTab, SetupLesson> = {
  MODES: {
    title: "Dónde se ofrece el servicio",
    purpose: "La modalidad identifica el alcance del trabajo. Una mudanza dentro del país usa Local / Nacional.",
    steps: [
      <>En <strong>Lista</strong>, abre <strong>Local / Nacional</strong> o usa <strong>+</strong> si ese alcance está disponible para crear.</>,
      <>Completa el nombre, elige <strong>Publicada</strong> y pulsa <strong>✓ Guardar modalidad</strong>.</>,
      <>Con el servicio ya creado, abre <strong>Compatibilidad</strong> y marca la modalidad en su fila. Cada cambio se guarda al marcar la casilla.</>,
    ],
    example: <ExampleFields rows={[["Alcance", "Local / Nacional"], ["Nombre", "Local / Nacional"], ["Estado", "Publicada"], ["Compatibilidad de Mudanza local", "Local / Nacional marcada"]]} />,
    check: "Al crear el paquete, Local / Nacional permite seleccionar Mudanza local como servicio principal.",
  },
  CATALOG: {
    title: "Qué puede ofrecer Comercial",
    purpose: "Cada servicio tiene una categoría, un rol en el caso y las modalidades en que se ofrece.",
    steps: [
      <>Pulsa <strong>+ Nuevo servicio</strong>. Escribe el nombre, selecciona la categoría y marca al menos una modalidad.</>,
      <>Elige <strong>Principal</strong> si identifica la necesidad del cliente, <strong>Complementario</strong> si acompaña otro servicio, o <strong>Ambos</strong> si puede cumplir los dos roles.</>,
      <>Pulsa <strong>✓ Guardar servicio</strong>. Para habilitar Empaque con Mudanza local, registra Empaque y luego márcalo en <strong>Complementarios permitidos</strong> al editar Mudanza local.</>,
    ],
    example: <ExampleFields rows={[["Nombre", "Mudanza local"], ["Categoría", "Mudanzas"], ["Rol en el caso", "Principal"], ["Modalidad", "Local / Nacional"], ["Complementario", "Empaque · Empaque y embalaje"]]} />,
    check: "En planes cuenta las veces que el servicio aparece en planes guardados, incluidas las versiones anteriores de un mismo caso.",
  },
  COSTS: {
    title: "Cuánto cuesta cada componente",
    purpose: "Aquí se registra el costo de una unidad. En el Tarifario se define cuántas unidades usa el paquete.",
    steps: [
      <>Pulsa <strong>+ Nuevo componente</strong>. Completa el nombre, familia y tipo (propio, externo o desembolso), según quién presta el servicio o a quién se paga.</>,
      <>Escribe la unidad, la moneda y el costo por esa unidad. Si Comercial también puede vender el componente por separado, completa <strong>Venta adic.</strong>.</>,
      <>Pulsa <strong>✓ Guardar costo</strong> y repite con los componentes que usarás en el ejemplo.</>,
    ],
    example: <ExampleFields rows={[["Nombre", "Caja de cartón"], ["Familia · Tipo", "Materiales · Propio"], ["Unidad · Moneda", "caja · DOP"], ["Costo unit. · Venta adic.", "100 · 160"], ["Empacador", "Personal · Propio · jornada · RD$1.000"], ["Camión local", "Transporte · Propio · viaje · RD$2.500"]]} />,
    check: "Con costo unitario RD$100, 3 cajas cuestan RD$300 al paquete. La venta adicional de una caja tiene su propio precio de RD$160.",
  },
  PACKAGES: {
    title: "Qué recursos necesita un paquete",
    purpose: "La operación define los servicios incluidos y lo que se prevé usar para ejecutarlos.",
    steps: [
      <>Pulsa <strong>+ Nuevo paquete operativo</strong> o edita el paquete que ya tengas. Selecciona el servicio principal y la modalidad.</>,
      <>Abre <strong>Servicios complementarios</strong> y marca los que correspondan. En <strong>Recursos previstos</strong> pulsa <strong>+</strong>, llena la fila y guárdala con <strong>✓</strong>.</>,
      <>Para Personal, Material o Equipo, usa la referencia de un recurso de su catálogo. Cuando la configuración esté lista, elige <strong>Publicado</strong> y pulsa <strong>Guardar versión</strong>.</>,
    ],
    example: <ExampleFields rows={[["Nombre del paquete", EXAMPLE_PACKAGE], ["Servicio · Modalidad", "Mudanza local · Local / Nacional"], ["Servicio complementario", "Empaque"], ["Duración", "Duración estimada · 4 horas"], ["Vehículo", "Camión local · 1 · unidad"]]} />,
    check: "El paquete publicado queda disponible en Tarifario para configurar su precio.",
  },
  MATERIALS: {
    title: "Cómo se usa y cobra el material",
    purpose: "La política indica qué se consume, qué regresa y qué uso genera un cargo.",
    steps: [
      <>Pulsa <strong>+ Nueva política</strong>. Ponle un nombre y selecciona la combinación, modalidad o servicio al que aplica.</>,
      <>En <strong>Composición y cargos</strong>, elige el tipo y el recurso del catálogo. Completa <strong>Clase</strong>, <strong>Uso</strong> y <strong>Cargo</strong>. Usa <strong>Agregar fila</strong> para el segundo recurso.</>,
      <>Deja los porcentajes en blanco si solo defines el tratamiento de cada recurso. Si registras una distribución, haz que sumen 100 %. Pulsa <strong>Guardar política</strong> y usa el estado <strong>Borrador</strong> mientras revisas.</>,
    ],
    example: <ExampleFields rows={[["Nombre", "Materiales de mudanza local"], ["Combinación", EXAMPLE_PACKAGE], ["Caja de cartón", "Material · Embalaje · Consumo · Incluido"], ["Colcha reutilizable", "Activo · Protección · Devolución · Incluido"]]} />,
    check: "La caja se consume y su costo se incluye en el paquete. La colcha debe regresar. Los importes se configuran en Costos y Tarifario.",
  },
  PRICING: {
    title: "Cómo se calcula y publica el precio",
    purpose: "El tarifario combina costos, cantidades, margen de venta y el mínimo que verá Comercial.",
    steps: [
      <>Abre la tarifa del paquete publicado. Si aún no existe, pulsa <strong>+ Nuevo paquete</strong>, elige modalidad y servicio principal y pulsa <strong>✓ Configurar tarifa</strong>.</>,
      <>En <strong>Componentes</strong>, agrega los costos registrados y define el cálculo de cada fila. Completa la moneda y los márgenes. El <strong>Margen mín.</strong> establece el umbral para autorizar ajustes.</>,
      <>En <strong>Tramos</strong>, indica el volumen máximo y su mínimo de venta. En <strong>Peso y ruta</strong>, deja desmarcado <strong>Incluir transporte por ruta</strong> si ya agregaste el costo del camión. Prueba el volumen en <strong>Simular</strong> antes de pulsar <strong>Publicar tarifa</strong>.</>,
    ],
    example: <>
      <ExampleFields rows={[["Paquete", EXAMPLE_PACKAGE], ["Moneda · Margen venta · Mín.", "DOP · 20 % · 15 %"], ["Empacador", "Cantidad fija · 2"], ["Camión local", "Por viaje según capacidad · 6 m³"], ["Caja de cartón", "Por m³ · 0,5 · Red. marcada"], ["Tramo", "Hasta 6 m³ · mínimo RD$6.500"]]} />
      <p className="mt-2">Para <strong>5 m³</strong> se calculan 2 jornadas de empacador, 1 viaje y 3 cajas. Costo <strong>RD$4.800</strong>, precio por margen <strong>RD$6.000</strong> y venta estimada <strong>RD$6.500</strong> por el mínimo.</p>
    </>,
    reference: <details>
      <summary className="cursor-pointer font-semibold text-[#0070a8]">Ejemplo de peso para flete</summary>
      <p className="mt-1"><strong>Aéreo.</strong> En Peso y ruta, un divisor de 6.000 y un volumen de 1 m³ dan 166,67 kg volumétricos. Con 100 kg brutos y redondeo al kg superior, se cotizan 167 kg.</p>
      <p className="mt-1"><strong>Marítimo.</strong> Con densidad de 100 kg/m³ y 3 m³, el peso estimado es 300 kg cuando falta el peso bruto. Si la tarifa está en CWT, cada CWT equivale a 100 lb.</p>
    </details>,
    check: "En Comercial, selecciona el paquete publicado. Los componentes con precio adicional se pueden agregar por separado.",
  },
};
