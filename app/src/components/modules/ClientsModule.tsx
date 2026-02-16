import { useEffect, useMemo, useState } from "react";
import { Search, Plus, Phone, Mail, MapPin, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { mockClients } from "@/data/mockData";
import { toast } from "sonner";
import QuoteBuilder from "@/modules/sales/QuoteBuilder";
import { getOrCreateQuoteForLead, loadLeads, loadQuotes, saveLeads } from "@/lib/salesStore";
import { loadBookings } from "@/lib/commercialCalendarStore";
import { createCustomer, loadCustomers, saveCustomers, type Customer } from "@/lib/customersStore";
import { loadHistory, historyByCustomer, type CustomerHistoryItem } from "@/lib/customerHistoryStore";
import { generateQuoteServicePdf } from "@/lib/quotePdf";
import type { LeadLite, LeadStatus, Quote } from "@/types/sales.types";
import type { UserRole } from "@/types/osi.types";
import { CustomerPipelineBar } from "@/components/CustomerPipelineBar";

export function ClientsModule({ userRole = "A" as UserRole }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [crmLeads, setCrmLeads] = useState<LeadLite[]>([]);
  const [crmQuotes, setCrmQuotes] = useState<Quote[]>([]);
  const [historyItems, setHistoryItems] = useState<CustomerHistoryItem[]>([]);
  const [selectedLead, setSelectedLead] = useState<LeadLite | null>(null);
  const [activeQuote, setActiveQuote] = useState<Quote | null>(null);

  const [isNewOpen, setIsNewOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    legalName: "",
    displayName: "",
    taxId: "",
    phone: "",
    email: "",
    address: "",
    serviceOriginAddress: "",
    serviceDestinationAddress: "",
    billingLegalName: "",
    billingTaxId: "",
    billingAddress: "",
    billingEmail: "",
    billingPhone: "",
  });

  const refreshCRM = () => {
    setCrmLeads(loadLeads());
    setCrmQuotes(loadQuotes());
    setHistoryItems(loadHistory());
  };

  useEffect(() => {
    const existingCustomers = loadCustomers();
    if (existingCustomers.length > 0) {
      setCustomers(existingCustomers);
    } else {
      const seeded: Customer[] = mockClients.map((client) => ({
        id: String(client.id),
        legalName: client.legalName,
        displayName: client.displayName,
        taxId: "",
        phone: client.phone,
        email: client.email,
        address: client.address,
        serviceOriginAddress: client.address,
        serviceDestinationAddress: "",
        billingLegalName: client.legalName,
        billingTaxId: "",
        billingAddress: client.address,
        billingEmail: client.email,
        billingPhone: client.phone,
        status: client.status,
        createdAt: client.createdAt,
        updatedAt: client.updatedAt,
      }));
      saveCustomers(seeded);
      setCustomers(seeded);
    }

    const existingLeads = loadLeads();
    if (existingLeads.length === 0) {
      const seededLeads: LeadLite[] = mockClients.map((client) => ({
        id: String(client.id),
        customerId: String(client.id),
        clientName: client.displayName,
        status: "PROSPECT",
        origin: client.address,
        destination: "",
        phone: client.phone,
        email: client.email,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));
      saveLeads(seededLeads);
    }
    refreshCRM();
  }, []);

  const customerStatusMap = useMemo(() => {
    const out: Record<string, LeadStatus> = {};
    customers.forEach((c) => {
      const byCustomer = crmLeads
        .filter((l) => l.customerId === c.id || l.clientName === c.displayName || l.clientName === c.legalName)
        .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
      out[c.id] = byCustomer[0]?.status ?? "PROSPECT";
    });
    return out;
  }, [customers, crmLeads]);

  const filteredCustomers = useMemo(
    () =>
      customers.filter(
        (c) =>
          c.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.legalName.toLowerCase().includes(searchTerm.toLowerCase())
      ),
    [customers, searchTerm]
  );

  const openLead = (customer: Customer) => {
    const leads = loadLeads();
    const existing = leads.find((l) => l.customerId === customer.id);
    const lead: LeadLite = {
      ...(existing ?? {
        id: `lead_${customer.id}`,
        status: "PROSPECT" as const,
        createdAt: new Date().toISOString(),
      }),
      customerId: customer.id,
      clientName: customer.displayName,
      origin: customer.serviceOriginAddress || customer.address,
      destination: customer.serviceDestinationAddress || "",
      phone: customer.phone,
      email: customer.email,
      updatedAt: new Date().toISOString(),
    };

    saveLeads([lead, ...leads.filter((l) => l.id !== lead.id)]);

    setSelectedLead(lead);
    setActiveQuote(
      getOrCreateQuoteForLead(lead.id, lead.clientName, customer.id, {
        customerLegalName: customer.legalName,
        customerTaxId: customer.taxId,
        customerAddress: customer.address,
        serviceOriginAddress: customer.serviceOriginAddress,
        serviceDestinationAddress: customer.serviceDestinationAddress,
        billingLegalName: customer.billingLegalName,
        billingTaxId: customer.billingTaxId,
        billingAddress: customer.billingAddress,
        billingEmail: customer.billingEmail,
        billingPhone: customer.billingPhone,
      })
    );
    refreshCRM();
  };

  const viewCustomerReport = async (customer: Customer) => {
    const relatedLeads = crmLeads
      .filter((l) => l.customerId === customer.id || l.clientName === customer.displayName || l.clientName === customer.legalName)
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));

    const preferredLead = relatedLeads.find((l) => l.status === "WON") || relatedLeads[0];
    const leadIds = new Set(relatedLeads.map((l) => l.id));
    const relatedQuotes = crmQuotes
      .filter((q) => q.customerId === customer.id || leadIds.has(q.leadId))
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
    const quote = relatedQuotes[0];

    if (!quote) {
      toast.error("No existe cotización técnica para este cliente.");
      return;
    }

    const booking = loadBookings().find((b) => b.workNumber === quote.proposalNumber);
    await generateQuoteServicePdf({
      quote,
      lead: {
        clientName: preferredLead?.clientName || customer.displayName,
        origin: preferredLead?.origin || customer.serviceOriginAddress || customer.address,
        destination: preferredLead?.destination || customer.serviceDestinationAddress,
      },
      booking: booking
        ? {
            startDate: booking.startDate,
            endDate: booking.endDate,
          }
        : null,
    });
    toast.success("Reporte PDF generado.");
  };

  const openNewCustomerDialog = () => setIsNewOpen(true);

  const saveNewCustomer = () => {
    const missingCore =
      !newCustomer.legalName.trim() ||
      !newCustomer.taxId.trim() ||
      !newCustomer.phone.trim() ||
      !newCustomer.email.trim() ||
      !newCustomer.serviceOriginAddress.trim() ||
      !newCustomer.serviceDestinationAddress.trim();

    const missingBilling =
      !newCustomer.billingLegalName.trim() ||
      !newCustomer.billingTaxId.trim() ||
      !newCustomer.billingAddress.trim() ||
      !newCustomer.billingEmail.trim() ||
      !newCustomer.billingPhone.trim();

    if (missingCore || missingBilling) {
      toast.error("Completa todos los campos obligatorios del cliente y de facturación.");
      return;
    }

    if (String(newCustomer.taxId).trim().length < 5) {
      toast.error("Debe registrar una Cédula o RNC válido para el cliente.");
      return;
    }
    const created = createCustomer({
      legalName: newCustomer.legalName.trim(),
      displayName: newCustomer.legalName.trim(),
      taxId: newCustomer.taxId.trim(),
      phone: newCustomer.phone.trim(),
      email: newCustomer.email.trim(),
      address: newCustomer.address.trim() || undefined,
      serviceOriginAddress: newCustomer.serviceOriginAddress.trim(),
      serviceDestinationAddress: newCustomer.serviceDestinationAddress.trim(),
      billingLegalName: newCustomer.billingLegalName.trim(),
      billingTaxId: newCustomer.billingTaxId.trim(),
      billingAddress: newCustomer.billingAddress.trim(),
      billingEmail: newCustomer.billingEmail.trim(),
      billingPhone: newCustomer.billingPhone.trim(),
      status: "ACTIVE",
    });
    setCustomers((prev) => [created, ...prev]);
    setNewCustomer({
      legalName: "",
      displayName: "",
      taxId: "",
      phone: "",
      email: "",
      address: "",
      serviceOriginAddress: "",
      serviceDestinationAddress: "",
      billingLegalName: "",
      billingTaxId: "",
      billingAddress: "",
      billingEmail: "",
      billingPhone: "",
    });
    setIsNewOpen(false);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clientes</h1>
          <p className="text-slate-500">Gestion de clientes, propuestas e historial comercial</p>
        </div>
        <Button onClick={openNewCustomerDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Cliente
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">{customers.length}</p>
            <p className="text-sm text-slate-500">Total Clientes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{customers.filter((c) => c.status === "ACTIVE").length}</p>
            <p className="text-sm text-slate-500">Activos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">{crmQuotes.length}</p>
            <p className="text-sm text-slate-500">Propuestas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-emerald-600">{crmLeads.filter((l) => l.status === "WON").length}</p>
            <p className="text-sm text-slate-500">Proyectos Ganados</p>
          </CardContent>
        </Card>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder="Buscar cliente por nombre..."
          className="pl-10"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <Tabs defaultValue="clients">
        <TabsList>
          <TabsTrigger value="clients">Clientes</TabsTrigger>
          <TabsTrigger value="history">Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="clients" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredCustomers.map((customer) => (
              <ClientCard
                key={customer.id}
                customer={customer}
                status={customerStatusMap[customer.id] ?? "PROSPECT"}
                isSelected={selectedLead?.customerId === customer.id}
                onOpenQuote={() => openLead(customer)}
                onViewReport={() => void viewCustomerReport(customer)}
              />
            ))}
          </div>
          {selectedLead && activeQuote && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Cotizador tecnico para {selectedLead.clientName}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <QuoteBuilder
                  userRole={userRole}
                  lead={selectedLead}
                  quote={activeQuote}
                  onQuoteChange={(q) => {
                    setActiveQuote(q);
                    refreshCRM();
                  }}
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Historial por Cliente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {customers.map((c) => {
                const rows = historyByCustomer(c.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
                if (rows.length === 0) return null;

                return (
                  <div key={c.id} className="p-3 border rounded-lg">
                    <p className="font-semibold text-slate-900 mb-2">{c.displayName}</p>
                    <div className="space-y-2">
                      {rows.map((h) => (
                        <div key={h.id} className="grid grid-cols-1 md:grid-cols-5 gap-2 text-sm bg-slate-50 rounded-md p-2">
                          <div>
                            <p className="text-xs text-slate-500">Fecha</p>
                            <p>{new Date(h.createdAt).toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">Evento</p>
                            <p>{h.type}</p>
                          </div>
                          <div className="md:col-span-2">
                            <p className="text-xs text-slate-500">Comentario</p>
                            <p>{h.note || "Sin comentario"}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <div>
                              <p className="text-xs text-slate-500">Score</p>
                              <p>{h.score ?? "-"}</p>
                            </div>
                            {(h.type === "WON" || h.type === "LOST") && (
                              <Badge variant={h.type === "WON" ? "default" : "destructive"}>
                                {h.type === "WON" ? "Ganado" : "Perdido"}
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              {historyItems.length === 0 && <p className="text-slate-500">No hay eventos en historial.</p>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={isNewOpen} onOpenChange={setIsNewOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo Cliente</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Razon social / Nombre <span className="text-red-500">*</span></Label>
              <Input
                value={newCustomer.legalName}
                onChange={(e) =>
                  setNewCustomer((s) => ({
                    ...s,
                    legalName: e.target.value,
                    displayName: e.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Cédula / RNC (Cliente) <span className="text-red-500">*</span></Label>
              <Input
                value={newCustomer.taxId}
                onChange={(e) => setNewCustomer((s) => ({ ...s, taxId: e.target.value }))}
                placeholder="Cédula o RNC"
              />
            </div>
            <div className="space-y-2">
              <Label>Telefono <span className="text-red-500">*</span></Label>
              <Input value={newCustomer.phone} onChange={(e) => setNewCustomer((s) => ({ ...s, phone: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Email <span className="text-red-500">*</span></Label>
              <Input value={newCustomer.email} onChange={(e) => setNewCustomer((s) => ({ ...s, email: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Direccion</Label>
              <Input value={newCustomer.address} onChange={(e) => setNewCustomer((s) => ({ ...s, address: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Direccion del Servicio (Origen) <span className="text-red-500">*</span></Label>
              <Input
                value={newCustomer.serviceOriginAddress}
                onChange={(e) => setNewCustomer((s) => ({ ...s, serviceOriginAddress: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Direccion del Servicio (Destino) <span className="text-red-500">*</span></Label>
              <Input
                value={newCustomer.serviceDestinationAddress}
                onChange={(e) => setNewCustomer((s) => ({ ...s, serviceDestinationAddress: e.target.value }))}
              />
            </div>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Datos de Facturación</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setNewCustomer((f) => ({
                        ...f,
                        billingLegalName: f.legalName,
                        billingTaxId: f.taxId,
                        billingAddress: f.address,
                        billingEmail: f.email,
                        billingPhone: f.phone,
                      }));
                      toast.success("Datos de facturación clonados desde el cliente");
                    }}
                  >
                    Datos de Cliente igual a Facturacion
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Nombre / Razón Social (Facturación) <span className="text-red-500">*</span></Label>
                    <Input
                      value={newCustomer.billingLegalName}
                      onChange={(e) => setNewCustomer((f) => ({ ...f, billingLegalName: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>RNC / Cédula (Facturación) <span className="text-red-500">*</span></Label>
                    <Input
                      value={newCustomer.billingTaxId}
                      onChange={(e) => setNewCustomer((f) => ({ ...f, billingTaxId: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Dirección (Facturación) <span className="text-red-500">*</span></Label>
                    <Input
                      value={newCustomer.billingAddress}
                      onChange={(e) => setNewCustomer((f) => ({ ...f, billingAddress: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Email (Facturación) <span className="text-red-500">*</span></Label>
                    <Input
                      value={newCustomer.billingEmail}
                      onChange={(e) => setNewCustomer((f) => ({ ...f, billingEmail: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Teléfono (Facturación) <span className="text-red-500">*</span></Label>
                    <Input
                      value={newCustomer.billingPhone}
                      onChange={(e) => setNewCustomer((f) => ({ ...f, billingPhone: e.target.value }))}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveNewCustomer} disabled={!newCustomer.legalName.trim() || !newCustomer.taxId.trim()}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ClientCard({
  customer,
  status,
  isSelected,
  onOpenQuote,
  onViewReport,
}: {
  customer: Customer;
  status: LeadStatus;
  isSelected?: boolean;
  onOpenQuote: () => void;
  onViewReport: () => void;
}) {
  const hasActiveApprovedProject = status === "WON" && customer.status === "ACTIVE";

  return (
    <Card className={`hover:shadow-md transition-shadow ${isSelected ? "ring-2 ring-blue-500/40" : ""}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <Avatar className="h-12 w-12">
            <AvatarFallback className="bg-blue-100 text-blue-700">
              {customer.displayName.split(" ").map((n) => n[0]).join("").slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-semibold text-slate-900 truncate">{customer.displayName}</h4>
              <Badge variant={customer.status === "ACTIVE" ? "default" : "secondary"}>
                {customer.status === "ACTIVE" ? "Activo" : "Inactivo"}
              </Badge>
            </div>
            <p className="text-xs text-slate-500 truncate">{customer.legalName}</p>
            <div className="mt-3 space-y-1 text-sm text-slate-600">
              <div className="flex items-center gap-2">
                <Mail className="h-3 w-3" />
                <span className="truncate">{customer.email || "Sin email"}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="h-3 w-3" />
                <span>{customer.phone || "Sin telefono"}</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-3 w-3" />
                <span className="truncate">{customer.address || "Sin direccion"}</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-3 w-3" />
                <span className="truncate">
                  Destino: {customer.serviceDestinationAddress || "Sin destino"}
                </span>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100">
              <CustomerPipelineBar status={status} />
            </div>
            <div className="mt-3">
              {hasActiveApprovedProject ? (
                <Button variant="default" size="sm" onClick={onViewReport}>
                  <FileText className="h-4 w-4 mr-2" />
                  Ver reporte
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={onOpenQuote}>
                  <FileText className="h-4 w-4 mr-2" />
                  Abrir cotizacion tecnica
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
