import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendProposalToClientEmail } from "@/lib/mail";

const schema = z.object({
  visitId: z.string().min(1),
  proposedDate: z.coerce.date().refine((d) => d.getTime() > Date.now() - 60_000, "La fecha propuesta debe ser futura."),
  message: z.string().trim().max(500).optional(),
});

/** El administrador propone un día/hora; se envía correo al cliente con opciones aceptar/rechazar/proponer. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
    }
    const { visitId, proposedDate, message } = parsed.data;

    const visit = await prisma.visitRequest.findUnique({ where: { id: visitId } });
    if (!visit) return NextResponse.json({ error: "Solicitud no encontrada." }, { status: 404 });
    if (["CONFIRMED", "COMPLETED", "CANCELLED"].includes(visit.status)) {
      return NextResponse.json({ error: "Esta solicitud ya está cerrada." }, { status: 409 });
    }

    // Tokens únicos para los botones del correo del cliente.
    const acceptToken = crypto.randomBytes(24).toString("hex");
    const rejectToken = crypto.randomBytes(24).toString("hex");
    const proposeToken = crypto.randomBytes(24).toString("hex");

    const updated = await prisma.visitRequest.update({
      where: { id: visitId },
      data: {
        proposedDate,
        proposedMessage: message || null,
        status: "PROPOSED",
        acceptToken,
        rejectToken,
        proposeToken,
        tokenExpiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000), // 30 días
      },
    });

    // El estado PROPOSED ya quedó guardado en la BD. El correo al cliente se
    // envía EN SEGUNDO PLANO para que la petición no quede esperando a Gmail
    // (causa típica de los errores 504 cuando el SMTP responde lento).
    let emailSent = false;
    let emailError: string | undefined;
    void sendProposalToClientEmail({
      id: updated.id,
      customerName: updated.customerName,
      customerEmail: updated.customerEmail,
      proposedDate,
      proposedMessage: message,
      acceptToken,
      rejectToken,
      proposeToken,
    })
      .then(() => console.log(`[admin/visitas] propuesta enviada por correo a ${updated.customerEmail}`))
      .catch((e) => {
        console.error("[admin/visitas] error enviando propuesta:", e);
        // Si falla, marcamos la solicitud para reenvío desde el dashboard.
        prisma.visitRequest
          .update({ where: { id: visitId }, data: { proposalEmailFailed: true } })
          .catch(() => undefined);
      });
    emailSent = true; // entregado al mailer en background

    return NextResponse.json({ ok: true, emailSent, emailError });
  } catch (e) {
    console.error("[admin/visitas] error:", e);
    return NextResponse.json({ error: "No se pudo registrar la propuesta." }, { status: 500 });
  }
}
