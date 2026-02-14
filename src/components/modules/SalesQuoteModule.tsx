import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { mockClients } from "@/data/mockData";
import type { LeadLite, Quote } from "@/types/sales.types";
import type { UserRole } from "@/types/osi.types";
import { getOrCreateQuoteForLead, loadLeads, saveLeads } from "@/lib/salesStore";
import QuoteBuilder from "@/modules/sales/QuoteBuilder";

export function SalesQuoteModule({ userRole = "A" as UserRole }) {
  const [leads, setLeads] = useState<LeadLite[]>([]);
  const [selectedLead, setSelectedLead] = useState<LeadLite | null>(null);
  const [activeQuote, setActiveQuote] = useState<Quote | null>(null);

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
            leads.map((lead) => (
              <div key={lead.id} className="p-3 border rounded-lg flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium truncate">{lead.clientName}</p>
                  <p className="text-xs text-slate-500 truncate">
                    {lead.origin || "Sin origen"} {lead.destination ? `-> ${lead.destination}` : ""}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => openLead(lead)}>
                  <FileText className="h-4 w-4 mr-2" />
                  Abrir
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {selectedLead && activeQuote && (
        <QuoteBuilder userRole={userRole} lead={selectedLead} quote={activeQuote} onQuoteChange={setActiveQuote} />
      )}
    </div>
  );
}
