"use server";

import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendClientResponseToAdminsEmail } from "@/lib/mail";

export type VisitActionState = { success: boolean; error?: string };

/** Respuesta pública validada mediante el token secreto enviado por correo. */
export async function handleAction(formData: FormData): Promise<VisitActionState> {
  const visitId = String(formData.get("visitId") ?? "");
  const token = String(formData.get("token") ?? "");
  const action = String(formData.get("action") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 500);
  const dateRaw = String(formData.get("date") ?? "");

  if (!visitId || !token) return { success: false, error: "El enlace no es válido." };

  const visit = await prisma.visitRequest.findUnique({ where: { id: visitId } });
  if (!visit || !visit.proposedDate) {
    return { success: false, error: "No encontramos la solicitud asociada a este enlace." };
  }
  if (visit.tokenExpiresAt && visit.tokenExpiresAt < new Date()) {
    return { success: false, error: "Este enlace ha expirado. Contacta al equipo de soporte." };
  }

  const tokenWhere =
    action === "accept" ? { acceptToken: token } :
    action === "reject" ? { rejectToken: token } :
    action === "propose" ? { proposeToken: token } : null;

  if (!tokenWhere) return { success: false, error: "La acción solicitada no es válida." };
  const expectedToken = action === "accept" ? visit.acceptToken :
    action === "reject" ? visit.rejectToken : visit.proposeToken;

  if (!expectedToken || expectedToken !== token) {
    return { success: false, error: "Este enlace ya fue utilizado o no es válido." };
  }

  if (["CONFIRMED", "AWAITING_CONFIRMATION", "COMPLETED", "CANCELLED", "REJECTED"].includes(visit.status)) {
    return { success: false, error: "Esta solicitud ya recibió una respuesta y no admite más cambios." };
  }

  let nextStatus: "AWAITING_CONFIRMATION" | "REJECTED" | "RESCHEDULE_REQUESTED";
  let suggestedDate: Date | null = null;

  if (action === "accept") {
    nextStatus = "AWAITING_CONFIRMATION";
  } else if (action === "reject") {
    nextStatus = "REJECTED";
  } else {
    if (!dateRaw) return { success: false, error: "Selecciona una fecha y hora." };
    suggestedDate = new Date(dateRaw);
    if (Number.isNaN(suggestedDate.getTime()) || suggestedDate.getTime() <= Date.now()) {
      return { success: false, error: "La fecha sugerida debe ser futura." };
    }
    nextStatus = "RESCHEDULE_REQUESTED";
  }

  // Actualización condicional: evita que dos clics simultáneos reutilicen el mismo token.
  const updated = await prisma.visitRequest.updateMany({
    where: { id: visitId, status: visit.status, ...tokenWhere },
    data: {
      status: nextStatus,
      customerSuggestedDate: suggestedDate,
      customerNote: note || null,
      acceptToken: null,
      rejectToken: null,
      proposeToken: null,
    },
  });

  if (updated.count !== 1) {
    return { success: false, error: "La solicitud ya fue respondida. Actualiza la página para ver su estado." };
  }

  after(() => sendClientResponseToAdminsEmail({
    id: visit.id,
    customerName: visit.customerName,
    customerEmail: visit.customerEmail,
    action: nextStatus === "AWAITING_CONFIRMATION" ? "ACCEPTED" : nextStatus,
    proposedDate: visit.proposedDate,
    suggestedDate,
    note: note || null,
  }).catch((e) => console.error("[visita] no se pudo notificar a administradores:", e)));

  return { success: true };
}
