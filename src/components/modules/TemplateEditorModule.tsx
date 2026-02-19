import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Code2, Copy, Eye, EyeOff, Plus, Save, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { UserRole } from "@/types/osi.types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  getTemplateVersion,
  submitTemplateForApproval,
  upsertTemplateDraft,
  type TemplateType,
} from "@/lib/api";
import {
  extractVariablesFromHtml,
  normalizeTagList,
  safeParseJson,
  type NpsScale,
  type NpsTemplateContent,
  type OutputChannel,
  type PicTemplateContent,
  type PgdFileType,
  type PgdResponsible,
  type PgdTemplateContent,
  type PgdVisibility,
  type TriggerPhase,
} from "@/lib/templateSchemas";
import DOMPurify from "dompurify";

const EDITOR_CTX_KEY = "osi-plus.templates.editorContext";

type TemplateEditorContext = {
  templateType: TemplateType;
  templateId?: string | null;
  templateName?: string;
  editingVersionId?: string | null;
  sourceVersionId?: string | null;
  returnModule?: string;
};

function readContext(): TemplateEditorContext | null {
  try {
    return JSON.parse(localStorage.getItem(EDITOR_CTX_KEY) || "null") as TemplateEditorContext | null;
  } catch {
    return null;
  }
}

function writeContext(ctx: TemplateEditorContext) {
  localStorage.setItem(EDITOR_CTX_KEY, JSON.stringify(ctx));
}

function typeLabel(t: TemplateType) {
  if (t === "PIC") return "PIC (Instrucciones)";
  if (t === "PGD") return "PGD (Gestión Documental)";
  return "NPS (Encuesta)";
}

const PIC_VARIABLES = [
  "Cliente_Nombre",
  "Fecha_Servicio",
  "Hora_Llegada",
  "OSI_Codigo",
  "Proyecto_Codigo",
  "Supervisor_Nombre",
] as const;

type PgdDocDraft = {
  name: string;
  visibility: PgdVisibility;
  responsible: PgdResponsible;
  isBlocking: boolean;
  expectedFileType: PgdFileType;
  serviceTagsText: string;
};

export function TemplateEditorModule({ userRole }: { userRole: UserRole }) {
  const canEdit = userRole === "K";
  const ctx = useMemo(() => readContext(), []);

  if (!ctx) {
    return (
      <div className="p-6 space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">Editor de Plantillas</h2>
        <Card>
          <CardContent className="py-6">
            <div className="text-sm text-slate-600">No hay contexto de edición. Vuelve al Centro de Plantillas.</div>
            <div className="mt-3">
              <Button onClick={() => window.dispatchEvent(new CustomEvent("changeModule", { detail: "k-templates" }))}>
                Ir a Centro de Plantillas
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const [templateName, setTemplateName] = useState(ctx.templateName || "");
  const [changeSummary, setChangeSummary] = useState("");
  const [editingVersionId, setEditingVersionId] = useState<string | undefined>(
    ctx.editingVersionId ? String(ctx.editingVersionId) : undefined,
  );
  const [sourceVersionMeta, setSourceVersionMeta] = useState<{ id: string; version: number; status: string } | null>(null);
  const [isLoadingVersion, setIsLoadingVersion] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [showPreview, setShowPreview] = useState(true);
  const [jsonOpen, setJsonOpen] = useState(false);

  // PIC state
  const [picTriggerPhase, setPicTriggerPhase] = useState<TriggerPhase>("PRE_OSI");
  const [picChannel, setPicChannel] = useState<OutputChannel>("BOTH");
  const [picBodyHtml, setPicBodyHtml] = useState("");
  const [picAttachmentsText, setPicAttachmentsText] = useState("");

  // PGD state
  const [pgdServiceTagsText, setPgdServiceTagsText] = useState("");
  const [pgdDocs, setPgdDocs] = useState<PgdDocDraft[]>([]);
  const [pgdSelectedIndex, setPgdSelectedIndex] = useState(0);

  // NPS state
  const [npsQuestion, setNpsQuestion] = useState("");
  const [npsScale, setNpsScale] = useState<NpsScale>("0_10");
  const [npsPositiveTagsText, setNpsPositiveTagsText] = useState("");
  const [npsNegativeTagsText, setNpsNegativeTagsText] = useState("");
  const [npsEvalSupervisorD, setNpsEvalSupervisorD] = useState(true);
  const [npsEvalOfficeKV, setNpsEvalOfficeKV] = useState(true);
  const [npsAlertThreshold, setNpsAlertThreshold] = useState(7);

  const templateType = ctx.templateType;

  const asCommaText = (value: unknown) => {
    if (!value) return "";
    if (Array.isArray(value)) return value.map((v) => String(v)).filter(Boolean).join(", ");
    if (typeof value === "string") return value;
    return "";
  };

  function hydrateEditorsFromContent(type: TemplateType, contentJson: unknown, contentHtml: string) {
    if (type === "PIC") {
      const c = safeParseJson<Partial<PicTemplateContent>>(contentJson, {});
      setPicTriggerPhase((c.triggerPhase as TriggerPhase) || "PRE_OSI");
      setPicChannel((c.channel as OutputChannel) || "BOTH");
      const body = String((c as any).bodyHtml ?? contentHtml ?? "");
      setPicBodyHtml(body);
      const attachments = Array.isArray((c as any).attachments) ? (c as any).attachments : [];
      setPicAttachmentsText(
        attachments
          .map((a: any) => `${String(a?.name || "").trim()}|${String(a?.url || "").trim()}`)
          .filter((l: string) => l !== "|")
          .join("\n"),
      );
      return;
    }

    if (type === "PGD") {
      const c = safeParseJson<Partial<PgdTemplateContent>>(contentJson, { documents: [] });
      setPgdServiceTagsText(asCommaText((c as any).serviceTags));
      const docs = Array.isArray((c as any).documents) ? (c as any).documents : [];
      setPgdDocs(
        docs.map((d: any) => ({
          name: String(d?.name || ""),
          visibility: (d?.visibility as PgdVisibility) || "CLIENT_VIEW",
          responsible: (d?.responsible as PgdResponsible) || "CLIENT",
          isBlocking: Boolean(d?.isBlocking),
          expectedFileType: (d?.expectedFileType as PgdFileType) || "PDF",
          serviceTagsText: asCommaText(d?.serviceTags),
        })),
      );
      setPgdSelectedIndex(0);
      return;
    }

    const c = safeParseJson<Partial<NpsTemplateContent>>(contentJson, {});
    setNpsQuestion(String((c as any).question || ""));
    setNpsScale(((c as any).scale as NpsScale) || "0_10");
    setNpsPositiveTagsText(asCommaText((c as any).positiveTags));
    setNpsNegativeTagsText(asCommaText((c as any).negativeTags));
    setNpsEvalSupervisorD((c as any).evaluateSupervisorD !== false);
    setNpsEvalOfficeKV((c as any).evaluateOfficeKV !== false);
    setNpsAlertThreshold(Number.isFinite(Number((c as any).alertThreshold)) ? Number((c as any).alertThreshold) : 7);
  }

  useEffect(() => {
    const sourceVersionId = ctx.sourceVersionId ? String(ctx.sourceVersionId) : "";
    if (!sourceVersionId) {
      hydrateEditorsFromContent(templateType, null, "");
      return;
    }

    setIsLoadingVersion(true);
    getTemplateVersion(sourceVersionId)
      .then((r) => {
        setSourceVersionMeta({ id: r.data.id, version: r.data.version, status: r.data.status });
        hydrateEditorsFromContent(templateType, r.data.contentJson, r.data.contentHtml || "");
      })
      .catch(() => hydrateEditorsFromContent(templateType, null, ""))
      .finally(() => setIsLoadingVersion(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const contentJson = useMemo(() => {
    if (templateType === "PIC") return buildPicContent();
    if (templateType === "PGD") return buildPgdContent();
    return buildNpsContent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    templateType,
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

  const jsonPreview = useMemo(() => {
    try {
      return JSON.stringify(contentJson, null, 2);
    } catch {
      return "{\\n  \\\"error\\\": \\\"No se pudo generar JSON\\\"\\n}";
    }
  }, [contentJson]);

  const previewTitle = useMemo(() => {
    if (templateType === "PIC") return "Render (HTML)";
    if (templateType === "PGD") return "Checklist (simulación)";
    return "NPS (simulación)";
  }, [templateType]);

  const goBack = () => {
    const returnModule = ctx.returnModule || "k-templates";
    window.dispatchEvent(new CustomEvent("changeModule", { detail: returnModule as any }));
  };

  const persistContext = (next: Partial<TemplateEditorContext>) => {
    const merged: TemplateEditorContext = {
      ...ctx,
      templateType,
      templateName,
      ...next,
    };
    writeContext(merged);
  };

  const saveDraft = async (opts: { submit?: boolean } = {}) => {
    if (!canEdit) return toast.error("Solo el rol K puede crear/editar drafts.");
    if (!templateName.trim()) return toast.error("Nombre requerido.");

    setIsSaving(true);
    try {
      const r = await upsertTemplateDraft({
        templateType,
        templateName: templateName.trim(),
        tenantId: null,
        versionId: editingVersionId,
        contentJson,
        contentHtml: templateType === "PIC" ? picBodyHtml || undefined : undefined,
        changeSummary: changeSummary || undefined,
      });

      const v = r.data;
      setEditingVersionId(v.id);
      persistContext({ editingVersionId: v.id, sourceVersionId: v.id, templateName: templateName.trim() });
      toast.success("Draft guardado.");

      if (opts.submit) {
        await submitTemplateForApproval(v.id);
        toast.success("Enviado a aprobación.");
        goBack();
      }
    } catch (e: any) {
      toast.error(e?.message || "No se pudo guardar el draft.");
    } finally {
      setIsSaving(false);
    }
  };

  const pgdSelected = pgdDocs[pgdSelectedIndex] || null;

  const addPgdDoc = () => {
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
    ]);
    setPgdSelectedIndex(pgdDocs.length);
  };

  const duplicatePgdDoc = () => {
    if (!pgdSelected) return;
    setPgdDocs((prev) => {
      const copy: PgdDocDraft = { ...pgdSelected, name: pgdSelected.name ? `${pgdSelected.name} (copia)` : "" };
      return [...prev, copy];
    });
    setPgdSelectedIndex(pgdDocs.length);
  };

  const deletePgdDoc = () => {
    if (!pgdSelected) return;
    setPgdDocs((prev) => prev.filter((_, i) => i !== pgdSelectedIndex));
    setPgdSelectedIndex((i) => Math.max(0, i - 1));
  };

  const insertPicVar = (v: string) => {
    const token = `{${v}}`;
    setPicBodyHtml((prev) => {
      if (!prev) return token;
      if (prev.endsWith(" ") || prev.endsWith("\n")) return `${prev}${token}`;
      return `${prev}${token}`;
    });
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{typeLabel(templateType)}</Badge>
            {editingVersionId ? <Badge>Draft</Badge> : <Badge variant="outline">Nuevo</Badge>}
            {sourceVersionMeta && (
              <Badge variant="outline" className="hidden sm:inline-flex">
                Base v{sourceVersionMeta.version} {String(sourceVersionMeta.status).toUpperCase()}
              </Badge>
            )}
          </div>
          <h2 className="text-xl font-semibold text-slate-900 truncate mt-1">
            {templateName.trim() ? templateName : "Sin nombre"}
          </h2>
          <p className="text-sm text-slate-600">
            {isLoadingVersion
              ? "Cargando contenido..."
              : canEdit
                ? "Edita y guarda como Draft (K), luego envía a aprobación."
                : "Modo lectura: solo el rol K puede crear/editar drafts."}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={goBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver
          </Button>
          <Button variant="outline" onClick={() => setShowPreview((p) => !p)}>
            {showPreview ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
            {showPreview ? "Ocultar vista previa" : "Mostrar vista previa"}
          </Button>
          <Button variant="outline" onClick={() => setJsonOpen(true)}>
            <Code2 className="h-4 w-4 mr-2" />
            JSON
          </Button>
          <Button onClick={() => void saveDraft()} disabled={!canEdit || isSaving}>
            <Save className="h-4 w-4 mr-2" />
            Guardar
          </Button>
          <Button onClick={() => void saveDraft({ submit: true })} disabled={!canEdit || isSaving}>
            <Send className="h-4 w-4 mr-2" />
            Guardar y Enviar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className={showPreview ? "xl:col-span-6 space-y-4" : "xl:col-span-12 space-y-4"}>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Metadatos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-slate-500">Nombre</Label>
                  <Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="Ej: PGD - Base" />
                </div>
                <div>
                  <Label className="text-xs text-slate-500">Resumen de cambio</Label>
                  <Input value={changeSummary} onChange={(e) => setChangeSummary(e.target.value)} placeholder="Ej: Ajuste de docs bloqueantes" />
                </div>
              </div>
            </CardContent>
          </Card>

          {templateType === "PIC" && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Config PIC</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
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

                  <div>
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
                  <div className="text-xs text-slate-500">Variables</div>
                  <div className="flex flex-wrap gap-2">
                    {PIC_VARIABLES.map((v) => (
                      <Button key={v} type="button" size="sm" variant="outline" onClick={() => insertPicVar(v)}>
                        {`{${v}}`}
                      </Button>
                    ))}
                  </div>
                  <div className="text-xs text-slate-500">
                    Detectadas: {extractVariablesFromHtml(picBodyHtml).join(", ") || "-"}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-slate-500">Adjuntos (1 por línea: Nombre|URL)</Label>
                  <Textarea value={picAttachmentsText} onChange={(e) => setPicAttachmentsText(e.target.value)} rows={4} />
                </div>
              </CardContent>
            </Card>
          )}

          {templateType === "PGD" && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Config PGD</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs text-slate-500">Tags de servicio (coma)</Label>
                  <Input value={pgdServiceTagsText} onChange={(e) => setPgdServiceTagsText(e.target.value)} placeholder="Ej: Internacional, Arte" />
                </div>
                <div className="text-xs text-slate-500">
                  Documentos: <span className="font-medium text-slate-900">{pgdDocs.filter((d) => d.name.trim()).length}</span>
                  {" · "}
                  Bloqueantes: <span className="font-medium text-slate-900">{pgdDocs.filter((d) => d.name.trim() && d.isBlocking).length}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {templateType === "NPS" && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Config NPS</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
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
                  <div>
                    <Label className="text-xs text-slate-500">Umbral alerta (score &lt;)</Label>
                    <Input type="number" value={npsAlertThreshold} onChange={(e) => setNpsAlertThreshold(Number(e.target.value) || 0)} />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-sm text-slate-700">Evaluar Supervisor (D)</div>
                  <Switch checked={npsEvalSupervisorD} onCheckedChange={setNpsEvalSupervisorD} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-sm text-slate-700">Evaluar Gestión Oficina (K/V)</div>
                  <Switch checked={npsEvalOfficeKV} onCheckedChange={setNpsEvalOfficeKV} />
                </div>
              </CardContent>
            </Card>
          )}

          {templateType === "PIC" && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Contenido PIC (HTML)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-xs text-slate-500">
                  Tip: usa HTML básico (`&lt;p&gt;`, `&lt;ul&gt;`, `&lt;strong&gt;`) para WhatsApp/Email.
                </div>
                <Textarea value={picBodyHtml} onChange={(e) => setPicBodyHtml(e.target.value)} rows={24} className="font-mono text-xs" />
              </CardContent>
            </Card>
          )}

          {templateType === "PGD" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <Card className="lg:col-span-5">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center justify-between gap-2">
                    Documentos
                    <Button size="sm" variant="outline" onClick={addPgdDoc}>
                      <Plus className="h-4 w-4 mr-2" />
                      Agregar
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {pgdDocs.length === 0 ? (
                    <div className="text-sm text-slate-600">Agrega tu primer documento.</div>
                  ) : (
                    <div className="space-y-2">
                      {pgdDocs.map((d, idx) => {
                        const selected = idx === pgdSelectedIndex;
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setPgdSelectedIndex(idx)}
                            className={[
                              "w-full text-left border rounded-md p-3 transition-colors",
                              selected ? "border-slate-900 bg-slate-50" : "hover:bg-slate-50",
                            ].join(" ")}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="font-medium text-slate-900 truncate">{d.name || `Documento ${idx + 1}`}</div>
                                <div className="text-xs text-slate-500">{d.visibility} · {d.responsible} · {d.expectedFileType}</div>
                              </div>
                              {d.isBlocking ? (
                                <Badge className="bg-red-600 hover:bg-red-600 shrink-0">Bloq</Badge>
                              ) : (
                                <Badge variant="secondary" className="shrink-0">OK</Badge>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="lg:col-span-7">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center justify-between gap-2">
                    Configuración
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={duplicatePgdDoc} disabled={!pgdSelected}>
                        <Copy className="h-4 w-4 mr-2" />
                        Duplicar
                      </Button>
                      <Button size="sm" variant="destructive" onClick={deletePgdDoc} disabled={!pgdSelected}>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Eliminar
                      </Button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {!pgdSelected ? (
                    <div className="text-sm text-slate-600">Selecciona un documento.</div>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                        <div className="md:col-span-7">
                          <Label className="text-xs text-slate-500">Nombre</Label>
                          <Input
                            value={pgdSelected.name}
                            onChange={(e) =>
                              setPgdDocs((prev) => prev.map((x, i) => (i === pgdSelectedIndex ? { ...x, name: e.target.value } : x)))
                            }
                            placeholder="Ej: Declaración de Valor"
                          />
                        </div>
                        <div className="md:col-span-5">
                          <Label className="text-xs text-slate-500">Tags (coma)</Label>
                          <Input
                            value={pgdSelected.serviceTagsText}
                            onChange={(e) =>
                              setPgdDocs((prev) => prev.map((x, i) => (i === pgdSelectedIndex ? { ...x, serviceTagsText: e.target.value } : x)))
                            }
                            placeholder="Ej: Internacional, Aduana"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                        <div className="md:col-span-4">
                          <Label className="text-xs text-slate-500">Visibilidad</Label>
                          <Select
                            value={pgdSelected.visibility}
                            onValueChange={(v) =>
                              setPgdDocs((prev) => prev.map((x, i) => (i === pgdSelectedIndex ? { ...x, visibility: v as PgdVisibility } : x)))
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
                        <div className="md:col-span-4">
                          <Label className="text-xs text-slate-500">Responsable</Label>
                          <Select
                            value={pgdSelected.responsible}
                            onValueChange={(v) =>
                              setPgdDocs((prev) => prev.map((x, i) => (i === pgdSelectedIndex ? { ...x, responsible: v as PgdResponsible } : x)))
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
                        <div className="md:col-span-4">
                          <Label className="text-xs text-slate-500">Tipo archivo</Label>
                          <Select
                            value={pgdSelected.expectedFileType}
                            onValueChange={(v) =>
                              setPgdDocs((prev) => prev.map((x, i) => (i === pgdSelectedIndex ? { ...x, expectedFileType: v as PgdFileType } : x)))
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

                      <div className="flex items-center gap-2">
                        <Switch
                          checked={pgdSelected.isBlocking}
                          onCheckedChange={(checked) =>
                            setPgdDocs((prev) => prev.map((x, i) => (i === pgdSelectedIndex ? { ...x, isBlocking: checked } : x)))
                          }
                        />
                        <span className="text-sm text-slate-700">Bloqueante (impide cierre)</span>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {templateType === "NPS" && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Contenido NPS</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs text-slate-500">Pregunta principal</Label>
                  <Input value={npsQuestion} onChange={(e) => setNpsQuestion(e.target.value)} placeholder="¿Recomendaría a International Packers...?" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-slate-500">Tags positivos (coma)</Label>
                    <Input value={npsPositiveTagsText} onChange={(e) => setNpsPositiveTagsText(e.target.value)} placeholder="Puntualidad, Amabilidad, Cuidado" />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500">Tags negativos (coma)</Label>
                    <Input value={npsNegativeTagsText} onChange={(e) => setNpsNegativeTagsText(e.target.value)} placeholder="Retraso, Daños, Actitud" />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {showPreview && (
          <div className="xl:col-span-6 xl:sticky xl:top-6 self-start space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Vista previa</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-xs text-slate-500">{previewTitle}</div>
                {templateType === "PIC" ? (
                  <div
                    className="border rounded-md p-4 prose prose-sm max-w-none bg-white break-words"
                    dangerouslySetInnerHTML={{
                      __html: DOMPurify.sanitize(picBodyHtml || "<p class='text-slate-400'>Sin contenido</p>"),
                    }}
                  />
                ) : templateType === "PGD" ? (
                  <div className="border rounded-md p-4 bg-white space-y-3">
                    {pgdDocs.filter((d) => d.name.trim()).length === 0 ? (
                      <div className="text-sm text-slate-600">Agrega documentos para ver el checklist.</div>
                    ) : (
                      <div className="space-y-2">
                        {pgdDocs.filter((d) => d.name.trim()).map((d, idx) => (
                          <div key={idx} className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-slate-900 truncate">{d.name}</div>
                              <div className="text-xs text-slate-500">
                                {d.visibility} · {d.responsible} · {d.expectedFileType}
                              </div>
                              {d.serviceTagsText.trim() && (
                                <div className="text-xs text-slate-500 mt-1">Tags: {d.serviceTagsText}</div>
                              )}
                            </div>
                            {d.isBlocking ? (
                              <Badge className="bg-red-600 hover:bg-red-600 shrink-0">Bloqueante</Badge>
                            ) : (
                              <Badge variant="secondary" className="shrink-0">No bloquea</Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="border rounded-md p-4 bg-white space-y-3">
                    <div className="text-sm font-medium text-slate-900">{npsQuestion.trim() || "Sin pregunta"}</div>
                    <div className="text-xs text-slate-600">
                      Escala: <span className="font-medium text-slate-900">{npsScale === "0_10" ? "0-10" : "1-5"}</span>
                      {" · "}
                      Alerta si score &lt; <span className="font-medium text-slate-900">{npsAlertThreshold}</span>
                    </div>
                    <div className="text-xs text-slate-600">
                      Evalúa D: <span className="font-medium text-slate-900">{npsEvalSupervisorD ? "Sí" : "No"}</span>
                      {" · "}
                      Evalúa K/V: <span className="font-medium text-slate-900">{npsEvalOfficeKV ? "Sí" : "No"}</span>
                    </div>
                    <div className="space-y-2">
                      <div className="text-xs text-slate-500">Tags positivos</div>
                      <div className="flex flex-wrap gap-1">
                        {normalizeTagList(npsPositiveTagsText).map((t) => (
                          <Badge key={t} variant="secondary">{t}</Badge>
                        ))}
                        {normalizeTagList(npsPositiveTagsText).length === 0 && <span className="text-xs text-slate-500">-</span>}
                      </div>
                      <div className="text-xs text-slate-500">Tags negativos</div>
                      <div className="flex flex-wrap gap-1">
                        {normalizeTagList(npsNegativeTagsText).map((t) => (
                          <Badge key={t} className="bg-slate-900 hover:bg-slate-900">{t}</Badge>
                        ))}
                        {normalizeTagList(npsNegativeTagsText).length === 0 && <span className="text-xs text-slate-500">-</span>}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <Dialog open={jsonOpen} onOpenChange={setJsonOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>JSON Avanzado</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <div className="text-xs text-slate-500">Esto es lo que se guardará en `contentJson`.</div>
            <Textarea value={jsonPreview} readOnly rows={26} className="font-mono text-xs" />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
