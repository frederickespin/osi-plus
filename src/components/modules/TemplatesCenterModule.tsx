import { useEffect, useMemo, useState } from "react";
import { Plus, Send, Edit, RefreshCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { UserRole } from "@/types/osi.types";
import {
  listTemplates,
  submitTemplateForApproval,
  upsertTemplateDraft,
  type TemplateDto,
  type TemplateType,
  type TemplateVersionStatus,
} from "@/lib/api";

type Props = { userRole: UserRole };

function statusBadgeVariant(status: TemplateVersionStatus): "default" | "secondary" | "destructive" | "outline" {
  if (status === "PUBLISHED" || status === "APPROVED") return "default";
  if (status === "PENDING_APPROVAL") return "secondary";
  if (status === "REJECTED") return "destructive";
  return "outline";
}

export function TemplatesCenterModule({ userRole }: Props) {
  const [activeTab, setActiveTab] = useState<TemplateType>("PIC");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<TemplateDto[]>([]);

  const [isOpen, setIsOpen] = useState(false);
  const [editingTemplateName, setEditingTemplateName] = useState("");
  const [editingVersionId, setEditingVersionId] = useState<string | undefined>(undefined);
  const [contentJsonText, setContentJsonText] = useState("{\n\n}");
  const [contentHtml, setContentHtml] = useState("");
  const [changeSummary, setChangeSummary] = useState("");

  const refresh = () => {
    setLoading(true);
    listTemplates(activeTab)
      .then((r) => setItems(r.data))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((t) => t.name.toLowerCase().includes(q));
  }, [items, search]);

  const openNew = () => {
    setEditingTemplateName("");
    setEditingVersionId(undefined);
    setContentJsonText("{\n\n}");
    setContentHtml("");
    setChangeSummary("");
    setIsOpen(true);
  };

  const openEditDraft = (t: TemplateDto) => {
    const latest = t.versions?.[0];
    setEditingTemplateName(t.name);
    setEditingVersionId(latest?.status === "DRAFT" ? latest.id : undefined);
    setContentJsonText("{\n\n}");
    setContentHtml("");
    setChangeSummary("");
    setIsOpen(true);
  };

  const saveDraft = async () => {
    let parsed: unknown | undefined = undefined;
    const trimmed = contentJsonText.trim();
    if (trimmed) {
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        throw new Error("contentJson no es JSON válido");
      }
    }

    await upsertTemplateDraft({
      templateType: activeTab,
      templateName: editingTemplateName,
      tenantId: null,
      versionId: editingVersionId,
      contentJson: parsed,
      contentHtml: contentHtml || undefined,
      changeSummary: changeSummary || undefined,
    });

    setIsOpen(false);
    refresh();
  };

  const submitLatestDraft = async (t: TemplateDto) => {
    const latest = t.versions?.[0];
    if (!latest || latest.status !== "DRAFT") return;
    await submitTemplateForApproval(latest.id);
    refresh();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Centro de Plantillas</h1>
          <p className="text-slate-500">PIC / PGD / NPS con flujo Draft → Aprobación → Publicación</p>
          <p className="text-xs text-slate-400 mt-1">Rol actual: {userRole}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={refresh}>
            <RefreshCcw className="h-4 w-4 mr-2" />
            Refrescar
          </Button>
          <Button onClick={openNew}>
            <Plus className="h-4 w-4 mr-2" />
            Nueva
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TemplateType)}>
        <TabsList>
          <TabsTrigger value="PIC">PIC</TabsTrigger>
          <TabsTrigger value="PGD">PGD</TabsTrigger>
          <TabsTrigger value="NPS">NPS</TabsTrigger>
        </TabsList>

        <div className="mt-4 max-w-md">
          <Input placeholder="Buscar por nombre..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <TabsContent value={activeTab} className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((t) => {
              const latest = t.versions?.[0];
              const published = t.publishedVersion;
              return (
                <Card key={t.id}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center justify-between gap-3">
                      <span className="truncate">{t.name}</span>
                      {latest ? (
                        <Badge variant={statusBadgeVariant(latest.status as TemplateVersionStatus)}>
                          v{latest.version} {latest.status}
                        </Badge>
                      ) : (
                        <Badge variant="outline">sin versiones</Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="text-xs text-slate-500">
                      Publicada: {published ? `v${published.version}` : "no"}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEditDraft(t)}>
                        <Edit className="h-4 w-4 mr-2" />
                        {latest?.status === "DRAFT" ? "Editar Draft" : "Nuevo Draft"}
                      </Button>
                      <Button
                        size="sm"
                        disabled={!latest || latest.status !== "DRAFT"}
                        onClick={() => submitLatestDraft(t)}
                      >
                        <Send className="h-4 w-4 mr-2" />
                        Enviar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {!loading && filtered.length === 0 && (
              <div className="text-sm text-slate-500">No hay plantillas para este tipo.</div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingVersionId ? "Editar Draft" : "Nueva Plantilla / Draft"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500">Nombre</label>
                <Input value={editingTemplateName} onChange={(e) => setEditingTemplateName(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-slate-500">Resumen de cambio</label>
                <Input value={changeSummary} onChange={(e) => setChangeSummary(e.target.value)} />
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-500">contentJson (JSON)</label>
              <textarea
                className="w-full h-56 font-mono text-xs border rounded-md p-3"
                value={contentJsonText}
                onChange={(e) => setContentJsonText(e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs text-slate-500">contentHtml (opcional, PIC)</label>
              <textarea
                className="w-full h-28 font-mono text-xs border rounded-md p-3"
                value={contentHtml}
                onChange={(e) => setContentHtml(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setIsOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={() => void saveDraft()}>Guardar Draft</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

