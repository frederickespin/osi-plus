import { useEffect, useRef, useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { costUnitLabel } from "@/costing/componentLabels";
import { quoteApi, type QuoteClientProposal } from "./api";
import "./quote-document.css";

const DATE = new Intl.DateTimeFormat("es-DO", { dateStyle: "medium", timeZone: "UTC" });
const QUANTITY = new Intl.NumberFormat("es-DO", { maximumFractionDigits: 6 });
const STATE: Record<string, string> = {
  DRAFT: "Borrador", READY: "Lista para enviar", SENT: "Enviada", ACCEPTED: "Aceptada",
  REJECTED: "Rechazada", CANCELLED: "Cancelada", EXPIRED: "Vencida", SUPERSEDED: "Sustituida",
};
export function quoteStateLabel(value: string) { return STATE[value] ?? "Sin estado"; }
export function quoteDate(value: string) { return DATE.format(new Date(value)); }

export function QuoteDocument({ proposal }: { proposal: QuoteClientProposal }) {
  const article = useRef<HTMLElement>(null);
  const closePrint = useRef<(() => void) | null>(null);
  useEffect(() => () => closePrint.current?.(), [proposal.revisionRef]);
  const price = new Intl.NumberFormat("es-DO", { style: "currency", currency: proposal.currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const { client, terms, totals } = proposal;
  const deductions = Number(totals.discountAmount) > 0;
  const conditions = [
    ["Condiciones de pago", terms?.paymentTerms], ["Exclusiones", terms?.exclusions?.join("\n")],
    ["Condiciones especiales", terms?.specialConditions?.join("\n")], ["Notas", terms?.clientNotes],
  ];
  const route = client?.route ?? [];
  const stops = [...route.filter((row) => row.role === "ORIGIN"),
    ...route.filter((row) => row.role !== "ORIGIN" && row.role !== "DESTINATION").sort((a, b) => a.stopOrder - b.stopOrder),
    ...route.filter((row) => row.role === "DESTINATION")];

  function printVersion() {
    if (!article.current) return;
    closePrint.current?.();
    const copy = article.current.cloneNode(true) as HTMLElement;
    copy.classList.add("quote-print-copy");
    copy.querySelector("[data-print-action]")?.remove();
    document.body.append(copy);
    const previousTitle = document.title;
    document.title = proposal.reference + " - V" + proposal.revision;
    const cleanup = () => {
      copy.remove();
      document.title = previousTitle;
      window.removeEventListener("afterprint", cleanup);
      closePrint.current = null;
    };
    closePrint.current = cleanup;
    window.addEventListener("afterprint", cleanup);
    try { window.print(); } catch { cleanup(); }
  }

  return <article ref={article} aria-label="Propuesta para el cliente" className="mx-auto max-w-5xl space-y-3 px-3 py-4 text-sm text-slate-800 sm:px-6">
    <header className="flex flex-wrap items-start justify-between gap-2">
      <div><h3 className="text-lg font-bold text-[#003366]">{proposal.proposalName}</h3>
        <p className="text-xs text-slate-600">{proposal.reference} · Versión {proposal.revision}{proposal.state === "DRAFT" ? " · Borrador" : ""}</p></div>
      <div className="flex items-start gap-3 text-xs text-slate-600">
        <div><p>Emisión · {quoteDate(proposal.issueDate)}</p><p>Vigencia · {quoteDate(proposal.validUntil)}</p></div>
        <Button data-print-action type="button" size="icon-sm" variant="ghost" aria-label="Imprimir o guardar como PDF" title="Imprimir o guardar como PDF" onClick={printVersion}><Printer /></Button>
      </div>
    </header>
    <div className="space-y-1 text-xs" data-testid="quote-commercial-snapshot">
      {client?.client?.displayName && <p>Cliente · <strong>{client.client.displayName}</strong></p>}
      {proposal.payer.displayName && proposal.payer.displayName !== client?.client?.displayName && <p>Responsable del pago · {proposal.payer.displayName}</p>}
      {stops.map((row) => {
        const label = row.role === "ORIGIN" ? "Origen" : row.role === "DESTINATION" ? "Destino" : "Parada";
        const address = [row.streetAndNumber, row.buildingResidential, row.floorUnit, row.sector, row.cityMunicipality, row.provinceState, row.countryCode].filter(Boolean).join(", ");
        return address && <p key={row.role + row.stopOrder}>{label} · {address}</p>;
      })}
    </div>
    {terms?.scope && <p className="whitespace-pre-wrap break-words text-sm">{terms.scope}</p>}
    {proposal.packageScope && <p className="text-xs">{proposal.packageScope.name} · {QUANTITY.format(proposal.packageScope.volumeM3)} m³</p>}
    <div>
      {proposal.groupName && <h4 className="pb-1 font-semibold text-[#003366]">{proposal.groupName}</h4>}
      <table className="w-full text-left text-xs">
        <thead className="border-y border-slate-200 bg-slate-50 text-slate-600"><tr><th className="p-2">Concepto</th><th className="px-2 text-right">Cantidad</th><th className="px-2 text-right">Importe</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{proposal.lines.map((line) => <tr key={line.lineRef}>
          <td className="break-words p-2">{line.concept}</td><td className="px-2 text-right">{QUANTITY.format(Number(line.quantity))} {costUnitLabel(line.unit)}</td>
          <td className="px-2 text-right tabular-nums">{line.quotedPrice == null ? "Pendiente" : price.format(Number(line.quotedPrice))}</td>
        </tr>)}</tbody>
      </table>
      <dl className="ml-auto w-fit min-w-48 space-y-1 border-t border-slate-200 px-2 py-2 text-right text-xs">
        {deductions && <><div className="flex justify-between gap-6"><dt>Subtotal</dt><dd>{price.format(Number(totals.grossQuotedPrice))}</dd></div>
          <div className="flex justify-between gap-6"><dt>Descuento</dt><dd>−{price.format(Number(totals.discountAmount))}</dd></div></>}
        <div className="flex justify-between gap-6 font-bold text-[#003366]"><dt>{proposal.lines.some((line) => line.quotedPrice == null) ? "Total parcial" : "Total"} ({proposal.currency})</dt>
          <dd>{totals.totalQuotedPrice == null ? "Pendiente" : price.format(totals.totalQuotedPrice)}</dd></div>
      </dl>
      {proposal.exchange?.rate != null && <p className="text-right text-xs text-slate-600">Tasa de cambio · 1 {String(proposal.exchange.sourceCurrency)} = {String(proposal.exchange.rate)} {String(proposal.exchange.targetCurrency)}</p>}
    </div>
    <dl className="grid gap-2 text-xs sm:grid-cols-2">{conditions.map(([label, content]) => content && <div key={label}>
      <dt className="font-semibold text-slate-700">{label}</dt><dd className="whitespace-pre-wrap break-words">{content}</dd>
    </div>)}</dl>
  </article>;
}

export function ArchivedQuoteDocument({ authorization, proposalRef, revisionRef, onUnauthorized }: {
  authorization?: string; proposalRef: string; revisionRef: string; onUnauthorized(): void;
}) {
  const [value, setValue] = useState<QuoteClientProposal | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void quoteApi.clientVersion(authorization, proposalRef, revisionRef, controller.signal).then((document) => {
      if (controller.signal.aborted) return;
      if (document?.revisionRef === revisionRef && document.proposalRef === proposalRef) setValue(document);
      else setFailed(true);
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      if (error instanceof Error && error.message.includes("UNAUTHORIZED")) onUnauthorized();
      else setFailed(true);
    });
    return () => controller.abort();
  }, [authorization, proposalRef, revisionRef, attempt, onUnauthorized]);
  if (failed) return <p role="alert" className="px-3 py-2 text-sm text-amber-800">No se pudo abrir esta versión. <Button variant="ghost" size="sm"
    onClick={() => { setFailed(false); setAttempt((value) => value + 1); }}>Reintentar</Button></p>;
  return value ? <QuoteDocument proposal={value} /> : <p role="status" className="px-3 py-2 text-xs text-slate-600">Cargando versión…</p>;
}
