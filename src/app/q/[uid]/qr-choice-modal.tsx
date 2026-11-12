"use client";

import { BookOpen, CalendarClock, X } from "lucide-react";
import { useState } from "react";

export default function QrScanChoiceModal({ hasEquipment }: { hasEquipment: boolean }) {
  const [open, setOpen] = useState(true);

  function goTo(id: string) {
    setOpen(false);
    window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  }

  if (!open) return null;

  return (
    <div role="presentation" style={{ position: "fixed", inset: 0, zIndex: 10000, display: "grid", placeItems: "center", padding: 18, background: "rgba(8, 22, 42, .72)", backdropFilter: "blur(5px)" }}>
      <section role="dialog" aria-modal="true" aria-labelledby="qr-choice-title" style={{ width: "min(100%, 470px)", borderRadius: 22, padding: 26, background: "#fff", boxShadow: "0 24px 80px rgba(0,0,0,.28)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <span style={{ color: "#1456c0", fontSize: 11, fontWeight: 800, letterSpacing: 1.3 }}>SOPORTE IT · EQUIPO IDENTIFICADO</span>
          <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar opciones" style={{ border: 0, background: "#f1f5f9", borderRadius: 99, width: 34, height: 34, cursor: "pointer", color: "#475569" }}><X size={17} /></button>
        </div>
        <h1 id="qr-choice-title" style={{ margin: "15px 0 7px", color: "#102a43", fontSize: 24, lineHeight: 1.2 }}>¿Qué deseas hacer?</h1>
        <p style={{ margin: "0 0 22px", color: "#64748b", fontSize: 14, lineHeight: 1.55 }}>Selecciona una opción para continuar con la información de este equipo.</p>
        <button type="button" disabled={!hasEquipment} onClick={() => goTo("solicitar-visita")} style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", padding: 16, textAlign: "left", border: "1px solid #cbdcf7", borderRadius: 14, background: hasEquipment ? "#eff6ff" : "#f8fafc", color: hasEquipment ? "#1456c0" : "#94a3b8", cursor: hasEquipment ? "pointer" : "not-allowed", opacity: hasEquipment ? 1 : .7 }}>
          <span style={{ display: "grid", placeItems: "center", width: 44, height: 44, borderRadius: 12, background: "#dbeafe", flexShrink: 0 }}><CalendarClock size={22} /></span>
          <span><strong style={{ display: "block", fontSize: 15 }}>Solicitar visita técnica</strong><small style={{ display: "block", marginTop: 4, color: "#64748b", fontSize: 12 }}>{hasEquipment ? "Reportar una falla o coordinar soporte para este equipo." : "Disponible cuando el equipo tenga una ficha registrada."}</small></span>
        </button>
        <button type="button" onClick={() => goTo("informacion-equipo")} style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", padding: 16, marginTop: 11, textAlign: "left", border: "1px solid #e2e8f0", borderRadius: 14, background: "#fff", color: "#243b53", cursor: "pointer" }}>
          <span style={{ display: "grid", placeItems: "center", width: 44, height: 44, borderRadius: 12, background: "#f1f5f9", flexShrink: 0 }}><BookOpen size={22} /></span>
          <span><strong style={{ display: "block", fontSize: 15 }}>Leer información del equipo</strong><small style={{ display: "block", marginTop: 4, color: "#64748b", fontSize: 12 }}>Consultar datos técnicos, ubicación e historial.</small></span>
        </button>
      </section>
    </div>
  );
}
