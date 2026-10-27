"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, LockKeyhole, Mail, ShieldCheck } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "No se pudo iniciar sesión.");
        setLoading(false);
        return;
      }
      // Si la cuenta aún usa la contraseña temporal generada desde el panel,
      // obliga a cambiarla antes de continuar (flujo de bienvenida seguro).
      if (data.mustChangePassword) {
        router.replace("/cambiar-contrasena?obligatorio=1");
        router.refresh();
        return;
      }
      router.replace(data.redirect ?? "/dashboard");
      router.refresh();
    } catch {
      setError("Error de conexión. Inténtalo de nuevo.");
      setLoading(false);
    }
  }

  return (
    <main className="login-wrap">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-head">
          <div className="brand" style={{ color: "var(--navy)" }}>
            SOPORTE IT
            <small style={{ color: "var(--muted)" }}>ACCESO AL SISTEMA</small>
          </div>
        </div>
        <h1 className="h1" style={{ fontSize: 24 }}>Iniciar sesión</h1>
        <p className="muted">Ingresa con tu cuenta: los administradores acceden al panel de control y los técnicos a la gestión de fichas técnicas.</p>

        {error ? <div className="login-error" role="alert">{error}</div> : null}

        <label className="login-field">
          <Mail size={16} color="#1456c0" />
          <span>Correo electrónico</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@empresa.com"
            autoComplete="email"
            required
          />
        </label>

        <label className="login-field">
          <LockKeyhole size={16} color="#1456c0" />
          <span>Contraseña</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            required
          />
        </label>

        <button className="login-button" type="submit" disabled={loading}>
          {loading ? <Loader2 size={17} className="spin" /> : <ShieldCheck size={17} />}
          {loading ? "Verificando…" : "Entrar al panel"}
        </button>

        <div className="login-foot">
          <Link href="/">← Volver al inicio</Link>
          <span>Sesión protegida · administradores y técnicos</span>
        </div>
      </form>
    </main>
  );
}
