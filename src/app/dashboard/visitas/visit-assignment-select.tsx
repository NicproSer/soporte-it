"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, UserRoundCog } from "lucide-react";

type Technician = { id: string; name: string; email: string; role?: "ADMIN" | "TECHNICIAN" };
type Props = { visitId: string; assignedToId: string | null; technicians: Technician[] };

export default function VisitAssignmentSelect({ visitId, assignedToId, technicians }: Props) {
  const router = useRouter();
  const [value, setValue] = useState(assignedToId ?? "");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (value === (assignedToId ?? "")) return;
    setBusy(true);
    setSaved(false);
    setError("");
    try {
      const response = await fetch(`/api/admin/visitas/${visitId}/assign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: value || null }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "No se pudo asignar el responsable.");
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError("Error de conexión. Intenta nuevamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="visit-assignment">
      <label className="visit-assignment-label" htmlFor={`assign-${visitId}`}>
        <UserRoundCog size={14} /> Responsable de la visita
      </label>
      <div className="visit-assignment-controls">
        <select
          id={`assign-${visitId}`}
          value={value}
          onChange={(event) => { setValue(event.target.value); setSaved(false); }}
          disabled={busy}
        >
          <option value="">Sin asignar</option>
          {technicians.map((technician) => (
            <option key={technician.id} value={technician.id}>{technician.name} · {technician.role === "ADMIN" ? "Administrador" : "Técnico"}</option>
          ))}
        </select>
        <button type="button" onClick={save} disabled={busy || value === (assignedToId ?? "")} aria-label="Guardar asignación">
          {busy ? <Loader2 size={14} className="spin" /> : <Check size={14} />}
          Guardar
        </button>
      </div>
      {saved ? <span className="visit-assignment-feedback success">Asignación actualizada.</span> : null}
      {error ? <span className="visit-assignment-feedback error">{error}</span> : null}
    </div>
  );
}
