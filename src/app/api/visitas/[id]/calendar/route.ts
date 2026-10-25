import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildIcsEvent } from "@/lib/ics";

export const dynamic = "force-dynamic";

/**
 * GET /api/visitas/[id]/calendar
 * Devuelve un archivo .ics (iCalendar) con el recordatorio de la visita, para
 * que el cliente lo descargue y lo agregue al calendario de su teléfono.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const visit = await prisma.visitRequest.findUnique({ where: { id }, include: { equipment: true } });
  const when = visit?.proposedDate ?? visit?.customerSuggestedDate ?? null;
  if (!visit || !when) {
    return NextResponse.json({ error: "Esta visita aún no tiene una fecha agendada." }, { status: 404 });
  }
  const lines = [`Visita técnica programada para ${visit.customerName}.`];
  if (visit.equipment) lines.push(`Equipo: ${visit.equipment.name} (${visit.equipment.category}).`);
  lines.push(`Motivo: ${visit.issueDescription}`);
  const ics = buildIcsEvent({
    uid: visit.id,
    summary: `Visita técnica — Soporte IT${visit.equipment ? ` (${visit.equipment.name})` : ""}`,
    description: lines.join("\n"),
    location: visit.address,
    start: when,
    organizerEmail: visit.contactEmail ?? visit.customerEmail,
  });
  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="visita-tecnica-${visit.id.slice(-6)}.ics"`,
    },
  });
}
