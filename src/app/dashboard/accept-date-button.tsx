"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, Loader2 } from "lucide-react";

type Props = {
  visitId: string;
  /** Fecha que sugirió el cliente (se muestra en el botón para confirmar a simple vista). */
  suggestedDate: string; // ISO string pasado desde el server component
};

/** Botón "Aceptar fecha del cliente": deja la visita CONFIRMADA en el día que
 *  propuso el cliente y le envía la confirmación por correo. Equivale a que el
 *  admin/técnico acepte la sugerencia sin tener que volver a proponer fecha. */
export default function AcceptDateButton({ visitId, suggestedDate }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dateLabel = new Date(suggestedDate).toLocaleDateString("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }) +
    " " +
    new Date(suggestedDate).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/visitas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "No se pudo aceptar la fecha.");
      } else {
        router.refresh();
      }
    } catch {
      setError("Error de conexión.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 8 }}>
      {error ? <div className="generate-status error">{error}</div> : null}
      <button className="propose-button" onClick={accept} disabled={busy} style={{ background: "#2e7d32", borderColor: "#2e7d32", color: "#fff" }}>
        {busy ? <Loader2 size={14} className="spin" /> : <CalendarCheck size={14} />}
        Aceptar fecha del cliente ({dateLabel})
      </button>
    </div>
  );
}
