"use server";

import { prisma } from "@/lib/prisma";
import { sendClientResponseToAdminsEmail } from "@/lib/mail";

/** El cliente responde a la propuesta: acepta, rechaza o sugiere otra fecha. */
export async function handleAction(formData: FormData) {
  const visitId = String(formData.get("visitId") ?? "");
  const action = String(formData.get("action") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 500);
  const dateRaw = String(formData.get("date") ?? "");

  if (!visitId) return;

  const visit = await prisma.visitRequest.findUnique({ where: { id: visitId } });
  if (!visit || !visit.proposedDate) return;
  // Evita re-procesar respuestas de enlaces ya usados/cerrados.
  if (["CONFIRMED", "COMPLETED", "CANCELLED"].includes(visit.status)) return;

  let nextStatus: "CONFIRMED" | "REJECTED" | "RESCHEDULE_REQUESTED";
  let suggestedDate: Date | null = null;

  if (action === "accept") nextStatus = "CONFIRMED";
  else if (action === "reject") nextStatus = "REJECTED";
  else if (action === "propose") {
    if (!dateRaw) return;
    suggestedDate = new Date(dateRaw);
    if (Number.isNaN(suggestedDate.getTime())) return;
    nextStatus = "RESCHEDULE_REQUESTED";
  } else return;

  await prisma.visitRequest.update({
    where: { id: visitId },
    data: {
      status: nextStatus,
      customerSuggestedDate: suggestedDate,
      customerNote: note || null,
      acceptToken: null,
      rejectToken: null,
      proposeToken: null,
    },
  });

  try {
    await sendClientResponseToAdminsEmail({
      id: visit.id,
      customerName: visit.customerName,
      customerEmail: visit.customerEmail,
      action: nextStatus === "CONFIRMED" ? "ACCEPTED" : nextStatus,
      proposedDate: visit.proposedDate,
      suggestedDate,
      note: note || null,
    });
  } catch (e) {
    console.error("[visita] no se pudo notificar a administradores:", e);
  }
}
