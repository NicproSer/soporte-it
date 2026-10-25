import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { CalendarClock, CheckCircle2, XCircle } from "lucide-react";

export const dynamic = "force-dynamic";

const statusInfo: Record<string, { title: string; text: string; color: string }> = {
  PENDING: { title: "Solicitud recibida", text: "Un administrador la revisará y te propondrá una fecha por correo.", color: "#8a5a00" },
  PROPOSED: { title: "Fecha propuesta en espera", text: "Te enviamos una propuesta de fecha por correo. Revisa tu bandeja (y spam) para aceptar, rechazar o sugerir otra.", color: "#174b9e" },
  CONFIRMED: { title: "Visita confirmada ✅", text: "La fecha quedó agendada. El equipo técnico asistirá según lo coordinado.", color: "#2e7d32" },
  REJECTED: { title: "Solicitud rechazada", text: "Registramos tu respuesta. Puedes crear una nueva solicitud cuando la necesites.", color: "#b3261e" },
  RESCHEDULE_REQUESTED: { title: "Esperando nueva propuesta", text: "Recibimos la fecha que sugeriste. El administrador te enviará una nueva propuesta por correo.", color: "#174b9e" },
  COMPLETED: { title: "Visita completada", text: "La intervención fue registrada en el historial del equipo.", color: "#2e7d32" },
  CANCELLED: { title: "Solicitud cancelada", text: "Esta solicitud fue cancelada.", color: "#68788b" },
};

export default async function VisitStatusPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const visit = await prisma.visitRequest.findFirst({
    where: { OR: [{ acceptToken: token }, { rejectToken: token }, { proposeToken: token }] },
  });
  if (!visit) notFound();

  const info = statusInfo[visit.status] ?? statusInfo.PENDING;
  const Icon = visit.status === "REJECTED" || visit.status === "CANCELLED" ? XCircle : CheckCircle2;

  return (
    <main className="public-wrap">
      <article className="public-card" style={{ textAlign: "center" }}>
        <div style={{ padding: "44px 34px" }}>
          <Icon size={54} color={info.color} style={{ margin: "0 auto 16px", display: "block" }} />
          <h1 className="h1" style={{ fontSize: 24 }}>{info.title}</h1>
          <p className="muted" style={{ maxWidth: 430, margin: "10px auto 18px" }}>{info.text}</p>
          {visit.proposedDate ? (
            <div style={{ background: "#f1f5f9", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#42546a", display: "inline-block" }}>
              <CalendarClock size={13} style={{ display: "inline", verticalAlign: "-2px", marginRight: 6 }} />
              Fecha propuesta: {visit.proposedDate.toLocaleDateString("es-ES")}{" "}
              {visit.proposedDate.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
              {visit.customerSuggestedDate ? <> · Tu sugerencia: {visit.customerSuggestedDate.toLocaleDateString("es-ES")}</> : null}
            </div>
          ) : null}
          <div style={{ marginTop: 26 }}><a className="home-login-button" href="/solicitar">Nueva solicitud</a></div>
        </div>
      </article>
    </main>
  );
}
