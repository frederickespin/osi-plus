import { useEffect, useMemo, useState } from "react";
import { Plus, Send, Edit, RefreshCcw, Eye } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { UserRole } from "@/types/osi.types";
import {
  getTemplateVersion,
  listTemplates,
  submitTemplateForApproval,
  upsertTemplateDraft,
  type TemplateDto,
  type TemplateType,
  type TemplateVersionStatus,
} from "@/lib/api";
import {
  extractVariablesFromHtml,
  normalizeTagList,
  safeParseJson,
  type NpsTemplateContent,
  type PicTemplateContent,
  type PgdTemplateContent,
  type TriggerPhase,
  type OutputChannel,
  type PgdFileType,
  type PgdResponsible,
  type PgdVisibility,
  type NpsScale,
} from "@/lib/templateSchemas";

type Props = { userRole: UserRole };

function statusBadgeVariant(status: TemplateVersionStatus): "default" | "secondary" | "destructive" | "outline" {
  if (status === "PUBLISHED" || status === "APPROVED") return "default";
  if (status === "PENDING_APPROVAL") return "secondary";
  if (status === "REJECTED") return "destructive";
  return "outline";
}

function statusLabel(status: TemplateVersionStatus) {
  if (status === "DRAFT") return "BORRADOR";
  if (status === "PENDING_APPROVAL") return "PENDIENTE";
  if (status === "APPROVED") return "APROBADA";
  if (status === "PUBLISHED") return "ACTIVA";
  if (status === "REJECTED") return "RECHAZADA";
  if (status === "ARCHIVED") return "ARCHIVADA";
  return status;
}

const PIC_VARIABLES = [
  "Cliente_Nombre",
  "Fecha_Servicio",
  "Hora_Llegada",
  "OSI_Codigo",
  "Proyecto_Codigo",
  "Supervisor_Nombre",
] as const;

export function TemplatesCenterModule({ userRole }: Props) {
  const [activeTab, setActiveTab] = useState<TemplateType>("PIC");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [items, setItems] = useState<TemplateDto[]>([]);

  const [isOpen, setIsOpen] = useState(false);
  const [isLoadingVersion, setIsLoadingVersion] = useState(false);
  const [editingTemplateName, setEditingTemplateName] = useState("");
  const [editingVersionId, setEditingVersionId] = useState<string | undefined>(undefined);
  const [changeSummary, setChangeSummary] = useState("");
  const [showAdvancedJson, setShowAdvancedJson] = useState(false);
  const [jsonPreview, setJsonPreview] = useState("{\n\n}");
  const [htmlPreview, setHtmlPreview] = useState("");

  const [picTriggerPhase, setPicTriggerPhase] = useState<TriggerPhase>("PRE_OSI");
  const [picChannel, setPicChannel] = useState<OutputChannel>("BOTH");
  const [picBodyHtml, setPicBodyHtml] = useState<string>("");
  const [picAttachmentsText, setPicAttachmentsText] = useState<string>("");

  const [pgdServiceTagsText, setPgdServiceTagsText] = useState<string>("");
  const [pgdDocs, setPgdDocs] = useState<
    Array<{
      name: string;
      visibility: PgdVisibility;
      responsible: PgdResponsible;
      isBlocking: boolean;
      expectedFileType: PgdFileType;
      serviceTagsText: string;
    }>
  >([]);

  const [npsQuestion, setNpsQuestion] = useState("");
  const [npsScale, setNpsScale] = useState<NpsScale>("0_10");
  const [npsPositiveTagsText, setNpsPositiveTagsText] = useState("");
  const [npsNegativeTagsText, setNpsNegativeTagsText] = useState("");
  const [npsEvalSupervisorD, setNpsEvalSupervisorD] = useState(true);
  const [npsEvalOfficeKV, setNpsEvalOfficeKV] = useState(false);
  const [npsAlertThreshold, setNpsAlertThreshold] = useState(3);

  const refresh = () => {
    setLoading(true);
    setLoadError(null);
    listTemplates(activeTab)
      .then((r) => setItems(r.data))
      .catch((e: any) => {
        setItems([]);
        const message = e?.message || "No se pudo cargar el Centro de Plantillas.";
        setLoadError(message);
      })
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
    const ctx = {
      templateType: activeTab,
      templateId: null,
      templateName: "",
      editingVersionId: null,
      sourceVersionId: null,
      returnModule: "k-templates",
    };
    localStorage.setItem("osi-plus.templates.editorContext", JSON.stringify(ctx));
    window.dispatchEvent(new CustomEvent("changeModule", { detail: "k-template-editor" }));
  };

  function buildPicContent(bodyOverride?: string): PicTemplateContent {
    const body = bodyOverride ?? picBodyHtml;
    const attachments = picAttachmentsText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [nameRaw, urlRaw] = line.split("|");
        const name = String(nameRaw || "").trim();
        const url = String(urlRaw || "").trim();
        return { name: name || url, url };
      })
      .filter((a) => Boolean(a.url));

    const variables = extractVariablesFromHtml(body);

    return {
      triggerPhase: picTriggerPhase,
      channel: picChannel,
      bodyHtml: body,
      attachments: attachments.length ? attachments : undefined,
      variables: variables.length ? variables : undefined,
    };
  }

  function buildPgdContent(): PgdTemplateContent {
    return {
      serviceTags: normalizeTagList(pgdServiceTagsText),
      documents: pgdDocs
        .filter((d) => d.name.trim())
        .map((d) => ({
          name: d.name.trim(),
          visibility: d.visibility,
          responsible: d.responsible,
          isBlocking: d.isBlocking,
          expectedFileType: d.expectedFileType,
          serviceTags: normalizeTagList(d.serviceTagsText),
        })),
    };
  }

  function buildNpsContent(): NpsTemplateContent {
    return {
      question: npsQuestion.trim(),
      scale: npsScale,
      positiveTags: normalizeTagList(npsPositiveTagsText),
      negativeTags: normalizeTagList(npsNegativeTagsText),
      evaluateSupervisorD: npsEvalSupervisorD,
      evaluateOfficeKV: npsEvalOfficeKV,
      alertThreshold: Number(npsAlertThreshold || 0),
    };
  }

  function hydrateEditorsFromContent(type: TemplateType, contentJson: unknown, contentHtml: string) {
    const asCommaText = (value: unknown) => {
      if (!value) return "";
      if (Array.isArray(value)) return value.map((v) => String(v)).filter(Boolean).join(", ");
      if (typeof value === "string") return value;
      return "";
    };

    if (type === "PIC") {
      const c = safeParseJson<Partial<PicTemplateContent>>(contentJson, {});
      setPicTriggerPhase((c.triggerPhase as TriggerPhase) || "PRE_OSI");
      setPicChannel((c.channel as OutputChannel) || "BOTH");
      const body = String(c.bodyHtml ?? contentHtml ?? "");
      setPicBodyHtml(body);
      const attachments = Array.isArray(c.attachments) ? c.attachments : [];
      setPicAttachmentsText(
        attachments
          .map((a) => `${String(a?.name || "").trim()}|${String(a?.url || "").trim()}`)
          .filter((l) => l !== "|")
          .join("\n"),
      );
      setHtmlPreview(body);
      setJsonPreview(JSON.stringify(buildPicContent(body), null, 2));
      return;
    }

    if (type === "PGD") {
      const c = safeParseJson<Partial<PgdTemplateContent>>(contentJson, { documents: [] });
      setPgdServiceTagsText(asCommaText((c as any).serviceTags));
      const docs = Array.isArray(c.documents) ? c.documents : [];
      setPgdDocs(
        docs.map((d) => ({
          name: String(d?.name || ""),
          visibility: (d?.visibility as PgdVisibility) || "CLIENT_VIEW",
          responsible: (d?.responsible as PgdResponsible) || "CLIENT",
          isBlocking: Boolean(d?.isBlocking),
          expectedFileType: (d?.expectedFileType as PgdFileType) || "PDF",
          serviceTagsText: asCommaText((d as any)?.serviceTags),
        })),
      );
      const next = buildPgdContent();
      setJsonPreview(JSON.stringify(next, null, 2));
      setHtmlPreview("");
      return;
    }

    const c = safeParseJson<Partial<NpsTemplateContent>>(contentJson, {});
    setNpsQuestion(String(c.question || ""));
    setNpsScale((c.scale as NpsScale) || "0_10");
    setNpsPositiveTagsText(asCommaText((c as any).positiveTags));
    setNpsNegativeTagsText(asCommaText((c as any).negativeTags));
    setNpsEvalSupervisorD(c.evaluateSupervisorD !== false);
    setNpsEvalOfficeKV(Boolean(c.evaluateOfficeKV));
    setNpsAlertThreshold(Number.isFinite(Number(c.alertThreshold)) ? Number(c.alertThreshold) : 3);
    const next = buildNpsContent();
    setJsonPreview(JSON.stringify(next, null, 2));
    setHtmlPreview("");
  }

  const openEditDraft = (t: TemplateDto) => {
    const latest = t.versions?.[0];
    const editingVersionId = latest?.status === "DRAFT" ? latest.id : null;
    const sourceVersionId = editingVersionId
      ? editingVersionId
      : (t.publishedVersionId ? String(t.publishedVersionId) : null);

    const ctx = {
      templateType: activeTab,
      templateId: t.id,
      templateName: t.name,
      editingVersionId,
      sourceVersionId,
      returnModule: "k-templates",
    };
    localStorage.setItem("osi-plus.templates.editorContext", JSON.stringify(ctx));
    window.dispatchEvent(new CustomEvent("changeModule", { detail: "k-template-editor" }));
  };

  const updatePreviews = () => {
    try {
      if (activeTab === "PIC") {
        const c = buildPicContent();
        setJsonPreview(JSON.stringify(c, null, 2));
        setHtmlPreview(c.bodyHtml);
        return;
      }
      if (activeTab === "PGD") {
        const c = buildPgdContent();
        setJsonPreview(JSON.stringify(c, null, 2));
        setHtmlPreview("");
        return;
      }
      const c = buildNpsContent();
      setJsonPreview(JSON.stringify(c, null, 2));
      setHtmlPreview("");
    } catch {
      // ignore preview errors
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    updatePreviews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isOpen,
    activeTab,
    picTriggerPhase,
    picChannel,
    picBodyHtml,
    picAttachmentsText,
    pgdServiceTagsText,
    pgdDocs,
    npsQuestion,
    npsScale,
    npsPositiveTagsText,
    npsNegativeTagsText,
    npsEvalSupervisorD,
    npsEvalOfficeKV,
    npsAlertThreshold,
  ]);

  const saveDraft = async () => {
    if (!editingTemplateName.trim()) throw new Error("Nombre requerido");

    const contentJson =
      activeTab === "PIC"
        ? buildPicContent()
        : activeTab === "PGD"
          ? buildPgdContent()
          : buildNpsContent();

    await upsertTemplateDraft({
      templateType: activeTab,
      templateName: editingTemplateName.trim(),
      tenantId: null,
      versionId: editingVersionId,
      contentJson,
      contentHtml: activeTab === "PIC" ? picBodyHtml || undefined : undefined,
      changeSummary: changeSummary || undefined,
    });

    setIsOpen(false);
    refresh();
  };

  const submitLatestDraft = async (t: TemplateDto) => {
    const latest = t.versions?.[0];
    if (!latest || latest.status !== "DRAFT") return;
    try {
      await submitTemplateForApproval(latest.id);
      toast.success("Plantilla enviada a aprobación.");
      refresh();
    } catch (e: any) {
      toast.error(e?.message || "No se pudo enviar a aprobación.");
    }
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
          <Button onClick={openNew} disabled={userRole !== "K"}>
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
          {loadError && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {loadError}
            </div>
          )}
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
                          v{latest.version} {statusLabel(latest.status as TemplateVersionStatus)}
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
                      <Button variant="outline" size="sm" onClick={() => void openEditDraft(t)}>
                        {userRole === "K" ? (
                          <Edit className="h-4 w-4 mr-2" />
                        ) : (
                          <Eye className="h-4 w-4 mr-2" />
                        )}
                        {userRole === "K" ? (latest?.status === "DRAFT" ? "Editar Draft" : "Nuevo Draft") : "Ver"}
                      </Button>
                      <Button
                        size="sm"
                        disabled={userRole !== "K" || !latest || latest.status !== "DRAFT"}
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
        <DialogContent className="max-w-[1600px] w-[min(1600px,calc(100vw-0.5rem))] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingVersionId ? "Editar Draft" : "Nueva Plantilla / Draft"}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            <div className="space-y-4 xl:col-span-5 2xl:col-span-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-slate-500">Nombre</Label>
                  <Input value={editingTemplateName} onChange={(e) => setEditingTemplateName(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs text-slate-500">Resumen de cambio</Label>
                  <Input value={changeSummary} onChange={(e) => setChangeSummary(e.target.value)} />
                </div>
              </div>

              {isLoadingVersion && (
                <div className="text-sm text-slate-500">Cargando contenido de versión...</div>
              )}

              {activeTab === "PIC" && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">PIC: Instrucciones al Cliente</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                      <div className="sm:col-span-6">
                        <Label className="text-xs text-slate-500">Fase de disparo</Label>
                        <Select value={picTriggerPhase} onValueChange={(v) => setPicTriggerPhase(v as TriggerPhase)}>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="PRE_OSI">PRE_OSI</SelectItem>
                            <SelectItem value="ON_ROUTE">ON_ROUTE</SelectItem>
                            <SelectItem value="POST_OSI">POST_OSI</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="sm:col-span-6">
                        <Label className="text-xs text-slate-500">Canal</Label>
                        <Select value={picChannel} onValueChange={(v) => setPicChannel(v as OutputChannel)}>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="WHATSAPP">WHATSAPP</SelectItem>
                            <SelectItem value="EMAIL">EMAIL</SelectItem>
                            <SelectItem value="BOTH">BOTH</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex flex-col gap-2">
                        <Label className="text-xs text-slate-500">Contenido (HTML básico)</Label>
                        <div className="flex flex-wrap items-center gap-1">
                          {PIC_VARIABLES.map((v) => (
                            <Button
                              key={v}
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setPicBodyHtml((prev) => `${prev}{${v}}`)}
                            >
                              {`{${v}}`}
                            </Button>
                          ))}
                        </div>
                      </div>
                      <Textarea value={picBodyHtml} onChange={(e) => setPicBodyHtml(e.target.value)} rows={10} />
                      <div className="text-xs text-slate-500">
                        Variables detectadas: {extractVariablesFromHtml(picBodyHtml).join(", ") || "-"}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs text-slate-500">Adjuntos (1 por línea, formato: Nombre|URL)</Label>
                      <Textarea value={picAttachmentsText} onChange={(e) => setPicAttachmentsText(e.target.value)} rows={4} />
                    </div>
                  </CardContent>
                </Card>
              )}

              {activeTab === "PGD" && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">PGD: Gestión Documental</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label className="text-xs text-slate-500">Tags de servicio (coma)</Label>
                      <Input value={pgdServiceTagsText} onChange={(e) => setPgdServiceTagsText(e.target.value)} placeholder="Ej: Internacional, Arte" />
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="text-sm text-slate-700 font-medium">Documentos</div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setPgdDocs((prev) => [
                            ...prev,
                            {
                              name: "",
                              visibility: "CLIENT_VIEW",
                              responsible: "CLIENT",
                              isBlocking: true,
                              expectedFileType: "PDF",
                              serviceTagsText: "",
                            },
                          ])
                        }
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Agregar documento
                      </Button>
                    </div>

                    <div className="space-y-3">
                      {pgdDocs.map((d, idx) => (
                        <div key={idx} className="border rounded-lg p-3 space-y-3">
                          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                            <div className="md:col-span-7">
                              <Label className="text-xs text-slate-500">Nombre</Label>
                              <Input
                                value={d.name}
                                onChange={(e) =>
                                  setPgdDocs((prev) => prev.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)))
                                }
                                placeholder="Ej: Declaración de Valor"
                              />
                            </div>
                            <div className="md:col-span-5">
                              <Label className="text-xs text-slate-500">Tags (coma)</Label>
                              <Input
                                value={d.serviceTagsText}
                                onChange={(e) =>
                                  setPgdDocs((prev) => prev.map((x, i) => (i === idx ? { ...x, serviceTagsText: e.target.value } : x)))
                                }
                                placeholder="Ej: Internacional, Aduana"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                            <div className="sm:col-span-4">
                              <Label className="text-xs text-slate-500">Visibilidad</Label>
                              <Select
                                value={d.visibility}
                                onValueChange={(v) =>
                                  setPgdDocs((prev) => prev.map((x, i) => (i === idx ? { ...x, visibility: v as PgdVisibility } : x)))
                                }
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="CLIENT_VIEW">CLIENT_VIEW</SelectItem>
                                  <SelectItem value="INTERNAL_VIEW">INTERNAL_VIEW</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="sm:col-span-4">
                              <Label className="text-xs text-slate-500">Responsable</Label>
                              <Select
                                value={d.responsible}
                                onValueChange={(v) =>
                                  setPgdDocs((prev) => prev.map((x, i) => (i === idx ? { ...x, responsible: v as PgdResponsible } : x)))
                                }
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="CLIENT">CLIENT</SelectItem>
                                  <SelectItem value="SUPERVISOR">SUPERVISOR</SelectItem>
                                  <SelectItem value="DRIVER">DRIVER</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="sm:col-span-4">
                              <Label className="text-xs text-slate-500">Tipo archivo</Label>
                              <Select
                                value={d.expectedFileType}
                                onValueChange={(v) =>
                                  setPgdDocs((prev) => prev.map((x, i) => (i === idx ? { ...x, expectedFileType: v as PgdFileType } : x)))
                                }
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="PDF">PDF</SelectItem>
                                  <SelectItem value="PHOTO">PHOTO</SelectItem>
                                  <SelectItem value="SIGNATURE">SIGNATURE</SelectItem>
                                  <SelectItem value="OTHER">OTHER</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={d.isBlocking}
                                onCheckedChange={(checked) =>
                                  setPgdDocs((prev) => prev.map((x, i) => (i === idx ? { ...x, isBlocking: checked } : x)))
                                }
                              />
                              <span className="text-sm text-slate-700">Bloqueante (impide cierre)</span>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              onClick={() => setPgdDocs((prev) => prev.filter((_, i) => i !== idx))}
                            >
                              Eliminar
                            </Button>
                          </div>
                        </div>
                      ))}

                      {pgdDocs.length === 0 && (
                        <div className="text-sm text-slate-500">Agrega al menos un documento para que PGD tenga efecto.</div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {activeTab === "NPS" && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">NPS: Encuesta de Calidad</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label className="text-xs text-slate-500">Pregunta principal</Label>
                      <Input value={npsQuestion} onChange={(e) => setNpsQuestion(e.target.value)} placeholder="¿Recomendaría a International Packers...?" />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                      <div className="sm:col-span-6">
                        <Label className="text-xs text-slate-500">Escala</Label>
                        <Select value={npsScale} onValueChange={(v) => setNpsScale(v as NpsScale)}>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0_10">0-10</SelectItem>
                            <SelectItem value="1_5">1-5</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="sm:col-span-6">
                        <Label className="text-xs text-slate-500">Umbral alerta (score &lt;)</Label>
                        <Input
                          type="number"
                          value={npsAlertThreshold}
                          onChange={(e) => setNpsAlertThreshold(Number(e.target.value) || 0)}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                      <div className="sm:col-span-6">
                        <Label className="text-xs text-slate-500">Tags positivos (coma)</Label>
                        <Input value={npsPositiveTagsText} onChange={(e) => setNpsPositiveTagsText(e.target.value)} placeholder="Puntualidad, Amabilidad, Cuidado" />
                      </div>
                      <div className="sm:col-span-6">
                        <Label className="text-xs text-slate-500">Tags negativos (coma)</Label>
                        <Input value={npsNegativeTagsText} onChange={(e) => setNpsNegativeTagsText(e.target.value)} placeholder="Retraso, Daños, Actitud" />
                      </div>
                    </div>

                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-slate-700">Evaluar Supervisor (D)</div>
                        <Switch checked={npsEvalSupervisorD} onCheckedChange={setNpsEvalSupervisorD} />
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-slate-700">Evaluar Gestión de Oficina (K/V)</div>
                        <Switch checked={npsEvalOfficeKV} onCheckedChange={setNpsEvalOfficeKV} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Switch checked={showAdvancedJson} onCheckedChange={setShowAdvancedJson} />
                  <span className="text-sm text-slate-700">Ver JSON avanzado</span>
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={() => setIsOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={() => void saveDraft()}>Guardar Draft</Button>
                </div>
              </div>

              {showAdvancedJson && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Eye className="h-4 w-4" />
                      JSON (preview)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Textarea value={jsonPreview} readOnly rows={10} className="font-mono text-xs" />
                  </CardContent>
                </Card>
              )}
            </div>

            <div className="space-y-4 xl:col-span-7 2xl:col-span-7 xl:sticky xl:top-4 self-start">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Vista previa</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {activeTab === "PIC" ? (
                    <div className="space-y-2">
                      <div className="text-xs text-slate-500">Render (HTML)</div>
                      <div
                        className="border rounded-md p-3 prose prose-sm max-w-none"
                        dangerouslySetInnerHTML={{ __html: htmlPreview || "<p class='text-slate-400'>Sin contenido</p>" }}
                      />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-xs text-slate-500">Preview</div>
                      {activeTab === "PGD" ? (
                        <div className="border rounded-md p-3 space-y-2">
                          <div className="text-sm font-medium text-slate-900">Checklist (simulación)</div>
                          <div className="text-xs text-slate-600">
                            Docs: <span className="font-medium text-slate-900">{pgdDocs.filter((d) => d.name.trim()).length}</span>
                            {" · "}
                            Bloqueantes:{" "}
                            <span className="font-medium text-slate-900">{pgdDocs.filter((d) => d.name.trim() && d.isBlocking).length}</span>
                          </div>
                          <div className="space-y-2">
                            {pgdDocs.filter((d) => d.name.trim()).slice(0, 10).map((d, idx) => (
                              <div key={idx} className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-sm text-slate-900 truncate">{d.name}</div>
                                  <div className="text-xs text-slate-500">
                                    {d.visibility} · {d.responsible} · {d.expectedFileType}
                                  </div>
                                </div>
                                {d.isBlocking ? (
                                  <Badge className="bg-red-600 hover:bg-red-600 shrink-0">Bloqueante</Badge>
                                ) : (
                                  <Badge variant="secondary" className="shrink-0">No bloquea</Badge>
                                )}
                              </div>
                            ))}
                            {pgdDocs.filter((d) => d.name.trim()).length > 10 && (
                              <div className="text-xs text-slate-500">+ {pgdDocs.filter((d) => d.name.trim()).length - 10} más...</div>
                            )}
                            {pgdDocs.filter((d) => d.name.trim()).length === 0 && (
                              <div className="text-sm text-slate-500">Agrega documentos para ver el checklist.</div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="border rounded-md p-3 space-y-2">
                          <div className="text-sm font-medium text-slate-900">NPS (simulación)</div>
                          <div className="text-xs text-slate-600">
                            Escala: <span className="font-medium text-slate-900">{npsScale === "0_10" ? "0-10" : "1-5"}</span>
                            {" · "}
                            Alerta si score &lt; <span className="font-medium text-slate-900">{npsAlertThreshold}</span>
                          </div>
                          <div className="text-sm text-slate-900">{npsQuestion.trim() || "Sin pregunta"}</div>
                          <div className="text-xs text-slate-600">
                            Evalúa D: <span className="font-medium text-slate-900">{npsEvalSupervisorD ? "Sí" : "No"}</span>
                            {" · "}
                            Evalúa K/V: <span className="font-medium text-slate-900">{npsEvalOfficeKV ? "Sí" : "No"}</span>
                          </div>
                          <div className="space-y-1">
                            <div className="text-xs text-slate-500">Tags positivos</div>
                            <div className="flex flex-wrap gap-1">
                              {normalizeTagList(npsPositiveTagsText).slice(0, 12).map((t) => (
                                <Badge key={t} variant="secondary">{t}</Badge>
                              ))}
                              {normalizeTagList(npsPositiveTagsText).length === 0 && (
                                <span className="text-xs text-slate-500">-</span>
                              )}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <div className="text-xs text-slate-500">Tags negativos</div>
                            <div className="flex flex-wrap gap-1">
                              {normalizeTagList(npsNegativeTagsText).slice(0, 12).map((t) => (
                                <Badge key={t} className="bg-slate-900 hover:bg-slate-900">{t}</Badge>
                              ))}
                              {normalizeTagList(npsNegativeTagsText).length === 0 && (
                                <span className="text-xs text-slate-500">-</span>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

