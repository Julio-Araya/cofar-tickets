/** Presentation helpers. Dates are shown in Chile's time zone. */
const dateTime = new Intl.DateTimeFormat("es-CL", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Santiago",
});

export function formatDateTime(iso: string | Date): string {
  return dateTime.format(typeof iso === "string" ? new Date(iso) : iso);
}

/** "45 min", "3,5 h", "2 d 4 h". */
export function formatHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${hours.toFixed(1).replace(".", ",").replace(",0", "")} h`;
  const days = Math.floor(hours / 24);
  const rest = Math.round(hours - days * 24);
  return rest === 0 ? `${days} d` : `${days} d ${rest} h`;
}

export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)} %`;
}
