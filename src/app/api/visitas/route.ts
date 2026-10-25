import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sendNewVisitRequestEmail, getAdminRecipients } from "@/lib/mail";

const schema = z.object({
  customerName: z.string().trim().min(2, "Indica tu nombre completo.").max(120),
  customerEmail: z.string().trim().email("Correo electrónico inválido.").max(160),
  customerPhone: z.string().trim().max(40).optional().or(z.literal("")),
  address: z.string().trim().min(5, "Indica la dirección del sitio.").max(250),
  issueDescription: z.string().trim().min(10, "Describe el problema con al menos 10 caracteres.").max(2000),
  preferredDate: z.coerce.date().optional().nullable(),
});

export async function POST(req: Request) {
  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
    }
    const data = parsed.data;

    const visit = await prisma.visitRequest.create({
      data: {
        customerName: data.customerName,
        customerEmail: data.customerEmail.toLowerCase(),
        customerPhone: data.customerPhone || null,
        address: data.address,
        issueDescription: data.issueDescription,
        preferredDate: data.preferredDate ?? null,
        status: "PENDING",
      },
    });

    // Notificación a los administradores (2 correos definidos en MAIL_TO_ADMIN).
    // Se envía EN SEGUNDO PLANO (fire-and-forget): la solicitud ya quedó
    // guardada en la BD y respondemos de inmediato. Así el navegador nunca
    // queda esperando a Gmail y se evitan los errores 504 del proxy cuando
    // el servidor SMTP responde lento o está bloqueado.
    let emailSent = false;
    let emailError: string | undefined;
    const recipients = getAdminRecipients();
    if (recipients.length === 0) {
      emailError = "MAIL_TO_ADMIN no está configurado.";
    } else {
      // La petición HTTP termina aquí; este promise sigue en background.
      void sendNewVisitRequestEmail({ ...visit, customerPhone: visit.customerPhone })
        .then(() => console.log(`[visitas] correo de notificación enviado a ${recipients.length} administrador(es)`))
        .catch((e) => console.error("[visitas] no se pudo notificar a administradores:", e));
      emailSent = true; // entregado al mailer en background
    }

    return NextResponse.json({ ok: true, id: visit.id, emailSent, emailError });
  } catch (e) {
    console.error("[visitas] error creando solicitud:", e);
    return NextResponse.json({ error: "No se pudo registrar la solicitud." }, { status: 500 });
  }
}
