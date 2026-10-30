import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendTicketClosedEmail } from "@/lib/mail";

const schema = z.object({
  visitId: z.string().min(1),
  completed: z.boolean(),
  notes: z.string().trim().min(10, "Describe la solución con al menos 10 caracteres.").max(2000),
  interventionType: z.string().trim().min(3, "Indica el tipo de servicio.").max(80),
  // Enlace opcional del dispositivo al momento del cierre (para tickets que
  // llegaron sin equipo asociado).
  equipmentId: z.string().trim().optional().nullable(),
});

/**
 * Cierre del ticket (post-visita): el técnico/administrador indica si la
 * tarea se COMPLETÓ o NO y registra la información del servicio. Esa
 * intervención queda enlazada al historial del dispositivo y todo el
 * equipo recibe el resultado por correo.
 *
 * Si el ticket NO tiene equipo asociado, se puede pasar `equipmentId` para
 * enlazarlo durante el cierre; si no se enlaza ninguno, el ticket se cierra
 * igualmente y la nota queda registrada en el propio ticket.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "TECHNICIAN")) {
    return NextResponse.json({ error: "Inicia sesión como administrador o técnico." }, { status: 401 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
  }
  const { visitId, completed, notes, interventionType, equipmentId } = parsed.data;

  const visit = await prisma.visitRequest.findUnique({
    where: { id: visitId },
    include: { equipment: true, acceptedBy: true },
  });
  if (!visit) return NextResponse.json({ error: "Solicitud no encontrada." }, { status: 404 });
  if (visit.status === "COMPLETED" || visit.status === "CANCELLED") {
    return NextResponse.json({ error: "Este ticket ya fue cerrado." }, { status: 409 });
  }

  // Determinar el equipo del cierre: el vinculado o el que se enlazó ahora.
  let equipment = visit.equipment;
  let linkingNow = false;
  if (!equipment && equipmentId) {
    equipment = await prisma.equipment.findUnique({ where: { id: equipmentId } });
    if (!equipment) {
      return NextResponse.json({ error: "El dispositivo seleccionado no existe." }, { status: 400 });
    }
    linkingNow = true;
  }

  // Nota: MongoDB no soporta transacciones multi-documento sin replica set,
  // así que se ejecutan las operaciones secuencialmente (idempotentes por el
  // guard de "ya cerrado" del inicio).
  if (equipment) {
    // Intervención enlazada al dispositivo Y al ticket → alimenta el historial.
    await prisma.intervention.create({
      data: {
        equipmentId: equipment.id,
        technicianId: session.sub,
        visitRequestId: visit.id,
        type: interventionType,
        description: notes,
        performedAt: new Date(),
      },
    });
  }

  await prisma.visitRequest.update({
    where: { id: visit.id },
    data: {
      ...(linkingNow ? { equipmentId: equipment!.id } : {}),
      status: completed ? "COMPLETED" : "CANCELLED",
      closedById: session.sub,
      closedAt: new Date(),
      completionNotes: `${completed ? "Completada" : "No completada"}: ${notes}`,
    },
  });

  if (equipment) {
    await prisma.equipment.update({
      where: { id: equipment.id },
      data: { status: completed ? "ACTIVE" : "MAINTENANCE" },
    });
  }

  void sendTicketClosedEmail({
    id: visit.id,
    customerName: visit.customerName,
    completed,
    notes,
    closedByName: session.name,
    equipmentName: equipment?.name ?? "Sin dispositivo asociado",
  }).catch((e) => console.error("[tickets/cerrar] no se pudo notificar el cierre:", e));

  return NextResponse.json({ ok: true, linked: linkingNow, hasEquipment: Boolean(equipment) });
}
