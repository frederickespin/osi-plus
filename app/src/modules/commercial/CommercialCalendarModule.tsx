import { useMemo, useState } from "react";
import { addDays, addWeeks, eachDayOfInterval, format, isSameDay, parseISO, startOfWeek, subWeeks } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight, Pause, Play, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

import { addCommercialAudit } from "@/lib/commercialAuditStore";
import {
  createBooking,
  loadBookings,
  loadCalendarLimits,
  overlapsDate,
  pauseBooking,
  resumeBooking,
  saveCalendarLimits,
  upsertBooking,
  validateProjectCapacity,
  type BookingType,
  type CommercialBooking,
} from "@/lib/commercialCalendarStore";
import { loadProjects } from "@/lib/projectsStore";
import { loadQuotes } from "@/lib/salesStore";
import { isAdminRole, loadSession } from "@/lib/sessionStore";
import type { Quote } from "@/types/sales.types";

const DAY_HEADERS = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"] as const;
const VISIBLE_WEEKS = 3;
const VISIBLE_DAYS = VISIBLE_WEEKS * 7;
const DAY_MS = 1000 * 60 * 60 * 24;
const toISO = (d: Date) => d.toISOString().slice(0, 10);

function getCapacityTone(confirmedProjects: number, maxProjects: number) {
  if (maxProjects <= 0) {
    return {
      dotClass: "bg-slate-400",
      textClass: "text-slate-600",
      chipClass: "bg-slate-100 text-slate-700 border-slate-200",
      label: "Sin limite",
    };
  }

  const ratio = confirmedProjects / maxProjects;
  if (ratio >= 1) {
    return {
      dotClass: "bg-red-500",
      textClass: "text-red-600",
      chipClass: "bg-red-50 text-red-700 border-red-200",
      label: "Completo",
    };
  }
  if (ratio >= 0.75) {
    return {
      dotClass: "bg-orange-500",
      textClass: "text-orange-600",
      chipClass: "bg-orange-50 text-orange-700 border-orange-200",
      label: "Alto",
    };
  }
  if (ratio >= 0.5) {
    return {
      dotClass: "bg-amber-500",
      textClass: "text-amber-600",
      chipClass: "bg-amber-50 text-amber-700 border-amber-200",
      label: "Medio",
    };
  }
  return {
    dotClass: "bg-emerald-500",
    textClass: "text-emerald-600",
    chipClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    label: "Disponible",
  };
}

export default function CommercialCalendarModule() {
  const session = loadSession();
  const isAdmin = isAdminRole(session.role);

  const today = useMemo(() => new Date(), []);
  const [windowStart, setWindowStart] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [selectedDay, setSelectedDay] = useState<Date>(today);

  const [bookings, setBookings] = useState<CommercialBooking[]>(() => loadBookings());
  const [limitsMaxProjects, setLimitsMaxProjects] = useState<number>(() => loadCalendarLimits().maxProjectsPerDay);

  const [selectionType, setSelectionType] = useState<BookingType>("PROPOSAL");
  const [selectionId, setSelectionId] = useState<string>("");
  const [startISO, setStartISO] = useState<string>(toISO(today));
  const [endISO, setEndISO] = useState<string>(toISO(today));
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);

  const quotes = useMemo(() => loadQuotes(), []);
  const projects = useMemo(() => loadProjects(), []);

  const proposalCandidates = useMemo(() => {
    const projectNumbers = new Set(projects.map((p) => p.projectNumber));
    return quotes.filter((q) => !projectNumbers.has((q as Quote & { proposalNumber?: string }).proposalNumber || ""));
  }, [quotes, projects]);

  const projectCandidates = useMemo(() => projects, [projects]);

  const dayISO = useMemo(() => toISO(selectedDay), [selectedDay]);

  const visibleDays = useMemo(
    () =>
      eachDayOfInterval({
        start: windowStart,
        end: addDays(windowStart, VISIBLE_DAYS - 1),
      }),
    [windowStart]
  );

  const windowRange = useMemo(() => {
    const end = addDays(windowStart, VISIBLE_DAYS - 1);
    return `${format(windowStart, "d MMM", { locale: es })} - ${format(end, "d MMM yyyy", { locale: es })}`;
  }, [windowStart]);

  const selectedDayBookings = useMemo(() => {
    return bookings
      .filter((b) => overlapsDate(b, dayISO))
      .sort((a, b) => {
        if (a.bookingStatus === "PAUSED" && b.bookingStatus !== "PAUSED") return 1;
        if (a.bookingStatus !== "PAUSED" && b.bookingStatus === "PAUSED") return -1;
        if (a.bookingType === b.bookingType) return 0;
        return a.bookingType === "PROJECT" ? -1 : 1;
      });
  }, [bookings, dayISO]);

  const selectedConfirmedProjects = useMemo(
    () => selectedDayBookings.filter((b) => b.bookingType === "PROJECT" && b.bookingStatus === "CONFIRMED").length,
    [selectedDayBookings]
  );

  const dayCards = useMemo(() => {
    return visibleDays.map((dayDate) => {
      const iso = toISO(dayDate);
      const dayBookings = bookings.filter((b) => overlapsDate(b, iso));
      const confirmedProjects = dayBookings.filter(
        (b) => b.bookingType === "PROJECT" && b.bookingStatus === "CONFIRMED"
      ).length;
      const tentative = dayBookings.filter(
        (b) => b.bookingType === "PROPOSAL" && b.bookingStatus !== "PAUSED"
      ).length;
      const paused = dayBookings.filter((b) => b.bookingStatus === "PAUSED").length;

      return {
        date: dayDate,
        iso,
        bookings: dayBookings,
        confirmedProjects,
        tentative,
        paused,
        tone: getCapacityTone(confirmedProjects, limitsMaxProjects),
      };
    });
  }, [bookings, limitsMaxProjects, visibleDays]);

  const windowStats = useMemo(() => {
    const startISO = toISO(windowStart);
    const endISO = toISO(addDays(windowStart, VISIBLE_DAYS - 1));
    const inWindow = bookings.filter((b) => b.endDate >= startISO && b.startDate <= endISO);

    return {
      activeProjects: inWindow.filter((b) => b.bookingType === "PROJECT" && b.bookingStatus === "CONFIRMED").length,
      tentative: inWindow.filter((b) => b.bookingType === "PROPOSAL" && b.bookingStatus === "TENTATIVE").length,
      paused: inWindow.filter((b) => b.bookingStatus === "PAUSED").length,
      daysWithLoad: dayCards.filter((d) => d.bookings.length > 0).length,
    };
  }, [bookings, dayCards, windowStart]);

  const resetForm = (dateISO?: string) => {
    const nextISO = dateISO || dayISO;
    setSelectionType("PROPOSAL");
    setSelectionId("");
    setStartISO(nextISO);
    setEndISO(nextISO);
    setEditingBookingId(null);
  };

  const handleSelectDay = (date: Date) => {
    setSelectedDay(date);
    if (!editingBookingId) {
      const iso = toISO(date);
      setStartISO(iso);
      setEndISO(iso);
    }
  };

  const startFromToday = () => {
    const monday = startOfWeek(today, { weekStartsOn: 1 });
    setWindowStart(monday);
    setSelectedDay(today);
    if (!editingBookingId) {
      const iso = toISO(today);
      setStartISO(iso);
      setEndISO(iso);
    }
  };

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

  const beginEdit = (booking: CommercialBooking) => {
    setEditingBookingId(booking.id);
    setSelectionType(booking.bookingType);
    setSelectionId(booking.bookingType === "PROJECT" ? booking.projectId || "" : booking.quoteId || "");
    setStartISO(booking.startDate);
    setEndISO(booking.endDate);

    const firstDate = parseISO(booking.startDate);
    setSelectedDay(firstDate);
    setWindowStart(startOfWeek(firstDate, { weekStartsOn: 1 }));
  };

  const submitSchedule = () => {
    if (!selectionId) {
      toast.error("Selecciona una propuesta o proyecto.");
      return;
    }
    if (!startISO || !endISO || endISO < startISO) {
      toast.error("Rango de fechas invalido.");
      return;
    }

    if (selectionType === "PROJECT") {
      const cap = validateProjectCapacity(
        bookings,
        { maxProjectsPerDay: limitsMaxProjects },
        startISO,
        endISO,
        editingBookingId || undefined
      );
      if (!cap.ok) {
        toast.error(
          `Limite alcanzado el ${cap.dayISO} (${cap.count}/${limitsMaxProjects} proyectos confirmados).`
        );
        return;
      }
    }

    const days = Math.floor((parseISO(endISO).getTime() - parseISO(startISO).getTime()) / DAY_MS) + 1;

    if (selectionType === "PROPOSAL") {
      const quote = proposalCandidates.find((item) => item.id === selectionId) as
        | (Quote & { proposalNumber?: string; customerId?: string })
        | undefined;

      if (!quote) {
        toast.error("Propuesta no encontrada.");
        return;
      }

      if (editingBookingId) {
        const current = bookings.find((item) => item.id === editingBookingId);
        if (!current) return;

        upsertBooking({
          ...current,
          bookingType: "PROPOSAL",
          bookingStatus: "TENTATIVE",
          startDate: startISO,
          endDate: endISO,
          days,
          quoteId: quote.id,
          leadId: quote.leadId,
          workNumber: quote.proposalNumber || "P0000",
          customerId: quote.customerId,
          customerName: quote.title?.replace("Cotizacion - ", "") || "Cliente",
        });

        setBookings(loadBookings());
        toast.success("Propuesta reprogramada.");
        resetForm(startISO);
        return;
      }

      createBooking({
        bookingType: "PROPOSAL",
        bookingStatus: "TENTATIVE",
        workNumber: quote.proposalNumber || "P0000",
        customerId: quote.customerId,
        customerName: quote.title?.replace("Cotizacion - ", "") || "Cliente",
        quoteId: quote.id,
        leadId: quote.leadId,
        startDate: startISO,
        endDate: endISO,
        days,
        notes: "",
      });

      setBookings(loadBookings());
      toast.success("Propuesta agendada.");
      resetForm(startISO);
      return;
    }

    const project = projectCandidates.find((item) => item.id === selectionId);
    if (!project) {
      toast.error("Proyecto no encontrado.");
      return;
    }

    if (editingBookingId) {
      const current = bookings.find((item) => item.id === editingBookingId);
      if (!current) return;

      upsertBooking({
        ...current,
        bookingType: "PROJECT",
        bookingStatus: "CONFIRMED",
        startDate: startISO,
        endDate: endISO,
        days,
        projectId: project.id,
        workNumber: project.projectNumber,
        customerName: project.customerName,
        customerId: project.customerId,
      });

      setBookings(loadBookings());
      toast.success("Proyecto reprogramado.");
      resetForm(startISO);
      return;
    }

    createBooking({
      bookingType: "PROJECT",
      bookingStatus: "CONFIRMED",
      workNumber: project.projectNumber,
      customerId: project.customerId,
      customerName: project.customerName,
      projectId: project.id,
      startDate: startISO,
      endDate: endISO,
      days,
      notes: "",
    });

    setBookings(loadBookings());
    toast.success("Proyecto programado.");
    resetForm(startISO);
  };

  const pause = (id: string) => {
    pauseBooking(id);
    setBookings(loadBookings());
    toast.success("Reserva pausada.");
  };

  const resume = (id: string) => {
    const booking = bookings.find((item) => item.id === id);
    if (!booking) return;

    if (booking.bookingType === "PROJECT") {
      const cap = validateProjectCapacity(
        bookings,
        { maxProjectsPerDay: limitsMaxProjects },
        booking.startDate,
        booking.endDate,
        booking.id
      );
      if (!cap.ok) {
        toast.error(`No se puede reanudar: limite alcanzado el ${cap.dayISO}.`);
        return;
      }
    }

    resumeBooking(id);
    setBookings(loadBookings());
    toast.success("Reserva reanudada.");
  };

  const selectedTone = getCapacityTone(selectedConfirmedProjects, limitsMaxProjects);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Calendario Comercial</h1>
          <p className="text-slate-600">
            Vista operativa de propuestas y proyectos confirmados, con control de cupo diario.
          </p>
        </div>
        <Button
          onClick={() => resetForm()}
          className="w-full md:w-auto bg-[#373363] hover:bg-[#2e2a53] text-white"
        >
          <Plus className="h-4 w-4 mr-2" />
          Nueva reserva
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Proyectos confirmados</p>
            <p className="text-2xl font-semibold text-slate-900 mt-1">{windowStats.activeProjects}</p>
            <p className="text-xs text-slate-500 mt-1">Dentro del rango visible</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Propuestas tentativas</p>
            <p className="text-2xl font-semibold text-slate-900 mt-1">{windowStats.tentative}</p>
            <p className="text-xs text-slate-500 mt-1">No consumen cupo confirmado</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Reservas pausadas</p>
            <p className="text-2xl font-semibold text-slate-900 mt-1">{windowStats.paused}</p>
            <p className="text-xs text-slate-500 mt-1">Pendientes de reanudacion</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Dias con carga</p>
            <p className="text-2xl font-semibold text-slate-900 mt-1">{windowStats.daysWithLoad}</p>
            <p className="text-xs text-slate-500 mt-1">De {VISIBLE_DAYS} dias visibles</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => setWindowStart((prev) => subWeeks(prev, 1))}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Semana anterior
              </Button>
              <Button variant="outline" onClick={startFromToday}>
                <CalendarDays className="h-4 w-4 mr-2" />
                Hoy
              </Button>
              <Button variant="outline" onClick={() => setWindowStart((prev) => addWeeks(prev, 1))}>
                Semana siguiente
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>

            <p className="text-base font-semibold text-slate-800 capitalize">{windowRange}</p>

            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor="max-projects">Limite por dia</Label>
                <Input
                  id="max-projects"
                  type="number"
                  min={0}
                  className="w-[130px]"
                  value={limitsMaxProjects}
                  disabled={!isAdmin}
                  onChange={(e) => setLimitsMaxProjects(Math.max(0, Number(e.target.value) || 0))}
                />
              </div>
              <Button variant="outline" onClick={saveLimits} disabled={!isAdmin}>
                Guardar limite
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(380px,1fr)] gap-6 items-start">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-lg">Calendario de capacidad</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="grid grid-cols-7 border-t border-slate-200 bg-slate-50">
              {DAY_HEADERS.map((dayName) => (
                <div key={dayName} className="py-2 text-center text-xs font-semibold text-slate-600 border-r last:border-r-0">
                  {dayName}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {dayCards.map((dayCard, index) => {
                const isSelected = isSameDay(dayCard.date, selectedDay);
                const isToday = isSameDay(dayCard.date, today);
                const topItems = dayCard.bookings.slice(0, 3);

                return (
                  <button
                    key={dayCard.iso}
                    onClick={() => handleSelectDay(dayCard.date)}
                    className={cn(
                      "relative min-h-[145px] border-r border-b border-slate-200 p-2 text-left transition-colors",
                      index % 7 === 6 && "border-r-0",
                      index >= VISIBLE_DAYS - 7 && "border-b-0",
                      "hover:bg-slate-50",
                      isSelected && "ring-2 ring-[#373363] ring-inset bg-[#373363]/5",
                      isToday && !isSelected && "bg-emerald-50/60"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className={cn("text-sm font-semibold", isToday ? "text-emerald-700" : "text-slate-800")}>
                        {format(dayCard.date, "d")}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className={cn("text-[11px] font-semibold", dayCard.tone.textClass)}>
                          {limitsMaxProjects <= 0
                            ? `${dayCard.confirmedProjects} Pj`
                            : `${dayCard.confirmedProjects}/${limitsMaxProjects} Pj`}
                        </span>
                        <span className={cn("h-2.5 w-2.5 rounded-full", dayCard.tone.dotClass)} />
                      </div>
                    </div>

                    <div className="space-y-1">
                      {topItems.map((booking) => (
                        <div
                          key={booking.id}
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[11px] truncate border",
                            booking.bookingStatus === "PAUSED" &&
                              "bg-slate-100 text-slate-600 border-slate-200 line-through",
                            booking.bookingStatus !== "PAUSED" &&
                              booking.bookingType === "PROJECT" &&
                              "bg-[#D7554F]/10 text-[#a73f39] border-[#D7554F]/30",
                            booking.bookingStatus !== "PAUSED" &&
                              booking.bookingType === "PROPOSAL" &&
                              "bg-[#373363]/10 text-[#373363] border-[#373363]/30"
                          )}
                        >
                          {booking.workNumber}
                        </div>
                      ))}
                      {dayCard.bookings.length > 3 && (
                        <p className="text-[11px] font-medium text-slate-500">+{dayCard.bookings.length - 3} mas</p>
                      )}
                    </div>

                    <div className="absolute bottom-2 left-2 right-2 flex items-center gap-1 text-[10px] text-slate-500">
                      <span>Prop {dayCard.tentative}</span>
                      <span>•</span>
                      <span>Pausa {dayCard.paused}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-lg">
                  Detalle del dia {format(selectedDay, "dd/MM/yyyy")}
                </CardTitle>
                <Badge className={cn("border", selectedTone.chipClass)}>
                  {selectedTone.label}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <Badge variant="outline">
                  Proyectos:{" "}
                  {limitsMaxProjects <= 0
                    ? `${selectedConfirmedProjects}`
                    : `${selectedConfirmedProjects}/${limitsMaxProjects}`}
                </Badge>
                <Badge variant="outline">
                  Propuestas: {selectedDayBookings.filter((b) => b.bookingType === "PROPOSAL").length}
                </Badge>
                <Badge variant="outline">Total: {selectedDayBookings.length}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {selectedDayBookings.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 p-5 text-sm text-slate-500">
                  Sin reservas para este dia.
                </div>
              ) : (
                selectedDayBookings.map((booking) => (
                  <div
                    key={booking.id}
                    className={cn(
                      "rounded-lg border p-3 space-y-2",
                      booking.bookingStatus === "PAUSED" && "bg-slate-100 border-slate-200",
                      booking.bookingStatus !== "PAUSED" &&
                        booking.bookingType === "PROJECT" &&
                        "bg-[#D7554F]/10 border-[#D7554F]/25",
                      booking.bookingStatus !== "PAUSED" &&
                        booking.bookingType === "PROPOSAL" &&
                        "bg-[#373363]/10 border-[#373363]/25"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900">{booking.workNumber}</p>
                        <p className="text-sm text-slate-700 truncate">{booking.customerName}</p>
                        <p className="text-xs text-slate-500">
                          {booking.startDate} - {booking.endDate} ({booking.days} dias)
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge variant="outline">
                          {booking.bookingType === "PROJECT" ? "Proyecto" : "Propuesta"}
                        </Badge>
                        {booking.bookingStatus === "PAUSED" && <Badge variant="secondary">Pausado</Badge>}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => beginEdit(booking)}>
                        <RefreshCw className="h-3.5 w-3.5 mr-1" />
                        Reprogramar
                      </Button>
                      {booking.bookingStatus === "PAUSED" ? (
                        <Button size="sm" onClick={() => resume(booking.id)}>
                          <Play className="h-3.5 w-3.5 mr-1" />
                          Reanudar
                        </Button>
                      ) : (
                        <Button size="sm" variant="secondary" onClick={() => pause(booking.id)}>
                          <Pause className="h-3.5 w-3.5 mr-1" />
                          Pausar
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                {editingBookingId ? "Reprogramar reserva" : "Programar servicio"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select
                    value={selectionType}
                    onValueChange={(value) => {
                      setSelectionType(value as BookingType);
                      setSelectionId("");
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PROPOSAL">Propuesta (tentativa)</SelectItem>
                      <SelectItem value="PROJECT">Proyecto (confirmado)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{selectionType === "PROJECT" ? "Proyecto" : "Propuesta"}</Label>
                  <Select value={selectionId} onValueChange={setSelectionId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar..." />
                    </SelectTrigger>
                    <SelectContent>
                      {selectionType === "PROPOSAL"
                        ? proposalCandidates.map((quote: Quote & { proposalNumber?: string }) => (
                            <SelectItem key={quote.id} value={quote.id}>
                              {(quote.proposalNumber || "P----")} - {quote.title}
                            </SelectItem>
                          ))
                        : projectCandidates.map((project) => (
                            <SelectItem key={project.id} value={project.id}>
                              {project.projectNumber} - {project.customerName}
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

              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                Los proyectos confirmados consumen cupo diario. Las propuestas tentativas no bloquean capacidad.
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                {editingBookingId && (
                  <Button variant="outline" onClick={() => resetForm()}>
                    Cancelar edicion
                  </Button>
                )}
                <Button onClick={submitSchedule}>
                  {editingBookingId ? "Guardar cambios" : "Programar"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

