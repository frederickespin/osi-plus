import { ClipboardList, MapPin } from "lucide-react";
import type { CustomerStorageLot, CustomerStoredItem } from "./api";

type Stage = "unloading" | "description" | "putaway";
type Props = Readonly<{ stage: Stage; lot: CustomerStorageLot; onSelect(item: CustomerStoredItem): void }>;

function hasCondition(item: CustomerStoredItem) {
  return item.identitySource !== "GENERATED_AT_RECEPTION" || item.evidence?.some((entry) => entry.startsWith("COND|")) === true;
}
function byNumber(left: CustomerStoredItem, right: CustomerStoredItem) { return left.inventoryNumber - right.inventoryNumber; }
function numberText(item: CustomerStoredItem) { return String(item.inventoryNumber).padStart(4, "0"); }

function NumberList({ label, items, onSelect, tone = "slate" }: { label: string; items: readonly CustomerStoredItem[]; onSelect(item: CustomerStoredItem): void; tone?: "slate" | "amber" | "red" | "emerald" }) {
  const colors = { slate: "border-slate-200 bg-white text-slate-700", amber: "border-amber-200 bg-amber-50 text-amber-900", red: "border-red-200 bg-red-50 text-red-800", emerald: "border-emerald-200 bg-emerald-50 text-emerald-800" };
  const ordered = [...items].sort(byNumber);
  return <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2 border-t py-2 first:border-t-0">
    <b className="text-[10px] uppercase text-slate-500">{label} · {ordered.length}</b>
    <div className="flex min-w-0 flex-wrap gap-1">{ordered.length > 0 ? ordered.map((item) => <button key={item.itemRef} type="button" title={item.itemCode} onClick={() => onSelect(item)} className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold ${colors[tone]}`}>{numberText(item)}</button>) : <span className="text-[11px] text-slate-400">Ninguno</span>}</div>
  </div>;
}

export default function CustodyStageQuery({ stage, lot, onSelect }: Props) {
  const expected = lot.items.filter((item) => item.status === "EXPECTED");
  const received = lot.items.filter((item) => item.status !== "EXPECTED" && item.status !== "RELEASED");
  const conditionPending = received.filter((item) => !hasCondition(item));
  const described = received.filter((item) => ["CLEARED", "PREVERIFIED"].includes(item.inspectionStatus));
  const descriptionPending = received.filter((item) => item.status !== "HOLD" && !["CLEARED", "PREVERIFIED"].includes(item.inspectionStatus));
  const located = received.filter((item) => item.location && item.location.locationRef !== lot.receptionLocation.locationRef);
  const unlocated = received.filter((item) => !item.location || item.location.locationRef === lot.receptionLocation.locationRef);
  const locationGroups = new Map<string, CustomerStoredItem[]>();
  for (const item of located) {
    const key = item.location?.path || item.location?.name || "Ubicación";
    const group = locationGroups.get(key) ?? [];
    group.push(item);
    locationGroups.set(key, group);
  }
  const summary = stage === "unloading" ? `${received.length} recibidos · ${expected.length} sin escanear`
    : stage === "description" ? `${described.length} descritos · ${descriptionPending.length} pendientes`
      : `${located.length} ubicados · ${unlocated.length} sin ubicación`;

  return <details className="mt-3 rounded-lg border bg-slate-50 px-3 py-2 text-xs">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-bold text-slate-700"><span><ClipboardList className="mr-1 inline h-4 w-4 text-sky-700" />Consultar números</span><span className="text-[10px] font-medium text-slate-500">{summary}</span></summary>
    <div className="mt-2 border-t">
      {stage === "unloading" && <><NumberList label="Sin escanear" items={expected} onSelect={onSelect} tone="amber" /><NumberList label="Recibidos" items={received} onSelect={onSelect} tone="emerald" /><NumberList label="Sin condición" items={conditionPending} onSelect={onSelect} tone="red" /></>}
      {stage === "description" && <><NumberList label="Sin describir" items={descriptionPending} onSelect={onSelect} tone="red" /><NumberList label="Descritos" items={described} onSelect={onSelect} tone="emerald" /><NumberList label="Sin condición" items={conditionPending} onSelect={onSelect} tone="amber" /></>}
      {stage === "putaway" && <><NumberList label="Sin ubicación" items={unlocated} onSelect={onSelect} tone="red" />{[...locationGroups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([location, items]) => <div key={location} className="grid grid-cols-[110px_minmax(0,1fr)] gap-2 border-t py-2"><b className="text-[10px] text-slate-600"><MapPin className="mr-1 inline h-3.5 w-3.5" />{location}</b><div className="flex flex-wrap gap-1">{[...items].sort(byNumber).map((item) => <button key={item.itemRef} type="button" title={item.itemCode} onClick={() => onSelect(item)} className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-800">{numberText(item)}</button>)}</div></div>)}</>}
    </div>
    <p className="border-t pt-2 text-[10px] text-slate-500">Toque un número para continuar con ese artículo. Las etiquetas anuladas no aparecen.</p>
  </details>;
}
