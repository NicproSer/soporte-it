import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Soporte IT | Inventario y asistencia técnica",
  description: "Gestión de equipos, etiquetas QR permanentes e intervenciones técnicas.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
