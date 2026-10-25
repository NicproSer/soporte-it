"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut, QrCode, Tags } from "lucide-react";

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    await fetch("/api/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <button className="logout-button" onClick={logout} disabled={loading}>
      {loading ? <Loader2 size={15} className="spin" /> : <LogOut size={15} />}
      Cerrar sesión
    </button>
  );
}

export function GenerateLabelsButton() {
  const router = useRouter();
  const [count, setCount] = useState(50);
  const [status, setStatus] = useState<{ kind: "idle" | "loading" | "done" | "error"; message?: string }>({ kind: "idle" });

  async function generate() {
    setStatus({ kind: "loading" });
    try {
      const response = await fetch("/api/labels/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count }),
      });
      const data = await response.json();
      if (!response.ok) {
        setStatus({ kind: "error", message: data.error ?? "No se pudieron generar las etiquetas." });
        return;
      }
      setStatus({ kind: "done", message: `Lote ${data.batchId} creado con ${data.created} etiquetas.` });
      // Descarga automática del PDF generado.
      window.open(data.downloadUrl, "_blank", "noopener");
      // Actualiza las métricas del dashboard desde la base de datos.
      router.refresh();
    } catch {
      setStatus({ kind: "error", message: "Error de conexión al generar las etiquetas." });
    }
  }

  const busy = status.kind === "loading";

  return (
    <div className="generate-box">
      <div className="generate-controls">
        <label className="generate-count">
          <Tags size={15} color="#1456c0" />
          Cantidad
          <input
            type="number"
            min={1}
            max={500}
            value={count}
            onChange={(e) => setCount(Number(e.target.value) || 1)}
            disabled={busy}
          />
        </label>
        <button className="generate-button" onClick={generate} disabled={busy}>
          {busy ? <Loader2 size={17} className="spin" /> : <QrCode size={17} />}
          {busy ? "Generando lote…" : "Generar etiquetas"}
        </button>
      </div>
      {status.message ? (
        <div className={`generate-status ${status.kind}`}>{status.message}</div>
      ) : (
        <div className="generate-hint">
          Crea los QR en la base de datos y descarga el PDF listo para imprimir. Ya no necesitas escribir comandos npm.
        </div>
      )}
    </div>
  );
}
