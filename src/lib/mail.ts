import "server-only";
import nodemailer, { type TransportOptions } from "nodemailer";

/**
 * Envío de correos vía SMTP de Gmail.
 * Variables requeridas en .env:
 *   SMTP_HOST      (default smtp.gmail.com)
 *   SMTP_PORT      (default 465)
 *   SMTP_USER      correo Gmail que enviará los mensajes
 *   SMTP_PASS      contraseña de aplicación de Gmail (NO la contraseña normal)
 *   MAIL_TO_ADMIN  destino(s), separados por coma. Ej: "jefe@empresa.com,soporte@empresa.com"
 */

export function getAdminRecipients(): string[] {
  const raw = process.env.MAIL_TO_ADMIN ?? "";
  return raw
    .split(/[,\s]+/)
    .map((e) => e.trim())
    .filter(Boolean);
}

function getTransporter() {
  const host = process.env.SMTP_HOST ?? "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT ?? 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) {
    throw new Error("Faltan SMTP_USER / SMTP_PASS en el archivo .env");
  }
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    // --- Anti-timeout (evita errores 504) ---
    // Si el servidor SMTP no responde a tiempo, cortamos la conexión en vez
    // de dejar la petición HTTP colgada hasta que el proxy devuelva 504.
    connectionTimeout: 8_000, // conectar en máx. 8 s
    greetingTimeout: 8_000,   // saludo SMTP en máx. 8 s
    socketTimeout: 15_000,    // inactividad del socket en máx. 15 s
    pool: true,               // reutiliza conexiones TLS entre envíos
    maxConnections: 2,
    messageRetention: 30_000,
  } as TransportOptions);
}

/**
 * Envía un correo con límite de tiempo duro. Si Gmail tarda más de
 * MAIL_TIMEOUT_MS (o el puerto 465 está bloqueado y se intenta el fallback
 * 587), aborta con error claro en lugar de colgar la petición (504).
 */
const MAIL_TIMEOUT_MS = Number(process.env.MAIL_TIMEOUT_MS ?? 20_000);

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}: tiempo de espera agotado (${ms / 1000} s).`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function sendMail(to: string[], subject: string, html: string, text?: string) {
  const message = {
    from: `"Soporte IT" <${process.env.SMTP_USER}>`,
    to: to.join(","),
    subject,
    html,
    text: text ?? stripHtml(html),
  };

  try {
    await withTimeout(getTransporter().sendMail(message), MAIL_TIMEOUT_MS, "SMTP (puerto 465)");
  } catch (e) {
    // Puerto 465 bloqueado por la red → reintento único con STARTTLS 587.
    console.error("[mail] fallo en 465, reintentando con 587:", e);
    const host = process.env.SMTP_HOST ?? "smtp.gmail.com";
    const fallback = nodemailer.createTransport({
      host,
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      connectionTimeout: 8_000,
      greetingTimeout: 8_000,
      socketTimeout: 15_000,
    } as TransportOptions);
    await withTimeout(fallback.sendMail(message), MAIL_TIMEOUT_MS, "SMTP (puerto 587)");
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const shell = (title: string, subtitle: string, body: string, footer: string) => `
<!doctype html>
<html lang="es">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f2a43">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:26px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #dbe4ee">
        <tr><td style="background:#092746;padding:20px 26px">
          <div style="color:#ffffff;font-weight:800;font-size:17px;letter-spacing:.05em">SOPORTE IT</div>
          <div style="color:#b9cbe0;font-size:12px;margin-top:4px">${subtitle}</div>
        </td></tr>
        <tr><td style="padding:26px">
          <h1 style="font-size:19px;margin:0 0 14px">${title}</h1>
          ${body}
        </td></tr>
        <tr><td style="padding:16px 26px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:11px;color:#68788b">${footer}</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

const btn = (href: string, label: string, color = "#1456c0") =>
  `<a href="${href}" style="display:inline-block;background:${color};color:#fff;text-decoration:none;font-weight:700;font-size:13px;padding:11px 18px;border-radius:9px;margin:6px 8px 6px 0">${label}</a>`;

const row = (label: string, value: string) =>
  `<tr><td style="padding:7px 0;color:#68788b;font-size:12px;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap;vertical-align:top;width:110px">${label}</td><td style="padding:7px 0;font-size:14px;color:#0f2a43">${value}</td></tr>`;

export function formatDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) +
    " · " +
    date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/** Correo a los 2 administradores cuando un cliente solicita una visita. */
export async function sendNewVisitRequestEmail(v: {
  id: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  address: string;
  issueDescription: string;
  preferredDate?: Date | null;
}) {
  const dashboardUrl = `${appUrl()}/dashboard`;
  const html = shell(
    "Nueva solicitud de visita técnica",
    "Requiere tu respuesta en el sistema",
    `<p style="margin:0 0 16px;font-size:14px;line-height:1.6">Un cliente ha solicitado una visita técnica. Esta solicitud quedó registrada como <strong>PENDIENTE</strong>: es obligatorio ingresar al panel para <strong>proponer un día y horario</strong>, que el cliente podrá aceptar, rechazar o reprogramar.</p>
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${row("Cliente", `${v.customerName}<br/><span style="color:#68788b;font-size:12px">${v.customerEmail}${v.customerPhone ? " · " + v.customerPhone : ""}</span>`)}
     ${row("Dirección", v.address)}
     ${row("Motivo", v.issueDescription)}
     ${v.preferredDate ? row("Fecha preferida", formatDate(v.preferredDate)) : ""}</table>
     <div style="margin-top:22px">${btn(dashboardUrl, "Ingresar al panel y proponer fecha →")}</div>`,
    `ID de solicitud: ${v.id} · Este correo se envió automáticamente desde ${appUrl()}`
  );
  await sendMail(getAdminRecipients(), `[Soporte IT] Nueva solicitud de visita — ${v.customerName}`, html);
}

/** Correo al cliente con los botones Aceptar / Rechazar / Proponer otra fecha. */
export async function sendProposalToClientEmail(v: {
  id: string;
  customerName: string;
  customerEmail: string;
  proposedDate: Date;
  proposedMessage?: string | null;
  acceptToken: string;
  rejectToken: string;
  proposeToken: string;
}) {
  const base = appUrl();
  const html = shell(
    "Propuesta de fecha para tu visita técnica",
    "Tu solicitud fue revisada — confirma o propone otra fecha",
    `<p style="margin:0 0 16px;font-size:14px;line-height:1.6">Hola <strong>${v.customerName}</strong>, hemos revisado tu solicitud de soporte técnico y te proponemos la siguiente fecha:</p>
     <div style="background:#e5efff;border:1px solid #bfd4f7;border-radius:10px;padding:14px 16px;font-size:15px;font-weight:700;color:#174b9e;margin-bottom:10px">📅 ${formatDate(v.proposedDate)}</div>
     ${v.proposedMessage ? `<p style="margin:0 0 14px;font-size:13px;color:#42546a;line-height:1.6">Nota del técnico: “${v.proposedMessage}”</p>` : ""}
     <p style="margin:0 0 10px;font-size:13px;color:#42546a">¿Te conviene? Puedes responder directamente desde este correo:</p>
     <div style="margin:14px 0 6px">
       ${btn(`${base}/visita/${v.acceptToken}`, "✓ Aceptar la fecha", "#2e7d32")}
       ${btn(`${base}/visita/${v.rejectToken}`, "✕ Rechazar", "#b3261e")}
       ${btn(`${base}/visita/${v.proposeToken}`, "↻ Proponer otra fecha", "#1456c0")}
     </div>
     <p style="font-size:11px;color:#68788b;margin-top:16px">Si los botones no funcionan, copia esta dirección en tu navegador:<br/>${base}/visita/${v.acceptToken}</p>`,
    `Referencia: ${v.id} · Si no solicitaste esta visita, ignora este correo.`
  );
  await sendMail([v.customerEmail], "[Soporte IT] Te proponemos una fecha para tu visita técnica", html);
}

/** Correo a los administradores cuando el cliente acepta, rechaza o sugiere otra fecha. */
export async function sendClientResponseToAdminsEmail(v: {
  id: string;
  customerName: string;
  customerEmail: string;
  action: "ACCEPTED" | "REJECTED" | "RESCHEDULE_REQUESTED";
  proposedDate?: Date | null;
  suggestedDate?: Date | null;
  note?: string | null;
}) {
  const titles = {
    ACCEPTED: "El cliente ACEPTÓ la fecha propuesta",
    REJECTED: "El cliente RECHAZÓ la visita",
    RESCHEDULE_REQUESTED: "El cliente SUGIRIÓ otra fecha",
  } as const;
  const details = {
    ACCEPTED: "La visita quedó <strong>CONFIRMADA</strong>. Prepara la intervención.",
    REJECTED: "La solicitud quedó <strong>RECHAZADA</strong>. Puedes contactarlo o cerrar el caso.",
    RESCHEDULE_REQUESTED: "Ingresa al panel para revisar la nueva fecha sugerida y volver a proponer.",
  } as const;
  const html = shell(
    titles[v.action],
    "Respuesta del cliente a la propuesta de fecha",
    `<p style="margin:0 0 16px;font-size:14px;line-height:1.6">${details[v.action]}</p>
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
     ${row("Cliente", `${v.customerName}<br/><span style="color:#68788b;font-size:12px">${v.customerEmail}</span>`)}
     ${v.proposedDate ? row("Fecha propuesta", formatDate(v.proposedDate)) : ""}
     ${v.suggestedDate ? row("Fecha sugerida", formatDate(v.suggestedDate)) : ""}
     ${v.note ? row("Comentario", v.note) : ""}
     </table>
     <div style="margin-top:22px">${btn(`${appUrl()}/dashboard`, "Ver en el panel →")}</div>`,
    `ID de solicitud: ${v.id}`
  );
  await sendMail(getAdminRecipients(), `[Soporte IT] ${titles[v.action]} — ${v.customerName}`, html);
}
