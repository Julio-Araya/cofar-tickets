/** Presentation helpers. Dates are shown in Chile's time zone. */
const dateTime = new Intl.DateTimeFormat("es-CL", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Santiago",
});

export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso));
}
