// Demo runs on Australian time (Johnson Health Tech Australia, Dandenong VIC).
// Intl handles DST correctly, unlike a fixed offset.

export const DEMO_TZ = process.env.NEXT_PUBLIC_DEMO_TIMEZONE || "Australia/Melbourne";

function parts(now: Date, tz: string, options: Intl.DateTimeFormatOptions) {
  const p = new Intl.DateTimeFormat("en-AU", { timeZone: tz, ...options }).formatToParts(now);
  return (type: string) => p.find((x) => x.type === type)?.value || "";
}

/** YYYY-MM-DD for "today" in the demo timezone. */
export function localISODate(now: Date = new Date(), tz: string = DEMO_TZ): string {
  const get = parts(now, tz, { year: "numeric", month: "2-digit", day: "2-digit" });
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * Rich current date/time injected into every call as `current_datetime`, so the
 * agent can resolve "tomorrow", "next Tuesday", etc. against a real clock:
 *   "Thursday, 15 October 2026 | 2026-10-15 | 14:12 | Australia/Melbourne"
 */
export function richLocalDateTime(now: Date = new Date(), tz: string = DEMO_TZ): string {
  const get = parts(now, tz, {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${get("weekday")}, ${get("day")} ${get("month")} ${get("year")} | ${localISODate(
    now,
    tz
  )} | ${get("hour")}:${get("minute")} | ${tz}`;
}

/** "15 Oct 2026, 2:12 pm" style display for table cells. */
export function formatCallTime(iso: string, tz: string = DEMO_TZ): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat("en-AU", {
      timeZone: tz,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  } catch {
    return iso;
  }
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0s";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
}
