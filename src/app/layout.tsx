import type { Metadata } from "next";
import "./globals.css";
import SessionNav from "@/components/session-nav";

export const metadata: Metadata = {
  title: "Soporte IT | Inventario y asistencia técnica",
  description: "Gestión de equipos, etiquetas QR permanentes e intervenciones técnicas.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>
        {/* Bottom nav móvil: se muestra en TODAS las páginas solo si hay
            sesión iniciada como administrador o técnico */}
        <SessionNav />
        {children}
      </body>
    </html>
  );
}
