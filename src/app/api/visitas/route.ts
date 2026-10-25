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
    let emailSent = false;
    let emailError: string | undefined;
    try {
      if (getAdminRecipients().length > 0) {
        await sendNewVisitRequestEmail({ ...visit, customerPhone: visit.customerPhone });
        emailSent = true;
      } else {
        emailError = "MAIL_TO_ADMIN no está configurado.";
      }
    } catch (e) {
      emailError = e instanceof Error ? e.message : "Error desconocido al enviar el correo.";
      console.error("[visitas] no se pudo notificar a administradores:", e);
    }

    return NextResponse.json({ ok: true, id: visit.id, emailSent, emailError });
  } catch (e) {
    console.error("[visitas] error creando solicitud:", e);
    return NextResponse.json({ error: "No se pudo registrar la solicitud." }, { status: 500 });
  }
}
