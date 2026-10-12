import type { DateFilter } from "../types/models";

const pad = (n: number) => String(n).padStart(2, "0");

/** A Date as YYYY-MM-DD in the computer's local time zone (not UTC). */
export function toLocalIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Today's local date as YYYY-MM-DD. */
export function todayLocal(): string {
  return toLocalIsoDate(new Date());
}

/** Parse YYYY-MM-DD into a local Date, or null if not a real calendar date. */
export function parseIsoDate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  if (y < 1900) return null;
  return date;
}

export function isValidIsoDate(value: string): boolean {
  return parseIsoDate(value) !== null;
}

/** "2026-10-13" -> "Tue, Oct 13, 2026" */
export function formatDisplayDate(value: string): string {
  const d = parseIsoDate(value);
  if (!d) return value;
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

export function todayFilter(): DateFilter {
  const t = todayLocal();
  return { from: t, to: t };
}

export const ALL_DATES: DateFilter = { from: null, to: null };

export function isAllDates(f: DateFilter): boolean {
  return !f.from && !f.to;
}

/** Monday-to-today and first-of-month-to-today ranges. */
export function thisWeekFilter(): DateFilter {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  return { from: toLocalIsoDate(start), to: toLocalIsoDate(now) };
}

export function thisMonthFilter(): DateFilter {
  const now = new Date();
  return { from: toLocalIsoDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: toLocalIsoDate(now) };
}

export function thisYearFilter(): DateFilter {
  const now = new Date();
  return { from: `${now.getFullYear()}-01-01`, to: toLocalIsoDate(now) };
}

/** Human description of a filter, e.g. "Today", "All dates", "Oct 1 – Oct 13, 2026". */
export function describeRange(f: DateFilter): string {
  if (isAllDates(f)) return "All dates";
  const t = todayLocal();
  if (f.from === t && f.to === t) return "Today";
  if (f.from && f.to && f.from === f.to) return formatDisplayDate(f.from);
  const from = f.from ? formatDisplayDate(f.from) : "the beginning";
  const to = f.to ? formatDisplayDate(f.to) : "now";
  return `${from} – ${to}`;
}

/** Short slug for export file names. */
export function rangeSlug(f: DateFilter): string {
  if (isAllDates(f)) return "all-dates";
  if (f.from && f.from === f.to) return f.from;
  return `${f.from ?? "start"}_to_${f.to ?? "now"}`;
}
