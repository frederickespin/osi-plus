import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Upload, Trash2, FileText, Settings2, Boxes, Wrench, Calculator, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { useForm } from "react-hook-form";
import type { Resolver, SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import CrateSettingsModule from "@/modules/CrateSettingsModule";
import {
  CrateItemSchema,
  type CrateItemInput,
  type CrateDraft,
  createDraftFromContext,
  loadActiveDraft,
  upsertDraft,
  findDraftByProposal,
  setActiveDraftId,
} from "@/lib/crateDraftStore";
import { loadCrateSettings } from "@/lib/crateSettingsStore";
import { runNesting, runEngineering, runCosting } from "@/lib/crateEngine";
import type { CrateProfileKey } from "@/lib/crateSettingsStore";

type LeadLite = { id: string; clientName?: string; name?: string; status?: string; origin?: string; destination?: string };

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

function parseDelimited(text: string): Array<Partial<CrateItemInput>> {
  const lines = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  // detect delimiter (csv ; , \t)
  const sample = lines[0];
  const delimiter =
    sample.includes(";") ? ";" :
    sample.includes("\t") ? "\t" : ",";

  const first = lines[0].split(delimiter).map(s => s.trim());
  const hasHeader = first.some(h => /name|nombre|length|largo|width|ancho|height|alto|weight|peso|fragility|fragilidad|qty|cantidad/i.test(h));

  let headers: string[] = [];
  let startIndex = 0;

  if (hasHeader) {
    headers = first.map(h => h.toLowerCase());
    startIndex = 1;
  } else {
    // orden fijo si no hay header:
    // name,lengthCm,widthCm,heightCm,weightKg,fragility,qty
    headers = ["name","lengthcm","widthcm","heightcm","weightkg","fragility","qty"];
  }

  const out: Array<Partial<CrateItemInput>> = [];

  for (let i = startIndex; i < lines.length; i++) {
    const cols = lines[i].split(delimiter).map(s => s.trim());
    if (cols.length < 4) continue;

    const row: any = {};
    headers.forEach((h, idx) => row[h] = cols[idx]);

    const name = row.name || row.nombre || "";
    const lengthCm = Number(row.lengthcm ?? row.largo ?? row.length ?? "");
    const widthCm = Number(row.widthcm ?? row.ancho ?? row.width ?? "");
    const heightCm = Number(row.heightcm ?? row.alto ?? row.height ?? "");
    const weightKg = Number(row.weightkg ?? row.peso ?? row.weight ?? "0");
    const fragility = Number(row.fragility ?? row.fragilidad ?? "3");
    const qty = Number(row.qty ?? row.cantidad ?? "1");

    if (!name || !Number.isFinite(lengthCm) || !Number.isFinite(widthCm) || !Number.isFinite(heightCm)) continue;

    out.push({
      name,
      lengthCm,
      widthCm,
      heightCm,
      weightKg: Number.isFinite(weightKg) ? weightKg : 0,
      fragility: ([1,2,3,4,5].includes(fragility) ? fragility : 3) as any,
      qty: Number.isFinite(qty) && qty > 0 ? Math.floor(qty) : 1,
      allowRotation: true,
      stackable: false,
    });
  }

  return out;
}

const ItemFormSchema = z.object({
  name: z.string().min(1, "Nombre obligatorio"),
  qty: z.coerce.number().int().min(1),
  lengthCm: z.coerce.number().positive(),
  widthCm: z.coerce.number().positive(),
  heightCm: z.coerce.number().positive(),
  weightKg: z.coerce.number().min(0),
  fragility: z.coerce.number().int().min(1).max(5),
  allowRotation: z.boolean().optional().default(true),
  stackable: z.boolean().optional().default(false),
  notes: z.string().optional(),
});

type ItemForm = z.infer<typeof ItemFormSchema>;
type CrateTab = "items" | "nesting" | "engineering" | "pricing" | "settings";
type CrateOpenTab = "input" | "nesting" | "engineering" | "costing" | "settings";
type CrateWoodOpenContext = {
  openTab?: CrateOpenTab;
  mode?: "settingsOnly" | "full";
  customerId?: string;
  customerName?: string;
  proposalNumber?: string;
  quoteId?: string;
  leadId?: string;
};

function mapOpenTabToInternal(tab?: CrateOpenTab): CrateTab {
  if (tab === "input") return "items";
  if (tab === "costing") return "pricing";
  if (tab === "nesting" || tab === "engineering" || tab === "settings") return tab;
  return "items";
}

const buildDemoItems = (): CrateItemInput[] => ([
  { id: `demo_${Date.now()}_01`, name: "TV 55 pulgadas", qty: 1, lengthCm: 130, widthCm: 18, heightCm: 82, weightKg: 18, fragility: 4, allowRotation: true, stackable: false },
  { id: `demo_${Date.now()}_02`, name: "Monitor 27 pulgadas", qty: 2, lengthCm: 65, widthCm: 14, heightCm: 46, weightKg: 7, fragility: 4, allowRotation: true, stackable: false },
  { id: `demo_${Date.now()}_03`, name: "CPU Torre", qty: 2, lengthCm: 46, widthCm: 24, heightCm: 50, weightKg: 11, fragility: 3, allowRotation: true, stackable: false },
  { id: `demo_${Date.now()}_04`, name: "Impresora Láser", qty: 1, lengthCm: 60, widthCm: 48, heightCm: 42, weightKg: 16, fragility: 3, allowRotation: true, stackable: false },
  { id: `demo_${Date.now()}_05`, name: "Cuadro enmarcado grande", qty: 1, lengthCm: 120, widthCm: 8, heightCm: 95, weightKg: 9, fragility: 5, allowRotation: false, stackable: false },
  { id: `demo_${Date.now()}_06`, name: "Escultura mediana", qty: 1, lengthCm: 55, widthCm: 40, heightCm: 70, weightKg: 22, fragility: 5, allowRotation: false, stackable: false },
  { id: `demo_${Date.now()}_07`, name: "Caja cristalería 1", qty: 1, lengthCm: 52, widthCm: 36, heightCm: 34, weightKg: 12, fragility: 5, allowRotation: true, stackable: false },
  { id: `demo_${Date.now()}_08`, name: "Caja cristalería 2", qty: 1, lengthCm: 52, widthCm: 36, heightCm: 34, weightKg: 11, fragility: 5, allowRotation: true, stackable: false },
  { id: `demo_${Date.now()}_09`, name: "Bocina profesional", qty: 2, lengthCm: 74, widthCm: 42, heightCm: 41, weightKg: 19, fragility: 3, allowRotation: true, stackable: false },
  { id: `demo_${Date.now()}_10`, name: "Consola de mezcla", qty: 1, lengthCm: 95, widthCm: 58, heightCm: 24, weightKg: 14, fragility: 4, allowRotation: false, stackable: false },
  { id: `demo_${Date.now()}_11`, name: "Servidor rack 2U", qty: 1, lengthCm: 75, widthCm: 58, heightCm: 12, weightKg: 13, fragility: 4, allowRotation: false, stackable: false },
  { id: `demo_${Date.now()}_12`, name: "Switch de red", qty: 3, lengthCm: 48, widthCm: 34, heightCm: 9, weightKg: 4, fragility: 3, allowRotation: true, stackable: true },
  { id: `demo_${Date.now()}_13`, name: "Torno pequeño", qty: 1, lengthCm: 110, widthCm: 75, heightCm: 65, weightKg: 140, fragility: 2, allowRotation: false, stackable: false },
  { id: `demo_${Date.now()}_14`, name: "Compresor", qty: 1, lengthCm: 95, widthCm: 62, heightCm: 72, weightKg: 88, fragility: 2, allowRotation: false, stackable: false },
  { id: `demo_${Date.now()}_15`, name: "Generador portátil", qty: 1, lengthCm: 98, widthCm: 60, heightCm: 66, weightKg: 95, fragility: 2, allowRotation: false, stackable: false },
]);

export default function CrateWoodModule(props?: { initialTab?: CrateOpenTab; mode?: "settingsOnly" | "full" }) {
  const mode = props?.mode ?? "full";
  const [activeTab, setActiveTab] = useState<CrateTab>(() =>
    mode === "settingsOnly" ? "settings" : mapOpenTabToInternal(props?.initialTab)
  );
  const [draft, setDraft] = useState<CrateDraft>(() => loadActiveDraft());

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Detecta leads si existen (cuando el CRM esté listo)
  const leads = useMemo(() => {
    const raw = localStorage.getItem("osi-plus.leads");
    const parsed = safeParse<LeadLite[]>(raw, []);
    return Array.isArray(parsed) ? parsed : [];
  }, []);

  const form = useForm<ItemForm>({
    resolver: zodResolver(ItemFormSchema) as Resolver<ItemForm>,
    defaultValues: {
      name: "",
      qty: 1,
      lengthCm: 0,
      widthCm: 0,
      heightCm: 0,
      weightKg: 0,
      fragility: 3,
      allowRotation: true,
      stackable: false,
      notes: "",
    },
  });

  const persist = (next: CrateDraft) => {
    const saved = upsertDraft(next);
    setDraft(saved);
  };

  const nestingStats = useMemo(() => {
    const boxes = draft.plan?.nesting?.boxes ?? [];
    const inputRows = draft.items.length;
    const inputUnits = draft.items.reduce((acc, it) => acc + (it.qty ?? 0), 0);
    const outputBoxes = boxes.length;
    const consolidatedBoxes = boxes.filter((b) => b.type === "CONSOLIDATED");
    const consolidatedUnits = consolidatedBoxes.reduce((acc, b) => acc + (b.itemCount ?? 0), 0);
    const savingsByUnits = consolidatedBoxes.reduce((acc, b) => acc + Math.max(0, (b.itemCount ?? 0) - 1), 0);
    const savingsByRows = consolidatedBoxes.reduce((acc, b) => {
      const uniqRows = new Set((b.items ?? []).map((it: any) => it.sourceItemId)).size;
      return acc + Math.max(0, uniqRows - 1);
    }, 0);

    return {
      inputRows,
      inputUnits,
      outputBoxes,
      consolidatedUnits,
      savingsByUnits,
      savingsByRows,
      expectedByRows: Math.max(0, inputRows - savingsByRows),
      expectedByUnits: Math.max(0, inputUnits - savingsByUnits),
    };
  }, [draft.items, draft.plan?.nesting?.boxes]);

  useEffect(() => {
    const raw = localStorage.getItem("osi-plus.crateWood.openContext");
    if (!raw) return;

    localStorage.removeItem("osi-plus.crateWood.openContext");
    const ctx = safeParse<CrateWoodOpenContext>(raw, null as any);
    if (!ctx) return;

    // 1) Tab inicial (si no es settingsOnly)
    if (mode !== "settingsOnly" && ctx.openTab) {
      setActiveTab(mapOpenTabToInternal(ctx.openTab));
    }

    // 2) Draft por proposalNumber (vínculo principal con cotización)
    if (ctx.proposalNumber) {
      const existing = findDraftByProposal(ctx.proposalNumber);
      const nextDraft = existing ?? createDraftFromContext(ctx);

      // Persist + set activo
      setActiveDraftId(nextDraft.id);
      upsertDraft(nextDraft);

      setDraft(nextDraft);
      return;
    }

    // 3) Fallback: si no hay proposalNumber pero hay cliente, vincula al draft activo actual
    if (ctx.customerId || ctx.customerName || ctx.quoteId || ctx.leadId) {
      const base = loadActiveDraft();
      const updated: CrateDraft = {
        ...base,
        customerId: ctx.customerId ?? (base as any).customerId,
        customerName: ctx.customerName ?? (base as any).customerName,
        quoteId: ctx.quoteId ?? (base as any).quoteId,
        leadId: ctx.leadId ?? (base as any).leadId,
      };

      setActiveDraftId(updated.id);
      upsertDraft(updated);
      setDraft(updated);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (draft.items.length > 0 || draft.proposalNumber) return;
    const demoItems = buildDemoItems();
    persist({
      ...draft,
      clientName: draft.clientName?.trim() ? draft.clientName : "Cliente Demo Pruebas",
      serviceType: draft.serviceType ?? "Exportación",
      origin: draft.origin ?? "Santo Domingo",
      destination: draft.destination ?? "Miami",
      items: demoItems,
    });
    toast.message("Se cargaron 15 artículos demo para pruebas.");
  }, []);

  const runStageNesting = () => {
    const settings = loadCrateSettings();
    const nesting = runNesting(draft, settings);

    const consolidated = nesting.boxes.filter((b: any) => b.type === "CONSOLIDATED");
    const consolidatedUnits = consolidated.reduce((acc: number, b: any) => acc + (b.itemCount ?? 0), 0);

    persist({
      ...draft,
      plan: {
        settingsVersionId: settings.meta.versionId,
        nesting,
        engineering: undefined,
        costing: undefined,
        overrides: draft.plan?.overrides ?? { profileByBoxId: {} },
      },
    });

    toast.success(
      `Nesting listo: ${nesting.boxes.length} cajas. Consolidado: ${consolidatedUnits} unidades en ${consolidated.length} cajas.`
    );
  };

  const setBoxProfile = (boxId: string, profile: CrateProfileKey) => {
    const prev = draft.plan?.overrides?.profileByBoxId ?? {};
    persist({
      ...draft,
      plan: {
        ...(draft.plan ?? { settingsVersionId: loadCrateSettings().meta.versionId }),
        overrides: { profileByBoxId: { ...prev, [boxId]: profile } },
        engineering: undefined,
        costing: undefined,
      },
    });
  };

  const runStageEngineering = () => {
    const settings = loadCrateSettings();
    const boxes = draft.plan?.nesting?.boxes ?? [];
    if (!boxes.length) {
      toast.error("Primero ejecuta Nesting");
      return;
    }

    const map = (draft.plan?.overrides?.profileByBoxId ?? {}) as Record<string, CrateProfileKey>;
    const eng = runEngineering(draft, settings, boxes, map);

    persist({
      ...draft,
      plan: {
        settingsVersionId: settings.meta.versionId,
        nesting: draft.plan?.nesting,
        overrides: draft.plan?.overrides ?? { profileByBoxId: {} },
        engineering: eng,
        costing: undefined,
      },
    });

    toast.success("Ingeniería lista");
  };

  const runStageCosting = () => {
    const settings = loadCrateSettings();
    const engBoxes = draft.plan?.engineering?.boxes ?? [];
    if (!engBoxes.length) {
      toast.error("Primero ejecuta Ingeniería");
      return;
    }

    const costing = runCosting(settings, engBoxes);

    persist({
      ...draft,
      plan: {
        settingsVersionId: settings.meta.versionId,
        nesting: draft.plan?.nesting,
        overrides: draft.plan?.overrides ?? { profileByBoxId: {} },
        engineering: draft.plan?.engineering,
        costing,
      },
    });

    toast.success("Costos listos");
  };

  const addItem = (values: ItemForm) => {
    const item: CrateItemInput = {
      id: crypto?.randomUUID ? crypto.randomUUID() : `it_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      name: values.name.trim(),
      qty: values.qty,
      lengthCm: values.lengthCm,
      widthCm: values.widthCm,
      heightCm: values.heightCm,
      weightKg: values.weightKg ?? 0,
      fragility: values.fragility as any,
      allowRotation: !!values.allowRotation,
      stackable: !!values.stackable,
      notes: values.notes?.trim() || undefined,
    };

    const ok = CrateItemSchema.safeParse(item);
    if (!ok.success) {
      toast.error("Datos inválidos en el artículo");
      return;
    }

    persist({ ...draft, items: [item, ...draft.items] });
    setIsAddOpen(false);
    form.reset();
    toast.success("Artículo agregado");
  };

  const removeItem = (id: string) => {
    persist({ ...draft, items: draft.items.filter(i => i.id !== id) });
  };

  const handleImport = () => {
    const rows = parseDelimited(importText);
    if (!rows.length) {
      toast.error("No pude leer el listado. Usa CSV con columnas o orden: name,lengthCm,widthCm,heightCm,weightKg,fragility,qty");
      return;
    }

    const items: CrateItemInput[] = [];
    for (const r of rows) {
      const candidate: CrateItemInput = {
        id: crypto?.randomUUID ? crypto.randomUUID() : `it_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        name: String(r.name || "").trim(),
        qty: Number(r.qty ?? 1),
        lengthCm: Number(r.lengthCm),
        widthCm: Number(r.widthCm),
        heightCm: Number(r.heightCm),
        weightKg: Number(r.weightKg ?? 0),
        fragility: (r.fragility ?? 3) as any,
        allowRotation: r.allowRotation ?? true,
        stackable: r.stackable ?? false,
        notes: r.notes,
      };

      const ok = CrateItemSchema.safeParse(candidate);
      if (ok.success) items.push(ok.data);
    }

    if (!items.length) {
      toast.error("El listado no generó artículos válidos");
      return;
    }

    persist({ ...draft, items: [...items, ...draft.items] });
    setImportText("");
    toast.success(`Importados ${items.length} artículos`);
  };

  const handleImportFile = async (file: File) => {
    const text = await file.text();
    setImportText(text);
    toast.message("Archivo cargado. Revisa y presiona Importar.");
  };

  const linkLead = (leadId: string) => {
    const lead = leads.find(l => String(l.id) === String(leadId));
    if (!lead) return;

    persist({
      ...draft,
      leadId: String(lead.id),
      clientName: (lead.clientName || lead.name || draft.clientName || "").trim(),
      origin: lead.origin ?? draft.origin,
      destination: lead.destination ?? draft.destination,
    });

    toast.success("Lead vinculado a Cajas de Madera");
  };

  const goBackToQuote = () => {
    window.dispatchEvent(
      new CustomEvent("osi:salesquote:open", {
        detail: {
          customerId: draft.customerId,
          customerName: draft.customerName || draft.clientName,
          proposalNumber: draft.proposalNumber,
          quoteId: draft.quoteId,
          leadId: draft.leadId,
        },
      })
    );
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Boxes className="h-5 w-5" />
            Cajas de Madera (Comercial)
          </h1>
          <p className="text-slate-500">
            Captura artículos → nesting → ingeniería → costos → cotización.
          </p>
        </div>
      </div>

      {/* Datos del cliente / vínculo lead */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Cliente y datos generales
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {draft.proposalNumber && (
            <div className="space-y-2">
              <Label>No. Propuesta</Label>
              <Input value={draft.proposalNumber} disabled />
            </div>
          )}
          <div className="space-y-2">
            <Label>Nombre del cliente <span className="text-red-500">*</span></Label>
            <Input
              value={draft.clientName}
              placeholder="Ej: Juan Pérez / Empresa"
              onChange={(e) => persist({ ...draft, clientName: e.target.value })}
            />
            <p className="text-xs text-slate-500">Esto será el “título” del cálculo dentro de Ventas.</p>
          </div>

          <div className="space-y-2">
            <Label>Origen</Label>
            <Input
              value={draft.origin ?? ""}
              placeholder="Dirección origen"
              onChange={(e) => persist({ ...draft, origin: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label>Destino</Label>
            <Input
              value={draft.destination ?? ""}
              placeholder="Dirección destino"
              onChange={(e) => persist({ ...draft, destination: e.target.value })}
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label>Tipo de servicio</Label>
            <Input
              value={draft.serviceType ?? ""}
              placeholder="Local / Exportación / Arte / IT / Maquinaria"
              onChange={(e) => persist({ ...draft, serviceType: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label>Vincular Lead (si existe)</Label>
            <Select value={draft.leadId ?? ""} onValueChange={linkLead}>
              <SelectTrigger>
                <SelectValue placeholder={leads.length ? "Seleccionar lead..." : "No hay leads aún"} />
              </SelectTrigger>
              <SelectContent>
                {leads.map((l) => (
                  <SelectItem key={String(l.id)} value={String(l.id)}>
                    {(l.clientName || l.name || `Lead ${l.id}`) as string}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {draft.leadId && <p className="text-xs text-slate-500">Lead vinculado: {draft.leadId}</p>}
          </div>

          <div className="md:col-span-3 flex justify-end">
            <Button variant="outline" onClick={goBackToQuote}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Volver
            </Button>
          </div>
        </CardContent>
      </Card>

      {mode === "settingsOnly" ? (
        <CrateSettingsModule />
      ) : (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="items">
              <FileText className="h-4 w-4 mr-2" /> Captura / Importación
            </TabsTrigger>
            <TabsTrigger value="nesting">
              <Boxes className="h-4 w-4 mr-2" /> Nesting
            </TabsTrigger>
            <TabsTrigger value="engineering">
              <Wrench className="h-4 w-4 mr-2" /> Ingeniería
            </TabsTrigger>
            <TabsTrigger value="pricing">
              <Calculator className="h-4 w-4 mr-2" /> Costos
            </TabsTrigger>
            <TabsTrigger value="settings">
              <Settings2 className="h-4 w-4 mr-2" /> Configuración
            </TabsTrigger>
          </TabsList>
        

        {/* TAB 1: Captura */}
        <TabsContent value="items" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-lg">Artículos</CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setIsAddOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Agregar
                </Button>

                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleImportFile(f);
                    if (fileRef.current) fileRef.current.value = "";
                  }}
                />
                <Button variant="outline" onClick={() => fileRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-2" />
                  Cargar CSV
                </Button>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Import box */}
              <div className="p-4 border rounded-lg space-y-2">
                <Label>Importación rápida (pegar CSV)</Label>
                <textarea
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  className="w-full min-h-[120px] border rounded-md p-2 text-sm"
                  placeholder="CSV con header (recomendado): name,lengthCm,widthCm,heightCm,weightKg,fragility,qty"
                />
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-500">
                    Acepta separadores: coma (,), punto y coma (;), o tab.
                  </p>
                  <Button onClick={handleImport}>
                    Importar
                  </Button>
                </div>
              </div>

              {/* Items table */}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Artículo</TableHead>
                    <TableHead>Medidas (cm)</TableHead>
                    <TableHead>Peso</TableHead>
                    <TableHead>Frag.</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Rot.</TableHead>
                    <TableHead>Stack</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {draft.items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-slate-500 py-8">
                        Agrega artículos manualmente o importa un CSV.
                      </TableCell>
                    </TableRow>
                  ) : (
                    draft.items.map((it) => (
                      <TableRow key={it.id}>
                        <TableCell className="font-medium">{it.name}</TableCell>
                        <TableCell>{it.lengthCm} × {it.widthCm} × {it.heightCm}</TableCell>
                        <TableCell>{it.weightKg} kg</TableCell>
                        <TableCell>{it.fragility}</TableCell>
                        <TableCell>{it.qty}</TableCell>
                        <TableCell>{it.allowRotation ? "Sí" : "No"}</TableCell>
                        <TableCell>{it.stackable ? "Sí" : "No"}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => removeItem(it.id)}>
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              <div className="flex items-center justify-end">
                <Button
                  disabled={!draft.clientName.trim() || draft.items.length === 0}
                  onClick={() => {
                    if (!draft.clientName.trim()) {
                      toast.error("Coloca el nombre del cliente");
                      return;
                    }
                    if (draft.items.length === 0) {
                      toast.error("Agrega al menos 1 artículo");
                      return;
                    }
                    setActiveTab("nesting");
                    toast.message("Siguiente: Nesting (pendiente de implementar)");
                  }}
                >
                  Continuar a Nesting →
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Add item dialog */}
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Agregar artículo</DialogTitle>
              </DialogHeader>

              <form
                onSubmit={form.handleSubmit(addItem as SubmitHandler<ItemForm>)}
                className="space-y-4"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2 md:col-span-2">
                    <Label>Nombre <span className="text-red-500">*</span></Label>
                    <Input {...form.register("name")} placeholder='Ej: "Cuadro óleo"' />
                    {form.formState.errors.name?.message && (
                      <p className="text-xs text-red-600">{form.formState.errors.name.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Largo (cm) *</Label>
                    <Input type="number" step="0.01" {...form.register("lengthCm")} />
                  </div>
                  <div className="space-y-2">
                    <Label>Ancho (cm) *</Label>
                    <Input type="number" step="0.01" {...form.register("widthCm")} />
                  </div>
                  <div className="space-y-2">
                    <Label>Alto (cm) *</Label>
                    <Input type="number" step="0.01" {...form.register("heightCm")} />
                  </div>
                  <div className="space-y-2">
                    <Label>Peso (kg)</Label>
                    <Input type="number" step="0.01" {...form.register("weightKg")} />
                  </div>

                  <div className="space-y-2">
                    <Label>Fragilidad (1-5)</Label>
                    <Input type="number" min={1} max={5} {...form.register("fragility")} />
                  </div>
                  <div className="space-y-2">
                    <Label>Cantidad</Label>
                    <Input type="number" min={1} {...form.register("qty")} />
                  </div>

                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={!!form.watch("allowRotation")}
                      onCheckedChange={(v) => form.setValue("allowRotation", !!v)}
                    />
                    <Label>Permitir rotación 90°</Label>
                  </div>

                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={!!form.watch("stackable")}
                      onCheckedChange={(v) => form.setValue("stackable", !!v)}
                    />
                    <Label>Apilable</Label>
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label>Notas</Label>
                    <Input {...form.register("notes")} placeholder="Opcional" />
                  </div>
                </div>

                <DialogFooter className="gap-2">
                  <Button variant="outline" type="button" onClick={() => setIsAddOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit">Agregar</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="nesting" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Nesting</CardTitle>
              <Button onClick={runStageNesting} disabled={!draft.clientName.trim() || draft.items.length === 0}>
                Ejecutar Nesting
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {!draft.plan?.nesting?.boxes?.length ? (
                <p className="text-slate-500">Ejecuta nesting para generar las cajas resultantes.</p>
              ) : (
                <>
                  <div className="p-3 bg-slate-50 rounded-lg text-sm grid grid-cols-1 md:grid-cols-4 gap-2">
                    <div>
                      <p className="text-slate-500 text-xs">Artículos (filas)</p>
                      <p className="font-semibold">{nestingStats.inputRows}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 text-xs">Unidades (sum qty)</p>
                      <p className="font-semibold">{nestingStats.inputUnits}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 text-xs">Cajas resultantes</p>
                      <p className="font-semibold">{nestingStats.outputBoxes}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 text-xs">Ahorro por consolidación</p>
                      <p className="font-semibold">
                        {nestingStats.savingsByUnits} (unidades) / {nestingStats.savingsByRows} (filas)
                      </p>
                    </div>
                    <div className="md:col-span-4 text-xs text-slate-600">
                      Resultado esperado por filas: {nestingStats.expectedByRows}. Resultado esperado por unidades: {nestingStats.expectedByUnits}.
                    </div>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Items</TableHead>
                        <TableHead>Artículos (nombres)</TableHead>
                        <TableHead>Dim (cm)</TableHead>
                        <TableHead>Peso</TableHead>
                        <TableHead>Frag</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {draft.plan.nesting.boxes.map((b, idx) => (
                        <TableRow key={b.id}>
                          <TableCell className="font-medium">{idx + 1}</TableCell>
                          <TableCell>{b.type}</TableCell>
                          <TableCell>{b.itemCount}</TableCell>
                          <TableCell className="max-w-[360px] truncate">
                            {(b.items ?? []).map((it: any) => it.name).join(", ") || "Sin detalle"}
                          </TableCell>
                          <TableCell>{b.faceACm.toFixed(1)} × {b.faceBCm.toFixed(1)} × {b.depthCm.toFixed(1)}</TableCell>
                          <TableCell>{(b.totalWeightKg ?? 0).toFixed(2)} kg</TableCell>
                          <TableCell>{b.maxFragility}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}

              <div className="flex justify-end">
                <Button
                  variant="outline"
                  disabled={!draft.plan?.nesting?.boxes?.length}
                  onClick={() => setActiveTab("engineering")}
                >
                  Continuar a Ingeniería →
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="engineering" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Ingeniería</CardTitle>
              <Button onClick={runStageEngineering} disabled={!draft.plan?.nesting?.boxes?.length}>
                Ejecutar Ingeniería
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {!draft.plan?.nesting?.boxes?.length ? (
                <p className="text-slate-500">Primero ejecuta Nesting.</p>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Perfil</TableHead>
                        <TableHead>Interna final (cm)</TableHead>
                        <TableHead>Madera</TableHead>
                        <TableHead>Skid</TableHead>
                        <TableHead>Plywood</TableHead>
                        <TableHead>BOM</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(draft.plan.engineering?.boxes ?? draft.plan.nesting.boxes).map((b: any, idx: number) => {
                        const selected = (draft.plan?.overrides?.profileByBoxId?.[b.id] as CrateProfileKey | undefined) ?? "STANDARD_LOCAL";
                        const hasEng = !!draft.plan?.engineering?.boxes?.length;

                        return (
                          <TableRow key={b.id}>
                            <TableCell className="font-medium">{idx + 1}</TableCell>
                            <TableCell>
                              <Select value={selected} onValueChange={(v) => setBoxProfile(b.id, v as CrateProfileKey)}>
                                <SelectTrigger className="w-[220px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="STANDARD_LOCAL">Estándar (Local)</SelectItem>
                                  <SelectItem value="EXPORT_ISPM15">Exportación ISPM-15</SelectItem>
                                  <SelectItem value="PREMIUM_ART_IT">Premium (Arte/IT)</SelectItem>
                                  <SelectItem value="MACHINERY_ISPM15">Maquinaria ISPM-15</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>

                            <TableCell>
                              {hasEng ? (
                                <>{b.internalFinalCm.faceACm.toFixed(1)} × {b.internalFinalCm.faceBCm.toFixed(1)} × {b.internalFinalCm.depthCm.toFixed(1)}</>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </TableCell>

                            <TableCell>{hasEng ? b.lumberType : <span className="text-slate-400">—</span>}</TableCell>
                            <TableCell>{hasEng ? (b.skid ? "Sí" : "No") : <span className="text-slate-400">—</span>}</TableCell>
                            <TableCell>{hasEng ? `${b.plywoodThicknessIn}"` : <span className="text-slate-400">—</span>}</TableCell>
                            <TableCell>
                              {hasEng ? (
                                <span className="text-xs text-slate-600">
                                  Ply {b.bomRaw.plywoodSheets.toFixed(2)} · Lum {b.bomRaw.lumberSticks.toFixed(2)}
                                </span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>

                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      disabled={!draft.plan?.engineering?.boxes?.length}
                      onClick={() => setActiveTab("pricing")}
                    >
                      Continuar a Costos →
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pricing" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Costos</CardTitle>
              <Button onClick={runStageCosting} disabled={!draft.plan?.engineering?.boxes?.length}>
                Calcular Costos
              </Button>
            </CardHeader>

            <CardContent className="space-y-4">
              {!draft.plan?.engineering?.boxes?.length ? (
                <p className="text-slate-500">Primero ejecuta Ingeniería.</p>
              ) : !draft.plan?.costing?.boxes?.length ? (
                <p className="text-slate-500">Calcula costos para ver materiales, adicionales y precio sugerido.</p>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Perfil</TableHead>
                        <TableHead>Materiales</TableHead>
                        <TableHead>Adicionales</TableHead>
                        <TableHead>Costo</TableHead>
                        <TableHead>Precio sugerido</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {draft.plan.costing.boxes.map((b: any, idx: number) => (
                        <TableRow key={b.id}>
                          <TableCell className="font-medium">{idx + 1}</TableCell>
                          <TableCell>{b.profile}</TableCell>
                          <TableCell>RD$ {b.costs.materials.toFixed(2)}</TableCell>
                          <TableCell>RD$ {b.costs.adders.toFixed(2)}</TableCell>
                          <TableCell>RD$ {b.costs.totalCost.toFixed(2)}</TableCell>
                          <TableCell className="font-semibold">RD$ {b.costs.sellPrice.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  <div className="p-4 bg-slate-50 rounded-lg grid grid-cols-1 md:grid-cols-5 gap-3">
                    <div>
                      <p className="text-xs text-slate-500">Materiales</p>
                      <p className="font-semibold">RD$ {draft.plan.costing.totals.materials.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Labor</p>
                      <p className="font-semibold">RD$ {draft.plan.costing.totals.labor.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Adicionales</p>
                      <p className="font-semibold">RD$ {draft.plan.costing.totals.adders.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Costo total</p>
                      <p className="font-semibold">RD$ {draft.plan.costing.totals.totalCost.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Precio sugerido</p>
                      <p className="font-semibold">RD$ {draft.plan.costing.totals.sellPrice.toFixed(2)}</p>
                    </div>
                  </div>

                  <p className="text-xs text-slate-500">
                    Si ves RD$ 0.00 en materiales, entra a <strong>Configuración → Costos unitarios</strong> y llena los precios.
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 5: Settings embebido */}
        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-lg">Configuración del módulo</CardTitle></CardHeader>
            <CardContent>
              <CrateSettingsModule embedded />
            </CardContent>
          </Card>
        </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
