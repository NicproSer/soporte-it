import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import ScanPageClient from "./client";

export const dynamic = "force-dynamic";

/**
 * /scan — Escáner automático de etiquetas QR.
 * Solo accesible con sesión iniciada (ADMIN o TECHNICIAN): quien escanea
 * desde la app del sistema quiere abrir/editar la ficha; el público usa la
 * cámara nativa del teléfono sobre el QR y llega a /q/[uid] directamente.
 */
export default async function ScanPage() {
  let session;
  try {
    session = await getSession();
  } catch {
    session = null;
  }
  if (!session || (session.role !== "ADMIN" && session.role !== "TECHNICIAN")) {
    redirect("/login");
  }
  return <ScanPageClient />;
}
