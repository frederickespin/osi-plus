import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";
import { toast } from "sonner";
import { CalendarClock, Pause, Play, RefreshCw } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import type { Quote } from "@/types/sales.types";
import { loadQuotes } from "@/lib/salesStore";
import { loadProjects } from "@/lib/projectsStore";
import { loadSession, isAdminRole } from "@/lib/sessionStore";
import {
  createBooking,
  loadBookings,
  loadCalendarLimits,
  pauseBooking,
  resumeBooking,
  saveCalendarLimits,
  upsertBooking,
  validateProjectCapacity,
  overlapsDate,
  type BookingType,
  type CommercialBooking,
} from "@/lib/commercialCalendarStore";
import { addCommercialAudit } from "@/lib/commercialAuditStore";

const toISO = (d: Date) => d.toISOString().slice(0, 10);

export default function CommercialCalendarModule() {
  const session = loadSession();
  const isAdmin = isAdminRole(session.role);
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());
  const [bookings, setBookings] = useState<CommercialBooking[]>([]);
  const [limitsMaxProjects, setLimitsMaxProjects] = useState<number>(2);

  const [selectionType, setSelectionType] = useState<BookingType>("PROPOSAL");
  const [selectionId, setSelectionId] = useState<string>("");
  const [startISO, setStartISO] = useState<string>(toISO(new Date()));
  const [endISO, setEndISO] = useState<string>(toISO(new Date()));
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);

  useEffect(() => {
    setBookings(loadBookings());
    setLimitsMaxProjects(loadCalendarLimits().maxProjectsPerDay);
  }, []);

  const quotes = useMemo(() => loadQuotes(), []);
  const projects = useMemo(() => loadProjects(), []);

  const proposalCandidates = useMemo(() => {
    const projectNumbers = new Set(projects.map((p) => p.projectNumber));
    return quotes.filter((q) => !projectNumbers.has((q as Quote & { proposalNumber?: string }).proposalNumber || ""));
  }, [quotes, projects]);

  const projectCandidates = useMemo(() => projects, [projects]);
  const dayISO = useMemo(() => toISO(selectedDay), [selectedDay]);

  const bookingsForDay = useMemo(() => {
    return bookings
      .filter((b) => overlapsDate(b, dayISO))
      .sort((a, b) => (a.bookingType === b.bookingType ? 0 : a.bookingType === "PROJECT" ? -1 : 1));
  }, [bookings, dayISO]);

  const confirmedProjectsCount = useMemo(() => {
    return bookingsForDay.filter((b) => b.bookingType === "PROJECT" && b.bookingStatus === "CONFIRMED").length;
  }, [bookingsForDay]);

  const saveLimits = () => {
    if (!isAdmin) {
      toast.error("Solo Admin puede cambiar el limite diario.");
      return;
    }
    const before = loadCalendarLimits().maxProjectsPerDay;
    saveCalendarLimits({ maxProjectsPerDay: limitsMaxProjects });
    addCommercialAudit({
      userRole: session.role,
      action: "CALENDAR_LIMIT_CHANGE",
      entityType: "CALENDAR",
      entityId: "commercial-calendar-limits",
      note: "Cambio de limite diario de proyectos",
      before: { maxProjectsPerDay: before },
      after: { maxProjectsPerDay: limitsMaxProjects },
    });
    toast.success("Limite diario actualizado");
  };

  const resetForm = () => {
    setSelectionType("PROPOSAL");
    setSelectionId("");
    setStartISO(dayISO);
    setEndISO(dayISO);
    setEditingBookingId(null);
  };

  const beginEdit = (b: CommercialBooking) => {
    setEditingBookingId(b.id);
    setSelectionType(b.bookingType);
    setSelectionId(b.bookingType === "PROJECT" ? b.projectId || "" : b.quoteId || "");
    setStartISO(b.startDate);
    setEndISO(b.endDate);
  };

  const submitSchedule = () => {
    if (!selectionId) {
      toast.error("Selecciona una propuesta o proyecto");
      return;
    }
    if (!startISO || !endISO || endISO < startISO) {
      toast.error("Rango de fechas invalido");
      return;
    }

    const limits = { maxProjectsPerDay: limitsMaxProjects };

    if (selectionType === "PROJECT") {
      const cap = validateProjectCapacity(bookings, limits, startISO, endISO, editingBookingId || undefined);
      if (!cap.ok) {
        toast.error(`Limite alcanzado el ${cap.dayISO} (ya tienes ${cap.count}/${limits.maxProjectsPerDay} proyectos)`);
        return;
      }
    }

    const days = (parseISO(endISO).getTime() - parseISO(startISO).getTime()) / (1000 * 60 * 60 * 24) + 1;

    if (selectionType === "PROPOSAL") {
      const q = proposalCandidates.find((x) => x.id === selectionId) as (Quote & {
        proposalNumber?: string;
        customerId?: string;
      }) | undefined;
      if (!q) {
        toast.error("Propuesta no encontrada");
        return;
      }

      const workNumber = q.proposalNumber || "P0000";

      if (editingBookingId) {
        const current = bookings.find((b) => b.id === editingBookingId);
        if (!current) return;
        upsertBooking({
          ...current,
          startDate: startISO,
          endDate: endISO,
          days,
          bookingType: "PROPOSAL",
          bookingStatus: "TENTATIVE",
        });
        setBookings(loadBookings());
        toast.success("Propuesta reprogramada");
        resetForm();
        return;
      }

      createBooking({
        bookingType: "PROPOSAL",
        bookingStatus: "TENTATIVE",
        workNumber,
        customerId: q.customerId,
        customerName: q.title?.replace("Cotizacion - ", "") || "Cliente",
        quoteId: q.id,
        startDate: startISO,
        endDate: endISO,
        days,
        notes: "",
      });

      setBookings(loadBookings());
      toast.success("Propuesta agendada");
      resetForm();
      return;
    }

    const p = projectCandidates.find((x) => x.id === selectionId);
    if (!p) {
      toast.error("Proyecto no encontrado");
      return;
    }

    if (editingBookingId) {
      const current = bookings.find((b) => b.id === editingBookingId);
      if (!current) return;

      upsertBooking({
        ...current,
        startDate: startISO,
        endDate: endISO,
        days,
        bookingType: "PROJECT",
        bookingStatus: "CONFIRMED",
        projectId: p.id,
        workNumber: p.projectNumber,
        customerName: p.customerName,
        customerId: p.customerId,
      });

      setBookings(loadBookings());
      toast.success("Proyecto reprogramado");
      resetForm();
      return;
    }

    createBooking({
      bookingType: "PROJECT",
      bookingStatus: "CONFIRMED",
      workNumber: p.projectNumber,
      customerId: p.customerId,
      customerName: p.customerName,
      projectId: p.id,
      startDate: startISO,
      endDate: endISO,
      days,
      notes: "",
    });

    setBookings(loadBookings());
    toast.success("Proyecto programado");
    resetForm();
  };

  const pause = (id: string) => {
    pauseBooking(id);
    setBookings(loadBookings());
    toast.success("Pausado");
  };

  const resume = (id: string) => {
    const b = bookings.find((x) => x.id === id);
    if (!b) return;

    if (b.bookingType === "PROJECT") {
      const cap = validateProjectCapacity(bookings, { maxProjectsPerDay: limitsMaxProjects }, b.startDate, b.endDate, b.id);
      if (!cap.ok) {
        toast.error(`No se puede reanudar: limite alcanzado el ${cap.dayISO}`);
        return;
      }
    }

    resumeBooking(id);
    setBookings(loadBookings());
    toast.success("Reanudado");
  };

  const modifiers = useMemo(() => {
    const projDays = new Set<string>();
    const propDays = new Set<string>();
    for (const b of bookings) {
      if (b.bookingStatus === "PAUSED") continue;
      if (b.bookingType === "PROJECT") projDays.add(b.startDate);
      else propDays.add(b.startDate);
    }
    return {
      projectStarts: Array.from(projDays).map((d) => parseISO(d)),
      proposalStarts: Array.from(propDays).map((d) => parseISO(d)),
    };
  }, [bookings]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Calendario Comercial</h1>
          <p className="text-slate-500">Propuestas pendientes y proyectos confirmados con reprogramacion y pausas.</p>
        </div>

        <Card className="w-full md:w-auto">
          <CardContent className="p-4 flex items-end gap-3">
            <div className="space-y-1">
              <Label>Limite Proyectos por dia</Label>
              <Input
                type="number"
                min={0}
                value={limitsMaxProjects}
                disabled={!isAdmin}
                onChange={(e) => setLimitsMaxProjects(Number(e.target.value) || 0)}
              />
            </div>
            <Button variant="outline" onClick={saveLimits} disabled={!isAdmin}>
              Guardar
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CalendarClock className="h-5 w-5" />
              Mes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DayPicker
              mode="single"
              selected={selectedDay}
              onSelect={(d) => d && setSelectedDay(d)}
              modifiers={{
                projectStarts: modifiers.projectStarts,
                proposalStarts: modifiers.proposalStarts,
              }}
              modifiersClassNames={{
                projectStarts: "rdp-day_project",
                proposalStarts: "rdp-day_proposal",
              }}
            />
            <style>{`
              .rdp-day_project { outline: 2px solid #D7554F; border-radius: 10px; }
              .rdp-day_proposal { outline: 2px dashed #373363; border-radius: 10px; }
            `}</style>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Detalle del dia: {format(selectedDay, "yyyy-MM-dd")}</CardTitle>
              <Badge variant={confirmedProjectsCount >= limitsMaxProjects ? "destructive" : "secondary"}>
                Proyectos confirmados: {confirmedProjectsCount}/{limitsMaxProjects}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              {bookingsForDay.length === 0 ? (
                <p className="text-slate-500">Sin eventos este dia.</p>
              ) : (
                bookingsForDay.map((b) => {
                  const color =
                    b.bookingStatus === "PAUSED"
                      ? "bg-slate-100 border-slate-200"
                      : b.bookingType === "PROJECT"
                        ? "bg-[#D7554F]/10 border-[#D7554F]/30"
                        : "bg-[#373363]/10 border-[#373363]/30";

                  return (
                    <div key={b.id} className={`p-3 border rounded-lg ${color} flex items-start justify-between gap-3`}>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{b.workNumber}</span>
                          <Badge variant="outline">{b.bookingType === "PROJECT" ? "Proyecto" : "Propuesta"}</Badge>
                          {b.bookingStatus === "PAUSED" && <Badge variant="secondary">Pausado</Badge>}
                        </div>
                        <p className="text-sm text-slate-700 truncate">{b.customerName}</p>
                        <p className="text-xs text-slate-500">
                          {b.startDate} - {b.endDate} ({b.days} dias)
                        </p>
                      </div>

                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => beginEdit(b)}>
                          <RefreshCw className="h-4 w-4 mr-1" /> Reprogramar
                        </Button>
                        {b.bookingStatus === "PAUSED" ? (
                          <Button size="sm" onClick={() => resume(b.id)}>
                            <Play className="h-4 w-4 mr-1" /> Reanudar
                          </Button>
                        ) : (
                          <Button size="sm" variant="secondary" onClick={() => pause(b.id)}>
                            <Pause className="h-4 w-4 mr-1" /> Pausar
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{editingBookingId ? "Reprogramar" : "Programar"} servicio</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select
                    value={selectionType}
                    onValueChange={(v) => {
                      setSelectionType(v as BookingType);
                      setSelectionId("");
                    }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PROPOSAL">Propuesta (pendiente)</SelectItem>
                      <SelectItem value="PROJECT">Proyecto (confirmado)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{selectionType === "PROJECT" ? "Proyecto" : "Propuesta"}</Label>
                  <Select value={selectionId} onValueChange={setSelectionId}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                    <SelectContent>
                      {selectionType === "PROPOSAL"
                        ? proposalCandidates.map((q: Quote & { proposalNumber?: string }) => (
                            <SelectItem key={q.id} value={q.id}>
                              {(q.proposalNumber || "P----")} - {q.title}
                            </SelectItem>
                          ))
                        : projectCandidates.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.projectNumber} - {p.customerName}
                            </SelectItem>
                          ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Inicio</Label>
                  <Input type="date" value={startISO} onChange={(e) => setStartISO(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Fin</Label>
                  <Input type="date" value={endISO} onChange={(e) => setEndISO(e.target.value)} />
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                {editingBookingId && (
                  <Button variant="outline" onClick={resetForm}>Cancelar</Button>
                )}
                <Button onClick={submitSchedule}>
                  {editingBookingId ? "Guardar cambios" : "Programar"}
                </Button>
              </div>

              <p className="text-xs text-slate-500">
                Proyectos confirmados respetan el limite por dia. Propuestas pendientes no consumen cupo.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
