"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, CheckCircle2, Loader2, Send } from "lucide-react";

type Props = {
  uid: string;
  equipmentId: string;
  labelCode: string;
  equipmentName: string;
  /** Datos del cliente desde la ficha técnica (prellenado). */
  ownerName?: string | null;
  ownerEmail?: string | null;
  location?: string | null;
};

const inputStyle = { width: "100%", marginTop: 6, padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: 10, fontSize: 14, background: "#fff", color: "#0f2a43" } as const;

/**
 * Formulario "Pedir visita técnica" disponible para CUALQUIER persona que
 * escanee el QR (sin necesidad de iniciar sesión). La solicitud queda
 * vinculada al identificador de la etiqueta/equipo y llega por correo a los
 * administradores, que deberán entrar al sistema a proponer un día.
 */
export default function RequestVisitForm({ uid, equipmentId, labelCode, equipmentName, ownerName, ownerEmail, location }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const payload = {
      uid,
      equipmentId,
      contactName: String(fd.get("contactName") ?? "").trim(),
      contactEmail: String(fd.get("contactEmail") ?? "").trim(),
      customerPhone: String(fd.get("customerPhone") ?? "").trim(),
      address: String(fd.get("address") ?? "").trim(),
      issueDescription: String(fd.get("issueDescription") ?? "").trim(),
      preferredDate: String(fd.get("preferredDate") ?? "").trim() || null,
    };
    try {
      const res = await fetch(`/api/q/${uid}/visita`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "No se pudo enviar la solicitud.");
        return;
      }
      setDone(
        `Solicitud enviada y vinculada a la etiqueta ${labelCode}. Recibirás en ${payload.contactEmail} la propuesta de fecha del administrador.`
      );
      router.refresh();
    } catch {
      setError("Error de conexión. Verifica tu internet e inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <div style={{ background: "#e7f4e8", border: "1px solid #bfe0c2", borderRadius: 12, padding: "16px 18px", display: "flex", gap: 10, alignItems: "flex-start" }}>
        <CheckCircle2 size={20} color="#2e7d32" style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <strong style={{ color: "#1f5c24", fontSize: 14 }}>¡Solicitud registrada!</strong>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "#2c5530", lineHeight: 1.5 }}>{done}</p>
        </div>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#1456c0", color: "#fff", fontWeight: 700, fontSize: 14, border: 0, borderRadius: 10, padding: "13px 22px", cursor: "pointer", width: "100%", justifyContent: "center" }}
      >
        <CalendarClock size={17} />
        Pedir visita técnica para este equipo
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} style={{ marginTop: 4 }}>
      <div className="field-grid">
        <label>
          <span className="field-label">Tu nombre (persona de contacto) *</span>
          <input name="contactName" required placeholder="Ej: María González" maxLength={120} style={inputStyle} />
        </label>
        <label>
          <span className="field-label">Tu correo electrónico *</span>
          <input name="contactEmail" type="email" required placeholder="tucorreo@ejemplo.com" maxLength={160} style={inputStyle} defaultValue={ownerEmail ?? ""} />
        </label>
        <label>
          <span className="field-label">Teléfono</span>
          <input name="customerPhone" placeholder="+56 9 1234 5678" maxLength={40} style={inputStyle} defaultValue={""} />
        </label>
        <label>
          <span className="field-label">Fecha preferida (opcional)</span>
          <input type="date" name="preferredDate" min={new Date().toISOString().slice(0, 10)} style={inputStyle} />
        </label>
        <label style={{ gridColumn: "1 / -1" }}>
          <span className="field-label">Dirección del sitio *</span>
          <input name="address" required defaultValue={location ?? ""} placeholder="Calle, número, comuna/ciudad" maxLength={250} style={inputStyle} />
        </label>
        <label style={{ gridColumn: "1 / -1" }}>
          <span className="field-label">Describe el problema o requerimiento *</span>
          <textarea name="issueDescription" required rows={4} placeholder={`Ej: ${equipmentName} presenta fallas intermitentes…`} maxLength={2000} style={inputStyle} />
        </label>
      </div>
      {error ? <div className="generate-status error" style={{ marginTop: 14 }}>{error}</div> : null}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
        <button
          type="submit"
          disabled={saving}
          style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#1456c0", color: "#fff", fontWeight: 700, fontSize: 14, border: 0, borderRadius: 10, padding: "12px 20px", cursor: "pointer", opacity: saving ? 0.6 : 1 }}
        >
          {saving ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
          {saving ? "Enviando…" : "Enviar solicitud"}
        </button>
        <button type="button" onClick={() => setOpen(false)} style={{ background: "transparent", border: "1px solid #cbd5e1", borderRadius: 10, padding: "12px 18px", fontSize: 13, fontWeight: 700, color: "#42546a", cursor: "pointer" }}>
          Cancelar
        </button>
      </div>
      <div className="generate-hint" style={{ marginTop: 10 }}>
        Tu solicitud quedará vinculada a la etiqueta <strong>{labelCode}</strong>. Un administrador revisará el caso y te propondrá un día por correo; podrás aceptarlo, rechazarlo o sugerir otra fecha.
      </div>
    </form>
  );
}
