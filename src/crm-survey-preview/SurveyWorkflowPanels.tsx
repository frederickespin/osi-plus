import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  Camera, Check, CheckCircle2, ChevronLeft, ChevronRight, Download, FileSignature,
  Eraser, Eye, Image, Minus, Package, Plus, Ruler, Search, Settings2, Trash2, X,
} from "lucide-react";
import { downloadSurveyPdf as downloadStructuredSurveyPdf, previewSurveyPdf, type SignatureStroke, type SurveyReportContext } from "./SurveyPdf";

export type SurveyShipmentMode = "Marítimo" | "Aéreo" | "Terrestre" | "Local" | "Almacenaje";
export type SurveyArticleCondition = "Buen estado" | "Desgaste visible" | "Averiado" | "Daño preexistente";
export type SurveyArticleFlag = "Caja de madera" | "Frágil" | "Armar" | "Desarmar" | "Recomendar grúa" | "Valioso" | "Sobredimensionado";
export type SurveyDimensions = Readonly<{ lengthCm: number; widthCm: number; heightCm: number }>;
export type SurveyArticle = Readonly<{
  id: string;
  catalogId: string;
  room: string;
  name: string;
  quantity: number;
  volumeM3: number;
  weightKg: number;
  weightSource: "Catálogo" | "Medido" | "Densidad";
  mode: SurveyShipmentMode;
  packing: ReadonlyArray<readonly [string, number]>;
  condition: SurveyArticleCondition;
  flags: readonly SurveyArticleFlag[];
  dimensions?: SurveyDimensions;
  photoCount: number;
  note?: string;
}>;

type CatalogItem = Readonly<{
  id: string;
  name: string;
  aliases: readonly string[];
  frequentRooms: readonly string[];
  volumeM3: number;
  weightKg: number;
  weightSource: "Catálogo" | "Densidad";
  packing: ReadonlyArray<readonly [string, number]>;
}>;

const ROOMS = ["Sala", "Comedor", "Dormitorio principal", "Dormitorio", "Estudio", "Cocina", "Terraza", "Depósito"] as const;
const MODES: readonly SurveyShipmentMode[] = ["Marítimo", "Aéreo", "Terrestre", "Local", "Almacenaje"];
const CONDITIONS: readonly SurveyArticleCondition[] = ["Buen estado", "Desgaste visible", "Averiado", "Daño preexistente"];
const FLAG_OPTIONS: ReadonlyArray<readonly [SurveyArticleFlag, string]> = [
  ["Caja de madera", "Huacal"], ["Frágil", "Frágil"], ["Armar", "Arm."],
  ["Desarmar", "Des."], ["Recomendar grúa", "Grúa"], ["Valioso", "AV"],
  ["Sobredimensionado", "SD"],
];
const CATALOG: readonly CatalogItem[] = [
  { id: "SOFA", name: "Sofá de 3 plazas", aliases: ["sofá", "mueble"], frequentRooms: ["Sala"], volumeM3: 1.9, weightKg: 72, weightSource: "Catálogo", packing: [["Cartón corrugado", 8], ["Plástico burbuja", 12], ["Cinta", 2]] },
  { id: "PAINTING", name: "Cuadro enmarcado", aliases: ["cuadro", "pintura", "obra"], frequentRooms: ["Sala", "Comedor", "Estudio"], volumeM3: 0.18, weightKg: 9, weightSource: "Catálogo", packing: [["Foam", 2], ["Cartón corrugado", 2], ["Esquineros", 4]] },
  { id: "DINING", name: "Mesa de comedor", aliases: ["mesa"], frequentRooms: ["Comedor", "Terraza"], volumeM3: 1.35, weightKg: 58, weightSource: "Catálogo", packing: [["Manta", 3], ["Stretch film", 1]] },
  { id: "LAMP", name: "Lámpara de pie", aliases: ["lámpara", "lampara"], frequentRooms: ["Sala", "Dormitorio principal", "Estudio"], volumeM3: 0.22, weightKg: 7, weightSource: "Catálogo", packing: [["Plástico burbuja", 3], ["Cartón corrugado", 2]] },
  { id: "BED", name: "Cama queen", aliases: ["cama", "colchón", "colchon"], frequentRooms: ["Dormitorio principal", "Dormitorio"], volumeM3: 1.75, weightKg: 86, weightSource: "Densidad", packing: [["Funda de colchón", 1], ["Stretch film", 2], ["Manta", 2]] },
  { id: "DESK", name: "Escritorio ejecutivo", aliases: ["escritorio", "mesa oficina"], frequentRooms: ["Estudio", "Dormitorio"], volumeM3: 0.82, weightKg: 41, weightSource: "Catálogo", packing: [["Manta", 2], ["Stretch film", 1]] },
];

const cubicFeet = (m3: number) => m3 * 35.3147;
const pounds = (kg: number) => kg * 2.20462;
const inches = (cm: number) => cm / 2.54;

function QuantityStepper({ value, onChange }: Readonly<{ value: number; onChange(value: number): void }>) {
  const update = (next: number) => onChange(Math.max(1, Math.min(999, next)));
  return <div className="flex items-center justify-center gap-1"><button type="button" aria-label="Disminuir cantidad" onClick={() => update(value - 1)} className="grid h-8 w-8 place-items-center rounded-full border border-slate-300"><Minus className="h-3.5 w-3.5" /></button><input aria-label="Cantidad" inputMode="numeric" value={value} onFocus={(event) => event.currentTarget.select()} onChange={(event) => update(Number(event.target.value.replace(/\D/g, "").slice(0, 3)) || 1)} className="h-8 w-12 rounded border border-slate-300 text-center text-xs font-bold" /><button type="button" aria-label="Aumentar cantidad" onClick={() => update(value + 1)} className="grid h-8 w-8 place-items-center rounded-full border border-slate-300"><Plus className="h-3.5 w-3.5" /></button></div>;
}

type MeasurementUnit = "cm" | "in";

function CatalogSettings({ measurementUnit, onMeasurementUnitChange }: Readonly<{ measurementUnit: MeasurementUnit; onMeasurementUnitChange(unit: MeasurementUnit): void }>) {
  return (
    <div className="space-y-2 rounded-lg border border-indigo-200 bg-indigo-50 p-3" data-testid="catalog-configuration">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-indigo-100 bg-white px-2 py-1.5">
        <span><strong className="block text-[10px] text-[#003b70]">Preferencia de medidas</strong><small className="text-[8px] text-slate-500">Configuración del evaluador</small></span>
        <div role="group" aria-label="Unidad preferida" className="flex rounded border border-slate-300 p-0.5">
          <button type="button" aria-pressed={measurementUnit === "cm"} onClick={() => onMeasurementUnitChange("cm")} className={`rounded px-2 py-1 text-[9px] font-bold ${measurementUnit === "cm" ? "bg-[#003b70] text-white" : "text-slate-600"}`}>Centímetros (cm)</button>
          <button type="button" aria-pressed={measurementUnit === "in"} onClick={() => onMeasurementUnitChange("in")} className={`rounded px-2 py-1 text-[9px] font-bold ${measurementUnit === "in" ? "bg-[#003b70] text-white" : "text-slate-600"}`}>Pulgadas (pulg)</button>
        </div>
      </div>
      <div className="grid gap-2 lg:grid-cols-2">
        <article className="rounded border border-slate-200 bg-white p-2">
          <div className="flex items-center justify-between"><strong className="text-xs">Áreas configurables</strong><button type="button" aria-label="Añadir área" className="grid h-7 w-7 place-items-center rounded bg-[#003b70] text-white"><Plus className="h-3.5 w-3.5" /></button></div>
          {ROOMS.slice(0, 5).map((room) => <div key={room} className="flex items-center justify-between border-t border-slate-100 py-1.5 text-[9px]"><span>{room}</span><span className="text-emerald-700">Activa</span></div>)}
        </article>
        <article className="rounded border border-slate-200 bg-white p-2">
          <strong className="text-xs">Artículo y recetas</strong>
          <div className="mt-2 grid grid-cols-[1fr_70px_70px] gap-1"><input defaultValue="Lámpara de pie" className="h-8 rounded border border-slate-300 px-2 text-[10px]" /><input defaultValue="0.22" aria-label="Volumen de catálogo" className="h-8 rounded border border-slate-300 px-2 text-[10px]" /><input placeholder="kg" aria-label="Peso de catálogo" className="h-8 rounded border border-slate-300 px-2 text-[10px]" /></div>
          <p className="mt-1 text-[8px] text-slate-500">Peso vacío: densidad según aéreo o marítimo/terrestre.</p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-[9px]"><span><strong className="block text-emerald-800">Receta local</strong>Mantas · plástico</span><span><strong className="block text-indigo-800">Receta internacional</strong>Cartón · papel · burbuja</span></div>
        </article>
      </div>
    </div>
  );
}
type InventoryProps = Readonly<{
  articles: readonly SurveyArticle[];
  room: string;
  mode: SurveyShipmentMode;
  modeFilter: SurveyShipmentMode | null;
  onRoomChange(room: string): void;
  onModeChange(mode: SurveyShipmentMode): void;
  onClearModeFilter(): void;
  onChange(articles: readonly SurveyArticle[]): void;
}>;

export function SurveyInventoryWorkspace({ articles, room, mode, modeFilter, onRoomChange, onModeChange, onClearModeFilter, onChange }: InventoryProps) {
  const articleInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);
  const [query, setQuery] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [condition, setCondition] = useState<SurveyArticleCondition>("Buen estado");
  const [flags, setFlags] = useState<readonly SurveyArticleFlag[]>([]);
  const [note, setNote] = useState("");
  const [photoCount, setPhotoCount] = useState(0);
  const [selectedCatalogId, setSelectedCatalogId] = useState<string | null>(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [measurementUnit, setMeasurementUnit] = useState<MeasurementUnit>("cm");
  const [saving, setSaving] = useState(false);
  const selectedCatalog = CATALOG.find((item) => item.id === selectedCatalogId);
  const filtered = articles.filter((item) => item.room === room && (!modeFilter || item.mode === modeFilter));
  const selectedIndex = editingId ? articles.findIndex((item) => item.id === editingId) : -1;
  const normalizedQuery = query.trim().toLocaleLowerCase("es");
  const suggestions = CATALOG.filter((item) => !normalizedQuery || item.name.toLocaleLowerCase("es").includes(normalizedQuery) || item.aliases.some((alias) => alias.includes(normalizedQuery))).sort((a, b) => Number(b.frequentRooms.includes(room)) - Number(a.frequentRooms.includes(room))).slice(0, 5);
  const needsDamagePhoto = condition === "Averiado" || condition === "Daño preexistente";
  const showMeasurements = flags.includes("Caja de madera") || flags.includes("Sobredimensionado");

  const resetEditor = () => { setEditingId(null); setDeleteConfirm(false); setSelectedCatalogId(null); setQuery(""); setQuantity(1); setCondition("Buen estado"); setFlags([]); setNote(""); setPhotoCount(0); setSuggestionsOpen(false); };
  const editArticle = (item: SurveyArticle) => { setEditingId(item.id); setDeleteConfirm(false); setSelectedCatalogId(item.catalogId); setQuery(item.name); setQuantity(item.quantity); setCondition(item.condition); setFlags(item.flags); setNote(item.note || ""); setPhotoCount(item.photoCount); onRoomChange(item.room); onModeChange(item.mode); };
  const toggleFlag = (flag: SurveyArticleFlag) => setFlags((current) => current.includes(flag) ? current.filter((value) => value !== flag) : [...current, flag]);
  const save = () => {
    if (!selectedCatalog || savingRef.current || (needsDamagePhoto && photoCount === 0)) return;
    savingRef.current = true;
    setSaving(true);
    const prior = articles.find((item) => item.id === editingId);
    const next: SurveyArticle = { id: editingId || `LINE-${selectedCatalog.id}-${articles.length + 1}`, catalogId: selectedCatalog.id, room, name: selectedCatalog.name, quantity, volumeM3: prior?.volumeM3 || selectedCatalog.volumeM3, weightKg: prior?.weightKg || selectedCatalog.weightKg, weightSource: prior?.weightSource || selectedCatalog.weightSource, mode, packing: prior?.packing || selectedCatalog.packing, condition, flags, dimensions: showMeasurements ? prior?.dimensions || { lengthCm: 120, widthCm: 60, heightCm: 80 } : undefined, photoCount, note: note.trim() || undefined };
    onChange(editingId ? articles.map((item) => item.id === editingId ? next : item) : [...articles, next]);
    resetEditor();
    window.setTimeout(() => { savingRef.current = false; setSaving(false); articleInputRef.current?.focus(); }, 0);
  };
  const navigate = (direction: -1 | 1) => { if (!articles.length) return; const index = selectedIndex < 0 ? (direction === 1 ? 0 : articles.length - 1) : (selectedIndex + direction + articles.length) % articles.length; onClearModeFilter(); editArticle(articles[index]); };
  const currentPosition = selectedIndex < 0 ? 0 : selectedIndex + 1;
  const pieces = filtered.reduce((sum, item) => sum + item.quantity, 0);
  const measurementValues = measurementUnit === "cm"
    ? [["Largo", "120", "47.2 pulg"], ["Ancho", "60", "23.6 pulg"], ["Alto", "80", "31.5 pulg"]] as const
    : [["Largo", "47.2", "120 cm"], ["Ancho", "23.6", "60 cm"], ["Alto", "31.5", "80 cm"]] as const;
  const measurementSuffix = measurementUnit === "cm" ? "cm" : "pulg";

  return <section className="space-y-3" data-testid="survey-inventory"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-sm font-black text-[#003b70]">Inventario rápido</h2><p className="text-[10px] text-slate-500">Área y modo permanecen activos hasta que los cambies.</p></div><div className="flex items-center gap-1"><span className="mr-1 text-[9px] font-black text-[#003b70]" data-testid="global-article-position">Artículo {currentPosition || "–"} / {articles.length}</span><button type="button" aria-label="Artículo anterior" onClick={() => navigate(-1)} disabled={!articles.length} className="grid h-8 w-8 place-items-center rounded border border-slate-300 bg-white disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" /></button><button type="button" aria-label="Artículo siguiente" onClick={() => navigate(1)} disabled={!articles.length} className="grid h-8 w-8 place-items-center rounded border border-slate-300 bg-white disabled:opacity-40"><ChevronRight className="h-3.5 w-3.5" /></button><button type="button" onClick={() => setSettingsOpen((value) => !value)} aria-label="Configurar catálogos" className="grid h-8 w-8 place-items-center rounded border border-slate-300 bg-white"><Settings2 className="h-4 w-4" /></button></div></div>{settingsOpen && <CatalogSettings measurementUnit={measurementUnit} onMeasurementUnitChange={setMeasurementUnit} />}<div className="rounded-lg border border-slate-200 bg-white p-3"><div className="grid gap-2 md:grid-cols-[145px_125px_minmax(180px,1fr)_auto]"><label><span className="block text-[9px] font-black uppercase text-slate-500">Área</span><select aria-label="Área o habitación" value={room} onChange={(event) => { onRoomChange(event.target.value); resetEditor(); }} className="mt-1 h-9 w-full rounded border border-slate-300 px-2 text-xs">{ROOMS.map((value) => <option key={value}>{value}</option>)}</select></label><label><span className="block text-[9px] font-black uppercase text-slate-500">Modo</span><select aria-label="Modo de traslado" value={mode} onChange={(event) => { onModeChange(event.target.value as SurveyShipmentMode); onClearModeFilter(); }} className="mt-1 h-9 w-full rounded border border-slate-300 px-2 text-xs">{MODES.map((value) => <option key={value}>{value}</option>)}</select></label><label className="relative"><span className="block text-[9px] font-black uppercase text-slate-500">Artículo</span><span className="relative mt-1 block"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input ref={articleInputRef} aria-label="Buscar artículo del catálogo" value={query} onChange={(event) => { setSelectedCatalogId(null); setQuery(event.target.value); setSuggestionsOpen(true); }} className="h-9 w-full rounded border border-slate-300 pl-9 pr-2 text-xs" placeholder="Empieza a escribir…" /></span>{query && suggestionsOpen && <div className="absolute z-20 mt-1 w-full overflow-hidden rounded border border-slate-200 bg-white shadow-lg" data-testid="article-suggestions">{suggestions.map((item) => <button key={item.id} type="button" onClick={() => { setSelectedCatalogId(item.id); setQuery(item.name); setSuggestionsOpen(false); }} className="flex w-full justify-between border-b border-slate-100 px-3 py-2 text-left text-[10px]"><span><strong className="block">{item.name}</strong><small>{item.frequentRooms.join(" · ")}</small></span>{item.frequentRooms.includes(room) && <span className="text-sky-700">Frecuente aquí</span>}</button>)}{suggestions.length === 0 && <button type="button" onClick={() => { setSettingsOpen(true); setSuggestionsOpen(false); }} className="flex w-full items-center gap-2 px-3 py-2 text-[10px] font-bold text-[#003b70]"><Plus className="h-3.5 w-3.5" />Añadir “{query}” al catálogo</button>}</div>}</label><label><span className="block text-center text-[9px] font-black uppercase text-slate-500">Cantidad</span><div className="mt-1"><QuantityStepper value={quantity} onChange={setQuantity} /></div></label></div><div className="mt-2 grid gap-2 sm:grid-cols-[165px_40px_minmax(0,1fr)]"><label><span className="block text-[9px] font-black uppercase text-slate-500">Condición</span><select aria-label="Condición del artículo" value={condition} onChange={(event) => setCondition(event.target.value as SurveyArticleCondition)} className="mt-1 h-9 w-full rounded border border-slate-300 px-2 text-xs">{CONDITIONS.map((value) => <option key={value}>{value}</option>)}</select></label><div><span className="block text-center text-[9px] font-black uppercase text-slate-500">Foto</span><input ref={cameraInputRef} data-testid="article-camera-input" type="file" accept="image/*" capture="environment" className="sr-only" onChange={(event) => { const count = event.currentTarget.files?.length || 0; if (count) setPhotoCount((value) => value + count); event.currentTarget.value = ""; }} /><button type="button" onClick={() => cameraInputRef.current?.click()} aria-label="Activar cámara para el artículo" title="Activar cámara" className={`relative mt-1 grid h-9 w-9 place-items-center rounded-full border ${photoCount ? "border-emerald-300 bg-emerald-100 text-emerald-800" : needsDamagePhoto ? "border-rose-300 bg-rose-50 text-rose-700" : "border-sky-300 bg-sky-50 text-sky-700"}`}><Camera className="h-4 w-4" />{photoCount > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-emerald-700 px-1 text-[8px] font-black text-white">{photoCount}</span>}</button></div><div><span className="block text-[9px] font-black uppercase text-slate-500">Condiciones especiales</span><div className="mt-1 flex h-9 items-center gap-1 overflow-x-auto">{FLAG_OPTIONS.map(([flag, short]) => <label key={flag} title={flag} className={`flex shrink-0 items-center gap-1 rounded px-2 py-1.5 text-[9px] font-semibold ${flags.includes(flag) ? "bg-sky-100 text-sky-900" : "bg-slate-100 text-slate-600"}`}><input aria-label={flag} type="checkbox" checked={flags.includes(flag)} onChange={() => toggleFlag(flag)} />{short}</label>)}</div></div></div><div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"><input aria-label="Nota opcional del artículo" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Nota opcional del artículo…" className="h-9 rounded border border-slate-300 px-3 text-[10px]" /><button type="button" onClick={save} disabled={!selectedCatalog || saving || (needsDamagePhoto && photoCount === 0)} className="flex h-9 items-center justify-center gap-1 rounded bg-[#003b70] px-4 text-[10px] font-bold text-white disabled:bg-slate-300">{editingId ? "Actualizar" : "Próximo"}<ChevronRight className="h-3.5 w-3.5" /></button></div>{needsDamagePhoto && photoCount === 0 && <p role="alert" className="mt-2 text-[9px] font-bold text-rose-700">La condición seleccionada requiere una fotografía.</p>}{showMeasurements && <div className="mt-2 grid grid-cols-3 gap-2 border-t border-slate-200 pt-2" data-testid="conditional-measurements">{measurementValues.map(([label, value, equivalent]) => <label key={label}><span className="block text-[8px] font-black uppercase text-slate-500">{label}</span><span className="relative mt-1 block"><input key={`${label}-${measurementUnit}`} aria-label={`${label} en ${measurementUnit === "cm" ? "centímetros" : "pulgadas"}`} defaultValue={value} className="h-8 w-full rounded border border-slate-300 px-2 pr-10 text-xs" /><span className="pointer-events-none absolute right-2 top-2 text-[9px] font-bold text-slate-500">{measurementSuffix}</span></span><small className="text-[8px] text-slate-500">Equiv. {equivalent}</small></label>)}</div>}</div><div className="overflow-hidden rounded-lg border border-slate-200 bg-white"><header className="flex items-center justify-between gap-2 bg-slate-100 px-3 py-2"><strong className="text-[10px] text-[#003b70]">{room} · {filtered.length} {filtered.length === 1 ? "renglón" : "renglones"} · {pieces} {pieces === 1 ? "pieza" : "piezas"}{modeFilter ? ` · ${modeFilter}` : ""}</strong>{modeFilter && <button type="button" onClick={onClearModeFilter} className="flex items-center gap-1 rounded bg-white px-2 py-1 text-[8px]"><X className="h-3 w-3" />Quitar modo</button>}</header><div className="grid grid-cols-[minmax(120px,1fr)_38px_82px_18px] px-3 py-1.5 text-[8px] font-black uppercase text-slate-500 sm:grid-cols-[minmax(160px,1fr)_45px_110px_100px_18px]"><span>Artículo</span><span>Cant.</span><span>Volumen</span><span className="hidden sm:block">Peso</span><span /></div>{filtered.map((item) => <button key={item.id} type="button" onClick={() => editArticle(item)} className={`grid w-full grid-cols-[minmax(120px,1fr)_38px_82px_18px] items-center border-t border-slate-100 px-3 py-2 text-left text-[10px] sm:grid-cols-[minmax(160px,1fr)_45px_110px_100px_18px] ${editingId === item.id ? "bg-sky-50" : "bg-white"}`}><span className="min-w-0"><strong className="block truncate">{item.name}</strong><small className={`${item.condition === "Averiado" || item.condition === "Daño preexistente" ? "font-bold text-rose-700" : "text-slate-500"}`}>{item.condition}{item.note ? " · nota" : ""}{item.photoCount ? ` · ${item.photoCount} foto` : ""}</small></span><strong>{item.quantity}</strong><span>{(item.volumeM3 * item.quantity).toFixed(2)} m³<small className="block text-[8px] text-slate-500">{cubicFeet(item.volumeM3 * item.quantity).toFixed(1)} ft³</small></span><span className="hidden sm:block">{(item.weightKg * item.quantity).toFixed(0)} kg<small className="block text-[8px] text-slate-500">{pounds(item.weightKg * item.quantity).toFixed(0)} lb</small></span><ChevronRight className="h-3.5 w-3.5 text-slate-400" /></button>)}{filtered.length === 0 && <p className="px-3 py-5 text-center text-[10px] text-slate-500">No hay artículos en esta área y modo.</p>}</div>{editingId && <div className="flex items-center justify-end gap-2 rounded border border-sky-200 bg-sky-50 p-2 text-[10px]"><span className="mr-auto font-bold text-sky-900">Editando el artículo seleccionado</span>{deleteConfirm ? <><button type="button" onClick={() => setDeleteConfirm(false)} className="rounded px-2 py-1">Cancelar</button><button type="button" onClick={() => { onChange(articles.filter((item) => item.id !== editingId)); resetEditor(); }} className="rounded bg-rose-700 px-2 py-1 font-bold text-white">Confirmar eliminación</button></> : <><button type="button" onClick={resetEditor} aria-label="Cancelar edición" className="grid h-7 w-7 place-items-center rounded border border-slate-300 bg-white"><X className="h-3.5 w-3.5" /></button><button type="button" onClick={() => setDeleteConfirm(true)} aria-label="Eliminar artículo" className="grid h-7 w-7 place-items-center rounded border border-rose-300 bg-white text-rose-700"><Trash2 className="h-3.5 w-3.5" /></button></>}</div>}<p className="text-[10px] text-slate-500">El listado se filtra por el área activa. El evaluador no selecciona materiales de empaque.</p></section>;
}

type NavigateTarget = Readonly<{ room: string; mode: SurveyShipmentMode; filterMode: boolean }>;

function groupedRows(articles: readonly SurveyArticle[], key: "room" | "mode") {
  const groups = new Map<string, SurveyArticle[]>();
  articles.forEach((item) => groups.set(item[key], [...(groups.get(item[key]) || []), item]));
  return [...groups.entries()].map(([label, items]) => ({ label, items, lines: items.length, pieces: items.reduce((sum, item) => sum + item.quantity, 0), volume: items.reduce((sum, item) => sum + item.volumeM3 * item.quantity, 0), weight: items.reduce((sum, item) => sum + item.weightKg * item.quantity, 0) }));
}

function GroupReport({ title, rows, onOpen }: Readonly<{ title: string; rows: ReturnType<typeof groupedRows>; onOpen(row: ReturnType<typeof groupedRows>[number]): void }>) {
  return <article className="overflow-hidden rounded-lg border border-slate-200 bg-white"><header className="bg-slate-100 px-3 py-2 text-xs font-black text-[#003b70]">{title}</header><div className="grid grid-cols-[1fr_38px_42px_68px_68px] px-3 py-1.5 text-[8px] font-black uppercase text-slate-500"><span>Grupo</span><span>Reng.</span><span>Piezas</span><span>Vol.</span><span>Peso</span></div>{rows.map((row) => <button type="button" key={row.label} onClick={() => onOpen(row)} className="grid w-full grid-cols-[1fr_38px_42px_68px_68px] items-center border-t border-slate-100 px-3 py-2 text-left text-[9px] hover:bg-sky-50"><strong>{row.label}</strong><span>{row.lines}</span><span>{row.pieces}</span><span>{row.volume.toFixed(2)} m³<small className="block text-[7px] text-slate-500">{cubicFeet(row.volume).toFixed(1)} ft³</small></span><span>{row.weight.toFixed(0)} kg<small className="block text-[7px] text-slate-500">{pounds(row.weight).toFixed(0)} lb</small></span></button>)}</article>;
}

export function SurveyReviewPanel({ articles, onNavigate }: Readonly<{ articles: readonly SurveyArticle[]; onNavigate(target: NavigateTarget): void }>) {
  const totalVolume = articles.reduce((sum, item) => sum + item.volumeM3 * item.quantity, 0);
  const totalWeight = articles.reduce((sum, item) => sum + item.weightKg * item.quantity, 0);
  const areaRows = groupedRows(articles, "room");
  const modeRows = groupedRows(articles, "mode");
  return <section className="space-y-3" data-testid="survey-review"><div className="grid grid-cols-4 rounded-lg border border-sky-200 bg-sky-50 py-3 text-center"><span><small className="block text-[8px] uppercase">Renglones</small><strong>{articles.length}</strong></span><span><small className="block text-[8px] uppercase">Piezas</small><strong>{articles.reduce((sum, item) => sum + item.quantity, 0)}</strong></span><span><small className="block text-[8px] uppercase">Volumen</small><strong>{totalVolume.toFixed(2)} m³</strong><small className="block text-[8px]">{cubicFeet(totalVolume).toFixed(1)} ft³</small></span><span><small className="block text-[8px] uppercase">Peso</small><strong>{totalWeight.toFixed(0)} kg</strong><small className="block text-[8px]">{pounds(totalWeight).toFixed(0)} lb</small></span></div><div className="grid gap-3 xl:grid-cols-2"><GroupReport title="Agrupado por área" rows={areaRows} onOpen={(row) => onNavigate({ room: row.label, mode: row.items[0].mode, filterMode: false })} /><GroupReport title="Agrupado por modo" rows={modeRows} onOpen={(row) => onNavigate({ room: row.items[0].room, mode: row.label as SurveyShipmentMode, filterMode: true })} /></div><p className="text-[10px] text-slate-500">Selecciona un área o modo para regresar al Inventario con ese contexto.</p></section>;
}

function SignaturePad({ strokes, onChange }: Readonly<{ strokes: readonly SignatureStroke[]; onChange(strokes: readonly SignatureStroke[]): void }>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef<readonly { x: number; y: number }[] | null>(null);
  const baseStrokesRef = useRef<readonly SignatureStroke[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "#003b70";
    context.lineWidth = 3;
    context.lineCap = "round";
    context.lineJoin = "round";
    strokes.forEach((stroke) => {
      if (stroke.length < 2) return;
      context.beginPath();
      context.moveTo(stroke[0].x * canvas.width, stroke[0].y * canvas.height);
      stroke.slice(1).forEach((point) => context.lineTo(point.x * canvas.width, point.y * canvas.height));
      context.stroke();
    });
  }, [strokes]);

  const point = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    };
  };
  const start = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    baseStrokesRef.current = strokes;
    drawingRef.current = [point(event)];
  };
  const move = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const next = [...drawingRef.current, point(event)];
    drawingRef.current = next;
    onChange([...baseStrokesRef.current, next]);
  };
  const finish = () => { drawingRef.current = null; };

  return <div className="overflow-hidden rounded-lg border border-slate-300 bg-white"><canvas ref={canvasRef} width={720} height={220} aria-label="Área para la firma manuscrita" role="img" onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} className="block h-36 w-full touch-none cursor-crosshair" /><div className="flex items-center justify-between border-t border-slate-200 px-3 py-1.5 text-[9px] text-slate-500"><span>Firme con el dedo o lápiz digital.</span><button type="button" aria-label="Borrar firma" title="Borrar firma" onClick={() => onChange([])} className="grid h-7 w-7 place-items-center rounded text-rose-700"><Eraser className="h-4 w-4" /></button></div></div>;
}

export function SurveySignaturePanel({ report: reportOverride, client, articles }: Readonly<{ report?: SurveyReportContext; client?: string; articles: readonly SurveyArticle[] }>) {
  const report: SurveyReportContext = reportOverride || { reference: "VIS-021", client: client || "Cliente", company: "Coca-Cola", leadAccount: "SIRVA", booker: "María López · SIRVA", service: "Mudanza internacional", origin: { city: "Santo Domingo", sector: "Piantini", street: "Av. Abraham Lincoln núm. 456", unit: "Torre Central · apartamento 8-B" }, destination: { city: "Madrid", sector: "Salamanca", street: "Calle Serrano núm. 120", unit: "Apartamento 4-A" }, instruction: "Llamar 15 minutos antes. Iniciar la visita por el dormitorio principal.", surveyDate: "2 sep 2026 · 5:30 p. m.", evaluator: "Ana Evaluadora" };
  const [accepted, setAccepted] = useState(false);
  const [signatureStrokes, setSignatureStrokes] = useState<readonly SignatureStroke[]>([]);
  const [signatoryName, setSignatoryName] = useState(report.client);
  const [relationship, setRelationship] = useState("Cliente");
  const [signedAt, setSignedAt] = useState<string | null>(null);
  const [copyRecordedAt, setCopyRecordedAt] = useState<string | null>(null);
  const totalVolume = articles.reduce((sum, item) => sum + item.volumeM3 * item.quantity, 0);
  const totalWeight = articles.reduce((sum, item) => sum + item.weightKg * item.quantity, 0);
  const specialSections = [
    { label: "Huacal", items: articles.filter((item) => item.flags.includes("Caja de madera")) },
    { label: "Frágil", items: articles.filter((item) => item.flags.includes("Frágil")) },
    { label: "Armar / desarmar", items: articles.filter((item) => item.flags.includes("Armar") || item.flags.includes("Desarmar")) },
    { label: "Grúa", items: articles.filter((item) => item.flags.includes("Recomendar grúa")) },
    { label: "AV · Artículo valioso", items: articles.filter((item) => item.flags.includes("Valioso")) },
    { label: "SD · Sobredimensionado", items: articles.filter((item) => item.flags.includes("Sobredimensionado")) },
  ].filter((section) => section.items.length);
  const noteOnly = articles.filter((item) => item.flags.length === 0 && (item.note || item.photoCount));
  const signature = { name: signatoryName.trim(), relationship, signedAt: signedAt || undefined, strokes: signatureStrokes };
  const resetSignatureState = () => { setSignedAt(null); setCopyRecordedAt(null); };
  const recordSignature = () => setSignedAt(new Intl.DateTimeFormat("es-DO", { dateStyle: "medium", timeStyle: "short" }).format(new Date()));
  const deliverCopy = () => {
    downloadStructuredSurveyPdf(report, articles, signature);
    setCopyRecordedAt(new Intl.DateTimeFormat("es-DO", { dateStyle: "medium", timeStyle: "short" }).format(new Date()));
  };

  return <section className="space-y-3" data-testid="survey-signature"><div className="grid grid-cols-4 overflow-hidden rounded-lg border border-slate-200 bg-white text-center text-[8px] font-bold text-slate-500"><span className="border-r border-slate-200 bg-sky-50 px-1 py-2 text-sky-800">1 · Vista previa</span><span className="border-r border-slate-200 px-1 py-2">2 · Firmar</span><span className="border-r border-slate-200 px-1 py-2">3 · Generar PDF</span><span className="px-1 py-2">4 · Entregar copia</span></div><div className="rounded-lg border border-slate-200 bg-white p-4"><div className="flex items-start justify-between gap-2"><div><p className="text-[9px] font-black uppercase tracking-wider text-sky-700">Reporte para aceptación del cliente</p><h2 className="text-base font-black text-[#003b70]">{report.client}</h2><p className="text-[9px] text-slate-500">{report.reference} · {report.service}</p></div><button type="button" onClick={() => previewSurveyPdf(report, articles, signature)} aria-label="Abrir vista previa del PDF" title="Vista previa" className="grid h-9 w-9 place-items-center rounded-full border border-sky-200 text-[#003b70]"><Eye className="h-4 w-4" /></button></div><div className="mt-3 grid grid-cols-3 rounded border border-slate-200 py-2 text-center text-[10px]"><span><small className="block text-slate-500">Piezas</small><strong>{articles.reduce((sum, item) => sum + item.quantity, 0)}</strong></span><span><small className="block text-slate-500">Volumen</small><strong>{totalVolume.toFixed(2)} m³</strong></span><span><small className="block text-slate-500">Peso ref.</small><strong>{totalWeight.toFixed(0)} kg</strong></span></div><div className="mt-3 overflow-hidden rounded border border-slate-200"><div className="grid grid-cols-[70px_1fr_32px_86px] bg-slate-100 px-2 py-1.5 text-[8px] font-black uppercase text-slate-500 sm:grid-cols-[90px_1fr_38px_100px]"><span>Área</span><span>Artículo</span><span>Cant.</span><span>Condición</span></div>{articles.map((item) => <div key={item.id} className="grid grid-cols-[70px_1fr_32px_86px] border-t border-slate-100 px-2 py-2 text-[9px] sm:grid-cols-[90px_1fr_38px_100px]"><span>{item.room}</span><strong>{item.name}</strong><span>{item.quantity}</span><span>{item.condition}</span></div>)}</div><div className="mt-3" data-testid="signature-special-conditions"><strong className="text-[10px] text-[#003b70]">Condiciones y observaciones</strong><div className="mt-1 grid gap-1.5 sm:grid-cols-2">{specialSections.map((section) => <article key={section.label} className="rounded border border-slate-200 bg-slate-50 p-2"><strong className="text-[9px] text-sky-800">{section.label}</strong>{section.items.map((item) => <AcceptanceSpecialItem key={`${section.label}-${item.id}`} item={item} />)}</article>)}{noteOnly.length > 0 && <article className="rounded border border-slate-200 bg-slate-50 p-2"><strong className="text-[9px] text-sky-800">Otras notas y fotos</strong>{noteOnly.map((item) => <AcceptanceSpecialItem key={item.id} item={item} />)}</article>}</div></div><p className="mt-3 text-[9px] text-slate-500">Este reporte confirma los artículos y condiciones levantados durante la visita. No constituye una cotización ni aceptación de precios.</p></div><label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-3 text-[10px]"><input type="checkbox" checked={accepted} onChange={(event) => { setAccepted(event.target.checked); resetSignatureState(); }} /><span>He revisado el reporte de artículos y confirmo que representa la información levantada durante la visita.</span></label><div className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-[1fr_170px]"><label><span className="block text-[9px] font-black uppercase text-slate-500">Nombre de quien firma</span><input aria-label="Nombre de quien firma" value={signatoryName} onChange={(event) => { setSignatoryName(event.target.value); resetSignatureState(); }} className="mt-1 h-9 w-full rounded border border-slate-300 px-3 text-sm" /></label><label><span className="block text-[9px] font-black uppercase text-slate-500">Relación</span><select aria-label="Relación de quien firma" value={relationship} onChange={(event) => { setRelationship(event.target.value); resetSignatureState(); }} className="mt-1 h-9 w-full rounded border border-slate-300 px-2 text-sm"><option>Cliente</option><option>Representante autorizado</option><option>Familiar</option><option>Encargado de residencia</option></select></label><div className="sm:col-span-2"><SignaturePad strokes={signatureStrokes} onChange={(next) => { setSignatureStrokes(next); resetSignatureState(); }} /></div></div><button type="button" onClick={recordSignature} disabled={!accepted || !signatoryName.trim() || signatureStrokes.length === 0} className="flex w-full items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 py-3 text-sm font-bold text-white disabled:bg-slate-300"><FileSignature className="h-4 w-4" />{signedAt ? "Firmado por el cliente" : "Firmar reporte"}{signedAt && <Check className="h-4 w-4" />}</button>{signedAt && <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2"><button type="button" onClick={deliverCopy} aria-label="Generar y entregar copia PDF" title="Generar copia PDF" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#003b70] text-white"><Download className="h-4 w-4" /></button><span className="text-[9px] text-emerald-950">{copyRecordedAt ? <span role="status"><strong className="block">Cliente firmó y recibió copia PDF</strong>Registro CRM del preview · {copyRecordedAt}</span> : <><strong className="block">Copia PDF disponible</strong>Genera la copia firmada y registra la entrega.</>}</span></div>}</section>;
}

function AcceptanceSpecialItem({ item }: Readonly<{ item: SurveyArticle }>) {
  return <div className="mt-1 border-t border-slate-200 pt-1 text-[8px]"><strong>{item.name}</strong><span className="ml-1 text-slate-500">{item.photoCount > 0 && <span className="mr-2 inline-flex items-center gap-0.5"><Image className="h-2.5 w-2.5" />{item.photoCount}</span>}{item.note && <span>Nota: {item.note}</span>}</span></div>;
}

export function SurveyTechnicalPanel({ articles }: Readonly<{ articles: readonly SurveyArticle[] }>) {
  const materials = useMemo(() => { const totals = new Map<string, number>(); articles.forEach((article) => article.packing.forEach(([name, qty]) => totals.set(name, (totals.get(name) || 0) + qty * article.quantity))); return [...totals.entries()]; }, [articles]);
  const specialGroups = FLAG_OPTIONS.map(([flag, short]) => ({ flag, short, items: articles.filter((item) => item.flags.includes(flag)) })).filter((group) => group.items.length);
  const damaged = articles.filter((item) => item.condition === "Averiado" || item.condition === "Daño preexistente");
  return <section className="space-y-3" data-testid="survey-technical"><div className="grid gap-3 xl:grid-cols-2"><article className="overflow-hidden rounded-lg border border-slate-200 bg-white"><header className="bg-slate-100 px-3 py-2 text-xs font-black text-[#003b70]">Artículos · peso y volumen</header>{articles.map((item) => <div key={item.id} className="grid grid-cols-[1fr_45px_86px_82px] border-t border-slate-100 px-3 py-2 text-[9px]"><span><strong className="block">{item.name}</strong><small>{item.room} · {item.mode}</small></span><span>{item.quantity}</span><span>{(item.volumeM3 * item.quantity).toFixed(2)} m³<small className="block">{cubicFeet(item.volumeM3 * item.quantity).toFixed(1)} ft³</small></span><span>{(item.weightKg * item.quantity).toFixed(0)} kg<small className="block">{pounds(item.weightKg * item.quantity).toFixed(0)} lb</small></span></div>)}</article><article className="rounded-lg border border-slate-200 bg-white p-3"><div className="flex items-center gap-2"><Package className="h-4 w-4 text-indigo-700" /><strong className="text-sm text-[#003b70]">Materiales derivados</strong></div><div className="mt-2 grid grid-cols-2 gap-x-3 text-[10px]">{materials.map(([name, quantity]) => <div key={name} className="flex justify-between border-b border-slate-100 py-1"><span>{name}</span><strong>{quantity}</strong></div>)}</div><p className="mt-2 text-[9px] text-sky-800">Resultado automático de recetas administrativas · no editable por el evaluador.</p></article></div><article className="rounded-lg border border-slate-200 bg-white p-3"><strong className="text-sm text-[#003b70]">Condiciones especiales agrupadas</strong><div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{damaged.length > 0 && <div className="rounded border border-rose-200 bg-rose-50 p-2"><strong className="text-[10px] text-rose-800">Daños registrados</strong>{damaged.map((item) => <SpecialItem key={item.id} item={item} />)}</div>}{specialGroups.map((group) => <div key={group.flag} className="rounded border border-slate-200 bg-slate-50 p-2"><strong className="text-[10px] text-[#003b70]">{group.short} · {group.items.length}</strong>{group.items.map((item) => <SpecialItem key={item.id} item={item} />)}</div>)}</div></article><button type="button" className="flex w-full items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white"><CheckCircle2 className="h-4 w-4" />Publicar resultado de Survey</button><p className="text-center text-[10px] text-slate-500">Publica una versión inmutable para Costos, Cajas y Taller y Cotización. Datos sintéticos en este preview.</p></section>;
}

function SpecialItem({ item }: Readonly<{ item: SurveyArticle }>) {
  return <div className="mt-1 border-t border-slate-200 pt-1 text-[8px]"><strong className="block">{item.name}</strong><span className="flex flex-wrap gap-2 text-slate-500">{item.photoCount > 0 && <span className="flex items-center gap-1"><Image className="h-3 w-3" />{item.photoCount} foto</span>}{item.note && <span>Nota: {item.note}</span>}{item.dimensions && <span className="flex items-center gap-1"><Ruler className="h-3 w-3" />{item.dimensions.lengthCm}×{item.dimensions.widthCm}×{item.dimensions.heightCm} cm · {inches(item.dimensions.lengthCm).toFixed(1)}×{inches(item.dimensions.widthCm).toFixed(1)}×{inches(item.dimensions.heightCm).toFixed(1)} in</span>}</span></div>;
}
