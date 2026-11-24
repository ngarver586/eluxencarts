// Time zone helpers. All business rules are evaluated in the business time zone.

export interface LocalParts {
  date: string; // YYYY-MM-DD
  minutes: number; // minutes after local midnight
  weekday: string; // Monday
  monthName: string; // November
  day: number;
  year: number;
}

export function localParts(d: Date, tz: string): LocalParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "long",
  });
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(d)) p[part.type] = part.value;
  const monthName = new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "long" }).format(d);
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    minutes: Number(p.hour) * 60 + Number(p.minute),
    weekday: p.weekday,
    monthName,
    day: Number(p.day),
    year: Number(p.year),
  };
}

/** Convert a local wall-clock date and minute-of-day to a UTC instant. */
export function localToUtc(date: string, minutes: number, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const wallAsUtc = Date.UTC(y, m - 1, d, 0, minutes);
  let guess = wallAsUtc;
  for (let i = 0; i < 3; i++) {
    const lp = localParts(new Date(guess), tz);
    const [ly, lm, ld] = lp.date.split("-").map(Number);
    const shown = Date.UTC(ly, lm - 1, ld, 0, lp.minutes);
    const diff = wallAsUtc - shown;
    if (diff === 0) break;
    guess += diff;
  }
  return new Date(guess);
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function parseHHMM(s: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s).trim());
  if (!m) throw new Error(`Bad time "${s}", expected HH:MM`);
  return Number(m[1]) * 60 + Number(m[2]);
}

export function clockLabel(minutes: number): string {
  const h24 = Math.floor(minutes / 60);
  const min = minutes % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(min).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
}

/** "Tuesday, November 26 at 10:00 AM" */
export function spokenLabel(d: Date, tz: string): string {
  const lp = localParts(d, tz);
  return `${lp.weekday}, ${lp.monthName} ${lp.day} at ${clockLabel(lp.minutes)}`;
}
