"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";

type Props = {
  userId: string;
  currentRole: "ADMIN" | "TECHNICIAN";
  isSelf: boolean;
};

/** Acciones por cuenta: cambiar permiso y restablecer contraseña (envía correo). */
export function UserActions({ userId, currentRole, isSelf }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<"role" | "reset" | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function act(action: "role" | "reset") {
    setBusy(action);
    setFeedback(null);
    try {
      const body =
        action === "role"
          ? { userId, action, role: currentRole === "ADMIN" ? "TECHNICIAN" : "ADMIN" }
          : { userId, action };
      const res = await fetch("/api/admin/usuarios", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFeedback(data.error ?? "No se pudo completar la acción.");
      } else if (action === "reset") {
        setFeedback("Enlace de recuperación enviado al correo del usuario.");
      }
      router.refresh();
    } catch {
      setFeedback("Error de conexión.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => act("role")}
          disabled={busy !== null || (isSelf && currentRole === "ADMIN")}
          title={isSelf && currentRole === "ADMIN" ? "No puedes quitarte tu propio permiso" : undefined}
        >
          {busy === "role" ? <Loader2 size={13} className="spin" /> : <ShieldCheck size={13} />}
          {currentRole === "ADMIN" ? "Pasar a Técnico" : "Pasar a Admin"}
        </button>
        <button type="button" className="btn-ghost" onClick={() => act("reset")} disabled={busy !== null}>
          {busy === "reset" ? <Loader2 size={13} className="spin" /> : <KeyRound size={13} />}
          Resetear contraseña
        </button>
      </div>
      {feedback ? <span style={{ fontSize: 11, color: "#8a5a00", lineHeight: 1.4 }}>{feedback}</span> : null}
    </div>
  );
}
