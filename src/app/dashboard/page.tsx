import { redirect } from "next/navigation";
import {
  CalendarClock,
  ClipboardList,
  Cpu,
  MapPin,
  QrCode,
  ScanLine,
  ShieldCheck,
  Tags,
  UserRound,
  Wrench,
} from "lucide-react";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { GenerateLabelsButton, LogoutButton } from "./actions";
import ProposeDateForm from "./propose-date-form";

export const dynamic = "force-dynamic";

const visitStatusLabels: Record<string, string> = {
  PENDING: "Pendiente",
  PROPOSED: "Fecha propuesta",
  REJECTED: "Rechazada",
  CONFIRMED: "Confirmada",
  RESCHEDULE_REQUESTED: "Reprogramación solicitada",
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
};

const equipmentStatusLabels: Record<string, string> = {
  ACTIVE: "Activo",
  MAINTENANCE: "En mantenimiento",
  INACTIVE: "Inactivo",
  REPLACED: "Reemplazado",
};

const labelStatusLabels: Record<string, string> = {
  AVAILABLE: "Disponible",
  ASSIGNED: "Asignada",
  RETIRED: "Retirada",
};

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/login");

  const [availableLabels, totalLabels, equipmentCount, pendingVisits, interventionCount, recentVisits, equipmentList, labelList] =
    await Promise.all([
      prisma.label.count({ where: { status: "AVAILABLE" } }),
      prisma.label.count(),
      prisma.equipment.count(),
      prisma.visitRequest.count({ where: { status: { in: ["PENDING", "PROPOSED", "RESCHEDULE_REQUESTED"] } } }),
      prisma.intervention.count(),
      prisma.visitRequest.findMany({ orderBy: { createdAt: "desc" }, take: 6, include: { equipment: true } }),
      prisma.equipment.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { label: true } }),
      prisma.label.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
    ]);

  const metrics = [
    { label: "Etiquetas disponibles", value: String(availableLabels), foot: `${totalLabels} etiquetas en total`, icon: Tags },
    { label: "Equipos registrados", value: String(equipmentCount), foot: "Actualizado desde la base de datos", icon: Cpu },
    { label: "Visitas pendientes", value: String(pendingVisits), foot: "Solicitudes por revisar", icon: CalendarClock },
    { label: "Intervenciones", value: String(interventionCount), foot: "Mantenimientos registrados", icon: Wrench },
  ];

  const initials = session.name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">SOPORTE IT<small>GESTIÓN TÉCNICA</small></div>
        <nav className="nav" aria-label="Navegación principal">
          <a className="active" href="#inicio">▦ &nbsp; Resumen</a>
          <a href="#etiquetas">▧ &nbsp; Etiquetas QR</a>
          <a href="#equipos">▣ &nbsp; Equipos</a>
          <a href="#visitas">◷ &nbsp; Visitas técnicas</a>
          <a href="#historial">☷ &nbsp; Intervenciones</a>
        </nav>
        <div className="side-note">
          Sesión de administrador:<br />
          <strong style={{ color: "#fff" }}>{session.name}</strong><br />
          {session.email}
          <div style={{ marginTop: 12 }}><LogoutButton /></div>
        </div>
      </aside>

      <main className="main" id="inicio">
        <div className="topline">
          <div>
            <div className="eyebrow">Panel de control</div>
            <h1 className="h1">Resumen general</h1>
            <div className="muted">Bienvenido, {session.name}. Datos en tiempo real desde la base de datos.</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="avatar" title={session.email}>{initials || "AD"}</div>
          </div>
        </div>

        <section className="cards" aria-label="Indicadores">
          {metrics.map(({ label, value, foot, icon: Icon }) => (
            <div className="card" key={label}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="metric-label">{label}</span>
                <Icon size={19} color="#1456c0" />
              </div>
              <div className="metric-value">{value}</div>
              <div className="metric-foot">{foot}</div>
            </div>
          ))}
        </section>

        <section className="card" id="etiquetas" style={{ marginBottom: 18 }}>
          <div className="section-head">
            <div>
              <h2 className="section-title">Generar etiquetas QR</h2>
              <div className="muted">Crea un lote de stickers y descarga el PDF para imprimir. Un solo clic, sin comandos npm.</div>
            </div>
            <ScanLine size={20} color="#1456c0" />
          </div>
          <GenerateLabelsButton />
        </section>

        <div className="content-grid">
          <section className="card" id="visitas">
            <div className="section-head">
              <div>
                <h2 className="section-title">Solicitudes recientes</h2>
                <div className="muted">Seguimiento de visitas técnicas</div>
              </div>
              <span className="pill">{pendingVisits} pendientes</span>
            </div>
            {recentVisits.length ? (
              <div className="list">
                {recentVisits.map((visit) => (
                  <div className="list-item" key={visit.id} style={{ flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 220 }}>
                      <div className="item-title">{visit.customerName} · {visit.issueDescription.slice(0, 80)}</div>
                      <div className="item-sub"><UserRound size={12} style={{ display: "inline", verticalAlign: "-2px" }} /> {visit.customerEmail}{visit.customerPhone ? ` · ${visit.customerPhone}` : ""}</div>
                      <div className="item-sub"><MapPin size={12} style={{ display: "inline", verticalAlign: "-2px" }} /> {visit.address}</div>
                      {visit.preferredDate ? <div className="item-sub"><CalendarClock size={12} style={{ display: "inline", verticalAlign: "-2px" }} /> Prefiere: {visit.preferredDate.toLocaleDateString("es-ES")}</div> : null}
                      {visit.proposedDate ? <div className="item-sub"><CalendarClock size={12} style={{ display: "inline", verticalAlign: "-2px" }} /> Propuesta enviada: {visit.proposedDate.toLocaleDateString("es-ES")} {visit.proposedDate.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</div> : null}
                      {visit.customerSuggestedDate ? <div className="item-sub" style={{ color: "#b3261e" }}><CalendarClock size={12} style={{ display: "inline", verticalAlign: "-2px" }} /> Cliente sugiere: {visit.customerSuggestedDate.toLocaleDateString("es-ES")} {visit.customerSuggestedDate.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}{visit.customerNote ? ` — “${visit.customerNote}”` : ""}</div> : null}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span className={`pill ${visit.status === "COMPLETED" || visit.status === "CONFIRMED" ? "green" : visit.status === "REJECTED" ? "red" : visit.status === "PROPOSED" ? "blue" : ""}`}>
                        {visitStatusLabels[visit.status] ?? visit.status}
                      </span>
                      <div style={{ marginTop: 8 }}>
                        <ProposeDateForm visitId={visit.id} status={visit.status} customerName={visit.customerName} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty">Aún no hay solicitudes de visita técnica. Cuando un cliente use la página pública <a href="/solicitar" style={{ color: "#1456c0", fontWeight: 700 }}>/solicitar</a>, aparecerá aquí y recibirás aviso por correo.</div>
            )}
          </section>

          <section className="card" id="equipos">
            <div className="section-head">
              <div>
                <h2 className="section-title">Equipos registrados</h2>
                <div className="muted">Últimos equipos con etiqueta asignada</div>
              </div>
              <Cpu size={20} color="#1456c0" />
            </div>
            {equipmentList.length ? (
              <div className="list">
                {equipmentList.map((eq) => (
                  <div className="list-item" key={eq.id}>
                    <div>
                      <div className="item-title">{eq.name}</div>
                      <div className="item-sub">{eq.category}{eq.brand ? ` · ${eq.brand}` : ""}{eq.model ? ` ${eq.model}` : ""}</div>
                      <div className="item-sub">{eq.label?.code} · {eq.location || "Sin ubicación"}</div>
                    </div>
                    <span className={`pill ${eq.status === "ACTIVE" ? "green" : ""}`}>{equipmentStatusLabels[eq.status] ?? eq.status}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty">Todavía no hay equipos registrados. Regístralos al asignar una etiqueta impresa.</div>
            )}
          </section>
        </div>

        <section className="card" id="historial" style={{ marginTop: 18 }}>
          <div className="section-head">
            <div>
              <h2 className="section-title">Etiquetas generadas recientemente</h2>
              <div className="muted">Identificadores permanentes creados en la base de datos</div>
            </div>
            <ClipboardList size={20} color="#1456c0" />
          </div>
          {labelList.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Código</th><th>Estado</th><th>Lote</th><th>Creada</th></tr>
                </thead>
                <tbody>
                  {labelList.map((label) => (
                    <tr key={label.id}>
                      <td><strong>{label.code}</strong></td>
                      <td><span className={`pill ${label.status === "AVAILABLE" ? "green" : "blue"}`}>{labelStatusLabels[label.status]}</span></td>
                      <td>{label.batchId ?? "—"}</td>
                      <td>{label.createdAt.toLocaleDateString("es-ES")} {label.createdAt.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty">No hay etiquetas todavía. Usa el botón “Generar etiquetas” para crear tu primer lote.</div>
          )}
        </section>

        <section className="qr-panel" id="qr-info">
          <div>
            <h2>Etiquetas QR permanentes</h2>
            <p>
              Genera una vez, imprime y asigna cada etiqueta cuando instales un equipo.<br />
              Los datos podrán cambiar sin alterar la dirección del QR.
            </p>
          </div>
          <QrCode className="qr-icon" size={52} />
        </section>

        <div className="footer-note">
          <ShieldCheck size={14} style={{ display: "inline", verticalAlign: "-2px", marginRight: 5 }} />
          Panel de administrador autenticado. Las acciones están conectadas a la base de datos.
        </div>
      </main>
    </div>
  );
}
