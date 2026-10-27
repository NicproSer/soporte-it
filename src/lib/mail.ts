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

/**
 * Destinatarios de las notificaciones internas (flujo tipo tickets):
 * TODOS los usuarios registrados como ADMIN o TECHNICIAN en la base de
 * datos. Si además hay correos definidos en MAIL_TO_ADMIN (legado), se
 * incluyen sin duplicar. Así, al crear un técnico/administrador desde el
 * panel, sus avisos quedan activos automáticamente sin tocar el .env.
 */
export async function getTeamRecipients(): Promise<string[]> {
  const emails: string[] = [];
  try {
    const { prisma } = await import("./prisma");
    const users = await prisma.user.findMany({
      where: { role: { in: ["ADMIN", "TECHNICIAN"] } },
      select: { email: true },
    });
    emails.push(...users.map((u) => u.email));
  } catch (e) {
    console.error("[mail] no se pudo leer el equipo desde la BD:", e);
  }
  emails.push(...getAdminRecipients());
  return [...new Set(emails.map((e) => e.toLowerCase().trim()).filter(Boolean))];
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
  await sendMail(await getTeamRecipients(), `[Soporte IT] Nueva solicitud de visita — ${v.customerName}`, html);
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
  await sendMail(await getTeamRecipients(), `[Soporte IT] ${titles[v.action]} — ${v.customerName}`, html);
}

/** Correo de bienvenida con credenciales al crear un admin/técnico desde el panel. */
export async function sendWelcomeEmail(u: {
  name: string;
  email: string;
  role: "ADMIN" | "TECHNICIAN";
  tempPassword: string;
}) {
  const roleName = u.role === "ADMIN" ? "Administrador" : "Técnico";
  const html = shell(
    `Bienvenido al sistema de Soporte IT`,
    `Tu cuenta de ${roleName} fue creada`,
    `<p style="margin:0 0 16px;font-size:14px;line-height:1.6">Hola <strong>${u.name}</strong>, un administrador te registró en el sistema. Estos son tus datos de acceso:</p>
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
       ${row("Correo", u.email)}
       ${row("Contraseña", `<code style="background:#eef3f9;border:1px solid #d5e0ee;border-radius:6px;padding:4px 8px;font-size:14px;font-weight:700">${u.tempPassword}</code>`)}
       ${row("Permiso", roleName)}
     </table>
     <p style="margin:14px 0 0;font-size:13px;color:#42546a;line-height:1.6">Por seguridad, al iniciar sesión por primera vez deberás <strong>cambiar esta contraseña temporal</strong>.</p>
     <div style="margin-top:22px">${btn(`${appUrl()}/login`, "Iniciar sesión →")}</div>`,
    `Si no esperabas este correo, ignóralo.`
  );
  await sendMail([u.email], `[Soporte IT] Tus datos de acceso (${roleName})`, html);
}

/** Correo con enlace para restablecer la contraseña (reset desde el panel). */
export async function sendPasswordResetEmail(u: { name: string; email: string; token: string }) {
  const url = `${appUrl()}/reset-password?token=${u.token}`;
  const html = shell(
    "Restablecimiento de contraseña",
    "Solicitud realizada desde el panel administrativo",
    `<p style="margin:0 0 16px;font-size:14px;line-height:1.6">Hola <strong>${u.name}</strong>, se solicitó un cambio de contraseña para tu cuenta.</p>
     <div style="margin:6px 0 16px">${btn(url, "Establecer nueva contraseña →")}</div>
     <p style="font-size:12px;color:#42546a;line-height:1.6">Este enlace vence en <strong>2 horas</strong> y solo funciona una vez. Si el botón no abre, copia esta dirección:<br/><span style="word-break:break-all">${url}</span></p>`,
    `Si no solicitaste el cambio, contacta a tu administrador.`
  );
  await sendMail([u.email], "[Soporte IT] Restablece tu contraseña", html);
}

/** Recordatorio interno: visita confirmada → cerrar ticket e informar si se completó. */
export async function sendVisitReminderEmail(v: {
  id: string;
  customerName: string;
  address: string;
  proposedDate?: Date | null;
  acceptedByName?: string | null;
  equipmentName?: string | null;
}) {
  const html = shell(
    "Recordatorio: visita programada pendiente de cierre",
    "Acción requerida por el equipo técnico",
    `<p style="margin:0 0 16px;font-size:14px;line-height:1.6">La visita confirmada de <strong>${v.customerName}</strong> requiere seguimiento: cuando sea atendida, quien la gestionó debe ingresar al panel e indicar si la tarea <strong>se completó o no</strong>, con la información del servicio. Ese registro quedará enlazado al historial del dispositivo.</p>
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
       ${v.equipmentName ? row("Equipo", v.equipmentName) : ""}
       ${row("Dirección", v.address)}
       ${v.proposedDate ? row("Fecha agendada", formatDate(v.proposedDate)) : ""}
       ${v.acceptedByName ? row("Aceptada por", v.acceptedByName) : ""}
     </table>
     <div style="margin-top:22px">${btn(`${appUrl()}/dashboard#visitas`, "Abrir el ticket →")}</div>`,
    `ID de solicitud: ${v.id}`
  );
  await sendMail(await getTeamRecipients(), `[Soporte IT] Recordatorio de visita — ${v.customerName}`, html);
}

/** Ticket cerrado: resultado final de la visita al equipo. */
export async function sendTicketClosedEmail(v: {
  id: string;
  customerName: string;
  completed: boolean;
  notes: string;
  closedByName: string;
  equipmentName?: string | null;
}) {
  const html = shell(
    v.completed ? "Visita COMPLETADA ✔" : "Visita NO completada ✕",
    "Cierre de ticket con informe técnico",
    `<p style="margin:0 0 16px;font-size:14px;line-height:1.6"><strong>${v.closedByName}</strong> cerró el ticket indicando que la tarea ${v.completed ? "SE COMPLETÓ" : "NO se completó"}.</p>
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
       ${row("Cliente", v.customerName)}
       ${v.equipmentName ? row("Equipo", v.equipmentName) : ""}
       ${row("Resultado", v.completed ? '<span style="color:#2e7d32;font-weight:700">Completada</span>' : '<span style="color:#b3261e;font-weight:700">No completada</span>')}
       ${row("Informe", v.notes)}
     </table>
     <p style="margin:14px 0 0;font-size:12px;color:#42546a">El detalle quedó enlazado al historial del dispositivo.</p>
     <div style="margin-top:22px">${btn(`${appUrl()}/dashboard#historial`, "Ver historial →")}</div>`,
    `ID de solicitud: ${v.id}`
  );
  await sendMail(await getTeamRecipients(), `[Soporte IT] Ticket ${v.completed ? "completado" : "no completado"} — ${v.customerName}`, html);
}
