import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendVisitReminderEmail } from "@/lib/mail";

const schema = z.object({ visitId: z.string().min(1) });

/** Recordatorio interno después de la visita agendada (panel / agenda). */
export async function PUT(req: Request) {
  const session = await getSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "TECHNICIAN")) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
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
  }).catch((e) => console.error("[tickets/recordatorio] fallo:", e));

  return NextResponse.json({ ok: true });
}
