import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { VisitStatus } from "@prisma/client";
import { sendNewVisitRequestEmail, getAdminRecipients } from "@/lib/mail";

export const dynamic = "force-dynamic";

const schema = z.object({
  equipmentId: z.string().min(1),
  contactName: z.string().trim().min(2, "Indica tu nombre.").max(120),
  contactEmail: z.string().trim().email("Correo electrónico inválido.").max(160),
  customerPhone: z.string().trim().max(40).optional().or(z.literal("")),
  address: z.string().trim().min(5, "Indica la dirección del sitio.").max(250),
  issueDescription: z.string().trim().min(10, "Describe el problema con al menos 10 caracteres.").max(2000),
  preferredDate: z.coerce.date().optional().nullable(),
});

/**
 * POST /api/q/[uid]/visita
 * Lo usa CUALQUIER persona que escanee el QR (sin sesión): solicita una visita
 * técnica vinculada al equipo/etiqueta. El nombre y correo del cliente salen de
 * la ficha técnica registrada por el administrador; quien escanea solo agrega
 * su nombre de contacto, su correo y el detalle del problema.
 */
export async function POST(request: Request, { params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params;
  try {
    const parsedBody = await request.json().catch(() => null);
    const parsed = schema.safeParse(parsedBody);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
    }
    const data = parsed.data;

    const label = await prisma.label.findUnique({ where: { uid }, include: { equipment: true } });
    if (!label || !label.equipment || label.equipment.id !== data.equipmentId) {
      return NextResponse.json({ error: "El equipo de esta etiqueta no está registrado todavía." }, { status: 404 });
    }
    if (label.status === "RETIRED") {
      return NextResponse.json({ error: "Esta etiqueta fue retirada." }, { status: 400 });
    }
    const equipment = label.equipment;

    // Bloquear duplicados abiertos del mismo equipo por el mismo contacto.
    const openStatuses: VisitStatus[] = ["PENDING", "PROPOSED", "RESCHEDULE_REQUESTED", "CONFIRMED"];
    const existingOpen = await prisma.visitRequest.findFirst({
      where: {
        equipmentId: equipment.id,
        customerEmail: data.contactEmail.toLowerCase(),
        status: { in: openStatuses },
      },
    });
    if (existingOpen) {
      return NextResponse.json(
        { error: "Ya tienes una solicitud activa para este equipo. Un administrador te propondrá una fecha pronto." },
        { status: 409 },
      );
    }

    const visit = await prisma.visitRequest.create({
      data: {
        // Cliente propietario desde la ficha técnica + contacto real que escaneó.
        customerName: equipment.ownerName ?? data.contactName,
        customerEmail: data.contactEmail.toLowerCase(),
        customerPhone: data.customerPhone || equipment.ownerPhone || null,
        contactName: data.contactName,
        contactEmail: data.contactEmail.toLowerCase(),
        address: data.address,
        issueDescription: `[${label.code}] ${equipment.name} (${equipment.category}) — ${data.issueDescription}`,
        preferredDate: data.preferredDate ?? null,
        status: "PENDING",
        equipmentId: equipment.id,
      },
    });

    // Notificación a los administradores EN SEGUNDO PLANO (fire-and-forget):
    // respondemos de inmediato y evitamos 504 si Gmail responde lento.
    const recipients = getAdminRecipients();
    let emailSent = false;
    let emailError: string | undefined;
    if (recipients.length === 0) {
      emailError = "MAIL_TO_ADMIN no está configurado.";
    } else {
      void sendNewVisitRequestEmail({ ...visit, id: visit.id })
        .then(() => console.log(`[q/visita] notificación enviada a ${recipients.length} administrador(es)`))
        .catch((e) => console.error("[q/visita] no se pudo notificar a administradores:", e));
      emailSent = true;
    }

    return NextResponse.json({ ok: true, id: visit.id, emailSent, emailError });
  } catch (e) {
    console.error("[q/visita] error creando solicitud:", e);
    return NextResponse.json({ error: "No se pudo registrar la solicitud." }, { status: 500 });
  }
}
