"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BellRing, CheckCircle2, Loader2, Link2, XCircle } from "lucide-react";

type Device = { id: string; name: string; code?: string; location?: string | null };

type Props = {
  visitId: string;
  customerName: string;
  /** true si el ticket llegó SIN equipo asociado (se puede enlazar al cerrar). */
  needsEquipment?: boolean;
};

/**
 * Recordatorio post-visita (flujo tipo tickets): el técnico o administrador
 * indica si la tarea SE COMPLETÓ o NO y registra la información del servicio.
 * El detalle se enlaza al historial del dispositivo y todo el equipo recibe
 * el resultado por correo.
 */
export default function CloseTicketForm({ visitId, customerName, needsEquipment = false }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [completed, setCompleted] = useState(true);
  const [type, setType] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  // Enlace de dispositivo para tickets sin equipo asociado.
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceQuery, setDeviceQuery] = useState("");
  const [selectedDevice, setSelectedDevice] = useState<string>("");

  // Cargar dispositivos cuando se abre el cierre de un ticket sin equipo.
  useEffect(() => {
    if (!open || !needsEquipment || devices.length) return;
    let alive = true;
    fetch("/api/equipos?limite=300")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        if (alive && Array.isArray(data?.equipos)) setDevices(data.equipos);
      })
      .catch(() => {
        /* si falla la carga, igual se puede cerrar sin enlazar */
      });
    return () => {
      alive = false;
    };
  }, [open, needsEquipment, devices.length]);

  const filteredDevices = useMemo(() => {
    const q = deviceQuery.trim().toLowerCase();
    if (!q) return devices.slice(0, 30);
    return devices
      .filter((d) => d.name.toLowerCase().includes(q) || (d.code ?? "").toLowerCase().includes(q) || (d.location ?? "").toLowerCase().includes(q))
      .slice(0, 30);
  }, [devices, deviceQuery]);

  async function close(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/tickets/cerrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitId,
          completed,
          notes,
          interventionType: type,
          equipmentId: needsEquipment && selectedDevice ? selectedDevice : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFeedback({ kind: "error", text: data.error ?? "No se pudo cerrar el ticket." });
      } else {
        setFeedback({ kind: "ok", text: `Ticket cerrado. El resultado se registró en el historial del dispositivo.` });
        setOpen(false);
        setType("");
        setNotes("");
        router.refresh();
      }
    } catch {
      setFeedback({ kind: "error", text: "Error de conexión." });
    } finally {
      setBusy(false);
    }
  }

  async function remind() {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/tickets/recordatorio", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitId }),
      });
      const data = await res.json().catch(() => ({}));
      setFeedback(
        res.ok
          ? { kind: "ok", text: "Recordatorio enviado al equipo por correo." }
          : { kind: "error", text: data.error ?? "No se pudo enviar el recordatorio." }
      );
    } catch {
      setFeedback({ kind: "error", text: "Error de conexión." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="propose-box">
      {feedback ? <div className={`generate-status ${feedback.kind === "ok" ? "done" : "error"}`}>{feedback.text}</div> : null}
      {!open ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button className="propose-button" onClick={remind} disabled={busy} title="Enviar recordatorio al equipo">
            <BellRing size={14} /> Recordar
          </button>
          <button className="propose-button send" onClick={() => setOpen(true)} disabled={busy}>
            <CheckCircle2 size={14} /> Cerrar visita
          </button>
        </div>
      ) : (
        <form onSubmit={close} className="propose-form">
          <span className="field-label">¿Se completó la tarea? *</span>
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <button
              type="button"
              className={`propose-button ${completed ? "send" : "cancel"}`}
              onClick={() => setCompleted(true)}
            >
              <CheckCircle2 size={14} /> Sí, completada
            </button>
            <button
              type="button"
              className={`propose-button ${!completed ? "cancel" : ""}`}
              onClick={() => setCompleted(false)}
            >
              <XCircle size={14} /> No completada
            </button>
          </div>
          <label className="form-field" style={{ display: "block", marginTop: 10 }}>
            <span className="field-label">Tipo de servicio *</span>
            <input required maxLength={80} value={type} onChange={(e) => setType(e.target.value)} placeholder="Ej: Reparación, mantenimiento preventivo…" />
          </label>
          {needsEquipment ? (
            <div className="form-field" style={{ display: "block", marginTop: 8 }}>
              <span className="field-label"><Link2 size={13} style={{ display: "inline", verticalAlign: "-2px" }} /> Enlazar dispositivo (opcional)</span>
              <div className="muted" style={{ fontSize: 12, margin: "4px 0" }}>
                Este ticket no tiene equipo asociado. Puedes enlazarlo ahora para que el resultado quede en su historial, o cerrarlo sin enlazar.
              </div>
              <input
                value={deviceQuery}
                onChange={(e) => setDeviceQuery(e.target.value)}
                placeholder="Buscar por nombre, código de etiqueta o ubicación…"
              />
              {deviceQuery.trim() || devices.length ? (
                <select
                  style={{ width: "100%", marginTop: 6 }}
                  value={selectedDevice}
                  onChange={(e) => setSelectedDevice(e.target.value)}
                >
                  <option value="">— Sin dispositivo —</option>
                  {filteredDevices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}{d.code ? ` (${d.code})` : ""}{d.location ? ` · ${d.location}` : ""}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          ) : null}
          <label className="form-field" style={{ display: "block", marginTop: 8 }}>
            <span className="field-label">Información / resultado para el historial de {customerName} *</span>
            <textarea required rows={3} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Qué se hizo, repuestos usados, pendientes…" />
          </label>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button className="propose-button send" type="submit" disabled={busy}>
              {busy ? <Loader2 size={14} className="spin" /> : <CheckCircle2 size={14} />} Guardar y cerrar
            </button>
            <button className="propose-button cancel" type="button" onClick={() => setOpen(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
