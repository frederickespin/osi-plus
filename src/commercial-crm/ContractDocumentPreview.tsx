import { Download, Eye, Printer, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadContractPdf, previewContractPdf, type ContractPdfContext } from "./ContractPdf";

type Props = Readonly<{
  context: ContractPdfContext;
  open: boolean;
  onOpenChange(open: boolean): void;
}>;

export function ContractOutputActions({ context, onOpenChange }: Omit<Props, "open">) {
  return <section className="mt-4 rounded-lg border border-slate-200 bg-white" aria-labelledby="contract-output-heading">
    <div className="flex flex-wrap items-center justify-between gap-3 p-3">
      <div>
        <h3 id="contract-output-heading" className="text-xs font-black uppercase tracking-wide text-[#003366]">Salida del contrato</h3>
        <p className="mt-1 text-[10px] text-slate-500">Revise el documento antes de imprimirlo, descargarlo o enviarlo.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => onOpenChange(true)}><Eye />Vista previa</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => downloadContractPdf(context)}><Download />Descargar PDF</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => previewContractPdf(context)}><Printer />Abrir para imprimir</Button>
        <Button type="button" size="sm" disabled title="El envío externo permanece desactivado en Preview"><Send />Enviar al cliente</Button>
      </div>
    </div>
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t bg-slate-50 px-3 py-2 text-[10px] text-slate-600">
      <span><b>Estado:</b> {context.isFinal ? "Copia contractual" : "Borrador para revisión"}</span>
      <span><b>Documento:</b> {context.documentReference}</span>
      <span className="text-amber-700">Envío externo desactivado en Preview</span>
    </div>
  </section>;
}

export default function ContractDocumentPreview({ context, open, onOpenChange }: Props) {
  if (!open) return null;
  return <div role="dialog" aria-modal="true" aria-label="Vista previa del contrato" className="fixed inset-0 z-50 overflow-auto bg-slate-950/70 p-3">
    <style>{`@media print {
      body * { visibility: hidden !important; }
      .contract-print, .contract-print * { visibility: visible !important; }
      .contract-print { position: absolute !important; inset: 0 !important; width: 100% !important; border: 0 !important; box-shadow: none !important; }
      .contract-actions { display: none !important; }
      .contract-paragraph { break-inside: avoid; }
    }`}</style>
    <article className="contract-print mx-auto max-w-4xl rounded-xl bg-white p-6 shadow-2xl">
      <div className="contract-actions mb-4 flex flex-wrap items-center justify-between gap-2 border-b pb-3">
        <p className="text-xs font-bold text-slate-600">Vista previa antes de emitir</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => downloadContractPdf(context)}><Download />Descargar PDF</Button>
          <Button type="button" size="sm" onClick={() => window.print()}><Printer />Imprimir</Button>
          <Button type="button" size="icon-sm" variant="ghost" aria-label="Cerrar vista previa" onClick={() => onOpenChange(false)}><X /></Button>
        </div>
      </div>
      <header className="border-b-2 border-[#003b70] pb-4">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-xs font-black uppercase tracking-[.18em] text-[#0070a8]">OSi Plus ERP</p><h2 className="mt-1 text-2xl font-black text-[#003366]">{context.templateName}</h2></div>
          <span className={`rounded px-2 py-1 text-[10px] font-black uppercase ${context.isFinal ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>{context.isFinal ? "Copia contractual" : "Borrador para revisión"}</span>
        </div>
        <dl className="mt-4 grid gap-2 rounded-lg bg-slate-50 p-3 text-xs sm:grid-cols-2">
          <div><dt className="font-bold text-slate-500">Cliente</dt><dd className="font-semibold text-[#003366]">{context.clientName}</dd></div>
          <div><dt className="font-bold text-slate-500">Caso</dt><dd className="font-mono font-semibold text-[#003366]">{context.caseCode}</dd></div>
          <div><dt className="font-bold text-slate-500">Servicio</dt><dd className="font-semibold text-[#003366]">{context.serviceName}</dd></div>
          <div><dt className="font-bold text-slate-500">Términos</dt><dd className="font-mono text-[#003366]">{context.termsReference}</dd></div>
        </dl>
      </header>
      <div className="mt-6 space-y-3 text-sm leading-6 text-slate-700">{context.bodyText.split(/\r?\n/).map((line, index) => line.trim() ? <p key={`${index}-${line.slice(0, 12)}`} className={`contract-paragraph whitespace-pre-wrap ${line === line.toUpperCase() && line.length < 80 ? "font-black text-[#003366]" : ""} ${/\[[^\]]+\]/.test(line) ? "text-amber-800" : ""}`}>{line}</p> : <div key={`space-${index}`} className="h-2" />)}</div>
      <footer className="mt-8 border-t pt-3 text-[10px] text-slate-500"><p>{context.documentReference} · {context.termsReference}</p><p className="mt-1">Los campos pendientes aparecen entre corchetes y deben completarse antes de la emisión definitiva.</p></footer>
    </article>
  </div>;
}
