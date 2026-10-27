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
});

/**
 * Cierre del ticket (post-visita): el técnico/administrador indica si la
 * tarea se COMPLETÓ o NO y registra la información del servicio. Esa
 * intervención queda enlazada al historial del dispositivo y todo el
 * equipo recibe el resultado por correo.
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
  const { visitId, completed, notes, interventionType } = parsed.data;

  const visit = await prisma.visitRequest.findUnique({
    where: { id: visitId },
    include: { equipment: true, acceptedBy: true },
  });
  if (!visit) return NextResponse.json({ error: "Solicitud no encontrada." }, { status: 404 });
  if (visit.status === "COMPLETED" || visit.status === "CANCELLED") {
    return NextResponse.json({ error: "Este ticket ya fue cerrado." }, { status: 409 });
  }
  if (!visit.equipment) {
    return NextResponse.json({ error: "El ticket no está vinculado a un equipo; abre la ficha del dispositivo primero." }, { status: 400 });
  }

  await prisma.$transaction([
    // Intervención enlazada al dispositivo Y al ticket → alimenta el historial.
    prisma.intervention.create({
      data: {
        equipmentId: visit.equipment.id,
        technicianId: session.sub,
        visitRequestId: visit.id,
        type: interventionType,
        description: notes,
        performedAt: new Date(),
      },
    }),
    prisma.visitRequest.update({
      where: { id: visit.id },
      data: {
        status: completed ? "COMPLETED" : "CANCELLED",
        closedById: session.sub,
        closedAt: new Date(),
        completionNotes: `${completed ? "Completada" : "No completada"}: ${notes}`,
      },
    }),
    prisma.equipment.update({
      where: { id: visit.equipment.id },
      data: { status: completed ? "ACTIVE" : "MAINTENANCE" },
    }),
  ]);

  void sendTicketClosedEmail({
    id: visit.id,
    customerName: visit.customerName,
    completed,
    notes,
    closedByName: session.name,
    equipmentName: visit.equipment.name,
  }).catch((e) => console.error("[tickets/cerrar] no se pudo notificar el cierre:", e));

  return NextResponse.json({ ok: true });
}
