import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Boxes, FileText, Users, Truck, Scale, ShieldCheck } from "lucide-react";

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
import { canPromoteBookingToProject, promoteBookingToProject } from "@/lib/commercialCalendarStore";
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

export default function QuoteBuilder({
  userRole = "A",
  lead,
  quote,
  onQuoteChange,
}: {
  userRole?: UserRole;
  lead: LeadLite;
  quote: Quote;
  onQuoteChange: (q: Quote) => void;
}) {
  const isAdmin = userRole === "A";
  const [tab, setTab] = useState("scope");
  const [resultNote, setResultNote] = useState("");
  const [resultScore, setResultScore] = useState("");

  const crates = useMemo(() => loadCrateDrafts(), []);
  const isApproved = useMemo(
    () => lead.status === "WON" || loadProjects().some((p) => p.projectNumber === quote.proposalNumber),
    [lead.status, quote.proposalNumber, quote.updatedAt]
  );
  const canEdit = !isApproved || isAdmin;
  const selectedCrate = useMemo(() => {
    if (quote.crateDraftId) {
      const byId = crates.find((d) => d.id === quote.crateDraftId);
      if (byId) return byId;
    }
    return crates.find((d) => d.proposalNumber === quote.proposalNumber);
  }, [crates, quote.crateDraftId, quote.proposalNumber]);
  const recentAudits = useMemo(() => loadQuoteAudit(quote.id).slice(0, 5), [quote.id, quote.updatedAt]);

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

    const leadCurrent = loadLeads().find((l) => l.id === lead.id);
    const wonLead: LeadLite = {
      ...(leadCurrent ?? lead),
      status: "WON",
      updatedAt: new Date().toISOString(),
    };
    upsertLead(wonLead);
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
            <Input value={lead.destination ?? ""} disabled />
          </div>
          <div className="space-y-2">
            <Label>Notas</Label>
            <Input disabled={!canEdit} value={quote.notes ?? ""} onChange={(e) => update({ notes: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="scope">
            <Scale className="h-4 w-4 mr-2" />
            Alcance
          </TabsTrigger>
          <TabsTrigger value="crating">
            <Boxes className="h-4 w-4 mr-2" />
            Cajas
          </TabsTrigger>
          <TabsTrigger value="resources">
            <Users className="h-4 w-4 mr-2" />
            Recursos
          </TabsTrigger>
          <TabsTrigger value="third">
            <Truck className="h-4 w-4 mr-2" />
            Terceros
          </TabsTrigger>
          <TabsTrigger value="legal">
            <ShieldCheck className="h-4 w-4 mr-2" />
            Legales
          </TabsTrigger>
          <TabsTrigger value="summary">
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
                          <TableCell className="space-y-2">
                            <Input disabled={!canEdit} value={l.name} onChange={(e) => updateLine(l.id, { name: e.target.value })} />
                            <Input
                              disabled={!canEdit}
                              placeholder="Descripcion (opcional)"
                              value={l.description ?? ""}
                              onChange={(e) => updateLine(l.id, { description: e.target.value })}
                            />
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
                <Button
                  onClick={() =>
                    toast.message("PDF/Envio se hace en Etapa 3 (cuando haya backend o integracion WhatsApp).")
                  }
                >
                  Generar PDF (placeholder)
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
