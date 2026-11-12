import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import ClientesManager from "./clientes-manager";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/login");

  return <div className="shell shell-single">
    <main className="main">
      <div className="topline">
        <div>
          <div className="eyebrow">Panel de control</div>
          <h1 className="h1">Gestión de clientes</h1>
          <div className="muted">Administra clientes, sucursales, contactos y ubicaciones GPS.</div>
        </div>
        <a href="/dashboard" className="home-login-button" style={{textDecoration:"none"}}>← Volver al resumen</a>
      </div>
      <ClientesManager />
    </main>
  </div>;
}
