"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, KeyRound } from "lucide-react";

/**
 * Restablecimiento de contraseña desde el enlace enviado al correo
 * (/reset-password?token=...). El token es de un solo uso y vence en 2 h.
 */
function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [checking, setChecking] = useState(true);
  const [valid, setValid] = useState(false);
  const [userName, setUserName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setChecking(false);
      return;
    }
    fetch(`/api/reset-password?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d) => {
        setValid(!!d.valid);
        setUserName(d.name ?? "");
      })
      .catch(() => setValid(false))
      .finally(() => setChecking(false));
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("La confirmación no coincide.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "No se pudo restablecer la contraseña.");
        setBusy(false);
        return;
      }
      router.replace(data.redirect ?? "/login");
      router.refresh();
    } catch {
      setError("Error de conexión.");
      setBusy(false);
    }
  }

  return (
    <main className="login-wrap">
      <div className="login-card">
        <div className="login-head">
          <div className="brand" style={{ color: "var(--navy)" }}>
            SOPORTE IT
            <small style={{ color: "var(--muted)" }}>RECUPERACIÓN DE ACCESO</small>
          </div>
        </div>

        {checking ? (
          <p className="muted"><Loader2 size={15} className="spin" style={{ verticalAlign: "-2px" }} /> Verificando el enlace…</p>
        ) : !token || !valid ? (
          <>
            <h1 className="h1" style={{ fontSize: 22 }}>Enlace no válido</h1>
            <p className="muted">
              El enlace de recuperación expiró o ya fue utilizado. Pide a un administrador enviar uno nuevo desde
              <strong> Panel → Usuarios y accesos → Resetear contraseña</strong>.
            </p>
            <div className="login-foot">
              <Link href="/login">Ir al inicio de sesión →</Link>
            </div>
          </>
        ) : (
          <form onSubmit={submit}>
            <h1 className="h1" style={{ fontSize: 22 }}>Nueva contraseña</h1>
            <p className="muted">
              {userName ? `Hola ${userName}, define tu nueva contraseña` : "Define tu nueva contraseña"} (mínimo 8 caracteres).
            </p>
            {error ? <div className="login-error" role="alert">{error}</div> : null}
            <label className="login-field">
              <KeyRound size={16} color="#1456c0" />
              <span>Nueva contraseña</span>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} autoComplete="new-password" required />
            </label>
            <label className="login-field">
              <KeyRound size={16} color="#1456c0" />
              <span>Confirmar contraseña</span>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={8} autoComplete="new-password" required />
            </label>
            <button type="submit" className="login-button" disabled={busy}>
              {busy ? <Loader2 size={16} className="spin" /> : <KeyRound size={16} />}
              Establecer contraseña y entrar
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<main className="login-wrap"><div className="login-card"><p className="muted">Verificando enlace…</p></div></main>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
