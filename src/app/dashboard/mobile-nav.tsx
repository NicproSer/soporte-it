"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ScanLine, Users, Wallet } from "lucide-react";
import { LogoutButton } from "./actions";

/** Icono de QR simple en SVG (evita dependencias extra). */
function QrScannerIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
    </svg>
  );
}

export type MobileNavItem = { href: string; icon: string; label: string };

type BottomItem = { href: string; label: string; icon: React.ReactNode; match?: (path: string) => boolean };

type Props = {
  items: MobileNavItem[];
  sessionName: string;
  sessionEmail: string;
  sessionRole?: string;
};

/**
 * Navegación móvil estilo aplicación nativa: barra fija INFERIOR (bottom nav)
 * con hasta 5 secciones + un botón "Más" que abre una hoja (sheet) con el
 * resto de enlaces y la sesión. En escritorio no se renderiza nada.
 */
export default function MobileNav({ items, sessionName, sessionEmail, sessionRole }: Props) {
  const [moreOpen, setMoreOpen] = useState(false);
  const pathname = usePathname();

  // Cierra la hoja al navegar entre páginas
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  // Bloquea el scroll del fondo mientras la hoja está abierta
  useEffect(() => {
    document.body.style.overflow = moreOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [moreOpen]);

  // Esc para cerrar
  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMoreOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  const isHome = pathname === "/dashboard";
  const isActive = (href: string) => {
    if (href.startsWith("#")) return isHome; // anclas viven en /dashboard
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  // Secciones principales del bottom bar (máx. 4 + "Más").
  // Disponible en TODAS las páginas cuando hay sesión de ADMIN/TECHNICIAN.
  const primary: BottomItem[] = [
    { href: "/dashboard", label: "Panel", icon: <Wallet size={21} /> },
    { href: "/scan", label: "Escanear", icon: <ScanLine size={21} /> },
    { href: "/equipos", label: "Fichas", icon: <QrScannerIcon />, match: (p) => p === "/equipos" || p.startsWith("/q/") },
    { href: "/dashboard/clientes", label: "Clientes", icon: <Users size={21} /> },
  ];

  const secondary = items.filter((i) => !primary.some((p) => p.href === i.href));

  return (
    <>
      <header className="mobile-header">
        <div className="brand">
          SOPORTE IT<small>GESTIÓN TÉCNICA</small>
        </div>
        <a href="/scan" className="menu-toggle" aria-label="Escanear etiqueta QR" style={{ display: "flex", alignItems: "center", gap: 6, color: "#fff", fontSize: 13, textDecoration: "none" }}>
          <ScanLine size={20} /> Escanear
        </a>
        <div className="avatar" title={sessionEmail}>
          {sessionName.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "AD"}
        </div>
      </header>

      <nav className="bottom-nav" aria-label="Navegación principal móvil">
        {primary.map((item) => {
          const active = item.match ? item.match(pathname) : isActive(item.href);
          return (
            <a key={item.href} href={item.href} className={`bottom-item ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}>
              {item.icon}
              <span>{item.label}</span>
            </a>
          );
        })}
        <button
          type="button"
          className={`bottom-item ${moreOpen ? "active" : ""}`}
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen(true)}
        >
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" />
          </svg>
          <span>Más</span>
        </button>
      </nav>

      <div
        className={`sheet-backdrop ${moreOpen ? "show" : ""}`}
        onClick={() => setMoreOpen(false)}
        aria-hidden="true"
      />

      <div className={`sheet ${moreOpen ? "open" : ""}`} role="dialog" aria-modal="true" aria-label="Más opciones">
        <div className="sheet-handle" aria-hidden="true" />
        <div className="sheet-user">
          <div>
            <strong>{sessionName}</strong>
            <div style={{ fontSize: 12, color: "#b9cbe0" }}>{sessionEmail}</div>
          </div>
          <span className="pill blue">{sessionRole === "ADMIN" ? "Administrador" : sessionRole === "TECHNICIAN" ? "Técnico" : "Sesión"}</span>
        </div>
        <nav className="nav" aria-label="Secciones adicionales">
          {secondary.map((item) => (
            <a key={item.href} href={item.href}>
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>&nbsp;{item.label}
            </a>
          ))}
        </nav>
        <div style={{ marginTop: 14 }}>
          <LogoutButton />
        </div>
      </div>
    </>
  );
}
