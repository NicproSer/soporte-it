"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Save } from "lucide-react";

type Props = {
  uid: string;
  initial?: {
    name: string;
    category: string;
    brand: string;
    model: string;
    serialNumber: string;
    location: string;
    installationAt: string; // yyyy-mm-dd | ""
    warrantyUntil: string;  // yyyy-mm-dd | ""
    status: string;
    notes: string;
  };
};

const inputStyle = { width: "100%", marginTop: 6, padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: 10, fontSize: 14, background: "#fff", color: "#0f2a43" } as const;

export default function FichaForm({ uid, initial }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setDone(null);
    const fd = new FormData(e.currentTarget);
    const payload: Record<string, unknown> = {};
    for (const [key, value] of fd.entries()) {
      if (typeof value === "string" && value.trim() !== "") payload[key] = value.trim();
    }
    try {
      const res = await fetch(`/api/q/${uid}/ficha`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "No se pudo guardar la ficha técnica.");
        return;
      }
      setDone(data.created ? "Ficha técnica creada correctamente." : "Ficha técnica actualizada correctamente.");
      router.refresh();
    } catch {
      setError("Error de conexión. Verifica que el servidor esté corriendo e inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ marginTop: 18 }}>
      <div className="field-grid">
        <label style={{ gridColumn: "1 / -1" }}>
          <span className="field-label">Nombre del equipo *</span>
          <input name="name" required defaultValue={initial?.name ?? ""} placeholder="Ej. Servidor Dell R740" style={inputStyle} />
        </label>
        <label>
          <span className="field-label">Categoría *</span>
          <input name="category" required defaultValue={initial?.category ?? ""} placeholder="Servidor, Laptop, Red, Impresora…" style={inputStyle} />
        </label>
        <label>
          <span className="field-label">Estado</span>
          <select name="status" defaultValue={initial?.status ?? "ACTIVE"} style={inputStyle}>
            <option value="ACTIVE">Activo</option>
            <option value="MAINTENANCE">En mantenimiento</option>
            <option value="INACTIVE">Inactivo</option>
            <option value="REPLACED">Reemplazado</option>
          </select>
        </label>
        <label>
          <span className="field-label">Marca</span>
          <input name="brand" defaultValue={initial?.brand ?? ""} placeholder="Dell, HP, Lenovo…" style={inputStyle} />
        </label>
        <label>
          <span className="field-label">Modelo</span>
          <input name="model" defaultValue={initial?.model ?? ""} placeholder="PowerEdge R740" style={inputStyle} />
        </label>
        <label>
          <span className="field-label">Número de serie</span>
          <input name="serialNumber" defaultValue={initial?.serialNumber ?? ""} placeholder="Etiqueta service tag / S/N" style={inputStyle} />
        </label>
        <label>
          <span className="field-label">Ubicación física</span>
          <input name="location" defaultValue={initial?.location ?? ""} placeholder="Oficina 3, piso 2, rack A4…" style={inputStyle} />
        </label>
        <label>
          <span className="field-label">Fecha de instalación</span>
          <input type="date" name="installationAt" defaultValue={initial?.installationAt ?? ""} style={inputStyle} />
        </label>
        <label>
          <span className="field-label">Garantía hasta</span>
          <input type="date" name="warrantyUntil" defaultValue={initial?.warrantyUntil ?? ""} style={inputStyle} />
        </label>
        <label style={{ gridColumn: "1 / -1" }}>
          <span className="field-label">Observaciones</span>
          <textarea name="notes" rows={3} defaultValue={initial?.notes ?? ""} placeholder="Notas técnicas, configuraciones especiales, contratos de soporte…" style={inputStyle} />
        </label>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginTop: 20 }}>
        <button
          type="submit"
          disabled={saving}
          style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#1456c0", color: "#fff", fontWeight: 700, fontSize: 14, border: 0, borderRadius: 10, padding: "12px 20px", cursor: "pointer", opacity: saving ? 0.6 : 1 }}
        >
          {saving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
          {saving ? "Guardando…" : initial ? "Guardar cambios" : "Guardar ficha técnica"}
        </button>
        {done ? (
          <span style={{ fontSize: 12, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6, color: "#356d11" }}>
            <CheckCircle2 size={15} /> {done}
          </span>
        ) : null}
        {error ? <span style={{ fontSize: 12, fontWeight: 700, color: "#b3261e" }}>{error}</span> : null}
      </div>
    </form>
  );
}
