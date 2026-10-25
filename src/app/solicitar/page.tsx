"use client";

import { useState } from "react";
import { CalendarClock, CheckCircle2, Loader2, MapPin, Send, UserRound } from "lucide-react";

type Status = { kind: "idle" } | { kind: "loading" } | { kind: "done"; message: string } | { kind: "error"; message: string };

export default function SolicitarVisitaPage() {
  const [form, setForm] = useState({
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    address: "",
    issueDescription: "",
    preferredDate: "",
  });
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ kind: "loading" });
    try {
      const res = await fetch("/api/visitas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, preferredDate: form.preferredDate || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ kind: "error", message: data.error ?? "No se pudo enviar la solicitud. Intenta nuevamente." });
        return;
      }
      setStatus({
        kind: "done",
        message: data.emailSent
          ? "Solicitud enviada correctamente. Recibirás una propuesta de fecha por correo a tu dirección."
          : "Solicitud registrada correctamente. Un administrador te contactará para coordinar la fecha.",
      });
      setForm({ customerName: "", customerEmail: "", customerPhone: "", address: "", issueDescription: "", preferredDate: "" });
    } catch {
      setStatus({ kind: "error", message: "Error de conexión. Verifica tu internet e intenta otra vez." });
    }
  }

  if (status.kind === "done") {
    return (
      <main className="public-wrap">
        <article className="public-card" style={{ textAlign: "center", padding: 0 }}>
          <div style={{ padding: "44px 34px" }}>
            <CheckCircle2 size={54} color="#2e7d32" style={{ margin: "0 auto 16px", display: "block" }} />
            <h1 className="h1" style={{ fontSize: 24 }}>¡Solicitud enviada!</h1>
            <p className="muted" style={{ maxWidth: 420, margin: "10px auto 24px" }}>{status.message}</p>
            <a className="home-login-button" href="/">Volver al inicio</a>
          </div>
        </article>
      </main>
    );
  }

  return (
    <main className="public-wrap">
      <article className="public-card">
        <header className="public-head">
          <strong>SOPORTE IT</strong>
          <div style={{ color: "#c7d8ec", fontSize: 13, marginTop: 7 }}>Solicitud de visita técnica</div>
        </header>
        <div className="public-body">
          <h1 className="h1" style={{ fontSize: 25 }}>Agenda tu visita</h1>
          <p className="muted" style={{ marginBottom: 22 }}>
            Completa el formulario con el detalle del problema. Un administrador revisará la solicitud y te propondrá
            un día por correo; podrás aceptarlo, rechazarlo o sugerir otra fecha.
          </p>
          <form onSubmit={submit} className="visit-form">
            <div className="field-grid">
              <label className="form-field">
                <span className="field-label"><UserRound size={12} style={{ display: "inline", verticalAlign: "-2px", marginRight: 4 }} /> Nombre y apellido *</span>
                <input required value={form.customerName} onChange={set("customerName")} placeholder="Ej: Juan Pérez" maxLength={120} />
              </label>
              <label className="form-field">
                <span className="field-label">Correo electrónico *</span>
                <input required type="email" value={form.customerEmail} onChange={set("customerEmail")} placeholder="tucorreo@ejemplo.com" maxLength={160} />
              </label>
              <label className="form-field">
                <span className="field-label">Teléfono de contacto</span>
                <input value={form.customerPhone} onChange={set("customerPhone")} placeholder="+56 9 1234 5678" maxLength={40} />
              </label>
              <label className="form-field">
                <span className="field-label"><CalendarClock size={12} style={{ display: "inline", verticalAlign: "-2px", marginRight: 4 }} /> Fecha preferida (opcional)</span>
                <input type="date" value={form.preferredDate} onChange={set("preferredDate")} min={new Date().toISOString().slice(0, 10)} />
              </label>
            </div>
            <label className="form-field" style={{ display: "block", marginTop: 14 }}>
              <span className="field-label"><MapPin size={12} style={{ display: "inline", verticalAlign: "-2px", marginRight: 4 }} /> Dirección del sitio *</span>
              <input required value={form.address} onChange={set("address")} placeholder="Calle, número, comuna/ciudad" maxLength={250} />
            </label>
            <label className="form-field" style={{ display: "block", marginTop: 14 }}>
              <span className="field-label">Describe el problema o requerimiento *</span>
              <textarea required rows={4} value={form.issueDescription} onChange={set("issueDescription")} placeholder="Ej: El equipo de red de bodega 2 perdió conectividad tras la actualización…" maxLength={2000} />
            </label>
            {status.kind === "error" ? <div className="generate-status error" style={{ marginTop: 14 }}>{status.message}</div> : null}
            <button className="generate-button" type="submit" disabled={status.kind === "loading"} style={{ marginTop: 18, width: "100%", justifyContent: "center" }}>
              {status.kind === "loading" ? <Loader2 size={17} className="spin" /> : <Send size={17} />}
              {status.kind === "loading" ? "Enviando…" : "Enviar solicitud"}
            </button>
            <div className="generate-hint" style={{ textAlign: "center" }}>
              Al enviarla recibirán notificación los administradores y deberemos confirmarte una fecha por correo.
            </div>
          </form>
        </div>
      </article>
    </main>
  );
}
