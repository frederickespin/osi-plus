import { useEffect, useMemo, useState } from "react";
import { Check, X, Upload, RefreshCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { UserRole } from "@/types/osi.types";
import {
  approveTemplateBatch,
  approveTemplateVersion,
  listPendingTemplateApprovals,
  publishTemplateVersion,
  rejectTemplateVersion,
  type TemplateVersionDto,
} from "@/lib/api";

type Props = { userRole: UserRole };

export function TemplateApprovalsModule({ userRole }: Props) {
  const [items, setItems] = useState<TemplateVersionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [rejectReason, setRejectReason] = useState("");

  const refresh = () => {
    setLoading(true);
    listPendingTemplateApprovals()
      .then((r) => setItems(r.data))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
  }, []);

  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([k]) => k),
    [selected],
  );

  const toggle = (id: string) => {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const approveOne = async (id: string) => {
    await approveTemplateVersion(id);
    refresh();
  };

  const approveAndPublish = async (id: string) => {
    await approveTemplateVersion(id);
    await publishTemplateVersion(id);
    refresh();
  };

  const rejectOne = async (id: string) => {
    await rejectTemplateVersion(id, rejectReason || "Rechazado");
    setRejectReason("");
    refresh();
  };

  const approveSelected = async () => {
    if (selectedIds.length === 0) return;
    await approveTemplateBatch(selectedIds);
    setSelected({});
    refresh();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Aprobaciones (Plantillas)</h1>
          <p className="text-slate-500">Bandeja de PENDING_APPROVAL con aprobación en lote</p>
          <p className="text-xs text-slate-400 mt-1">Rol actual: {userRole}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={refresh}>
            <RefreshCcw className="h-4 w-4 mr-2" />
            Refrescar
          </Button>
          <Button onClick={() => void approveSelected()} disabled={selectedIds.length === 0}>
            <Check className="h-4 w-4 mr-2" />
            Aprobar seleccionadas ({selectedIds.length})
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Pendientes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="max-w-lg">
            <label className="text-xs text-slate-500">Motivo rechazo (para usar en rechazar)</label>
            <Input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Ej: Falta legal / contenido incompleto" />
          </div>

          {items.map((v) => (
            <div key={v.id} className="border rounded-lg p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="flex items-start gap-3">
                <input type="checkbox" checked={!!selected[v.id]} onChange={() => toggle(v.id)} />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-900">{v.template?.name || v.templateId}</span>
                    <Badge variant="secondary">v{v.version}</Badge>
                    <Badge variant="outline">{v.template?.type}</Badge>
                  </div>
                  <div className="text-xs text-slate-500">
                    Solicitado: {v.requestedAt || "-"} | Creador: {v.createdBy?.name || "-"}
                  </div>
                  {v.changeSummary && <div className="text-xs text-slate-600 mt-1">Resumen: {v.changeSummary}</div>}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => void approveOne(v.id)}>
                  <Check className="h-4 w-4 mr-2" />
                  Aprobar
                </Button>
                <Button size="sm" onClick={() => void approveAndPublish(v.id)}>
                  <Upload className="h-4 w-4 mr-2" />
                  Aprobar+Publicar
                </Button>
                <Button size="sm" variant="destructive" onClick={() => void rejectOne(v.id)}>
                  <X className="h-4 w-4 mr-2" />
                  Rechazar
                </Button>
              </div>
            </div>
          ))}

          {!loading && items.length === 0 && (
            <div className="text-sm text-slate-500">No hay aprobaciones pendientes.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

