"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Check, Loader2, X } from "lucide-react";

type Props = {
  visitId: string;
  status: string;
  customerName: string;
};

export default function ProposeDateForm({ visitId, status, customerName }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const closed = ["CONFIRMED", "COMPLETED", "CANCELLED"].includes(status);

  async function propose(e: React.FormEvent) {
    e.preventDefault();
    if (!date) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/visitas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitId, proposedDate: new Date(date).toISOString(), message }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ kind: "error", text: data.error ?? "No se pudo guardar la propuesta." });
      } else {
        setFeedback({
          kind: "ok",
          text: data.emailSent
            ? `Propuesta enviada por correo a ${customerName}.`
            : `Propuesta guardada. El correo al cliente falló: ${data.emailError ?? "revisa SMTP en .env"}`,
        });
        setOpen(false);
        setDate("");
        setMessage("");
        router.refresh();
      }
    } catch {
      setFeedback({ kind: "error", text: "Error de conexión." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="propose-box">
      {feedback ? <div className={`generate-status ${feedback.kind === "ok" ? "done" : "error"}`}>{feedback.text}</div> : null}
      {!closed && !open ? (
        <button className="propose-button" onClick={() => setOpen(true)} disabled={busy}>
          <CalendarPlus size={14} /> Proponer fecha
        </button>
      ) : null}
      {closed ? <span className="item-sub">Solicitud cerrada.</span> : null}
      {open ? (
        <form onSubmit={propose} className="propose-form">
          <label className="form-field" style={{ display: "block" }}>
            <span className="field-label">Día y hora propuestos *</span>
            <input required type="datetime-local" value={date} min={new Date().toISOString().slice(0, 16)} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="form-field" style={{ display: "block", marginTop: 8 }}>
            <span className="field-label">Mensaje para el cliente (opcional)</span>
            <input maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Ej: Ese día tenemos técnico disponible en tu zona…" />
          </label>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button className="propose-button send" type="submit" disabled={busy}>
              {busy ? <Loader2 size={14} className="spin" /> : <Check size={14} />} Enviar propuesta
            </button>
            <button className="propose-button cancel" type="button" onClick={() => setOpen(false)}>
              <X size={14} /> Cancelar
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
