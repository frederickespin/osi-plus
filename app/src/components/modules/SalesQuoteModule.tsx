import { useEffect, useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { mockClients } from "@/data/mockData";
import type { LeadLite, Quote } from "@/types/sales.types";
import type { UserRole } from "@/types/osi.types";
import { getOrCreateQuoteForLead, loadLeads, saveLeads } from "@/lib/salesStore";
import { loadProjects } from "@/lib/projectsStore";
import { cn } from "@/lib/utils";
import QuoteBuilder from "@/modules/sales/QuoteBuilder";

export function SalesQuoteModule({ userRole = "A" as UserRole }) {
  const [leads, setLeads] = useState<LeadLite[]>([]);
  const [selectedLead, setSelectedLead] = useState<LeadLite | null>(null);
  const [activeQuote, setActiveQuote] = useState<Quote | null>(null);
  const projects = useMemo(() => loadProjects(), [leads.length, activeQuote?.updatedAt]);

  const getLeadVisualState = (lead: LeadLite) => {
    const isProject = lead.status === "WON" || projects.some((p) => p.leadId === lead.id);
    if (isProject) {
      return {
        label: "Proyecto",
        detail: "Confirmado",
        badgeClass: "border-emerald-200 bg-emerald-100 text-emerald-800",
        cardClass: "border-emerald-200 bg-emerald-50/50",
      };
    }
    if (lead.status === "LOST") {
      return {
        label: "Prospecto",
        detail: "Perdido",
        badgeClass: "border-rose-200 bg-rose-100 text-rose-800",
        cardClass: "border-rose-200 bg-rose-50/60",
      };
    }
    return {
      label: "Prospecto",
      detail: "Activo",
      badgeClass: "border-indigo-200 bg-indigo-100 text-indigo-800",
      cardClass: "border-indigo-200 bg-indigo-50/60",
    };
  };

  useEffect(() => {
    const stored = loadLeads();
    if (stored.length > 0) {
      setLeads(stored);
      return;
    }

    const seeded: LeadLite[] = mockClients.slice(0, 15).map((client) => ({
      id: String(client.id),
      clientName: client.displayName,
      status: "PROSPECT",
      origin: client.address,
      destination: "",
      phone: client.phone,
      email: client.email,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    saveLeads(seeded);
    setLeads(seeded);
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem("osi-plus.salesQuote.openContext");
    if (!raw) return;
    localStorage.removeItem("osi-plus.salesQuote.openContext");

    let ctx: {
      leadId?: string;
      customerId?: string;
      customerName?: string;
      proposalNumber?: string;
    } | null = null;
    try {
      ctx = JSON.parse(raw);
    } catch {
      ctx = null;
    }
    if (!ctx) return;

    const allLeads = loadLeads();
    const foundLead =
      (ctx.leadId ? allLeads.find((l) => l.id === ctx.leadId) : undefined) ||
      (ctx.customerId ? allLeads.find((l) => l.customerId === ctx.customerId) : undefined) ||
      (ctx.customerName ? allLeads.find((l) => l.clientName === ctx.customerName) : undefined);

    if (!foundLead) return;

    setSelectedLead(foundLead);
    setActiveQuote(getOrCreateQuoteForLead(foundLead.id, foundLead.clientName, foundLead.customerId));
  }, [leads.length]);

  const openLead = (lead: LeadLite) => {
    setSelectedLead(lead);
    setActiveQuote(getOrCreateQuoteForLead(lead.id, lead.clientName, lead.customerId));
  };

  const handleLeadChange = (updatedLead: LeadLite) => {
    setLeads((prev) => [updatedLead, ...prev.filter((l) => l.id !== updatedLead.id)]);
    setSelectedLead((prev) => (prev?.id === updatedLead.id ? updatedLead : prev));
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Cotizador Tecnico</h1>
        <p className="text-slate-500">CRM comercial con cotizacion por lead y enlace a Cajas de Madera.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Leads</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {leads.length === 0 ? (
            <p className="text-slate-500">No hay leads disponibles.</p>
          ) : (
            leads.map((lead) => {
              const visual = getLeadVisualState(lead);
              const isSelected = selectedLead?.id === lead.id;
              return (
              <div
                key={lead.id}
                className={cn(
                  "p-3 border rounded-lg flex items-center justify-between gap-2 transition-colors",
                  visual.cardClass,
                  isSelected && "ring-2 ring-[#373363] border-[#373363] bg-[#373363]/10"
                )}
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">{lead.clientName}</p>
                  <p className="text-xs mt-1">
                    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 font-semibold", visual.badgeClass)}>
                      {visual.label}: {visual.detail}
                    </span>
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    {lead.origin || "Sin origen"} {lead.destination ? `-> ${lead.destination}` : ""}
                  </p>
                </div>
                <Button
                  variant={isSelected ? "default" : "outline"}
                  size="sm"
                  className={cn(isSelected && "bg-[#373363] hover:bg-[#2d2a52]")}
                  onClick={() => openLead(lead)}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  {isSelected ? "Abierto" : "Abrir"}
                </Button>
              </div>
            )})
          )}
        </CardContent>
      </Card>

      {selectedLead && activeQuote && (
        <QuoteBuilder
          userRole={userRole}
          lead={selectedLead}
          quote={activeQuote}
          onQuoteChange={setActiveQuote}
          onLeadChange={handleLeadChange}
        />
      )}
    </div>
  );
}
