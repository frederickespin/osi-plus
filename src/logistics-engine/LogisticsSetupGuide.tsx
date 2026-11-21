import { ExampleFields, type SetupLesson } from "@/administration/AdministrationSetupGuide";
import type { TransportZoneEditorTab } from "./TransportZoneEditor";

export type LogisticsSetupTopic = TransportZoneEditorTab | "bases" | "metro" | "rules";

export const LOGISTICS_SETUP_LABELS: Record<LogisticsSetupTopic, string> = {
  bases: "Sedes operativas",
  metro: "Zona metro",
  location: "Ubicación",
  operation: "Operación y costos",
  rules: "Reglas operativas",
};

export const LOGISTICS_SETUP_LESSONS: Record<LogisticsSetupTopic, SetupLesson> = {
  bases: {
    title: "Ubica los puntos de salida",
    purpose: "Registra cada oficina, almacén o patio que se usa como origen habitual de los vehículos.",
    steps: [
      <>En <strong>Sedes</strong>, pulsa el botón <strong>Nueva sede</strong> y completa el nombre, tipo y dirección.</>,
      <>Busca la dirección o señala la salida de los vehículos en el mapa. Pulsa <strong>Guardar sede</strong>.</>,
      <>En <strong>Flota vehicular</strong>, selecciona el registro como <strong>Sede habitual</strong>.</>,
    ],
    example: <ExampleFields rows={[["Tipo", "Almacén"], ["Nombre de la sede", "Almacén Santo Domingo"], ["Punto en el mapa", "Entrada de camiones"]]} />,
    check: "Al editar el nombre o la dirección de una sede, la ficha del vehículo conserva su sede habitual.",
  },
  metro: {
    title: "Define la cobertura metropolitana",
    purpose: "Un solo perímetro permite reconocer la zona de las direcciones en las visitas y servicios.",
    steps: [
      <>Abre <strong>Zona metro</strong> y pulsa <strong>Configurar zona metro</strong>.</>,
      <>Busca una localidad como referencia o traza el perímetro en el mapa. Usa el contorno sugerido si representa tu cobertura.</>,
      <>Añade los municipios y sectores que el equipo usa al registrar direcciones. Elige <strong>Zona metro</strong> o <strong>Fuera de zona metro</strong> en cada fila.</>,
    ],
    example: <ExampleFields rows={[["Ciudad o municipio", "Santo Domingo Este"], ["Sector", "Sector validado por Logística"], ["Clasificación", "Zona metro"]]} />,
    check: "Deja Sector vacío si la clasificación corresponde a todo el municipio.",
  },
  location: {
    title: "Delimita la ciudad o el sector",
    purpose: "El perímetro permite reconocer qué perfil aplica a una dirección del caso.",
    steps: [
      <>Pulsa <strong>Nueva ciudad o sector</strong> y busca la localidad en el mapa. Elige el resultado que corresponda al municipio o sector.</>,
      <>Pulsa <strong>Usar contorno</strong> si el área sugerida coincide. También puedes marcar al menos tres puntos en el mapa. Traza los puntos en orden, sin cruzar los lados.</>,
      <>Revisa el tipo de ubicación, la ciudad y el <strong>Nombre del perfil</strong>. Si es un sector, completa también su nombre. Pasa a <strong>Operación y costos</strong> para registrar la sede y los cargos.</>,
    ],
    example: <ExampleFields rows={[
      ["Búsqueda", "Santiago de los Caballeros"],
      ["Tipo de ubicación", "Ciudad / municipio"],
      ["Ciudad", "Santiago de los Caballeros"],
      ["Nombre del perfil", "Santiago · servicios en camión"],
    ]} />,
    check: "Para usar la misma área con otros costos, pulsa Reutilizar perímetro en el listado. Puedes guardar un perfil para visitas y otro para servicios en camión.",
  },
  operation: {
    title: "Registra la sede y el costo vial",
    purpose: "La sede es el punto de partida. El perfil define qué vehículo y costos se usan para esa área.",
    steps: [
      <>Usa <strong>Usar base registrada</strong> si ya existe. Para registrar una sede nueva, escribe su nombre en <strong>Base operativa</strong> y su dirección completa en <strong>Dirección de la base</strong>. Podrás elegirla como <strong>Sede habitual</strong> en Flota vehicular después de guardar.</>,
      <>Marca <strong>Visitas presenciales</strong> o <strong>Servicios operativos</strong> según el uso. Elige la <strong>Clasificación operativa</strong> del área. Deja <strong>Tipo de vehículo</strong> vacío si el perfil aplica a todos. El perfil específico del vehículo tiene preferencia. Entre perfiles equivalentes, 101 tiene preferencia sobre 100.</>,
      <>Anota en <strong>Km viales de referencia</strong> la distancia por carretera desde la sede hasta el área. La <strong>Fuente de la distancia</strong> indica de dónde salió esa cifra, como una ruta confirmada en el mapa. Comercial usa la referencia como respaldo cuando no tiene distancia vial confirmada para el tramo desde o hacia la sede.</>,
      <>En <strong>Por renglones</strong>, pulsa <strong>Añadir renglón</strong> para combustible, peajes u otros costos del vehículo. Usa <strong>Guardar borrador</strong> para revisar. Para habilitar el perfil, selecciona <strong>Activa</strong> y pulsa <strong>Guardar versión</strong>.</>,
    ],
    example: <ExampleFields rows={[
      ["Base operativa", "International Packers · Santo Domingo"],
      ["Dirección de la base", "Dirección real de salida de la oficina o almacén"],
      ["Km viales · Fuente", "150 km · Medición vial de ejemplo"],
      ["Aplicación · Clasificación", "Servicios operativos · Fuera de zona metro"],
      ["Vehículo · Rendimiento", "Camión cerrado · 8 km/gal estadounidense"],
      ["Forma de cálculo · Moneda", "Por renglones · DOP"],
      ["Combustible", "Diésel · Por galón · 250 · Propio"],
      ["Peaje", "Peaje de ejemplo · Por paso · 200 · Desembolso"],
    ]} />,
    reference: <>
      <details>
        <summary className="cursor-pointer font-semibold text-[#0070a8]">Ejemplo de recorrido en Comercial</summary>
        <p className="mt-1">Con distancias ilustrativas de 150 km de sede a origen, 20 km de origen a destino y 150 km de regreso a sede, <strong>Recorrido diario</strong> muestra 320 km. Para dos días de ruta completa, son 640 km. Con el rendimiento del ejemplo se usan 80 galones. Combustible RD$20,000 y cuatro pasos de peaje RD$800 dan un costo vial de <strong>RD$20,800</strong>.</p>
        <p className="mt-1">Indica los pasos totales de cada recorrido, contando viajes y regresos. En una exportación, selecciona el almacén de entrega para el tramo nacional y registra los días solo en origen si la cuadrilla vuelve a la sede durante el empaque.</p>
      </details>
      <details>
        <summary className="cursor-pointer font-semibold text-[#0070a8]">Visitas y cálculo por factor</summary>
        <p className="mt-1"><strong>Visitas.</strong> Si el área tiene otro vehículo o costo para visitas, reutiliza el perímetro y marca <strong>Visitas presenciales</strong> en el nuevo perfil. El cargo al cliente se decide en Comercial.</p>
        <p className="mt-1"><strong>Por factor.</strong> Un costo base de RD$1,000 por viaje con factor 1,25 da RD$1,250. Suma los peajes aparte si la base no los incluye.</p>
      </details>
    </>,
    check: "Para que la sede aparezca en Recorrido diario del caso, guarda un perfil activo de Servicios operativos con los kilómetros de referencia y su fuente. Configura chofer, cuadrilla y viáticos en Servicios y combinaciones.",
  },
  rules: {
    title: "Define qué recursos propone el plan",
    purpose: "Una regla puede sugerir personal, tiempo, materiales, huacales o un proveedor externo. La tarifa de esos recursos se registra en Servicios y combinaciones.",
    steps: [
      <>Pulsa <strong>Nueva regla</strong>. Elige la <strong>Familia</strong> y escribe un nombre que puedas reconocer en el listado.</>,
      <>Selecciona la <strong>Modalidad</strong>. En <strong>Tipo de necesidad</strong>, escribe el identificador del recurso. En <strong>Descripción para el plan</strong>, escribe el nombre que verá el equipo y completa la cantidad.</>,
      <>Revisa el <strong>Orden de aplicación</strong>. Entre alternativas del mismo grupo, prioridad 200 prevalece sobre 100. Si empatan, especificidad 50 prevalece sobre 10. Si ambos valores coinciden, se señala un conflicto. Las reglas independientes pueden aplicarse juntas.</>,
      <>Elige <strong>Borrador</strong> y pulsa <strong>Guardar regla</strong> para practicar. Usa <strong>Nueva versión</strong> para cambiar una regla existente. Revisa el estado de la versión antes de guardar porque reemplaza la activa anterior.</>,
    ],
    example: <ExampleFields rows={[
      ["Familia", "Personal"],
      ["Nombre de la regla", "Empacadores locales"],
      ["Modalidad", "Local / Nacional"],
      ["Tipo de necesidad", "EMPACADOR"],
      ["Descripción para el plan · Cantidad", "Empacadores · 2"],
      ["Prioridad · Especificidad", "100 · 0"],
      ["Estado", "Borrador"],
    ]} />,
    reference: <details>
      <summary className="cursor-pointer font-semibold text-[#0070a8]">Ejemplo de dietas fuera de zona metro</summary>
      <p className="mt-1">Con una dieta por persona y por día, 4 personas durante 2 días requieren 8 dietas. Registra la tarifa por dieta en <strong>Servicios y combinaciones → Costos</strong> y la cantidad correspondiente en el <strong>Tarifario</strong> del paquete.</p>
    </details>,
    check: "Si activas el ejemplo, sugerirá dos empacadores en todos los casos Local / Nacional que se calculen. Para aplicar por volumen o solo fuera de zona metro se requiere una condición adicional.",
  },
};
