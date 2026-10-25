"use client";

import { useActionState } from "react";
import { CalendarClock, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { handleAction } from "./actions";

type Props = {
  visitId: string;
  kind: "accept" | "reject" | "propose";
  customerName: string;
  proposedDate: string | null;
};

export default function RespondVisitForm({ visitId, kind, customerName, proposedDate }: Props) {
  const [state, formAction, pending] = useActionState(
    async (_prev: unknown, formData: FormData) => {
      await handleAction(formData);
      return true;
    },
    false
  );

  if (state) {
    const messages = {
      accept: { title: "¡Visita confirmada! ✅", text: "La fecha propuesta quedó confirmada y el equipo de soporte fue notificado. Te enviaremos un recordatorio antes de la visita." },
      reject: { title: "Solicitud rechazada", text: " Registramos tu respuesta e informamos al administrador. Puedes crear una nueva solicitud cuando lo necesites." },
      propose: { title: "Fecha sugerida enviada 📅", text: "El administrador revisará tu propuesta y te enviará una nueva fecha por correo." },
    } as const;
    const m = messages[kind];
    return (
      <main className="public-wrap">
        <article className="public-card" style={{ textAlign: "center" }}>
          <div style={{ padding: "44px 34px" }}>
            <CheckCircle2 size={54} color="#2e7d32" style={{ margin: "0 auto 16px", display: "block" }} />
            <h1 className="h1" style={{ fontSize: 24 }}>{m.title}</h1>
            <p className="muted" style={{ maxWidth: 430, margin: "10px auto 24px" }}>{m.text}</p>
            {/* Recordatorio descargable en el calendario del teléfono (.ics) */}
            {kind === "accept" && proposedDate ? (
              <a
                className="generate-button"
                href={`/api/visitas/${visitId}/calendar`}
                style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#1456c0", color: "#fff", fontWeight: 700, fontSize: 14, border: 0, borderRadius: 10, padding: "12px 22px", textDecoration: "none", marginBottom: 18 }}
              >
                <CalendarClock size={17} /> Descargar recordatorio (.ics)
              </a>
            ) : null}
            <div><a className="home-login-button" href="/solicitar">Nueva solicitud</a></div>
          </div>
        </article>
      </main>
    );
  }

  const prettyDate = proposedDate
    ? new Date(proposedDate).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) +
      " · " + new Date(proposedDate).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <main className="public-wrap">
      <article className="public-card">
        <header className="public-head">
          <strong>SOPORTE IT</strong>
          <div style={{ color: "#c7d8ec", fontSize: 13, marginTop: 7 }}>Respuesta a propuesta de visita técnica</div>
        </header>
        <div className="public-body">
          <h1 className="h1" style={{ fontSize: 24 }}>Hola, {customerName}</h1>
          {kind !== "propose" && prettyDate ? (
            <div style={{ background: "#e5efff", border: "1px solid #bfd4f7", borderRadius: 10, padding: "14px 16px", fontSize: 15, fontWeight: 700, color: "#174b9e", margin: "16px 0" }}>
              📅 Fecha propuesta: {prettyDate}
            </div>
          ) : null}

          {kind === "accept" && (
            <form action={formAction}>
              <input type="hidden" name="visitId" value={visitId} />
              <input type="hidden" name="action" value="accept" />
              <p className="muted">Confirma que la fecha propuesta te acomoda. Al aceptar, la visita quedará <strong>CONFIRMADA</strong>.</p>
              <button className="generate-button" type="submit" disabled={pending} style={{ marginTop: 18, width: "100%", justifyContent: "center", background: "#2e7d32" }}>
                {pending ? <Loader2 size={17} className="spin" /> : <CheckCircle2 size={17} />} Confirmar esta fecha
              </button>
            </form>
          )}

          {kind === "reject" && (
            <form action={formAction}>
              <input type="hidden" name="visitId" value={visitId} />
              <input type="hidden" name="action" value="reject" />
              <p className="muted">Indica si deseas agregar un motivo (opcional) y envía el rechazo al administrador.</p>
              <label className="form-field" style={{ display: "block", margin: "14px 0" }}>
                <span className="field-label">Motivo (opcional)</span>
                <textarea name="note" rows={3} maxLength={500} placeholder="Ej: Ya no necesitamos la visita / cambié de proveedor…" />
              </label>
              <button className="generate-button" type="submit" disabled={pending} style={{ marginTop: 6, width: "100%", justifyContent: "center", background: "#b3261e" }}>
                {pending ? <Loader2 size={17} className="spin" /> : <XCircle size={17} />} Rechazar la visita
              </button>
            </form>
          )}

          {kind === "propose" && (
            <form action={formAction}>
              <input type="hidden" name="visitId" value={visitId} />
              <input type="hidden" name="action" value="propose" />
              <p className="muted" style={{ marginBottom: 14 }}>
                La fecha propuesta no te conviene. Indica el día y horario que prefieras y el administrador la revisará.
              </p>
              <label className="form-field" style={{ display: "block", marginBottom: 12 }}>
                <span className="field-label"><CalendarClock size={12} style={{ display: "inline", verticalAlign: "-2px", marginRight: 4 }} /> Nueva fecha y hora sugerida *</span>
                <input required type="datetime-local" name="date" min={new Date().toISOString().slice(0, 16)} />
              </label>
              <label className="form-field" style={{ display: "block", marginBottom: 12 }}>
                <span className="field-label">Comentario (opcional)</span>
                <textarea name="note" rows={3} maxLength={500} placeholder="Ej: Me acomoda mejor por la tarde…" />
              </label>
              <button className="generate-button" type="submit" disabled={pending} style={{ marginTop: 6, width: "100%", justifyContent: "center" }}>
                {pending ? <Loader2 size={17} className="spin" /> : <CalendarClock size={17} />} Enviar fecha sugerida
              </button>
            </form>
          )}
        </div>
      </article>
    </main>
  );
}
