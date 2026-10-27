"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserPlus } from "lucide-react";

export type UserRow = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "TECHNICIAN";
  mustChangePassword: boolean;
  createdAt: string;
};

/** Formulario de creación de cuentas: Nombre, Correo y Permiso. */
export function CreateForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"ADMIN" | "TECHNICIAN">("TECHNICIAN");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, role }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFeedback({ kind: "error", text: data.error ?? "No se pudo crear la cuenta." });
      } else {
        setFeedback({
          kind: "ok",
          text: `Cuenta creada para ${data.user?.name ?? email}. Se envió un correo con su contraseña temporal.`,
        });
        setName("");
        setEmail("");
        setRole("TECHNICIAN");
        router.refresh();
      }
    } catch {
      setFeedback({ kind: "error", text: "Error de conexión. Revisa que el servidor esté activo." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="form-stack">
      {feedback ? (
        <div className={`form-feedback ${feedback.kind}`}>{feedback.text}</div>
      ) : null}
      <div className="form-grid-3">
        <label className="form-field">
          <span>Nombre completo</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: María Gómez" required minLength={2} />
        </label>
        <label className="form-field">
          <span>Correo electrónico</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="maria@empresa.com" required />
        </label>
        <label className="form-field">
          <span>Permiso</span>
          <select value={role} onChange={(e) => setRole(e.target.value as "ADMIN" | "TECHNICIAN")}>
            <option value="TECHNICIAN">Técnico</option>
            <option value="ADMIN">Administrador</option>
          </select>
        </label>
      </div>
      <button type="submit" className="btn-primary" disabled={busy}>
        {busy ? <Loader2 size={15} className="spin" /> : <UserPlus size={15} />}
        Crear cuenta y enviar credenciales por correo
      </button>
    </form>
  );
}
