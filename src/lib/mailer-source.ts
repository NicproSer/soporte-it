import "server-only";
import nodemailer, { type TransportOptions } from "nodemailer";
import type { SentMessageInfo } from "nodemailer";

export function getAdminRecipients(): string[] {
  return (process.env.MAIL_TO_ADMIN ?? "").split(/[,\s]+/).map((e) => e.trim()).filter(Boolean);
}

export async function getTeamRecipients(): Promise<string[]> {
  const emails: string[] = [];
  try {
    const { prisma } = await import("./prisma");
    const users = await prisma.user.findMany({
      where: { role: { in: ["ADMIN", "TECHNICIAN"] } },
      select: { email: true },
    });
    emails.push(...users.map((u) => u.email));
  } catch (error) {
    console.error("[mail] team recipient lookup failed:", safeError(error));
  }
  emails.push(...getAdminRecipients());
  return [...new Set(emails.map((e) => e.toLowerCase().trim()).filter(Boolean))];
}

const configuredMailTimeout = Number(process.env.MAIL_TIMEOUT_MS ?? 45_000);
const MAIL_TIMEOUT_MS = Number.isFinite(configuredMailTimeout) ? Math.max(5_000, configuredMailTimeout) : 45_000;
const SMTP_HOST = (process.env.SMTP_HOST?.trim() || "smtp.gmail.com").replace("smtp.googlemail.com", "smtp.gmail.com");
const SMTP_USER = process.env.SMTP_USER?.trim();
const SMTP_PASS = process.env.SMTP_PASS;

function safeError(error: unknown): string {
  if (!error || typeof error !== "object") return String(error);
  const e = error as { code?: string; responseCode?: number; command?: string; message?: string };
  // Nunca persistir respuestas SMTP completas: algunos servidores incluyen datos sensibles.
  return [e.code, e.responseCode ? `SMTP ${e.responseCode}` : null, e.command, e.message?.slice(0, 240)]
    .filter(Boolean).join(" | ").replace(/(password|pass|auth)\s*[:=]\s*\S+/gi, "$1=[redacted]");
}

async function recordEmail(input: {
  recipients: string[];
  subject: string;
  status: "SENT" | "FAILED";
  attempts: number;
  messageId?: string;
  response?: string;
  errorCode?: string;
  error?: string;
}) {
  try {
    const { prisma } = await import("./prisma");
    await prisma.emailLog.create({
      data: {
        recipients: input.recipients,
        subject: input.subject.slice(0, 250),
        status: input.status,
        attempts: input.attempts,
        messageId: input.messageId,
        response: input.response?.slice(0, 300),
        errorCode: input.errorCode?.slice(0, 80),
        error: input.error?.slice(0, 500),
      },
    });
  } catch (error) {
    console.error("[mail] could not persist email log:", safeError(error));
  }
}

function createTransport(port: 465 | 587) {
  if (!SMTP_USER || !SMTP_PASS) throw new Error("Faltan SMTP_USER / SMTP_PASS en las variables de entorno.");
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    family: 4,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 50_000,
    pool: false,
  } as TransportOptions);
}

function errorDetails(error: unknown) {
  const e = error as { code?: string; responseCode?: number; command?: string; message?: string };
  return {
    code: e?.code ?? "SMTP_ERROR",
    responseCode: e?.responseCode,
    command: e?.command,
    message: safeError(error),
  };
}

function canSafelyRetry(error: unknown): boolean {
  const e = error as { code?: string; responseCode?: number; command?: string };
  // Solo fallos de conexión previos a la fase DATA o rechazo SMTP explícito 4xx.
  // No reintentar timeouts ambiguos durante DATA: el servidor pudo aceptar el mensaje.
  if (e?.command && /^(CONN|CONNECT|CONNECTION)$/i.test(e.command)) return true;
  return Number(e?.responseCode) >= 400 && Number(e?.responseCode) < 500;
}

async function deliver(port: 465 | 587, message: { from: string; to: string; subject: string; html: string; text: string }): Promise<SentMessageInfo> {
  const transporter = createTransport(port);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      transporter.sendMail(message),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error("SMTP timeout; envío de resultado incierto, no se reintentará automáticamente."), { code: "MAIL_TIMEOUT", command: "DATA" })), MAIL_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    // Cerrar sockets incluso si se agotó el tiempo de espera.
    transporter.close();
  }
}

/** Diagnóstico real de DNS, conexión TLS y autenticación (verify no envía correos). */
export async function diagnoseSMTP() {
  const checks: Array<{ stage: string; ok: boolean; detail: string }> = [];
  if (!SMTP_USER || !SMTP_PASS) {
    return { ok: false, checks: [{ stage: "config", ok: false, detail: "Faltan SMTP_USER o SMTP_PASS." }] };
  }
  checks.push({ stage: "config", ok: true, detail: `Host ${SMTP_HOST}; usuario configurado; contraseña no expuesta.` });
  try {
    const dns = await import("node:dns/promises");
    const addresses = await dns.resolve4(SMTP_HOST);
    checks.push({ stage: "dns", ok: true, detail: `DNS IPv4 correcto (${addresses.length} dirección(es)).` });
  } catch (error) {
    checks.push({ stage: "dns", ok: false, detail: safeError(error) });
    return { ok: false, checks };
  }

  for (const port of [465, 587] as const) {
    const transporter = createTransport(port);
    try {
      await transporter.verify();
      checks.push({ stage: `smtp-${port}`, ok: true, detail: port === 465 ? "TLS + autenticación correctos." : "STARTTLS + autenticación correctos." });
    } catch (error) {
      checks.push({ stage: `smtp-${port}`, ok: false, detail: safeError(error) });
    } finally {
      transporter.close();
    }
  }
  return { ok: checks.some((c) => c.ok && c.stage.startsWith("smtp-")), checks };
}

export async function sendMail(to: string[], subject: string, html: string, text?: string) {
  const recipients = [...new Set(to.map((address) => address.trim()).filter(Boolean))];
  if (!recipients.length) {
    console.warn(`[mail] omitted "${subject}": no recipients.`);
    return;
  }

  const message = {
    from: `"Soporte IT" <${SMTP_USER ?? "no-reply@example.invalid"}>`,
    to: recipients.join(","),
    subject,
    html,
    text: text ?? stripHtml(html),
  };

  let attempts = 0;
  let lastError: unknown;
  // Fallback 587 solo si 465 falla antes de enviar el contenido, o si el
  // servidor rechaza explícitamente con un 4xx. No repetir resultados inciertos.
  for (const port of [465, 587] as const) {
    attempts++;
    try {
      const result = await deliver(port, message);
      await recordEmail({
        recipients, subject, status: "SENT", attempts,
        messageId: result.messageId,
        response: `SMTP ${port}: ${String(result.response ?? "accepted")}`,
      });
      console.info(`[mail] sent subject="${subject}" recipients=${recipients.length} port=${port} attempts=${attempts}`);
      return result;
    } catch (error) {
      lastError = error;
      const details = errorDetails(error);
      console.error(`[mail] attempt ${attempts} failed port=${port} code=${details.code} command=${details.command ?? "unknown"}`);
      if (port === 587 || !canSafelyRetry(error)) break;
    }
  }

  const details = errorDetails(lastError);
  await recordEmail({
    recipients, subject, status: "FAILED", attempts,
    errorCode: details.code,
    error: details.message,
  });
  throw new Error(`No se pudo enviar el correo por SMTP: ${details.message}`);
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

/** Correo al cliente cuando el equipo ACEPTA la fecha que él propuso
 *  (flujo inverso: cliente sugirió → admin/técnico confirma). */
export async function sendAdminAcceptedClientDateEmail(v: {
  id: string;
  customerName: string;
  customerEmail: string;
  confirmedDate: Date;
}) {
  const html = shell(
    "Tu visita técnica está confirmada",
    "Aceptamos la fecha que propusiste",
    `<p style="margin:0 0 16px;font-size:14px;line-height:1.6">Hola <strong>${v.customerName}</strong>, aceptamos la fecha que nos sugeriste y tu visita quedó <strong>CONFIRMADA</strong>:</p>
     <div style="background:#e7f8d5;border:1px solid #bfe3a6;border-radius:10px;padding:14px 16px;font-size:15px;font-weight:700;color:#2e7d32;margin-bottom:10px">📅 ${formatDate(v.confirmedDate)}</div>
     <p style="margin:0 0 10px;font-size:13px;color:#42546a;line-height:1.6">Un técnico asistirá en ese horario. Si necesitas cambiarla, responde este correo o escanea el QR de tu equipo para solicitar un ajuste.</p>
     <div style="margin-top:18px">${btn(`${appUrl()}/visita/estado/${v.id}`, "Ver estado de mi solicitud")}</div>`,
    `Referencia: ${v.id}`
  );
  await sendMail([v.customerEmail], "[Soporte IT] Visita confirmada en la fecha que propusiste", html);
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
