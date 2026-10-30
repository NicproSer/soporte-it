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

  /** Dispara la descarga del PDF vía fetch + <a download> (con la cookie de
   *  sesión). window.open no siempre descarga cuando el servidor responde con
   *  Content-Disposition, y falla si el navegador bloquea la ventana. */
  async function downloadPdf(downloadUrl: string, batchId: string) {
    const pdfResponse = await fetch(downloadUrl);
    if (!pdfResponse.ok) throw new Error(String(pdfResponse.status));
    const blob = await pdfResponse.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `stickers-${batchId}-carta.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  /** Polling al estado del lote hasta que el PDF esté listo (patrón asíncrono
   *  que evita el timeout de 60 s de Vercel en producción). */
  async function waitForPdf(statusUrl: string, downloadUrl: string, batchId: string, created: number) {
    const started = Date.now();
    // Espera máxima: 4 minutos (lotes grandes en serverless).
    while (Date.now() - started < 240_000) {
      await new Promise((r) => setTimeout(r, 1500));
      let state = "generating";
      try {
        const res = await fetch(statusUrl);
        if (res.ok) {
          const st = await res.json();
          state = st.state ?? "generating";
          if (state === "error") {
            setStatus({ kind: "error", message: st.message ?? "El PDF no se pudo generar. Revisa los logs de Vercel." });
            return;
          }
        }
      } catch {
        continue; // fallo transitorio de red: seguimos intentando
      }
      if (state === "ready") {
        try {
          await downloadPdf(downloadUrl, batchId);
          setStatus({ kind: "done", message: `Lote ${batchId} creado con ${created} etiquetas. El PDF se descargó automáticamente.` });
        } catch {
          setStatus({ kind: "done", message: `Lote ${batchId} listo, pero la descarga automática falló.` });
          window.open(downloadUrl, "_blank", "noopener");
        }
        return;
      }
    }
    setStatus({
      kind: "done",
      message: `Lote ${batchId} creado. La generación del PDF sigue en segundo plano; vuelve a intentar la descarga en unos segundos.`,
    });
  }

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
      setStatus({ kind: "loading", message: `Lote ${data.batchId}: generando PDF en segundo plano…` });
      // Actualiza las métricas del dashboard desde la base de datos.
      router.refresh();
      // Esperar a que el PDF termine y descargarlo automáticamente.
      void waitForPdf(data.statusUrl, data.downloadUrl, data.batchId, data.created);
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
