import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendProposalToClientEmail, sendVisitReminderEmail, sendTicketClosedEmail } from "@/lib/mail";

const schema = z.object({
  visitId: z.string().min(1),
  proposedDate: z.coerce.date().refine((d) => d.getTime() > Date.now() - 60_000, "La fecha propuesta debe ser futura."),
  message: z.string().trim().max(500).optional(),
});

/**
 * Flujo tipo tickets: el ADMIN o TECHNICIAN que responde propone día/hora.
 * Se guarda QUIEN aceptó la solicitud (aceptadoPor) y se envía la propuesta
 * al cliente con botones aceptar / rechazar / proponer otra fecha.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "TECHNICIAN")) {
    return NextResponse.json({ error: "Inicia sesión como administrador o técnico." }, { status: 401 });
  }

  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
    }
    const { visitId, proposedDate, message } = parsed.data;

    const visit = await prisma.visitRequest.findUnique({ where: { id: visitId } });
    if (!visit) return NextResponse.json({ error: "Solicitud no encontrada." }, { status: 404 });
    if (["COMPLETED", "CANCELLED"].includes(visit.status)) {
      return NextResponse.json({ error: "Este ticket ya está cerrado." }, { status: 409 });
    }
    if (visit.acceptedById && visit.acceptedById !== session.sub) {
      return NextResponse.json({ error: "Esta solicitud ya fue aceptada por otro usuario del equipo." }, { status: 409 });
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
        acceptedById: session.sub, // 👤 quién tomó el ticket desde el sistema
        acceptedAt: new Date(),
      },
    });

    // Correo al cliente EN SEGUNDO PLANO (evita 504 cuando Gmail va lento).
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
      .then(() => console.log(`[tickets] propuesta enviada a ${updated.customerEmail} por ${session.name}`))
      .catch((e) => {
        console.error("[tickets] error enviando propuesta:", e);
        prisma.visitRequest
          .update({ where: { id: visitId }, data: { proposalEmailFailed: true } })
          .catch(() => undefined);
      });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[tickets] error:", e);
    return NextResponse.json({ error: "No se pudo registrar la propuesta." }, { status: 500 });
  }
}

const reminderSchema = z.object({ visitId: z.string().min(1) });

/** Reenvía el recordatorio interno de cierre de visita a todo el equipo. */
export async function PUT(req: Request) {
  const session = await getSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "TECHNICIAN")) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const parsed = reminderSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Falta la visita." }, { status: 400 });

  const visit = await prisma.visitRequest.findUnique({
    where: { id: parsed.data.visitId },
    include: { equipment: true, acceptedBy: true },
  });
  if (!visit) return NextResponse.json({ error: "Solicitud no encontrada." }, { status: 404 });

  void sendVisitReminderEmail({
    id: visit.id,
    customerName: visit.customerName,
    address: visit.address,
    proposedDate: visit.proposedDate,
    acceptedByName: visit.acceptedBy?.name ?? null,
    equipmentName: visit.equipment?.name ?? null,
  }).catch((e) => console.error("[tickets] no se pudo reenviar el recordatorio:", e));

  return NextResponse.json({ ok: true });
}
