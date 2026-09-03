import { useRef, useState, type ComponentType } from "react";
import {
  AlertTriangle, ArrowLeft, Building2, CalendarDays, Camera,
  CheckCircle2, ChevronRight, ClipboardCheck, Clock3, FileSignature, Home,
  Info, ListChecks, MapPin, Menu, Navigation, Smartphone, Truck, UserRound,
} from "lucide-react";
import {
  SurveyInventoryWorkspace,
  SurveyReviewPanel,
  SurveySignaturePanel,
  SurveyTechnicalPanel,
  type SurveyArticle,
  type SurveyShipmentMode,
} from "./SurveyWorkflowPanels";

type SurveyStep = "AGENDA" | "INVENTORY" | "ACCESS" | "REVIEW" | "TECHNICAL" | "SIGNATURE";
type ShipmentMode = SurveyShipmentMode;
type VisitAddress = Readonly<{ city: string; sector: string; street: string; unit: string }>;
type Visit = Readonly<{ id: string; day: "Hoy" | "Mañana" | "Esta semana" | "Próxima semana"; dateLabel: string; time: string; client: string; company: string; leadAccount: string; booker: string; service: string; city: string; origin: VisitAddress; destination?: VisitAddress; instruction: string; distanceKm: number; travelMinutes: number; status: string; nearest?: boolean }>;
type CatalogItem = Readonly<{ id: string; name: string; aliases: readonly string[]; frequentRooms: readonly string[]; volumeM3: number; weightKg: number; weightSource: "Catálogo" | "Densidad"; packing: ReadonlyArray<readonly [string, number]> }>;
type Article = SurveyArticle;

const STEPS: ReadonlyArray<readonly [SurveyStep, string, ComponentType<{ className?: string }>]> = [
  ["AGENDA", "Agenda", CalendarDays], ["INVENTORY", "Inventario", Home],
  ["ACCESS", "Accesos", MapPin], ["REVIEW", "Revisión", ListChecks],
  ["TECHNICAL", "Detalle técnico", ClipboardCheck], ["SIGNATURE", "Firma", FileSignature],
];

const VISITS: readonly Visit[] = [
  { id: "VIS-021", day: "Hoy", dateLabel: "2 sep", time: "5:30 p. m.", client: "Ana María Gómez", company: "Coca-Cola", leadAccount: "SIRVA", booker: "María López · SIRVA", service: "Mudanza internacional", city: "Piantini", origin: { city: "Santo Domingo", sector: "Piantini", street: "Av. Abraham Lincoln núm. 456", unit: "Torre Central · apartamento 8-B" }, destination: { city: "Madrid", sector: "Salamanca", street: "Calle Serrano núm. 120", unit: "Apartamento 4-A" }, instruction: "Llamar 15 minutos antes. Iniciar la visita por el dormitorio principal.", distanceKm: 7, travelMinutes: 18, status: "Próxima", nearest: true },
  { id: "VIS-022", day: "Hoy", dateLabel: "2 sep", time: "7:00 p. m.", client: "Carlos Mena", company: "Cliente particular", leadAccount: "Directo", booker: "Carlos Mena · cliente", service: "Almacenaje de mobiliario", city: "Boca Chica", origin: { city: "Santo Domingo", sector: "Boca Chica", street: "Calle Duarte núm. 18", unit: "Casa 2" }, destination: { city: "Santo Domingo", sector: "Haina", street: "Almacén OSi Plus", unit: "Nave B" }, instruction: "Confirmar por WhatsApp antes de salir; el cliente tiene disponibilidad después de las 6:45 p. m.", distanceKm: 46, travelMinutes: 78, status: "Asignada" },
  { id: "VIS-023", day: "Mañana", dateLabel: "3 sep", time: "8:00 a. m.", client: "Laura Díaz", company: "Cliente particular", leadAccount: "Directo", booker: "Laura Díaz · cliente", service: "Mudanza residencial", city: "San Cristóbal", origin: { city: "San Cristóbal", sector: "Madre Vieja Norte", street: "Calle Principal núm. 32", unit: "Casa amarilla" }, destination: { city: "Santo Domingo", sector: "Bella Vista", street: "Av. Sarasota núm. 77", unit: "Apartamento 5-C" }, instruction: "Acceder por la puerta lateral; hay un perro en el patio.", distanceKm: 38, travelMinutes: 62, status: "Asignada" },
  { id: "VIS-024", day: "Mañana", dateLabel: "3 sep", time: "10:30 a. m.", client: "Roberto Castillo", company: "Grupo Castillo", leadAccount: "AGS Mobility", booker: "Elena Ruiz · AGS Mobility", service: "Exportación marítima", city: "Naco", origin: { city: "Santo Domingo", sector: "Naco", street: "Calle Fantino Falco núm. 44", unit: "Torre Sol · apartamento 10-A" }, destination: { city: "Lisboa", sector: "Parque das Nações", street: "Dirección final pendiente", unit: "Pendiente de confirmar" }, instruction: "La hora debe confirmarse con el asistente del cliente.", distanceKm: 5, travelMinutes: 15, status: "Pendiente confirmar" },
  { id: "VIS-025", day: "Mañana", dateLabel: "3 sep", time: "2:00 p. m.", client: "Isabel Rodríguez", company: "Galería IR", leadAccount: "Directo", booker: "Isabel Rodríguez · cliente", service: "Embalaje de obras de arte", city: "Bella Vista", origin: { city: "Santo Domingo", sector: "Bella Vista", street: "Calle Helios núm. 9", unit: "Local 3" }, destination: { city: "Nueva York", sector: "Manhattan", street: "Dirección del consignatario", unit: "Pendiente de unidad" }, instruction: "Usar guantes limpios y evitar fotografías de obras no incluidas.", distanceKm: 9, travelMinutes: 24, status: "Asignada" },
  { id: "VIS-026", day: "Esta semana", dateLabel: "4 sep", time: "8:30 a. m.", client: "Miguel Tejada", company: "Caribe Tecnología", leadAccount: "Crown Relocations", booker: "John Reed · Crown", service: "Mudanza corporativa", city: "Santiago", origin: { city: "Santiago", sector: "Los Jardines", street: "Av. 27 de Febrero núm. 210", unit: "Edificio CT · piso 4" }, destination: { city: "Santo Domingo", sector: "Evaristo Morales", street: "Av. Winston Churchill núm. 95", unit: "Torre Empresarial · piso 7" }, instruction: "Presentarse en recepción con identificación y lista de equipos.", distanceKm: 158, travelMinutes: 155, status: "Asignada" },
  { id: "VIS-027", day: "Esta semana", dateLabel: "4 sep", time: "1:00 p. m.", client: "Patricia Suárez", company: "Banco Continental", leadAccount: "SIRVA", booker: "Anne Miller · SIRVA", service: "Importación aérea", city: "Arroyo Hondo", origin: { city: "Santo Domingo", sector: "Arroyo Hondo", street: "Calle Camino del Norte núm. 14", unit: "Residencial Palma · casa 6" }, destination: { city: "Santo Domingo", sector: "Arroyo Hondo", street: "Misma dirección de origen", unit: "Residencial Palma · casa 6" }, instruction: "El cliente solicita una visita corta de máximo 45 minutos.", distanceKm: 13, travelMinutes: 31, status: "Asignada" },
  { id: "VIS-028", day: "Esta semana", dateLabel: "5 sep", time: "9:00 a. m.", client: "Daniel Santana", company: "DataCore Dominicana", leadAccount: "Directo corporativo", booker: "Paola Núñez · DataCore", service: "Transporte tecnológico", city: "Herrera", origin: { city: "Santo Domingo Oeste", sector: "Zona Industrial Herrera", street: "Av. Isabel Aguiar núm. 155", unit: "Nave 12" }, destination: { city: "Santo Domingo", sector: "Piantini", street: "Av. Gustavo Mejía Ricart núm. 88", unit: "Centro de datos · nivel 2" }, instruction: "Coordinar acceso técnico y validar números de serie.", distanceKm: 18, travelMinutes: 38, status: "Asignada" },
  { id: "VIS-029", day: "Esta semana", dateLabel: "5 sep", time: "11:30 a. m.", client: "Sofía Méndez", company: "Cliente particular", leadAccount: "Referido", booker: "José Méndez · referido", service: "Mudanza local", city: "Gazcue", origin: { city: "Santo Domingo", sector: "Gazcue", street: "Calle Santiago núm. 63", unit: "Apartamento 2" }, destination: { city: "Santo Domingo", sector: "Los Prados", street: "Calle Nicolás Ureña núm. 17", unit: "Casa 1" }, instruction: "Llamar al llegar; no tocar la bocina frente al edificio.", distanceKm: 8, travelMinutes: 21, status: "Asignada" },
  { id: "VIS-030", day: "Esta semana", dateLabel: "5 sep", time: "3:00 p. m.", client: "Jorge Alcántara", company: "Archivo Legal SRL", leadAccount: "Directo corporativo", booker: "Marta Pérez · Archivo Legal", service: "Almacenaje documental", city: "Haina", origin: { city: "Bajos de Haina", sector: "Zona Industrial", street: "Carretera Sánchez km 12", unit: "Nave 4" }, destination: { city: "Bajos de Haina", sector: "Zona Industrial", street: "Almacén OSi Plus", unit: "Área Record Storage" }, instruction: "El encargado de seguridad debe acompañar el conteo.", distanceKm: 31, travelMinutes: 55, status: "Asignada" },
  { id: "VIS-031", day: "Próxima semana", dateLabel: "7 sep", time: "8:00 a. m.", client: "María Fernanda Ruiz", company: "Embajada Andina", leadAccount: "AGS Mobility", booker: "Lucía Torres · AGS Mobility", service: "Exportación aérea", city: "Los Cacicazgos", origin: { city: "Santo Domingo", sector: "Los Cacicazgos", street: "Av. Enriquillo núm. 101", unit: "Residencial Mar · apartamento 9-D" }, destination: { city: "Bogotá", sector: "Chapinero", street: "Carrera 11 núm. 83-20", unit: "Apartamento 601" }, instruction: "Confirmar acceso diplomático un día antes.", distanceKm: 11, travelMinutes: 26, status: "Asignada" },
  { id: "VIS-032", day: "Próxima semana", dateLabel: "7 sep", time: "1:30 p. m.", client: "Luis Emilio Vargas", company: "Cliente particular", leadAccount: "Directo", booker: "Luis Emilio Vargas · cliente", service: "Mudanza residencial", city: "Juan Dolio", origin: { city: "San Pedro de Macorís", sector: "Juan Dolio", street: "Boulevard de Juan Dolio km 9", unit: "Residencial Coral · villa 12" }, destination: { city: "Santo Domingo", sector: "Naco", street: "Calle Rafael Augusto Sánchez núm. 25", unit: "Apartamento 6-B" }, instruction: "Solicitar autorización en la garita antes de ingresar.", distanceKm: 67, travelMinutes: 86, status: "Asignada" },
  { id: "VIS-033", day: "Próxima semana", dateLabel: "8 sep", time: "9:30 a. m.", client: "Gabriela Peña", company: "Industrias GPM", leadAccount: "Directo corporativo", booker: "Gabriela Peña · Industrias GPM", service: "Embalaje industrial", city: "Zona Industrial Herrera", origin: { city: "Santo Domingo Oeste", sector: "Zona Industrial Herrera", street: "Calle Central núm. 28", unit: "Nave 7" }, destination: { city: "Monterrey", sector: "Apodaca", street: "Parque Industrial Norte", unit: "Nave de destino pendiente" }, instruction: "Usar casco y calzado de seguridad durante la visita.", distanceKm: 20, travelMinutes: 42, status: "Asignada" },
  { id: "VIS-034", day: "Próxima semana", dateLabel: "8 sep", time: "2:30 p. m.", client: "Andrés Paredes", company: "Misión Diplomática", leadAccount: "Crown Relocations", booker: "Sarah Collins · Crown", service: "Mudanza diplomática", city: "La Romana", origin: { city: "La Romana", sector: "Casa de Campo", street: "Villas del Mar núm. 22", unit: "Villa 22" }, destination: { city: "Bruselas", sector: "Ixelles", street: "Avenue Louise núm. 180", unit: "Apartamento 5" }, instruction: "Enviar identificación del evaluador 24 horas antes.", distanceKm: 126, travelMinutes: 128, status: "Asignada" },
  { id: "VIS-035", day: "Próxima semana", dateLabel: "9 sep", time: "10:00 a. m.", client: "Natalia Cabrera", company: "Consultores NC", leadAccount: "Directo corporativo", booker: "Natalia Cabrera · Consultores NC", service: "Record storage", city: "Evaristo Morales", origin: { city: "Santo Domingo", sector: "Evaristo Morales", street: "Calle Max Henríquez Ureña núm. 41", unit: "Oficina 302" }, destination: { city: "Bajos de Haina", sector: "Zona Industrial", street: "Almacén OSi Plus", unit: "Área Record Storage" }, instruction: "La documentación confidencial no puede fotografiarse.", distanceKm: 6, travelMinutes: 17, status: "Asignada" },
];

const CATALOG_ITEMS: readonly CatalogItem[] = [
  { id: "SOFA", name: "Sofá de 3 plazas", aliases: ["sofá", "mueble"], frequentRooms: ["Sala"], volumeM3: 1.9, weightKg: 72, weightSource: "Catálogo", packing: [["Cartón corrugado", 8], ["Plástico burbuja", 12], ["Cinta", 2]] },
  { id: "PAINTING", name: "Cuadro enmarcado", aliases: ["cuadro", "pintura", "obra"], frequentRooms: ["Sala", "Comedor", "Estudio"], volumeM3: 0.18, weightKg: 9, weightSource: "Catálogo", packing: [["Foam", 2], ["Cartón corrugado", 2], ["Esquineros", 4]] },
  { id: "DINING", name: "Mesa de comedor", aliases: ["mesa"], frequentRooms: ["Comedor", "Terraza"], volumeM3: 1.35, weightKg: 58, weightSource: "Catálogo", packing: [["Manta", 3], ["Stretch film", 1]] },
  { id: "LAMP", name: "Lámpara de pie", aliases: ["lámpara", "lampara"], frequentRooms: ["Sala", "Dormitorio principal", "Estudio"], volumeM3: 0.22, weightKg: 7, weightSource: "Catálogo", packing: [["Plástico burbuja", 3], ["Cartón corrugado", 2]] },
  { id: "BED", name: "Cama queen", aliases: ["cama", "colchón", "colchon"], frequentRooms: ["Dormitorio principal", "Dormitorio"], volumeM3: 1.75, weightKg: 86, weightSource: "Densidad", packing: [["Funda de colchón", 1], ["Stretch film", 2], ["Manta", 2]] },
  { id: "DESK", name: "Escritorio ejecutivo", aliases: ["escritorio", "mesa oficina"], frequentRooms: ["Estudio", "Dormitorio"], volumeM3: 0.82, weightKg: 41, weightSource: "Catálogo", packing: [["Manta", 2], ["Stretch film", 1]] },
];

const INITIAL_ARTICLES: readonly Article[] = [
  { id: "LINE-SOFA", catalogId: "SOFA", room: "Sala", name: "Sofá de 3 plazas", quantity: 1, volumeM3: 1.9, weightKg: 72, weightSource: "Catálogo", mode: "Marítimo", packing: CATALOG_ITEMS[0].packing, condition: "Buen estado", flags: [], photoCount: 0 },
  { id: "LINE-PAINTING", catalogId: "PAINTING", room: "Sala", name: "Cuadro enmarcado", quantity: 3, volumeM3: 0.18, weightKg: 9, weightSource: "Medido", mode: "Aéreo", packing: CATALOG_ITEMS[1].packing, condition: "Daño preexistente", flags: ["Caja de madera", "Frágil"], dimensions: { lengthCm: 118, widthCm: 9, heightCm: 86 }, photoCount: 1, note: "Desgaste visible en esquina inferior." },
  { id: "LINE-DINING", catalogId: "DINING", room: "Comedor", name: "Mesa de comedor", quantity: 1, volumeM3: 1.35, weightKg: 58, weightSource: "Catálogo", mode: "Almacenaje", packing: CATALOG_ITEMS[2].packing, condition: "Buen estado", flags: ["Desarmar"], photoCount: 0 },
];

const cubicFeet = (m3: number) => m3 * 35.3147;
const pounds = (kg: number) => kg * 2.20462;
function ArrivalControl({ visit, arrivalRecorded, clientConfirmed, onArrival, onConfirm, onStart }: Readonly<{ visit: Visit; arrivalRecorded: boolean; clientConfirmed: boolean; onArrival(): void; onConfirm(): void; onStart(): void }>) {
  return (
    <section className="mt-3 border-t border-white/15 pt-3" data-testid="arrival-control">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[10px] font-bold text-white"><Clock3 className="h-3.5 w-3.5" />Hora acordada · {visit.time}</span>
        <span className="text-[8px] text-blue-200">±10 min.</span>
      </div>
      {!arrivalRecorded ? (
        <button type="button" onClick={onArrival} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md bg-sky-500 px-3 py-2 text-[10px] font-black text-white">
          <Navigation className="h-3.5 w-3.5" />Registrar llegada
        </button>
      ) : !clientConfirmed ? (
        <>
          <p role="status" className="mt-2 text-[9px] leading-4 text-blue-100">Llegada registrada dentro de la tolerancia con ubicación.</p>
          <button type="button" onClick={onConfirm} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md bg-white px-3 py-2 text-[10px] font-black text-[#003b70]">
            <UserRound className="h-3.5 w-3.5" />Cliente confirma llegada
          </button>
        </>
      ) : (
        <div className="mt-2">
          <span role="status" className="flex items-center gap-1 text-[10px] font-black text-emerald-300"><CheckCircle2 className="h-4 w-4" />Puntual · confirmado</span>
          <button type="button" onClick={onStart} className="mt-2 w-full rounded-md bg-emerald-500 px-3 py-2 text-[10px] font-black text-white">Iniciar Survey</button>
        </div>
      )}
    </section>
  );
}

function AddressSummary({ label, address }: Readonly<{ label: "Origen" | "Destino"; address?: VisitAddress }>) {
  return (
    <div className="border-t border-white/10 py-2">
      <span className="block text-[8px] font-black uppercase tracking-wider text-sky-200">{label}</span>
      {address ? <><strong className="mt-0.5 block text-[10px]">{address.city} · {address.sector}</strong><span className="block text-[9px] leading-4 text-blue-100">{address.street}</span><span className="block text-[9px] leading-4 text-blue-100">{address.unit}</span></> : <strong className="mt-0.5 block text-[10px] text-amber-200">Pendiente de confirmar</strong>}
    </div>
  );
}

function VisitContextPanel({ visit, step, arrivalRecorded, clientConfirmed, totalVolume, totalWeight, onArrival, onConfirm, onStart }: Readonly<{ visit: Visit; step: SurveyStep; arrivalRecorded: boolean; clientConfirmed: boolean; totalVolume: number; totalWeight: number; onArrival(): void; onConfirm(): void; onStart(): void }>) {
  return (
    <aside className="rounded-xl bg-[#003b70] p-4 text-white" data-testid="visit-context">
      <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full bg-amber-400 text-[#003b70]"><UserRound className="h-5 w-5" /></span><div><strong className="block text-sm">Ana Evaluadora</strong><span className="text-[10px] text-blue-200">15 visitas asignadas</span></div></div>
      <div className="mt-4 border-t border-white/15 pt-3">
        <span className="text-[9px] font-black uppercase tracking-wider text-blue-200">{step === "AGENDA" ? "Próxima visita" : "Visita activa"}</span>
        <strong className="mt-1 block text-sm">{visit.client}</strong>
        <p className="text-[10px] text-blue-100">{visit.id} · {visit.service}</p>
      </div>
      <dl className="mt-2 grid grid-cols-[62px_1fr] gap-x-2 gap-y-1 text-[9px]">
        <dt className="text-blue-200">Empresa</dt><dd className="font-bold">{visit.company}</dd>
        <dt className="text-blue-200">Lead account</dt><dd>{visit.leadAccount}</dd>
        <dt className="text-blue-200">Booker</dt><dd>{visit.booker}</dd>
      </dl>
      <div className="mt-2">
        <AddressSummary label="Origen" address={visit.origin} />
        <AddressSummary label="Destino" address={visit.destination} />
      </div>
      <div className="border-t border-white/10 py-2">
        <span className="block text-[8px] font-black uppercase tracking-wider text-sky-200">Preferencia o instrucción</span>
        <p className="mt-0.5 text-[9px] leading-4 text-blue-100">{visit.instruction || "Sin instrucciones registradas."}</p>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-2 text-[9px]">
        <span className="flex items-center gap-1"><Clock3 className="h-3 w-3" />{visit.day} · {visit.time}</span>
        <span>{visit.distanceKm} km · {visit.travelMinutes} min.</span>
      </div>
      {step === "AGENDA" && <ArrivalControl visit={visit} arrivalRecorded={arrivalRecorded} clientConfirmed={clientConfirmed} onArrival={onArrival} onConfirm={onConfirm} onStart={onStart} />}
      {step !== "AGENDA" && <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-white/10 p-3"><div><span className="block text-[9px] text-blue-200">Volumen</span><strong className="text-sm">{totalVolume.toFixed(2)} m³</strong><small className="block text-[8px] text-blue-200">{cubicFeet(totalVolume).toFixed(1)} ft³</small></div><div><span className="block text-[9px] text-blue-200">Peso ref.</span><strong className="text-sm">{totalWeight.toFixed(0)} kg</strong><small className="block text-[8px] text-blue-200">{pounds(totalWeight).toFixed(0)} lb</small></div></div>}
      <p className="mt-3 flex items-center gap-1.5 text-[9px] text-blue-100"><Smartphone className="h-3.5 w-3.5" />Borrador local · sincronización pendiente</p>
    </aside>
  );
}
function AgendaPanel({ selectedVisit, onSelect }: Readonly<{ selectedVisit: Visit; onSelect(visit: Visit): void }>) {
  const [filter, setFilter] = useState<"TODAS" | "HOY" | "DISTANTES">("TODAS");
  const visits = VISITS.filter((visit) => filter === "TODAS" || (filter === "HOY" ? visit.day === "Hoy" : visit.distanceKm >= 30));
  return <section className="space-y-3" data-testid="survey-agenda"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-sm font-black text-[#003b70]">15 visitas asignadas</h2><p className="text-[10px] text-slate-500">Ordenadas por la fecha y hora acordadas.</p></div><div className="flex gap-1">{(["TODAS", "HOY", "DISTANTES"] as const).map((value) => <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded px-2.5 py-1.5 text-[9px] font-black ${filter === value ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-600"}`}>{value === "TODAS" ? "Todas" : value === "HOY" ? "Hoy" : "Distantes"}</button>)}</div></div><div className="max-h-[500px] overflow-y-auto rounded-lg border border-slate-200 bg-white" data-testid="visit-list">{visits.map((visit, index) => { const distant = visit.distanceKm >= 30; const showGroup = index === 0 || visits[index - 1]?.day !== visit.day; const selected = selectedVisit.id === visit.id; return <div key={visit.id}>{showGroup && <div className="sticky top-0 z-10 border-y border-slate-200 bg-slate-100 px-3 py-1.5 text-[9px] font-black uppercase tracking-wider text-slate-500 first:border-t-0">{visit.day}</div>}<button type="button" aria-current={visit.nearest ? "true" : undefined} aria-pressed={selected} onClick={() => onSelect(visit)} className={`grid w-full grid-cols-[68px_minmax(102px,1fr)_82px_14px] items-center gap-1 border-b border-slate-100 px-2 py-2.5 text-left last:border-b-0 sm:grid-cols-[86px_minmax(150px,1fr)_108px_24px] sm:gap-2 sm:px-3 ${selected ? "bg-sky-50 ring-1 ring-inset ring-sky-300" : "hover:bg-slate-50"}`}><div><strong className={`block text-[11px] sm:text-xs ${visit.nearest ? "text-sky-800" : "text-slate-800"}`}>{visit.time}</strong><span className="text-[9px] text-slate-500">{visit.dateLabel}</span>{visit.nearest && <span className="mt-1 block w-fit rounded bg-sky-600 px-1 py-0.5 text-[7px] font-black uppercase text-white sm:px-1.5 sm:text-[8px]">Más próxima</span>}</div><div className="min-w-0"><strong className="block truncate text-[11px] sm:text-xs">{visit.client}</strong><span className="block truncate text-[9px] text-slate-500 sm:text-[10px]">{visit.service}</span><span className="mt-0.5 block truncate text-[8px] text-slate-500 sm:text-[9px]">{visit.id} · {visit.status}</span></div><div className={`min-w-0 rounded px-1.5 py-1.5 text-[8px] sm:px-2 sm:text-[9px] ${distant ? "bg-amber-50 text-amber-900" : "bg-slate-50 text-slate-600"}`}><span className="flex min-w-0 items-center gap-1 font-bold"><MapPin className="h-3 w-3 shrink-0" /><span className="truncate">{visit.city}</span></span><span className="mt-0.5 block whitespace-nowrap">{visit.distanceKm} km · {visit.travelMinutes} min</span>{distant && <span className="mt-1 flex items-center gap-1 font-black"><AlertTriangle className="h-3 w-3 shrink-0" /><span className="sm:hidden">Alerta</span><span className="hidden sm:inline">Salida anticipada</span></span>}</div><ChevronRight className="h-3.5 w-3.5 text-slate-400 sm:h-4 sm:w-4" /></button></div>; })}</div><p className="flex items-start gap-1.5 text-[10px] text-slate-500"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />Las alertas combinan distancia, zona y tiempo estimado. El evaluador sólo ve sus visitas asignadas.</p></section>;
}

const ACCESS_ROWS = [
  ["Escaleras", "Pisos y tiempo adicional", false, true], ["Elevador de pasajeros", "Disponibilidad para la operación", false, true],
  ["Elevador de carga", "Capacidad y horario", true, false], ["No cabe en elevador", "Revisar medidas y ruta manual", false, true],
  ["Puertas o pasillos estrechos", "Posible desmontaje o izaje", false, true], ["Acarreo largo", "Distancia desde el camión", true, false],
  ["Parqueo restringido", "Permiso, espera o transbordo", true, true], ["Muelle de carga", "Facilidad disponible", true, false],
  ["Horario restringido", "Ventana permitida", true, false], ["Permiso requerido", "Gestión y costo asociados", false, true],
  ["Grúa o izaje", "Recurso externo o propio", false, true], ["Transbordo", "Vehículo adicional", false, false],
] as const;

function AccessPanel() {
  const originCameraRef = useRef<HTMLInputElement>(null);
  const destinationCameraRef = useRef<HTMLInputElement>(null);
  const [accessPhotos, setAccessPhotos] = useState({ Origen: 0, Destino: 0 });
  const recordAccessPhotos = (
    point: "Origen" | "Destino",
    files: FileList | null,
  ) => {
    const count = files?.length || 0;
    if (count) {
      setAccessPhotos((current) => ({
        ...current,
        [point]: current[point] + count,
      }));
    }
  };

  return (
    <section className="space-y-3" data-testid="survey-access">
      <div className="grid gap-2 sm:grid-cols-2">
        {([
          { point: "Origen", floor: 6, access: "Elevador de carga" },
          { point: "Destino", floor: 3, access: "Escalera" },
        ] as const).map((site) => (
          <article
            key={site.point}
            className="rounded-lg border border-slate-200 bg-white p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={`grid h-6 w-6 place-items-center rounded text-[10px] font-black ${site.point === "Origen" ? "bg-sky-100 text-sky-800" : "bg-indigo-100 text-indigo-800"}`}
                >
                  {site.point[0]}
                </span>
                <strong className="text-sm">{site.point}</strong>
              </div>
              <input
                ref={
                  site.point === "Origen"
                    ? originCameraRef
                    : destinationCameraRef
                }
                data-testid={`access-camera-${site.point.toLowerCase()}`}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(event) => {
                  recordAccessPhotos(site.point, event.currentTarget.files);
                  event.currentTarget.value = "";
                }}
              />
              <button
                type="button"
                onClick={() =>
                  (site.point === "Origen"
                    ? originCameraRef
                    : destinationCameraRef
                  ).current?.click()
                }
                aria-label={`Activar cámara de ${site.point.toLowerCase()}`}
                title={`Fotografiar acceso de ${site.point.toLowerCase()}`}
                className={`relative grid h-8 w-8 place-items-center rounded-full border ${site.point === "Origen" ? "border-sky-300 bg-sky-50 text-sky-700" : "border-indigo-300 bg-indigo-50 text-indigo-700"}`}
              >
                <Camera className="h-4 w-4" />
                {accessPhotos[site.point] > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-emerald-700 px-1 text-[8px] font-black text-white"
                  >
                    {accessPhotos[site.point]}
                  </span>
                )}
              </button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label>
                <span className="block text-[9px] font-black uppercase text-slate-500">
                  Piso
                </span>
                <input
                  type="number"
                  defaultValue={site.floor}
                  className="mt-1 h-8 w-full rounded border border-slate-300 px-2 text-xs"
                />
              </label>
              <label>
                <span className="block text-[9px] font-black uppercase text-slate-500">
                  Acceso principal
                </span>
                <input
                  value={site.access}
                  readOnly
                  className="mt-1 h-8 w-full rounded border border-slate-300 bg-slate-50 px-2 text-xs"
                />
              </label>
            </div>
          </article>
        ))}
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="grid grid-cols-[minmax(140px,1fr)_54px_54px] items-center bg-slate-100 px-3 py-2 text-[9px] font-black uppercase text-slate-500 sm:grid-cols-[170px_minmax(150px,1fr)_70px_70px]">
          <span>Condición</span>
          <span className="hidden sm:block">Qué representa</span>
          <span className="text-center">Origen</span>
          <span className="text-center">Destino</span>
        </div>
        {ACCESS_ROWS.map(([label, detail, origin, destination]) => (
          <div
            key={label}
            className="grid grid-cols-[minmax(140px,1fr)_54px_54px] items-center border-t border-slate-100 px-3 py-2 text-[10px] sm:grid-cols-[170px_minmax(150px,1fr)_70px_70px]"
          >
            <strong>{label}</strong>
            <span className="hidden text-slate-500 sm:block">{detail}</span>
            <span className="text-center">
              <input
                aria-label={`${label} en origen`}
                type="checkbox"
                defaultChecked={origin}
              />
            </span>
            <span className="text-center">
              <input
                aria-label={`${label} en destino`}
                type="checkbox"
                defaultChecked={destination}
              />
            </span>
          </div>
        ))}
      </div>
      <div
        className="grid gap-2 lg:grid-cols-2"
        data-testid="building-access-catalog"
      >
        <article className="rounded-lg border border-sky-200 bg-sky-50 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-sky-800" />
              <div>
                <strong className="block text-xs text-[#003b70]">
                  Torre Empresarial Piantini
                </strong>
                <span className="text-[9px] text-slate-500">
                  Perfil interno del edificio · Origen
                </span>
              </div>
            </div>
            <span className="text-[9px] font-bold text-sky-800">
              {6 + accessPhotos.Origen} fotos
            </span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-[9px]">
            <span>4 visitas verificadas</span>
            <span>6 fotos históricas</span>
            <span>Elevador de carga</span>
            <span>Parqueo restringido</span>
          </div>
        </article>
        <article className="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-indigo-800" />
            <strong className="text-xs text-[#003b70]">
              Aprendizaje de zona
            </strong>
          </div>
          <p className="mt-2 text-[10px] text-slate-600">
            Cada visita agrega una versión fechada de facilidades,
            inconvenientes y evidencias. Los futuros análisis de zonas usan
            datos agrupados sin exponer al cliente.
          </p>
        </article>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[10px] text-amber-950">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <strong>Destino · piso 3 por escalera:</strong> aumenta tiempo y
            esfuerzo según la regla configurada.
          </p>
        </div>
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[10px] text-amber-950">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <strong>Origen · elevador sobre piso 5:</strong> añade tiempo
            operativo sin fijar aquí el precio.
          </p>
        </div>
      </div>
      <p className="text-[10px] text-slate-500">
        El Motor Logístico convierte estas condiciones en minutos, recursos,
        advertencias y conceptos para Costos y Cotización.
      </p>
    </section>
  );
}

export default function SurveyVisualPreview() {
  const [step, setStep] = useState<SurveyStep>("AGENDA");
  const [selectedVisit, setSelectedVisit] = useState<Visit>(VISITS[0]);
  const [arrivalRecorded, setArrivalRecorded] = useState(false);
  const [clientConfirmed, setClientConfirmed] = useState(false);
  const [articles, setArticles] = useState<readonly Article[]>(INITIAL_ARTICLES);
  const [inventoryRoom, setInventoryRoom] = useState("Sala");
  const [inventoryMode, setInventoryMode] = useState<ShipmentMode>("Marítimo");
  const [inventoryModeFilter, setInventoryModeFilter] = useState<ShipmentMode | null>(null);
  const totalVolume = articles.reduce((sum, item) => sum + item.volumeM3 * item.quantity, 0);
  const totalWeight = articles.reduce((sum, item) => sum + item.weightKg * item.quantity, 0);
  const selectVisit = (visit: Visit) => { setSelectedVisit(visit); setArrivalRecorded(false); setClientConfirmed(false); };
  return <div className="min-h-screen bg-[#edf2f7] text-slate-800" data-testid="crm-survey-visual-preview"><header className="sticky top-0 z-20 border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-3 py-2"><div className="flex min-w-0 items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#003b70] font-black text-white">OS</span><div className="min-w-0"><strong className="block truncate text-sm text-[#003b70]">OSi Survey</strong><span className="block truncate text-[10px] uppercase tracking-wider text-slate-500">Terminal móvil de evaluación</span></div></div><div className="flex gap-1"><button type="button" className="grid h-9 w-9 place-items-center rounded-md border border-slate-300 lg:hidden" aria-label="Abrir menú" title="Abrir menú"><Menu className="h-4 w-4" /></button><button type="button" className="grid h-9 w-9 place-items-center rounded-md border border-slate-300" aria-label="Volver a la Ficha del Caso" title="Volver a la Ficha del Caso"><ArrowLeft className="h-4 w-4" /></button></div></div></header><main className="mx-auto grid max-w-7xl gap-3 p-3 lg:grid-cols-[245px_minmax(0,1fr)]"><VisitContextPanel visit={selectedVisit} step={step} arrivalRecorded={arrivalRecorded} clientConfirmed={clientConfirmed} totalVolume={totalVolume} totalWeight={totalWeight} onArrival={() => setArrivalRecorded(true)} onConfirm={() => setClientConfirmed(true)} onStart={() => setStep("INVENTORY")} /><section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-[#f8fafc] shadow-sm"><header className="border-b border-slate-200 bg-white px-3 py-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-[9px] font-black uppercase tracking-[.18em] text-sky-700">{step === "AGENDA" ? "Agenda del visitador" : `Survey presencial · ${selectedVisit.id}`}</p><h1 className="mt-1 text-lg font-black text-[#003b70]">{step === "AGENDA" ? "Visitas programadas" : selectedVisit.client}</h1></div><span className="rounded bg-amber-50 px-2 py-1 text-[9px] font-bold text-amber-900">Datos visuales · no productivos</span></div></header><nav role="tablist" aria-label="Secciones del Survey" className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white p-1.5">{STEPS.map(([value, label, Icon]) => <button key={value} type="button" role="tab" aria-selected={step === value} onClick={() => setStep(value)} className={`flex shrink-0 items-center gap-1.5 rounded px-2.5 py-2 text-[10px] font-bold ${step === value ? "bg-sky-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}><Icon className="h-3.5 w-3.5" />{label}</button>)}</nav><div className="p-3 sm:p-4">{step === "AGENDA" ? <AgendaPanel selectedVisit={selectedVisit} onSelect={selectVisit} /> : step === "INVENTORY" ? <SurveyInventoryWorkspace articles={articles} room={inventoryRoom} mode={inventoryMode} modeFilter={inventoryModeFilter} onRoomChange={setInventoryRoom} onModeChange={setInventoryMode} onClearModeFilter={() => setInventoryModeFilter(null)} onChange={setArticles} /> : step === "ACCESS" ? <AccessPanel /> : step === "REVIEW" ? <SurveyReviewPanel articles={articles} onNavigate={({ room, mode, filterMode }) => { setInventoryRoom(room); setInventoryMode(mode); setInventoryModeFilter(filterMode ? mode : null); setStep("INVENTORY"); }} /> : step === "TECHNICAL" ? <SurveyTechnicalPanel articles={articles} /> : <SurveySignaturePanel client={selectedVisit.client} articles={articles} />}</div><footer className="flex items-center justify-between border-t border-slate-200 bg-white px-3 py-2 text-[10px] text-slate-500"><span>{step === "AGENDA" ? "Agenda actualizada 5:12 p. m." : "Guardado 5:24 p. m."}</span><span className="flex items-center gap-1"><Truck className="h-3.5 w-3.5" />{step === "AGENDA" ? "Ruta del día" : "Origen evaluado"}</span></footer></section></main></div>;
}
