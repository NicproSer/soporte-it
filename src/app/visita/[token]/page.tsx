import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { sendClientResponseToAdminsEmail } from "@/lib/mail";
import RespondVisitForm from "./respond-form";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

async function findVisit(token: string) {
  return prisma.visitRequest.findFirst({
    where: { OR: [{ acceptToken: token }, { rejectToken: token }, { proposeToken: token }] },
  });
}

export default async function RespondVisitPage({ params }: Props) {
  const { token } = await params;
  const visit = await findVisit(token);
  if (!visit) notFound();

  // Enlaces expirados o solicitud ya cerrada → página de estado del cliente.
  if (visit.tokenExpiresAt && visit.tokenExpiresAt < new Date()) redirect("/visita/expiro");
  if (["CONFIRMED", "COMPLETED", "CANCELLED"].includes(visit.status)) redirect(`/visita/estado/${token}`);

  const kind = visit.acceptToken === token ? "accept" : visit.rejectToken === token ? "reject" : "propose";

  // GET con ?accion=accept|reject ejecuta la respuesta directamente (botones simples del correo).
  return <RespondVisitForm visitId={visit.id} kind={kind} customerName={visit.customerName} proposedDate={visit.proposedDate?.toISOString() ?? null} />;
}
