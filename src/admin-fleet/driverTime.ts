export const FLEET_DRIVER_TIMEZONE = "America/Santo_Domingo";
export const FLEET_DRIVER_TIMEZONE_LABEL = "Santo Domingo · UTC−04:00";

/** The operational timezone is fixed at UTC−04:00; the browser timezone is irrelevant. */
export function fleetDriverLocalToUtc(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u.test(value)) throw new Error("Indique fecha y hora de inicio y fin.");
  const instant = new Date(`${value}:00-04:00`);
  if (!Number.isFinite(instant.getTime()) || new Date(instant.getTime() - 4 * 60 * 60 * 1000).toISOString().slice(0, 16) !== value) throw new Error("Revise las fechas y horas indicadas.");
  return instant.toISOString();
}

const formatter = new Intl.DateTimeFormat("es-DO", { timeZone: FLEET_DRIVER_TIMEZONE, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
export function formatFleetDriverDate(value: string) { return formatter.format(new Date(value)); }
