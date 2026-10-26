import { redirect } from "next/navigation";
import { Building2, Cpu, Mail, PencilLine, Phone, Search } from "lucide-react";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import MobileNav from "../mobile-nav";

export const dynamic = "force-dynamic";

const equipmentStatusLabels: Record<string, string> = {
  ACTIVE: "Activo",
  MAINTENANCE: "En mantenimiento",
  INACTIVE: "Inactivo",
  REPLACED: "Reemplazado",
};

/**
 * Panel de administrador: clientes agrupados por correo con TODOS sus
 * dispositivos registrados (equipos + etiquetas + estado + solicitudes).
 */
export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/login");

  const { q } = await searchParams;
  const query = (q ?? "").trim();

  const where = query
    ? {
        OR: [
          { ownerName: { contains: query, mode: "insensitive" as const } },
          { ownerEmail: { contains: query, mode: "insensitive" as const } },
        ],
      }
    : { ownerEmail: { not: null as unknown as undefined } };

  const equipmentList = await prisma.equipment.findMany({
    where,
    orderBy: [{ ownerName: "asc" }, { createdAt: "desc" }],
    include: { label: true, visits: { orderBy: { createdAt: "desc" } } },
  });

  // Agrupar equipos por cliente (correo normalizado a minúsculas).
  const groups = new Map<string, { name: string; email: string; phone?: string | null; items: typeof equipmentList }>();
  for (const eq of equipmentList) {
    const key = (eq.ownerEmail ?? "sin-correo").toLowerCase();
    if (!groups.has(key)) {
      groups.set(key, { name: eq.ownerName ?? "Sin nombre", email: eq.ownerEmail ?? "—", phone: eq.ownerPhone, items: [] });
    }
    groups.get(key)!.items.push(eq);
    if (!groups.get(key)!.phone && eq.ownerPhone) groups.get(key)!.phone = eq.ownerPhone;
  }
  const clients = [...groups.entries()].sort((a, b) => b[1].items.length - a[1].items.length || a[1].name.localeCompare(b[1].name));

  return (
    <div className="shell">
      <MobileNav
        items={[
          { href: "/dashboard", icon: "▦", label: "Resumen" },
          { href: "/equipos", icon: "✎", label: "Fichas técnicas" },
          { href: "/dashboard#visitas", icon: "◷", label: "Visitas técnicas" },
        ]}
        sessionName={session.name}
        sessionEmail={session.email}
        sessionRole={session.role}
      />

      <aside className="sidebar">
        <div className="brand">SOPORTE IT<small>GESTIÓN TÉCNICA</small></div>
        <nav className="nav" aria-label="Navegación principal">
          <a href="/dashboard">▦ &nbsp; Resumen</a>
          <a className="active" href="/dashboard/clientes">◈ &nbsp; Clientes y dispositivos</a>
          <a href="/equipos">✎ &nbsp; Fichas técnicas</a>
          <a href="/dashboard#visitas">◷ &nbsp; Visitas técnicas</a>
        </nav>
        <div className="side-note">
          Sesión de administrador:<br />
          <strong style={{ color: "#fff" }}>{session.name}</strong><br />
          {session.email}
        </div>
      </aside>

      <main className="main">
        <div className="topline">
          <div>
            <div className="eyebrow">Panel de control</div>
            <h1 className="h1">Clientes y sus dispositivos</h1>
            <div className="muted">{clients.length} clientes · {equipmentList.length} equipos registrados.</div>
          </div>
          <a href="/dashboard" className="home-login-button" style={{ textDecoration: "none" }}>← Volver al resumen</a>
        </div>

        <form method="get" style={{ display: "flex", gap: 10, marginBottom: 20 }}>
          <input
            name="q"
            defaultValue={query}
            placeholder="Buscar por nombre o correo del cliente…"
            style={{ flex: 1, padding: "11px 14px", border: "1px solid #cbd5e1", borderRadius: 10, fontSize: 14, background: "#fff" }}
          />
          <button className="generate-button" type="submit" style={{ justifyContent: "center" }}><Search size={16} /> Buscar</button>
        </form>

        {clients.length === 0 ? (
          <div className="card"><div className="empty">Aún no hay clientes registrados. Al llenar una ficha técnica desde el QR, el nombre y correo del cliente aparecerán aquí con todos sus equipos.</div></div>
        ) : (
          clients.map(([email, client]) => {
            const openVisits = client.items.flatMap((eq) => eq.visits.filter((v) => ["PENDING", "PROPOSED", "RESCHEDULE_REQUESTED"].includes(v.status)));
            return (
              <section className="card" key={email} style={{ marginBottom: 18 }}>
                <div className="section-head">
                  <div>
                    <h2 className="section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Building2 size={18} color="#1456c0" /> {client.name}
                    </h2>
                    <div className="muted">
                      <Mail size={12} style={{ display: "inline", verticalAlign: "-2px", marginRight: 4 }} />{client.email}
                      {client.phone ? <> · <Phone size={12} style={{ display: "inline", verticalAlign: "-2px", marginRight: 4 }} />{client.phone}</> : null}
                    </div>
                  </div>
                  <span className="pill blue"><Cpu size={12} style={{ display: "inline", verticalAlign: "-2px", marginRight: 4 }} />{client.items.length} dispositivo{client.items.length !== 1 ? "s" : ""}</span>
                </div>
                {openVisits.length > 0 ? (
                  <div className="generate-status" style={{ marginBottom: 12 }}>⚠ {openVisits.length} solicitud(es) de visita abiertas para este cliente.</div>
                ) : null}
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr><th>Equipo</th><th>Categoría</th><th>Etiqueta</th><th>Ubicación</th><th>Estado</th><th>Solicitudes</th><th>Ficha</th></tr>
                    </thead>
                    <tbody>
                      {client.items.map((eq) => (
                        <tr key={eq.id}>
                          <td><strong>{eq.name}</strong>{eq.brand ? <div className="item-sub">{eq.brand} {eq.model ?? ""}</div> : null}</td>
                          <td>{eq.category}</td>
                          <td>{eq.label?.code ?? "—"}</td>
                          <td>{eq.location || "—"}</td>
                          <td><span className={`pill ${eq.status === "ACTIVE" ? "green" : ""}`}>{equipmentStatusLabels[eq.status] ?? eq.status}</span></td>
                          <td>{eq.visits.length}</td>
                          <td style={{ display: "flex", gap: 10, alignItems: "center" }}>
                            <a href={`/q/${eq.label?.uid}`} style={{ color: "#1456c0", fontWeight: 700, fontSize: 12 }}>Ver →</a>
                            {eq.label?.uid ? (
                              <a href={`/q/${eq.label.uid}?edit=1`} style={{ color: "#48607a", fontWeight: 700, fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4 }} title="Editar ficha y datos del cliente">
                                <PencilLine size={13} /> Editar
                              </a>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })
        )}
      </main>
    </div>
  );
}
