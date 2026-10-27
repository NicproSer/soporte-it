"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, KeyRound, ShieldCheck } from "lucide-react";

/**
 * Cambio de contraseña autenticado. Se usa en dos contextos:
 * 1) Primer ingreso con contraseña temporal (obligatorio=1): no se puede omitir.
 * 2) Desde el menú "Mi cuenta" para cambiar la contraseña en cualquier momento.
 */
function CambiarContrasenaForm() {
  const router = useRouter();
  const params = useSearchParams();
  const obligatorio = params.get("obligatorio") === "1";

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next !== confirm) {
      setError("La confirmación no coincide con la nueva contraseña.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/cambiar-contrasena", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "No se pudo cambiar la contraseña.");
        setBusy(false);
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Error de conexión. Inténtalo de nuevo.");
      setBusy(false);
    }
  }

  return (
    <main className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-head">
          <div className="brand" style={{ color: "var(--navy)" }}>
            SOPORTE IT
            <small style={{ color: "var(--muted)" }}>SEGURIDAD DE CUENTA</small>
          </div>
        </div>
        <h1 className="h1" style={{ fontSize: 24 }}>Cambiar contraseña</h1>
        <p className="muted">
          {obligatorio
            ? "Tu cuenta aún usa la contraseña temporal enviada por correo. Por seguridad debes definir una propia antes de continuar."
            : "Define una nueva contraseña para tu cuenta (mínimo 8 caracteres)."}
        </p>

        {error ? <div className="login-error" role="alert">{error}</div> : null}

        <label className="login-field">
          <KeyRound size={16} color="#1456c0" />
          <span>Contraseña actual</span>
          <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
        </label>
        <label className="login-field">
          <ShieldCheck size={16} color="#1456c0" />
          <span>Nueva contraseña</span>
          <input type="password" value={next} onChange={(e) => setNext(e.target.value)} minLength={8} autoComplete="new-password" required />
        </label>
        <label className="login-field">
          <ShieldCheck size={16} color="#1456c0" />
          <span>Confirmar nueva contraseña</span>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={8} autoComplete="new-password" required />
        </label>

        <button type="submit" className="login-button" disabled={busy}>
          {busy ? <Loader2 size={16} className="spin" /> : <KeyRound size={16} />}
          Guardar nueva contraseña
        </button>

        {!obligatorio ? (
          <div className="login-foot">
            <Link href="/dashboard">← Volver al panel</Link>
          </div>
        ) : null}
      </form>
    </main>
  );
}

export default function CambiarContrasenaPage() {
  return (
    <Suspense fallback={<main className="login-wrap"><div className="login-card"><p className="muted">Cargando…</p></div></main>}>
      <CambiarContrasenaForm />
    </Suspense>
  );
}
