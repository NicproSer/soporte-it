"use client";

import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { LogoutButton } from "./actions";

export type MobileNavItem = { href: string; icon: string; label: string };

type Props = {
  items: MobileNavItem[];
  sessionName: string;
  sessionEmail: string;
};

export default function MobileNav({ items, sessionName, sessionEmail }: Props) {
  const [open, setOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement | null>(null);

  // Cierra el menú al navegar (enlaces de ancla y de página)
  useEffect(() => {
    const close = () => setOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  // Bloquea el scroll del fondo mientras el cajón está abierto
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Esc para cerrar
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const initials = sessionName
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <>
      <header className="mobile-header">
        <button
          type="button"
          className="menu-toggle"
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={open}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
        <div className="brand">
          SOPORTE IT<small>GESTIÓN TÉCNICA</small>
        </div>
        <div className="avatar" title={sessionEmail}>
          {initials || "AD"}
        </div>
      </header>

      <div
        className={`drawer-backdrop ${open ? "show" : ""}`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      <div
        ref={drawerRef}
        className={`drawer ${open ? "open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Menú de navegación"
      >
        <nav className="nav" aria-label="Navegación principal móvil">
          {items.map((item) => (
            <a key={item.href} href={item.href}>
              <span className="nav-icon" aria-hidden="true">
                {item.icon}
              </span>{" "}
              &nbsp;{item.label}
            </a>
          ))}
        </nav>
        <div className="side-note" style={{ display: "block" }}>
          Sesión de administrador:<br />
          <strong style={{ color: "#fff" }}>{sessionName}</strong><br />
          {sessionEmail}
          <div style={{ marginTop: 12 }}>
            <LogoutButton />
          </div>
        </div>
      </div>
    </>
  );
}
