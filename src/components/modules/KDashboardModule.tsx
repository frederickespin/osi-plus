import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getKDashboard, type KDashboardProjectDto, type SignalColor } from "@/lib/api";

function colorBadge(color: SignalColor) {
  if (color === "GREEN") return <Badge className="bg-emerald-600 hover:bg-emerald-600">OK</Badge>;
  if (color === "AMBER") return <Badge className="bg-amber-500 hover:bg-amber-500">Atención</Badge>;
  return <Badge className="bg-red-600 hover:bg-red-600">Riesgo</Badge>;
}

function kStateLabel(state: string) {
  if (state === "PENDING_VALIDATION") return "Pendiente";
  if (state === "VALIDATED") return "Validado";
  if (state === "RELEASED") return "Liberado";
  return state;
}

export function KDashboardModule() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<KDashboardProjectDto[]>([]);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((p) => (p.name || "").toLowerCase().includes(q) || (p.code || "").toLowerCase().includes(q));
  }, [rows, query]);

  async function load() {
    setLoading(true);
    try {
      const r = await getKDashboard();
      setRows(r.data || []);
    } catch (e: any) {
      toast.error(e?.message || "Error cargando Dashboard K");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const counts = useMemo(() => {
    const by: Record<string, number> = { PENDING_VALIDATION: 0, VALIDATED: 0, RELEASED: 0 };
    for (const p of rows) by[p.kState] = (by[p.kState] || 0) + 1;
    return by;
  }, [rows]);

  const openProject = (projectId: string) => {
    localStorage.setItem("osi-plus.k.openProjectId", projectId);
    window.dispatchEvent(new CustomEvent("changeModule", { detail: "k-project" }));
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Control K</h2>
          <p className="text-sm text-slate-600">Validación administrativa, semáforos y PGD aplicado.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.dispatchEvent(new CustomEvent("changeModule", { detail: "k-templates" }))}>
            Centro de Plantillas
          </Button>
          <Button onClick={load} disabled={loading}>
            Actualizar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm text-slate-600">Pendiente Validación</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-semibold">{counts.PENDING_VALIDATION || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm text-slate-600">Validado</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-semibold">{counts.VALIDATED || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm text-slate-600">Liberado a Ops</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-semibold">{counts.RELEASED || 0}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle className="text-base">Proyectos</CardTitle>
          <div className="w-full sm:w-80">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por código o nombre..." />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-slate-600">Cargando...</div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-slate-600">No hay proyectos para mostrar.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Proyecto</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>kState</TableHead>
                  <TableHead>Pago</TableHead>
                  <TableHead>Permisos</TableHead>
                  <TableHead>PGD</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow key={p.id} className="cursor-pointer" onClick={() => openProject(p.id)}>
                    <TableCell className="font-medium">{p.code}</TableCell>
                    <TableCell>{p.name}</TableCell>
                    <TableCell>{p.startDate}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{kStateLabel(p.kState)}</Badge>
                    </TableCell>
                    <TableCell>{colorBadge(p.semaphores.payment)}</TableCell>
                    <TableCell>{colorBadge(p.semaphores.permits)}</TableCell>
                    <TableCell>{colorBadge(p.semaphores.pgd)}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" onClick={(e) => { e.stopPropagation(); openProject(p.id); }}>
                        Abrir
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

