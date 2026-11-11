import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Printer, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { COMPACT_FORM_FIELD } from "@/components/ui/compact-form";
import type { CustomerStorageLot, CustomerStoredItem } from "./api";

export type LabelBatch = Readonly<{ items: readonly CustomerStoredItem[]; declaredContentQuantity: number | null }>;
type LabelFormat = "THERMAL" | "MACO_ML1000";

const PRIMARY = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#003b70] px-4 text-sm font-bold text-white shadow-sm hover:bg-[#002d57] disabled:opacity-40";
const SECONDARY = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40";

export default function PrintableCustodyLabels({ lot, batch, onClose }: { lot: CustomerStorageLot; batch: LabelBatch; onClose(): void }) {
  const [format, setFormat] = useState<LabelFormat>("MACO_ML1000");
  const [startPosition, setStartPosition] = useState(1);
  const [firstLabel, setFirstLabel] = useState(1);
  const [printQuantity, setPrintQuantity] = useState(batch.items.length);
  const availableQuantity = Math.max(1, batch.items.length - firstLabel + 1);
  const selectedItems = useMemo(() => batch.items.slice(firstLabel - 1, firstLabel - 1 + printQuantity), [batch.items, firstLabel, printQuantity]);
  const sheets = useMemo(() => buildMacoSheets(selectedItems, startPosition, firstLabel - 1), [firstLabel, selectedItems, startPosition]);
  const previewItem = selectedItems[0];
  const sheetCount = format === "MACO_ML1000" ? sheets.length : selectedItems.length;
  const changeFirstLabel = (value: number) => { const next = Math.min(batch.items.length, Math.max(1, value || 1)); setFirstLabel(next); setPrintQuantity((current) => Math.min(current, Math.max(1, batch.items.length - next + 1))); };
  const changePrintQuantity = (value: number) => setPrintQuantity(Math.min(availableQuantity, Math.max(1, value || 1)));

  return createPortal(<div role="dialog" aria-modal="true" aria-label="Imprimir etiquetas de custodia" className="custody-label-dialog fixed inset-0 z-50 overflow-auto bg-slate-950/60 p-3 sm:p-6">
    <style>{`@media print {
      @page { size: ${format === "MACO_ML1000" ? "Letter" : "100mm 65mm"}; margin: 0; }
      html, body { margin: 0 !important; padding: 0 !important; overflow: visible !important; background: white !important; }
      body > *:not(.custody-label-dialog) { display: none !important; }
      .custody-label-dialog { position: static !important; inset: auto !important; display: block !important; width: auto !important; height: auto !important; overflow: visible !important; margin: 0 !important; padding: 0 !important; background: white !important; }
      .custody-label-print-area { position: static !important; inset: auto !important; display: block !important; width: 100% !important; height: auto !important; overflow: visible !important; background: white !important; }
      .custody-label-actions, .custody-label-preview { display: none !important; }
      .custody-maco-sheet { width: 8.5in !important; min-width: 8.5in !important; max-width: 8.5in !important; height: 11in !important; min-height: 11in !important; max-height: 11in !important; margin: 0 !important; padding: .5in .15625in !important; display: grid !important; grid-template-columns: repeat(2, 4in) !important; grid-template-rows: repeat(5, 2in) !important; column-gap: .1875in !important; row-gap: 0 !important; overflow: hidden !important; break-inside: avoid-page !important; page-break-inside: avoid !important; break-after: page !important; page-break-after: always !important; box-sizing: border-box !important; }
      .custody-maco-sheet:last-child { break-after: auto !important; page-break-after: auto !important; }
      .custody-maco-sheet > *, .custody-thermal-label { break-inside: avoid-page !important; page-break-inside: avoid !important; }
      .custody-thermal-label { width: 100mm !important; height: 65mm !important; margin: 0 !important; overflow: hidden !important; break-after: page !important; page-break-after: always !important; box-sizing: border-box !important; }
      .custody-thermal-label:last-child { break-after: auto !important; page-break-after: auto !important; }
    }`}</style>
    <div className="custody-label-actions mx-auto mb-3 max-w-3xl rounded-2xl bg-white p-4 shadow-2xl">
      <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-sky-700">Impresión de custodia</p><h2 className="text-lg font-black text-[#003b70]">{batch.items.length} {batch.items.length === 1 ? "etiqueta preparada" : "etiquetas preparadas"}</h2></div><button type="button" className={SECONDARY} aria-label="Cerrar etiquetas" onClick={onClose}><X className="h-4 w-4" /></button></div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-slate-700">Formato<select value={format} onChange={(event) => setFormat(event.target.value as LabelFormat)} className={`${COMPACT_FORM_FIELD} mt-1 w-full`}><option value="MACO_ML1000">Maco ML-1000 · Carta · 10 por hoja</option><option value="THERMAL">Individual térmica · 100 × 65 mm</option></select></label>{format === "MACO_ML1000" && <label className="text-xs font-bold text-slate-700">Inicio en la hoja<select value={startPosition} onChange={(event) => setStartPosition(Number(event.target.value))} className={`${COMPACT_FORM_FIELD} mt-1 w-full`}>{Array.from({ length: 10 }, (_, index) => index + 1).map((position) => <option key={position} value={position}>{position === 1 ? "Hoja nueva · Posición 1" : `Hoja usada · Posición ${position}`}</option>)}</select></label>}<label className="text-xs font-bold text-slate-700">Desde la etiqueta<input type="number" min={1} max={batch.items.length} value={firstLabel} onChange={(event) => changeFirstLabel(Number(event.target.value))} className={`${COMPACT_FORM_FIELD} mt-1 w-full`} /></label><label className="text-xs font-bold text-slate-700">Cantidad a imprimir<input type="number" min={1} max={availableQuantity} value={printQuantity} onChange={(event) => changePrintQuantity(Number(event.target.value))} className={`${COMPACT_FORM_FIELD} mt-1 w-full`} /></label></div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-xs"><span><b>{selectedItems.length}</b> de {batch.items.length} etiquetas · <b>{sheetCount}</b> {format === "MACO_ML1000" ? sheetCount === 1 ? "hoja Carta" : "hojas Carta" : sheetCount === 1 ? "página individual" : "páginas individuales"}</span><span>Serie <b>{String(firstLabel).padStart(3, "0")}–{String(firstLabel + selectedItems.length - 1).padStart(3, "0")}</b>{batch.declaredContentQuantity ? ` · ${batch.declaredContentQuantity} unidades declaradas` : ""}</span><button type="button" className={PRIMARY} disabled={selectedItems.length === 0} onClick={() => window.print()}><Printer className="h-4 w-4" />Imprimir {selectedItems.length}</button></div>
      <p className="mt-2 text-[10px] text-slate-500"><CheckCircle2 className="mr-1 inline h-3.5 w-3.5 text-emerald-600" />Cada hoja se imprime completa y no se divide entre páginas. Use “Hoja nueva” salvo que reutilice una Maco parcialmente usada; seleccione escala 100 % o tamaño real y desactive encabezados y pies.</p>
      {previewItem && <div className="custody-label-preview mt-3 overflow-hidden rounded-xl border bg-slate-100 p-3"><p className="mb-2 text-[10px] font-bold uppercase text-slate-500">Vista previa</p><div className="mx-auto aspect-[2/1] max-w-md bg-white"><CustodyLabel lot={lot} item={previewItem} sequence={firstLabel} total={batch.items.length} declaredContentQuantity={batch.declaredContentQuantity} compact /></div></div>}
    </div>
    <div className="custody-label-print-area absolute -left-[10000px] top-0 h-0 overflow-hidden print:h-auto print:overflow-visible">
      {format === "MACO_ML1000" ? sheets.map((sheet, sheetIndex) => <div key={`sheet-${sheetIndex}`} className="custody-maco-sheet bg-white">{sheet.map((entry, position) => entry ? <CustodyLabel key={entry.item.itemRef} lot={lot} item={entry.item} sequence={entry.sequence} total={batch.items.length} declaredContentQuantity={batch.declaredContentQuantity} compact /> : <div key={`blank-${sheetIndex}-${position}`} aria-hidden="true" />)}</div>) : selectedItems.map((item, index) => <div key={item.itemRef} className="custody-thermal-label bg-white"><CustodyLabel lot={lot} item={item} sequence={firstLabel + index} total={batch.items.length} declaredContentQuantity={batch.declaredContentQuantity} /></div>)}
    </div>
  </div>, document.body);
}

function buildMacoSheets(items: readonly CustomerStoredItem[], startPosition: number, sequenceOffset = 0) {
  const slots: Array<{ item: CustomerStoredItem; sequence: number } | null> = Array.from({ length: Math.max(0, startPosition - 1) }, () => null);
  items.forEach((item, index) => slots.push({ item, sequence: sequenceOffset + index + 1 }));
  while (slots.length % 10 !== 0) slots.push(null);
  const sheets: Array<typeof slots> = [];
  for (let index = 0; index < slots.length; index += 10) sheets.push(slots.slice(index, index + 10));
  return sheets;
}

function CustodyLabel({ lot, item, sequence, total, declaredContentQuantity, compact = false }: { lot: CustomerStorageLot; item: CustomerStoredItem; sequence: number; total: number; declaredContentQuantity: number | null; compact?: boolean }) {
  const sequenceText = `${String(sequence).padStart(3, "0")} / ${String(total).padStart(3, "0")}`;
  return <article className={`h-full w-full overflow-hidden border border-slate-400 bg-white text-slate-950 ${compact ? "p-[.125in]" : "p-3"}`}>
    <div className="grid h-full grid-cols-[1fr_auto] gap-2"><div className="min-w-0"><p className="text-[8px] font-black uppercase tracking-[.12em] text-[#003b70]">International Packers · OSi Custodia</p><p className="mt-1 truncate text-[12px] font-black">{lot.client.name}</p><dl className="mt-1 grid gap-0.5 text-[8px]"><div><dt className="inline text-slate-500">Lote: </dt><dd className="inline font-bold">{lot.lotCode}</dd></div>{declaredContentQuantity && <div><dt className="inline text-slate-500">Declarado: </dt><dd className="inline font-bold">{declaredContentQuantity} unidades</dd></div>}</dl><p className="mt-1 font-mono text-[7px] leading-tight">{item.itemCode}</p></div><div className="flex flex-col items-center justify-between"><QRCodeSVG value={item.itemCode} size={compact ? 78 : 104} level="M" /><b className="text-[9px] text-[#003b70]">{sequenceText}</b></div></div>
  </article>;
}
