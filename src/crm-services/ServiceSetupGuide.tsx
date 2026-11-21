import { useId, useState, type ReactNode } from "react";
import { BookOpen, X } from "lucide-react";
import { AdministrationIconAction } from "@/administration/AdministrationHelp";
import { COMPACT_FORM_FIELD } from "@/components/ui/compact-form";

export const SERVICE_SETUP_LABELS = {
  PRICING: "Tarifario",
  COSTS: "Costos",
  CATALOG: "Servicios",
  MODES: "Modalidades",
  PACKAGES: "Operación",
  MATERIALS: "Políticas de materiales",
} as const;

export type ServiceSetupTab = keyof typeof SERVICE_SETUP_LABELS;

type Lesson = {
  title: string;
  purpose: string;
  steps: readonly ReactNode[];
  example: ReactNode;
  check: string;
};

const EXAMPLE_PACKAGE = "Mudanza local de 1 a 6 m³";
const SETUP_ORDER: readonly ServiceSetupTab[] = ["MODES", "CATALOG", "COSTS", "PACKAGES", "MATERIALS", "PRICING"];

function ExampleFields({ rows }: { rows: readonly (readonly [string, string])[] }) {
  return <dl className="divide-y divide-sky-100">
    {rows.map(([field, value]) => <div key={field} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-x-2 py-1">
      <dt className="text-slate-600">{field}</dt><dd className="font-medium text-slate-900">{value}</dd>
    </div>)}
  </dl>;
}

const LESSONS: Record<ServiceSetupTab, Lesson> = {
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
    check: "En Comercial, selecciona el paquete publicado. Los componentes con precio adicional se pueden agregar por separado.",
  },
};

export default function ServiceSetupGuide({ id, activeTab, allowedTabs, onClose }: {
  id: string;
  activeTab: ServiceSetupTab;
  allowedTabs: readonly ServiceSetupTab[];
  onClose(): void;
}) {
  const titleId = useId();
  const topicId = useId();
  const [pinnedTopic, setPinnedTopic] = useState<ServiceSetupTab | "">("");
  const topic = pinnedTopic && allowedTabs.includes(pinnedTopic) ? pinnedTopic : activeTab;
  const lesson = LESSONS[topic];

  return <aside id={id} aria-labelledby={titleId}
    className="min-w-0 self-start rounded border border-slate-200 bg-white xl:sticky xl:top-3 xl:order-2">
    <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-1.5">
      <h3 id={titleId} className="flex items-center gap-1.5 text-sm font-bold text-[#003366]">
        <BookOpen aria-hidden="true" className="size-4 shrink-0" />Guía de configuración
      </h3>
      <AdministrationIconAction label="Cerrar guía" onClick={onClose} className="border-transparent">
        <X aria-hidden="true" className="size-4" />
      </AdministrationIconAction>
    </div>
    <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700">
      <label htmlFor={topicId}>Tema de ayuda</label>
      <select id={topicId} className={COMPACT_FORM_FIELD + " min-w-0 flex-1"} value={pinnedTopic}
        onChange={(event) => setPinnedTopic(event.target.value as ServiceSetupTab | "")}>
        <option value="">Seguir la pestaña</option>
        {allowedTabs.map((tab) => <option key={tab} value={tab}>{SERVICE_SETUP_LABELS[tab]}</option>)}
      </select>
    </div>
    <div key={topic} role="region" aria-label={"Guía de " + SERVICE_SETUP_LABELS[topic]} tabIndex={0}
      className="max-h-[min(15rem,38dvh)] space-y-3 overflow-y-auto px-3 py-2 text-xs leading-5 text-slate-700 xl:max-h-[calc(100dvh-7.5rem)]">
      <details>
        <summary className="cursor-pointer font-semibold text-[#0070a8]">Orden recomendado</summary>
        <p className="mt-1">{SETUP_ORDER.filter((tab) => allowedTabs.includes(tab)).map((tab) => SERVICE_SETUP_LABELS[tab]).join(" → ")}</p>
      </details>
      <div>
        <h4 className="font-bold text-slate-900">{lesson.title}</h4>
        <p>{lesson.purpose}</p>
      </div>
      <ol className="list-decimal space-y-1.5 pl-4">
        {lesson.steps.map((step, index) => <li key={index}>{step}</li>)}
      </ol>
      <div className="rounded border border-sky-100 bg-sky-50 px-2.5 py-1.5">
        <h5 className="font-bold text-[#003366]">Ejemplo de llenado</h5>
        {lesson.example}
      </div>
      {topic === "PRICING" && <details>
        <summary className="cursor-pointer font-semibold text-[#0070a8]">Ejemplo de peso para flete</summary>
        <p className="mt-1"><strong>Aéreo.</strong> En Peso y ruta, un divisor de 6.000 y un volumen de 1 m³ dan 166,67 kg volumétricos. Con 100 kg brutos y redondeo al kg superior, se cotizan 167 kg.</p>
        <p className="mt-1"><strong>Marítimo.</strong> Con densidad de 100 kg/m³ y 3 m³, el peso estimado es 300 kg cuando falta el peso bruto. Si la tarifa está en CWT, cada CWT equivale a 100 lb.</p>
      </details>}
      <p>{lesson.check}</p>
    </div>
  </aside>;
}
