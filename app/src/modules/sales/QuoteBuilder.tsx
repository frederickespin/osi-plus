import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Boxes, FileText, Users, Truck, Scale, ShieldCheck } from "lucide-react";
import { eachDayOfInterval, format, parseISO } from "date-fns";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

import type { LeadLite, Quote, QuoteLine } from "@/types/sales.types";
import type { UserRole } from "@/types/osi.types";
import { loadLeads, recomputeTotals, upsertLead, upsertQuoteGuarded } from "@/lib/salesStore";
import { loadProjects, upsertProjectByNumber } from "@/lib/projectsStore";
import { addHistory } from "@/lib/customerHistoryStore";
import {
  canPromoteBookingToProject,
  countConfirmedProjectsOnDay,
  createBooking,
  loadBookings,
  loadCalendarLimits,
  promoteBookingToProject,
  upsertBooking,
} from "@/lib/commercialCalendarStore";
import { loadQuoteAudit } from "@/lib/quoteAuditStore";

function loadCrateDrafts(): any[] {
  try {
    return JSON.parse(localStorage.getItem("osi-plus.crateDrafts") || "[]");
  } catch {
    return [];
  }
}

const money = (n: number) => `RD$ ${n.toFixed(2)}`;
const uid = () =>
  crypto?.randomUUID ? crypto.randomUUID() : `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;

function capacityTone(confirmed: number, limit: number) {
  if (limit <= 0) {
    return {
      label: "Sin limite",
      dotClass: "bg-slate-400",
      textClass: "text-slate-700",
      chipClass: "bg-slate-100 border-slate-200 text-slate-700",
    };
  }
  const percentage = (confirmed / limit) * 100;
  if (percentage >= 70) {
    return {
      label: "Rojo",
      dotClass: "bg-red-500",
      textClass: "text-red-700",
      chipClass: "bg-red-50 border-red-200 text-red-700",
    };
  }
  if (percentage >= 34) {
    return {
      label: "Amarillo",
      dotClass: "bg-amber-500",
      textClass: "text-amber-700",
      chipClass: "bg-amber-50 border-amber-200 text-amber-700",
    };
  }
  return {
    label: "Verde",
    dotClass: "bg-emerald-500",
    textClass: "text-emerald-700",
    chipClass: "bg-emerald-50 border-emerald-200 text-emerald-700",
  };
}

export default function QuoteBuilder({
  userRole = "A",
  lead,
  quote,
  onQuoteChange,
  onLeadChange,
}: {
  userRole?: UserRole;
  lead: LeadLite;
  quote: Quote;
  onQuoteChange: (q: Quote) => void;
  onLeadChange?: (lead: LeadLite) => void;
}) {
  const isAdmin = userRole === "A";
  const [tab, setTab] = useState("scope");
  const [resultNote, setResultNote] = useState("");
  const [resultScore, setResultScore] = useState("");
  const [scheduleStartDate, setScheduleStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [scheduleEndDate, setScheduleEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [scheduleRefreshKey, setScheduleRefreshKey] = useState(0);

  const crates = useMemo(() => loadCrateDrafts(), []);
  const isApproved = useMemo(
    () => lead.status === "WON" || loadProjects().some((p) => p.projectNumber === quote.proposalNumber),
    [lead.status, quote.proposalNumber, quote.updatedAt]
  );
  const canEdit = !isApproved || isAdmin;
  const canEditProspectDestination = canEdit && lead.status !== "WON" && lead.status !== "LOST";
  const tabTriggerClass =
    "py-2.5 font-semibold text-slate-700 transition-colors hover:bg-slate-200 data-[state=active]:bg-[#373363] data-[state=active]:text-white data-[state=active]:shadow";
  const selectedCrate = useMemo(() => {
    if (quote.crateDraftId) {
      const byId = crates.find((d) => d.id === quote.crateDraftId);
      if (byId) return byId;
    }
    return crates.find((d) => d.proposalNumber === quote.proposalNumber);
  }, [crates, quote.crateDraftId, quote.proposalNumber]);
  const recentAudits = useMemo(() => loadQuoteAudit(quote.id).slice(0, 5), [quote.id, quote.updatedAt]);
  const limits = useMemo(() => loadCalendarLimits(), []);
  const linkedBooking = useMemo(
    () => loadBookings().find((b) => b.workNumber === quote.proposalNumber),
    [quote.proposalNumber, scheduleRefreshKey, quote.updatedAt]
  );

  const scheduleDayDetails = useMemo(() => {
    if (!scheduleStartDate || !scheduleEndDate || scheduleEndDate < scheduleStartDate) return [];

    const days = eachDayOfInterval({ start: parseISO(scheduleStartDate), end: parseISO(scheduleEndDate) });
    const bookings = loadBookings();
    return days.map((day) => {
      const iso = day.toISOString().slice(0, 10);
      const confirmed = countConfirmedProjectsOnDay(bookings, iso);
      const tone = capacityTone(confirmed, limits.maxProjectsPerDay);
      const ratio = limits.maxProjectsPerDay > 0 ? `${confirmed}/${limits.maxProjectsPerDay}` : `${confirmed}/-`;
      return {
        iso,
        label: format(day, "dd/MM/yyyy"),
        confirmed,
        ratio,
        tone,
      };
    });
  }, [limits.maxProjectsPerDay, scheduleEndDate, scheduleRefreshKey, scheduleStartDate]);

  const update = (patch: Partial<Quote>) => {
    if (!canEdit) {
      toast.error("Esta propuesta ya fue aprobada y convertida en proyecto. Solo Admin puede modificar.");
      return;
    }
    const next: Quote = {
      ...quote,
      ...patch,
      totals: recomputeTotals((patch.lines ?? quote.lines) as QuoteLine[]),
    };
    const guarded = upsertQuoteGuarded({
      prev: quote,
      next,
      actor: {
        role: userRole,
        proposalNumber: quote.proposalNumber,
      },
      locked: isApproved,
    });
    if (!guarded.ok) {
      toast.error("Solo Admin puede modificar una propuesta aprobada. Cambios auditados.");
      return;
    }
    onQuoteChange(guarded.quote);
  };

  const addLine = (partial: Omit<QuoteLine, "id" | "total">) => {
    const line: QuoteLine = {
      id: uid(),
      ...partial,
      total: (partial.qty || 0) * (partial.unitPrice || 0),
    };
    update({ lines: [line, ...quote.lines] });
  };

  const updateLine = (id: string, patch: Partial<QuoteLine>) => {
    const nextLines = quote.lines.map((l) => {
      if (l.id !== id) return l;
      const merged = { ...l, ...patch };
      return { ...merged, total: (merged.qty || 0) * (merged.unitPrice || 0) };
    });
    update({ lines: nextLines });
  };

  const removeLine = (id: string) => {
    update({ lines: quote.lines.filter((l) => l.id !== id) });
  };

  const updateLegalField = (
    field: "inclusions" | "exclusions" | "permits" | "contractClauses",
    value: string
  ) => {
    const next = value.split("\n").map((s) => s.trim()).filter(Boolean);
    update({ [field]: next } as Partial<Quote>);
  };

  const syncCrateToQuote = (draft: any, silent = false) => {
    const costing = draft?.plan?.costing;
    if (!costing?.totals?.sellPrice) {
      if (!silent) {
        toast.error("Aun no hay costos listos en Cajas de Madera. Ejecuta Costos para generar el resumen.");
      }
      return;
    }

    const withoutCrating = quote.lines.filter((l) => l.category !== "CRATING");
    const line: QuoteLine = {
      id: uid(),
      category: "CRATING",
      name: `Cajas de madera (${draft.clientName || draft.customerName || lead.clientName || "Cliente"})`,
      description: "Resumen tecnico de cajas (nesting + ingenieria + costos).",
      qty: 1,
      unit: "serv",
      unitPrice: Number(costing.totals.sellPrice),
      total: Number(costing.totals.sellPrice),
      meta: { crateDraftId: draft.id, proposalNumber: draft.proposalNumber },
    };

    update({
      crateDraftId: draft.id,
      crateSnapshot: costing,
      lines: [line, ...withoutCrating],
    });
    if (!silent) toast.success("Resumen de cajas sincronizado en la cotización.");
  };

  useEffect(() => {
    if (!selectedCrate) return;
    const hasCosting = !!selectedCrate?.plan?.costing?.totals?.sellPrice;
    if (!hasCosting) return;
    if (quote.crateDraftId === selectedCrate.id && quote.crateSnapshot?.totals?.sellPrice) return;
    syncCrateToQuote(selectedCrate, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCrate?.id, selectedCrate?.updatedAt]);

  useEffect(() => {
    if (linkedBooking) {
      setScheduleStartDate(linkedBooking.startDate);
      setScheduleEndDate(linkedBooking.endDate);
      return;
    }
    const todayIso = new Date().toISOString().slice(0, 10);
    setScheduleStartDate(todayIso);
    setScheduleEndDate(todayIso);
  }, [linkedBooking?.id, linkedBooking?.startDate, linkedBooking?.endDate, quote.proposalNumber]);

  const openWoodCrateFromQuote = () => {
    window.dispatchEvent(
      new CustomEvent("osi:cratewood:open", {
        detail: {
          openTab: "input",
          mode: "draft",
          customerId: quote.customerId,
          customerName: lead.clientName,
          proposalNumber: quote.proposalNumber,
          quoteId: quote.id,
          leadId: lead.id,
        },
      })
    );
  };

  const openCommercialCalendar = () => {
    window.dispatchEvent(new CustomEvent("changeModule", { detail: "commercial-calendar" }));
  };

  const scheduleTentativeBooking = () => {
    if (!canEdit) {
      toast.error("Esta propuesta ya fue aprobada. No se puede reprogramar desde este formulario.");
      return;
    }
    if (!scheduleStartDate || !scheduleEndDate) {
      toast.error("Define fecha de inicio y fecha final para programar.");
      return;
    }
    if (scheduleEndDate < scheduleStartDate) {
      toast.error("La fecha final no puede ser menor que la fecha de inicio.");
      return;
    }

    const totalDays = eachDayOfInterval({ start: parseISO(scheduleStartDate), end: parseISO(scheduleEndDate) }).length;
    const destination = (quote.serviceDestinationAddress ?? lead.destination ?? "").trim();
    const origin = (quote.serviceOriginAddress ?? lead.origin ?? "").trim();

    if (linkedBooking) {
      upsertBooking({
        ...linkedBooking,
        bookingType: "PROPOSAL",
        bookingStatus: "TENTATIVE",
        workNumber: quote.proposalNumber,
        customerName: lead.clientName,
        customerId: quote.customerId,
        leadId: lead.id,
        quoteId: quote.id,
        origin,
        destination,
        startDate: scheduleStartDate,
        endDate: scheduleEndDate,
        days: totalDays,
      });
      setScheduleRefreshKey((prev) => prev + 1);
      toast.success("Tentativo actualizado en Calendario Comercial.");
      return;
    }

    createBooking({
      bookingType: "PROPOSAL",
      bookingStatus: "TENTATIVE",
      workNumber: quote.proposalNumber,
      serviceType: "Propuesta comercial",
      customerId: quote.customerId,
      customerName: lead.clientName,
      origin,
      destination,
      quoteId: quote.id,
      leadId: lead.id,
      startDate: scheduleStartDate,
      endDate: scheduleEndDate,
      days: totalDays,
      notes: quote.notes || undefined,
    });
    setScheduleRefreshKey((prev) => prev + 1);
    toast.success("Tentativo creado en Calendario Comercial.");
  };

  const generateServicePdf = async () => {
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
    writeLine(`Propuesta: ${quote.proposalNumber}`);
    writeLine(`Fecha de emision: ${new Date().toLocaleDateString()}`);
    y += 2;

    writeLine("Datos del cliente", { bold: true, size: 11 });
    writeLine(`Cliente: ${lead.clientName}`);
    writeLine(`Origen: ${quote.serviceOriginAddress ?? lead.origin ?? "No definido"}`);
    writeLine(`Destino: ${quote.serviceDestinationAddress ?? lead.destination ?? "No definido"}`);
    writeLine(`Inicio programado: ${linkedBooking?.startDate ?? "No programado"}`);
    writeLine(`Fin programado: ${linkedBooking?.endDate ?? "No programado"}`);
    y += 2;

    writeLine("Lineas del servicio", { bold: true, size: 11 });
    if (quote.lines.length === 0) {
      writeLine("Sin lineas cargadas.");
    } else {
      quote.lines.forEach((line, index) => {
        writeLine(
          `${index + 1}. [${line.category}] ${line.name} | Qty: ${line.qty} | Precio: ${money(line.unitPrice)} | Total: ${money(line.total)}`
        );
        if (line.description) writeLine(`   Detalle: ${line.description}`);
      });
    }
    y += 2;

    writeLine("Terminos del servicio", { bold: true, size: 11 });
    writeLine(`Notas: ${quote.notes || "-"}`);
    writeLine(`Inclusiones: ${quote.inclusions.join("; ") || "-"}`);
    writeLine(`Exclusiones: ${quote.exclusions.join("; ") || "-"}`);
    writeLine(`Permisos: ${quote.permits.join("; ") || "-"}`);
    writeLine(`Clausulas: ${quote.contractClauses.join("; ") || "-"}`);
    y += 2;

    writeLine("Resumen economico", { bold: true, size: 11 });
    writeLine(`Subtotal: ${money(quote.totals.subtotal)}`);
    writeLine(`Descuento: ${money(quote.totals.discount)}`);
    writeLine(`Total: ${money(quote.totals.total)}`, { bold: true });

    doc.save(`cotizacion-${quote.proposalNumber}.pdf`);
    toast.success("PDF generado correctamente.");
  };

  const approveProposal = () => {
    const confirmed = window.confirm(
      "Asegure que la propuesta que el cliente esta conforme con la propuesta, despues de arpobado no se puede modificar."
    );
    if (!confirmed) return;

    const promotionCheck = canPromoteBookingToProject(quote.proposalNumber);
    if (!promotionCheck.ok) {
      toast.error(
        `No se puede confirmar la propuesta: el cupo de proyectos esta lleno el ${promotionCheck.dayISO} (${promotionCheck.count}/${promotionCheck.limit}). Reprograma el dia del servicio en Calendario Comercial antes de aprobar.`
      );
      return;
    }
    if (!promotionCheck.hasBooking) {
      toast.error(
        "Debes programar primero la propuesta como tentativo (fecha inicio/fin) en Calendario Comercial antes de confirmar."
      );
      return;
    }

    const leadCurrent = loadLeads().find((l) => l.id === lead.id);
    const wonLead: LeadLite = {
      ...(leadCurrent ?? lead),
      status: "WON",
      updatedAt: new Date().toISOString(),
    };
    upsertLead(wonLead);
    onLeadChange?.(wonLead);
    const project = upsertProjectByNumber(quote.proposalNumber, {
      customerId: quote.customerId,
      customerName: lead.clientName,
      leadId: lead.id,
      quoteId: quote.id,
      status: "ACTIVE",
    });
    if (promotionCheck.hasBooking) {
      promoteBookingToProject(quote.proposalNumber, {
        projectId: project.id,
        customerId: quote.customerId,
        customerName: lead.clientName,
        leadId: lead.id,
        quoteId: quote.id,
      });
    }
    if (quote.customerId) {
      const score = Number(resultScore);
      addHistory({
        customerId: quote.customerId,
        type: "WON",
        note: (resultNote || quote.notes || "").trim() || undefined,
        score: Number.isFinite(score) ? score : undefined,
      });
    }
    onQuoteChange({ ...quote });
    toast.success(`Propuesta ${quote.proposalNumber} aprobada. Convertida a proyecto con el mismo numero.`);
  };

  const markProposalLost = () => {
    const leadCurrent = loadLeads().find((l) => l.id === lead.id);
    const lostLead: LeadLite = {
      ...(leadCurrent ?? lead),
      status: "LOST",
      updatedAt: new Date().toISOString(),
    };
    upsertLead(lostLead);
    onLeadChange?.(lostLead);
    if (quote.customerId) {
      const score = Number(resultScore);
      addHistory({
        customerId: quote.customerId,
        type: "LOST",
        note: (resultNote || quote.notes || "").trim() || undefined,
        score: Number.isFinite(score) ? score : undefined,
      });
    }
    onQuoteChange({ ...quote });
    toast.message(`Propuesta ${quote.proposalNumber} marcada como perdida.`);
  };

  const commitDestinationToLead = (destinationRaw: string) => {
    const destination = destinationRaw.trim();
    if ((lead.destination ?? "") === destination) return;

    const leadCurrent = loadLeads().find((l) => l.id === lead.id);
    const updatedLead: LeadLite = {
      ...(leadCurrent ?? lead),
      destination,
      updatedAt: new Date().toISOString(),
    };
    upsertLead(updatedLead);
    onLeadChange?.(updatedLead);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Cotizacion Tecnica
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2 md:col-span-2">
            <Label>Titulo</Label>
            <Input disabled={!canEdit} value={quote.title} onChange={(e) => update({ title: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>No. propuesta</Label>
            <Input value={quote.proposalNumber} disabled />
          </div>
          <div className="space-y-2">
            <Label>Cliente</Label>
            <Input value={lead.clientName} disabled />
          </div>

          <div className="space-y-2">
            <Label>Origen</Label>
            <Input value={lead.origin ?? ""} disabled />
          </div>
          <div className="space-y-2">
            <Label>Destino</Label>
            <Input
              disabled={!canEditProspectDestination}
              value={quote.serviceDestinationAddress ?? lead.destination ?? ""}
              onChange={(e) => update({ serviceDestinationAddress: e.target.value })}
              onBlur={(e) => commitDestinationToLead(e.target.value)}
              placeholder="Editar direccion de destino del prospecto"
            />
          </div>
          <div className="space-y-2">
            <Label>Notas</Label>
            <Input disabled={!canEdit} value={quote.notes ?? ""} onChange={(e) => update({ notes: e.target.value })} />
          </div>

          <div className="md:col-span-3 rounded-lg border border-slate-200 bg-slate-50/70 p-4 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Programación tentativo en calendario</p>
                <p className="text-xs text-slate-600">
                  Define rango de servicio y revisa cupo por día antes de confirmar proyecto.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={openCommercialCalendar}>
                  Abrir Calendario Comercial
                </Button>
                <Button type="button" onClick={scheduleTentativeBooking} disabled={!canEdit}>
                  {linkedBooking ? "Actualizar tentativo" : "Programar tentativo"}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Fecha inicio</Label>
                <Input
                  type="date"
                  value={scheduleStartDate}
                  disabled={!canEdit}
                  onChange={(e) => {
                    setScheduleStartDate(e.target.value);
                    if (scheduleEndDate < e.target.value) setScheduleEndDate(e.target.value);
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label>Fecha final</Label>
                <Input
                  type="date"
                  value={scheduleEndDate}
                  disabled={!canEdit}
                  min={scheduleStartDate}
                  onChange={(e) => setScheduleEndDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Días seleccionados</Label>
                <div className="h-9 px-3 rounded-md border bg-white text-sm flex items-center">
                  {scheduleDayDetails.length}
                </div>
              </div>
            </div>

            {scheduleDayDetails.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {scheduleDayDetails.map((day) => (
                  <div key={day.iso} className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${day.tone.chipClass}`}>
                    <span className={`w-2 h-2 rounded-full ${day.tone.dotClass}`} />
                    <span className="font-medium">{day.label}</span>
                    <span className={day.tone.textClass}>{day.ratio}</span>
                    <span className={day.tone.textClass}>({day.tone.label})</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500">Selecciona un rango de fechas para ver semáforo de capacidad.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-6 h-auto rounded-xl bg-slate-100 p-1.5">
          <TabsTrigger value="scope" className={tabTriggerClass}>
            <Scale className="h-4 w-4 mr-2" />
            Alcance
          </TabsTrigger>
          <TabsTrigger value="crating" className={tabTriggerClass}>
            <Boxes className="h-4 w-4 mr-2" />
            Cajas
          </TabsTrigger>
          <TabsTrigger value="resources" className={tabTriggerClass}>
            <Users className="h-4 w-4 mr-2" />
            Recursos
          </TabsTrigger>
          <TabsTrigger value="third" className={tabTriggerClass}>
            <Truck className="h-4 w-4 mr-2" />
            Terceros
          </TabsTrigger>
          <TabsTrigger value="legal" className={tabTriggerClass}>
            <ShieldCheck className="h-4 w-4 mr-2" />
            Legales
          </TabsTrigger>
          <TabsTrigger value="summary" className={tabTriggerClass}>
            <FileText className="h-4 w-4 mr-2" />
            Resumen
          </TabsTrigger>
        </TabsList>

        <TabsContent value="scope" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Procesos tecnicos</CardTitle>
              <Button
                disabled={!canEdit}
                onClick={() =>
                  addLine({
                    category: "PROCESS",
                    name: "Proceso tecnico",
                    description: "",
                    qty: 1,
                    unit: "serv",
                    unitPrice: 0,
                  })
                }
              >
                <Plus className="h-4 w-4 mr-2" /> Agregar
              </Button>
            </CardHeader>
            <CardContent>
              <Table className="min-w-[980px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[55%]">Concepto</TableHead>
                    <TableHead className="w-[120px]">Qty</TableHead>
                    <TableHead className="w-[150px]">Precio</TableHead>
                    <TableHead className="w-[160px]">Total</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quote.lines.filter((l) => l.category === "PROCESS").length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-slate-500 py-6">
                        Agrega procesos (subida con soga, embalaje, etc.)
                      </TableCell>
                    </TableRow>
                  ) : (
                    quote.lines
                      .filter((l) => l.category === "PROCESS")
                      .map((l) => (
                        <TableRow key={l.id}>
                          <TableCell className="space-y-2 whitespace-normal align-top min-w-[420px]">
                            <Input
                              className="block"
                              disabled={!canEdit}
                              value={l.name}
                              onChange={(e) => updateLine(l.id, { name: e.target.value })}
                            />
                            <Input
                              className="block"
                              disabled={!canEdit}
                              placeholder="Descripcion (opcional)"
                              value={l.description ?? ""}
                              onChange={(e) => updateLine(l.id, { description: e.target.value })}
                            />
                          </TableCell>
                          <TableCell className="w-[120px]">
                            <Input
                              disabled={!canEdit}
                              type="number"
                              value={l.qty}
                              onChange={(e) => updateLine(l.id, { qty: Number(e.target.value) || 0 })}
                            />
                          </TableCell>
                          <TableCell className="w-[150px]">
                            <Input
                              disabled={!canEdit}
                              type="number"
                              value={l.unitPrice}
                              onChange={(e) => updateLine(l.id, { unitPrice: Number(e.target.value) || 0 })}
                            />
                          </TableCell>
                          <TableCell className="font-semibold">{money(l.total)}</TableCell>
                          <TableCell className="text-right">
                            <Button disabled={!canEdit} variant="ghost" size="icon" onClick={() => removeLine(l.id)}>
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="crating" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Cajas de Madera (vinculado por cliente/propuesta)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-slate-500">
                Este submódulo se vincula automáticamente con la propuesta actual por cliente y número de propuesta.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={openWoodCrateFromQuote}>
                  Abrir Cajas de Madera
                </Button>
                <Button
                  variant="outline"
                  onClick={() => (selectedCrate ? syncCrateToQuote(selectedCrate) : toast.error("No existe un draft vinculado para esta propuesta."))}
                >
                  Actualizar Resumen
                </Button>
              </div>

              {!selectedCrate ? (
                <p className="text-slate-500">Aún no existe un cálculo de cajas vinculado a esta propuesta.</p>
              ) : (
                <div className="p-3 bg-slate-50 rounded-lg text-sm space-y-1">
                  <p className="font-medium">Resumen vinculado:</p>
                  <p>Cliente: {selectedCrate.clientName || selectedCrate.customerName || lead.clientName}</p>
                  <p>Propuesta: {selectedCrate.proposalNumber || quote.proposalNumber}</p>
                  <p>Items capturados: {selectedCrate.items?.length ?? 0}</p>
                  <p>Cajas calculadas: {selectedCrate?.plan?.costing?.boxes?.length ?? 0}</p>
                  <p>Precio sugerido: {money(Number(selectedCrate?.plan?.costing?.totals?.sellPrice || 0))}</p>
                  {Array.isArray(selectedCrate?.plan?.costing?.boxes) && selectedCrate.plan.costing.boxes.length > 0 && (
                    <div className="pt-2">
                      <p className="font-medium">Contenido por caja:</p>
                      <ul className="list-disc pl-5">
                        {selectedCrate.plan.costing.boxes.slice(0, 5).map((b: any, idx: number) => (
                          <li key={b.id ?? idx}>
                            Caja {idx + 1}: {b.itemCount ?? b.items?.length ?? 0} item(s) -{" "}
                            {Array.isArray(b.items) ? b.items.map((it: any) => it.name).filter(Boolean).slice(0, 3).join(", ") : "Sin detalle"}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="resources" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Plan de Recursos</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Dias planificados</Label>
                <Input
                  disabled={!canEdit}
                  type="number"
                  value={quote.resourcePlan.plannedDays}
                  onChange={(e) =>
                    update({ resourcePlan: { ...quote.resourcePlan, plannedDays: Number(e.target.value) || 0 } })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Camiones</Label>
                <Input
                  disabled={!canEdit}
                  type="number"
                  value={quote.resourcePlan.plannedTrucks}
                  onChange={(e) =>
                    update({ resourcePlan: { ...quote.resourcePlan, plannedTrucks: Number(e.target.value) || 0 } })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Personal</Label>
                <Input
                  disabled={!canEdit}
                  type="number"
                  value={quote.resourcePlan.plannedPeople}
                  onChange={(e) =>
                    update({ resourcePlan: { ...quote.resourcePlan, plannedPeople: Number(e.target.value) || 0 } })
                  }
                />
              </div>
              <p className="text-xs text-slate-500 md:col-span-3">
                Esto se usara luego para sugerir PET + costos internos (etapa 3).
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="third" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Servicios de terceros / adicionales</CardTitle>
              <Button disabled={!canEdit} onClick={() => addLine({ category: "THIRD_PARTY", name: "Tercero", qty: 1, unit: "serv", unitPrice: 0 })}>
                <Plus className="h-4 w-4 mr-2" /> Agregar
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Concepto</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Precio</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quote.lines
                    .filter((l) => l.category === "THIRD_PARTY")
                    .map((l) => (
                      <TableRow key={l.id}>
                        <TableCell>
                          <Input disabled={!canEdit} value={l.name} onChange={(e) => updateLine(l.id, { name: e.target.value })} />
                        </TableCell>
                        <TableCell className="w-[110px]">
                          <Input
                            disabled={!canEdit}
                            type="number"
                            value={l.qty}
                            onChange={(e) => updateLine(l.id, { qty: Number(e.target.value) || 0 })}
                          />
                        </TableCell>
                        <TableCell className="w-[140px]">
                          <Input
                            disabled={!canEdit}
                            type="number"
                            value={l.unitPrice}
                            onChange={(e) => updateLine(l.id, { unitPrice: Number(e.target.value) || 0 })}
                          />
                        </TableCell>
                        <TableCell className="font-semibold">{money(l.total)}</TableCell>
                        <TableCell className="text-right">
                          <Button disabled={!canEdit} variant="ghost" size="icon" onClick={() => removeLine(l.id)}>
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  {quote.lines.filter((l) => l.category === "THIRD_PARTY").length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-slate-500 py-6">
                        Sin terceros todavia.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="legal" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Inclusiones / Exclusiones / Permisos</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Inclusiones (1 por linea)</Label>
                <Textarea
                  disabled={!canEdit}
                  value={quote.inclusions.join("\n")}
                  onChange={(e) => updateLegalField("inclusions", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Exclusiones (1 por linea)</Label>
                <Textarea
                  disabled={!canEdit}
                  value={quote.exclusions.join("\n")}
                  onChange={(e) => updateLegalField("exclusions", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Permisologia (1 por linea)</Label>
                <Textarea
                  disabled={!canEdit}
                  value={quote.permits.join("\n")}
                  onChange={(e) => updateLegalField("permits", e.target.value)}
                />
              </div>

              <div className="space-y-2 md:col-span-3">
                <Label>Clausulas de contrato (1 por linea)</Label>
                <Textarea
                  disabled={!canEdit}
                  value={quote.contractClauses.join("\n")}
                  onChange={(e) => updateLegalField("contractClauses", e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="summary" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Resumen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="p-4 bg-slate-50 rounded-lg grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <p className="text-xs text-slate-500">Subtotal</p>
                  <p className="font-semibold">{money(quote.totals.subtotal)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Descuento</p>
                  <p className="font-semibold">{money(quote.totals.discount)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Total</p>
                  <p className="text-xl font-bold">{money(quote.totals.total)}</p>
                </div>
              </div>

              <p className="text-xs text-slate-500">
                Proximo paso (etapa 3): generar PDF + enviar + seguimiento automatico.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Comentario de resultado</Label>
                  <Input
                    disabled={!canEdit}
                    value={resultNote}
                    onChange={(e) => setResultNote(e.target.value)}
                    placeholder="Comentario final"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Score</Label>
                  <Input
                    disabled={!canEdit}
                    type="number"
                    value={resultScore}
                    onChange={(e) => setResultScore(e.target.value)}
                    placeholder="0-10 o 1-5"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" disabled={isApproved} onClick={approveProposal}>
                  Aprobar y Crear Proyecto
                </Button>
                <Button variant="outline" disabled={isApproved || !canEdit} onClick={markProposalLost}>
                  Marcar Perdida
                </Button>
                <Button onClick={generateServicePdf}>
                  Generar PDF del servicio
                </Button>
              </div>

              <div className="pt-2 border-t border-slate-200">
                <p className="text-xs font-medium text-slate-700 mb-2">Audit Log (ultimos cambios)</p>
                {recentAudits.length === 0 ? (
                  <p className="text-xs text-slate-500">Sin cambios auditados.</p>
                ) : (
                  <div className="space-y-1">
                    {recentAudits.map((a) => (
                      <div key={a.id} className="text-xs text-slate-600">
                        {new Date(a.at).toLocaleString()} ({a.actorRole}) {a.changes.map((c) => c.field).join(", ")}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
