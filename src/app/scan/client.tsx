"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Html5Qrcode } from "html5-qrcode";

/**
 * /scan — Escáner de códigos QR con la cámara del dispositivo.
 * Al detectar un QR válido de etiqueta (URL /q/[uid] o el propio uid),
 * redirige automáticamente a la ficha técnica correspondiente.
 * Si además hay sesión de ADMIN/TECHNICIAN, la ficha se abre en modo editable.
 */

const REGION_ID = "qr-reader-region";
const SCAN_BOX_ID = "qr-scan-box";

function extractUid(text: string): string | null {
  // Formatos aceptados:
  //   https://host/q/ABC123...            → ABC123...
  //   /q/ABC123...                        → ABC123...
  //   ABC1234567890ABCDEFGHIJ             (uid raw de 20 caracteres)
  try {
    const url = new URL(text);
    const m = url.pathname.match(/^\/q\/([A-Za-z0-9_-]{6,})/);
    if (m) return m[1];
  } catch {
    /* no era URL absoluta */
  }
  const local = text.match(/\/q\/([A-Za-z0-9_-]{6,})/);
  if (local) return local[1];
  if (/^[A-Z0-9]{20}$/.test(text.trim())) return text.trim();
  return null;
}

export default function ScanPageClient() {
  const router = useRouter();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [status, setStatus] = useState<"idle" | "starting" | "scanning" | "error">("idle");
  const [message, setMessage] = useState("");
  const handledRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      setStatus("starting");
      setMessage("Solicitando acceso a la cámara…");
      try {
        const scanner = new Html5Qrcode(REGION_ID, false);
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 12, qrbox: 250 },
          (decodedText) => {
            if (handledRef.current || cancelled) return;
            const uid = extractUid(decodedText);
            if (!uid) {
              setMessage("El código leído no es una etiqueta válida. Inténtalo de nuevo.");
              return;
            }
            handledRef.current = true;
            setStatus("scanning");
            setMessage("Etiqueta reconocida ✓ Abriendo ficha técnica…");
            window.navigator.vibrate?.(120);
            setTimeout(() => router.push(`/q/${uid}`), 450);
          },
          () => {
            /* errores por frame: ignorar (ocurren constantemente) */
          },
        );
        if (!cancelled) {
          setStatus("scanning");
          setMessage("Apunta la cámara al código QR de la etiqueta.");
        }
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        const name = (err as { name?: string })?.name ?? "";
        setMessage(
          name === "NotAllowedError" || name === "PermissionDeniedError"
            ? "Permiso de cámara denegado. Habilítalo en el navegador y recarga la página."
            : "No se pudo iniciar la cámara. ¿Hay una cámara disponible y estás bajo HTTPS?",
        );
      }
    }

    start();

    return () => {
      cancelled = true;
      const s = scannerRef.current;
      scannerRef.current = null;
      if (s) {
        s.stop().then(() => s.clear()).catch(() => {});
      }
    };
  }, [router]);

  return (
    <main className="scan-page">
      <div className="scan-card">
        <div className="eyebrow">Lectura automática</div>
        <h1 className="h1">Escanear etiqueta QR</h1>
        <p className="muted" style={{ marginTop: 6 }}>
          La cámara se inicia automáticamente. Al reconocer una etiqueta te lleva directo a su ficha técnica.
        </p>

        <div className="scan-region-wrap">
          <div id={REGION_ID} className="scan-region" />
          {status === "scanning" && <div id={SCAN_BOX_ID} className="scan-frame" aria-hidden="true" />}
          {status === "starting" && <div className="scan-overlay">Iniciando cámara…</div>}
          {status === "error" && <div className="scan-overlay error">{message}</div>}
        </div>

        <div className="scan-status" role="status" aria-live="polite">
          {status === "scanning" && <span className="scan-dot" />}
          {message}
        </div>

        <div className="scan-actions">
          <a className="home-secondary-button" href="/dashboard">Volver al panel</a>
          <a className="home-secondary-button" href="/equipos">Buscar por código</a>
        </div>
      </div>
    </main>
  );
}
