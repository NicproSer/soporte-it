"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Loader2, Check, X } from "lucide-react";

type Props = {
  userId: string;
  initialName: string;
  initialEmail: string;
};

/** Edición en línea de nombre y correo desde la tabla de cuentas del panel. */
export function EditUserForm({ userId, initialName, initialEmail }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/usuarios", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action: "edit", name, email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFeedback(data.error ?? "No se pudo guardar.");
      } else {
        setEditing(false);
        setName(data.user?.name ?? name);
        setEmail(data.user?.email ?? email);
        router.refresh(); // recarga datos del servidor (tabla + cabecera con el nuevo nombre/correo)
      }
    } catch {
      setFeedback("Error de conexión.");
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    setName(initialName);
    setEmail(initialEmail);
    setFeedback(null);
    setEditing(false);
  }

  if (!editing) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => setEditing(true)}
          disabled={busy}
          title="Editar nombre y correo"
        >
          <Pencil size={13} /> Editar datos
        </button>
        {feedback ? <span style={{ fontSize: 11, color: "#8a5a00", lineHeight: 1.4 }}>{feedback}</span> : null}
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 210 }}
    >
      <input
        className="input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nombre completo"
        maxLength={120}
        required
        style={{ fontSize: 13, padding: "6px 8px" }}
      />
      <input
        className="input"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Correo electrónico"
        maxLength={160}
        required
        style={{ fontSize: 13, padding: "6px 8px" }}
      />
      <div style={{ display: "flex", gap: 6 }}>
        <button type="submit" className="btn-primary" disabled={busy} style={{ fontSize: 12, padding: "5px 10px" }}>
          {busy ? <Loader2 size={12} className="spin" /> : <Check size={12} />} Guardar
        </button>
        <button type="button" className="btn-ghost" onClick={cancel} disabled={busy} style={{ fontSize: 12, padding: "5px 10px" }}>
          <X size={12} /> Cancelar
        </button>
      </div>
      {feedback ? <span style={{ fontSize: 11, color: "#b00020", lineHeight: 1.4 }}>{feedback}</span> : null}
    </form>
  );
}
