/**
 * Generación de archivos .ics (iCalendar) para que el cliente descargue la
 * visita técnica confirmada/propuesta como recordatorio en el calendario de
 * su teléfono (Google Calendar, Apple Calendar, Samsung Calendar…).
 */

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Fecha en formato iCal UTC: YYYYMMDDTHHMMSSZ */
export function toIcsDate(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/** Escapa texto según RFC 5545 (\, ; y saltos de línea) */
function esc(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Divide líneas largas (>75 octetos) con continuación, como exige la RFC. */
function fold(line: string): string {
  const out: string[] = [];
  let current = line;
  while (Buffer.byteLength(current, "utf8") > 73) {
    // Cortar sin partir caracteres multibyte: buscamos por bytes utf8.
    let cut = 73;
    while (cut > 0 && Buffer.byteLength(current.slice(0, cut), "utf8") > 73) cut--;
    out.push(current.slice(0, cut));
    current = " " + current.slice(cut);
  }
  out.push(current);
  return out.join("\r\n");
}

export type IcsEventInput = {
  uid: string;
  summary: string;
  description?: string | null;
  location?: string | null;
  start: Date;
  /** Duración estimada en minutos (por defecto 60). */
  durationMinutes?: number;
  organizerEmail?: string | null;
};

export function buildIcsEvent(ev: IcsEventInput): string {
  const end = new Date(ev.start.getTime() + (ev.durationMinutes ?? 60) * 60_000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Soporte IT//Visitas Tecnicas//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${ev.uid}@soporte-it`,
    `DTSTAMP:${toIcsDate(new Date())}`,
    `DTSTART:${toIcsDate(ev.start)}`,
    `DTEND:${toIcsDate(end)}`,
    fold(`SUMMARY:${esc(ev.summary)}`),
    ev.location ? fold(`LOCATION:${esc(ev.location)}`) : "",
    ev.description ? fold(`DESCRIPTION:${esc(ev.description)}`) : "",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Recordatorio: visita técnica mañana",
    "TRIGGER:-P1D",
    "END:VALARM",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Recordatorio: visita técnica en 1 hora",
    "TRIGGER:-PT1H",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  return lines.join("\r\n") + "\r\n";
}
