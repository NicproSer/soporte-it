import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { SmtpAdminPanel } from "../actions";

export const dynamic = "force-dynamic";

export default async function EmailDiagnosticsPage() {
  const session = await getSession().catch(() => null);
  if (!session || session.role !== "ADMIN") redirect("/login");

  return (
    <main className="main">
      <div className="topline">
        <div>
          <div className="eyebrow">Administración · Infraestructura</div>
          <h1 className="h1">Diagnóstico DNS y SMTP</h1>
          <p className="muted">Consulta todas las comprobaciones de resolución DNS, conexión segura, autenticación y el historial de correos.</p>
        </div>
      </div>
      <SmtpAdminPanel compact={false} />
    </main>
  );
}
