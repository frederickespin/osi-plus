import type { CommercialBooking } from "@/lib/commercialCalendarStore";
import type { Quote } from "@/types/sales.types";
import { formatCurrency } from "@/lib/formatters";

type QuoteLeadInfo = {
  clientName: string;
  origin?: string;
  destination?: string;
};

type GenerateQuoteServicePdfInput = {
  quote: Quote;
  lead: QuoteLeadInfo;
  booking?: Pick<CommercialBooking, "startDate" | "endDate"> | null;
};

const money = (n: number) => formatCurrency(n);

export async function generateQuoteServicePdf(input: GenerateQuoteServicePdfInput) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF();
  const margin = 14;
  const lineHeight = 6;
  const pageBottom = 285;
  let y = 16;

  const writeLine = (text: string, options?: { bold?: boolean; size?: number }) => {
    if (y > pageBottom) {
      doc.addPage();
      y = 16;
    }
    doc.setFont("helvetica", options?.bold ? "bold" : "normal");
    doc.setFontSize(options?.size ?? 10);
    const lines = doc.splitTextToSize(text, 180);
    doc.text(lines, margin, y);
    y += lineHeight * lines.length;
  };

  writeLine("OSi-plus ERP v17", { bold: true, size: 14 });
  writeLine("Cotizacion Tecnica de Servicio", { bold: true, size: 12 });
  writeLine(`Propuesta: ${input.quote.proposalNumber}`);
  writeLine(`Fecha de emision: ${new Date().toLocaleDateString()}`);
  y += 2;

  writeLine("Datos del cliente", { bold: true, size: 11 });
  writeLine(`Cliente: ${input.lead.clientName}`);
  writeLine(`Origen: ${input.quote.serviceOriginAddress ?? input.lead.origin ?? "No definido"}`);
  writeLine(`Destino: ${input.quote.serviceDestinationAddress ?? input.lead.destination ?? "No definido"}`);
  writeLine(`Inicio programado: ${input.booking?.startDate ?? "No programado"}`);
  writeLine(`Fin programado: ${input.booking?.endDate ?? "No programado"}`);
  y += 2;

  writeLine("Lineas del servicio", { bold: true, size: 11 });
  if (input.quote.lines.length === 0) {
    writeLine("Sin lineas cargadas.");
  } else {
    input.quote.lines.forEach((line, index) => {
      writeLine(
        `${index + 1}. [${line.category}] ${line.name} | Qty: ${line.qty} | Precio: ${money(line.unitPrice)} | Total: ${money(line.total)}`
      );
      if (line.description) writeLine(`   Detalle: ${line.description}`);
    });
  }
  y += 2;

  writeLine("Plan de recursos", { bold: true, size: 11 });
  writeLine(`Dias planificados: ${input.quote.resourcePlan.plannedDays}`);
  writeLine(`Camiones planificados: ${input.quote.resourcePlan.plannedTrucks}`);
  writeLine(`Personal planificado: ${input.quote.resourcePlan.plannedPeople}`);
  y += 2;

  writeLine("Terminos del servicio", { bold: true, size: 11 });
  writeLine(`Notas: ${input.quote.notes || "-"}`);
  writeLine(`Inclusiones: ${input.quote.inclusions.join("; ") || "-"}`);
  writeLine(`Exclusiones: ${input.quote.exclusions.join("; ") || "-"}`);
  writeLine(`Permisos: ${input.quote.permits.join("; ") || "-"}`);
  writeLine(`Clausulas: ${input.quote.contractClauses.join("; ") || "-"}`);
  y += 2;

  writeLine("Resumen economico", { bold: true, size: 11 });
  writeLine(`Subtotal: ${money(input.quote.totals.subtotal)}`);
  writeLine(`Descuento: ${money(input.quote.totals.discount)}`);
  writeLine(`Total: ${money(input.quote.totals.total)}`, { bold: true });

  doc.save(`cotizacion-${input.quote.proposalNumber}.pdf`);
}
