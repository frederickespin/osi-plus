import { eachDayOfInterval, parseISO } from "date-fns";

export type BookingType = "PROPOSAL" | "PROJECT";
export type BookingStatus = "TENTATIVE" | "CONFIRMED" | "PAUSED";

export type CommercialBooking = {
  id: string;
  bookingType: BookingType;
  bookingStatus: BookingStatus;
  workNumber: string;
  customerId?: string;
  customerName: string;
  quoteId?: string;
  leadId?: string;
  projectId?: string;
  startDate: string;
  endDate: string;
  days: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type CalendarLimits = {
  maxProjectsPerDay: number;
};

const KEY_BOOK = "osi-plus.commercial.bookings";
const KEY_LIMITS = "osi-plus.commercial.calendarLimits";

const nowIso = () => new Date().toISOString();
const uid = () =>
  crypto?.randomUUID ? crypto.randomUUID() : `bk_${Date.now()}_${Math.random().toString(16).slice(2)}`;

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function loadBookings(): CommercialBooking[] {
  return safeParse<CommercialBooking[]>(localStorage.getItem(KEY_BOOK), []);
}

export function saveBookings(list: CommercialBooking[]) {
  localStorage.setItem(KEY_BOOK, JSON.stringify(list));
}

export function loadCalendarLimits(): CalendarLimits {
  return safeParse<CalendarLimits>(localStorage.getItem(KEY_LIMITS), { maxProjectsPerDay: 2 });
}

export function saveCalendarLimits(l: CalendarLimits) {
  localStorage.setItem(KEY_LIMITS, JSON.stringify(l));
}

export function createBooking(input: Omit<CommercialBooking, "id" | "createdAt" | "updatedAt">) {
  const list = loadBookings();
  const next: CommercialBooking = { ...input, id: uid(), createdAt: nowIso(), updatedAt: nowIso() };
  saveBookings([next, ...list]);
  return next;
}

export function upsertBooking(next: CommercialBooking) {
  const list = loadBookings();
  const updated: CommercialBooking = { ...next, updatedAt: nowIso() };
  saveBookings([updated, ...list.filter((b) => b.id !== updated.id)]);
  return updated;
}

export function pauseBooking(id: string) {
  const list = loadBookings();
  const b = list.find((x) => x.id === id);
  if (!b) return null;
  return upsertBooking({ ...b, bookingStatus: "PAUSED" });
}

export function resumeBooking(id: string) {
  const list = loadBookings();
  const b = list.find((x) => x.id === id);
  if (!b) return null;
  const bookingStatus: BookingStatus = b.bookingType === "PROJECT" ? "CONFIRMED" : "TENTATIVE";
  return upsertBooking({ ...b, bookingStatus });
}

export function overlapsDate(b: CommercialBooking, dayISO: string) {
  return b.startDate <= dayISO && dayISO <= b.endDate;
}

export function countConfirmedProjectsOnDay(bookings: CommercialBooking[], dayISO: string) {
  return bookings.filter(
    (b) => b.bookingType === "PROJECT" && b.bookingStatus === "CONFIRMED" && overlapsDate(b, dayISO)
  ).length;
}

export function validateProjectCapacity(
  bookings: CommercialBooking[],
  limits: CalendarLimits,
  startISO: string,
  endISO: string,
  ignoreBookingId?: string
) {
  const all = bookings.filter((b) => b.id !== ignoreBookingId);
  const intervalDays = eachDayOfInterval({ start: parseISO(startISO), end: parseISO(endISO) });

  for (const d of intervalDays) {
    const iso = d.toISOString().slice(0, 10);
    const count = countConfirmedProjectsOnDay(all, iso);
    if (count >= limits.maxProjectsPerDay) {
      return { ok: false as const, dayISO: iso, count };
    }
  }
  return { ok: true as const };
}

export function promoteBookingToProject(
  workNumber: string,
  patch: {
    projectId?: string;
    quoteId?: string;
    leadId?: string;
    customerId?: string;
    customerName?: string;
  }
) {
  const list = loadBookings();
  const b = list.find((x) => x.workNumber === workNumber);
  if (!b) return null;

  const next: CommercialBooking = {
    ...b,
    ...patch,
    bookingType: "PROJECT",
    bookingStatus: "CONFIRMED",
  };
  return upsertBooking(next);
}
