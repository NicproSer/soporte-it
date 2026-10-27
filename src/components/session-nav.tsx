import { getSession } from "@/lib/auth";
import MobileNav, { type MobileNavItem } from "@/app/dashboard/mobile-nav";

/**
 * Navegación móvil (bottom nav) disponible en TODAS las páginas del sistema,
 * pero únicamente cuando hay sesión iniciada como ADMIN o TECHNICIAN.
 * Se renderiza desde el layout raíz (server component): si no hay sesión o
 * JWT_SECRET no está configurado, simplemente no muestra nada.
 */
const items: MobileNavItem[] = [
  { href: "/dashboard", icon: "▦", label: "Resumen" },
  { href: "/dashboard#etiquetas", icon: "▧", label: "Etiquetas QR" },
  { href: "/dashboard#equipos", icon: "▣", label: "Equipos" },
  { href: "/dashboard#visitas", icon: "◷", label: "Visitas técnicas" },
  { href: "/dashboard#historial", icon: "☷", label: "Intervenciones" },
];

export default async function SessionNav() {
  let session;
  try {
    session = await getSession();
  } catch {
    return null; // JWT_SECRET ausente → sin menú
  }
  if (!session || (session.role !== "ADMIN" && session.role !== "TECHNICIAN")) {
    return null;
  }
  return <MobileNav items={items} sessionName={session.name} sessionEmail={session.email} sessionRole={session.role} />;
}
