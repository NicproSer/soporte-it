import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, CalendarClock, ChevronLeft, ChevronRight, ClipboardList, Filter, MapPin, UserRound, Wrench } from "lucide-react";
import type { Prisma, VisitStatus } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import AcceptDateButton from "../accept-date-button";
import CloseTicketForm from "../close-ticket-form";
import ProposeDateForm from "../propose-date-form";
import VisitAssignmentSelect from "./visit-assignment-select";

export const dynamic = "force-dynamic";

const STATUS = [
  ["PENDING", "Pendiente"],
  ["PROPOSED", "Fecha propuesta"],
  ["AWAITING_CONFIRMATION", "Aceptada · Por confirmar"],
  ["RESCHEDULE_REQUESTED", "Reprogramación solicitada"],
  ["CONFIRMED", "Confirmada"],
  ["COMPLETED", "Completada"],
  ["REJECTED", "Rechazada"],
  ["CANCELLED", "Cancelada"],
] as const;

const statusMeta: Record<string, { label: string; tone: string }> = {
  PENDING: { label: "Pendiente", tone: "amber" },
  PROPOSED: { label: "Fecha propuesta", tone: "blue" },
  AWAITING_CONFIRMATION: { label: "Aceptada · Por confirmar", tone: "violet" },
  RESCHEDULE_REQUESTED: { label: "Reprogramación solicitada", tone: "blue" },
  CONFIRMED: { label: "Confirmada", tone: "green" },
  COMPLETED: { label: "Completada", tone: "gray" },
  REJECTED: { label: "Rechazada", tone: "red" },
  CANCELLED: { label: "Cancelada", tone: "gray" },
};

function formatDate(date: Date | null) {
  if (!date) return "Sin fecha";
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: process.env.APP_TIME_ZONE || "America/Caracas",
  }).format(date);
}

function buildQuery(params: Record<string, string>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => { if (value) query.set(key, value); });
  return query.toString();
}

export default async function VisitsManagementPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; from?: string; to?: string; page?: string; assigned?: string }>;
}) {
  const session = await getSession().catch(() => null);
  if (!session || !["ADMIN", "TECHNICIAN"].includes(session.role)) redirect("/login");

  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const selectedStatus = STATUS.some(([value]) => value === sp.status) ? sp.status! : "";
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from! : "";
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "") ? sp.to! : "";
  const assigned = session.role === "ADMIN" ? (sp.assigned ?? "") : "";
  const page = Math.max(1, Math.min(1000, Number.parseInt(sp.page ?? "1", 10) || 1));
  const pageSize = 30;

  const conditions: Prisma.VisitRequestWhereInput[] = [];
  if (session.role === "TECHNICIAN") conditions.push({ assignedToId: session.sub });
  if (selectedStatus) conditions.push({ status: selectedStatus as VisitStatus });
  if (assigned === "unassigned") conditions.push({ assignedToId: null });
  else if (/^[a-f0-9]{24}$/i.test(assigned)) conditions.push({ assignedToId: assigned });
  if (q) {
    conditions.push({
      OR: [
        { customerName: { contains: q, mode: "insensitive" } },
        { customerEmail: { contains: q, mode: "insensitive" } },
        { customerPhone: { contains: q, mode: "insensitive" } },
        { address: { contains: q, mode: "insensitive" } },
        { issueDescription: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  if (from || to) {
    const range: { gte?: Date; lte?: Date } = {};
    if (from) range.gte = new Date(`${from}T00:00:00.000Z`);
    if (to) range.lte = new Date(`${to}T23:59:59.999Z`);
    conditions.push({
      OR: [
        { AND: [{ status: "RESCHEDULE_REQUESTED" }, { customerSuggestedDate: range }] },
        { AND: [{ status: { not: "RESCHEDULE_REQUESTED" } }, { proposedDate: range }] },
        { AND: [{ status: { not: "RESCHEDULE_REQUESTED" } }, { proposedDate: null }, { preferredDate: range }] },
      ],
    });
  }
  const where: Prisma.VisitRequestWhereInput = conditions.length ? { AND: conditions } : {};

  const [visits, total, technicians, counts] = await Promise.all([
    prisma.visitRequest.findMany({
      where,
      orderBy: [{ proposedDate: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        equipment: { select: { name: true, location: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
        acceptedBy: { select: { id: true, name: true } },
      },
    }),
    prisma.visitRequest.count({ where }),
    session.role === "ADMIN"
      ? prisma.user.findMany({ where: { role: "TECHNICIAN" }, orderBy: { name: "asc" }, select: { id: true, name: true, email: true } })
      : Promise.resolve([]),
    prisma.visitRequest.groupBy({ by: ["status"], where: session.role === "TECHNICIAN" ? { assignedToId: session.sub } : {}, _count: { _all: true } }),
  ]);

  const countByStatus = new Map(counts.map((item) => [item.status, item._count._all]));
  const activeCount = (countByStatus.get("PENDING") ?? 0) +
    (countByStatus.get("PROPOSED") ?? 0) +
    (countByStatus.get("AWAITING_CONFIRMATION") ?? 0) +
    (countByStatus.get("RESCHEDULE_REQUESTED") ?? 0);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const common = { q, status: selectedStatus, from, to, assigned };

  return (
    <main className="main visits-page">
      <div className="topline">
        <div>
          <div className="eyebrow">Operaciones · Soporte técnico</div>
          <h1 className="h1">Gestión de visitas</h1>
          <p className="muted">Organiza solicitudes, asigna técnicos, confirma fechas y registra el cierre de cada servicio.</p>
        </div>
        <div className="visits-page-actions">
          <Link href="/calendario" className="home-login-button"><CalendarDays size={16} /> Ver calendario</Link>
          <span className="avatar" title={session.email}>{session.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}</span>
        </div>
      </div>

      <section className="visit-stats" aria-label="Resumen de visitas">
        <div className="card"><span className="metric-label">Solicitudes encontradas</span><strong className="metric-value">{total}</strong><span className="metric-foot">Con los filtros actuales</span></div>
        <div className="card"><span className="metric-label">Pendientes de gestión</span><strong className="metric-value">{activeCount}</strong><span className="metric-foot">Todas las solicitudes abiertas</span></div>
        <div className="card"><span className="metric-label">Confirmadas</span><strong className="metric-value">{countByStatus.get("CONFIRMED") ?? 0}</strong><span className="metric-foot">Visitas aprobadas</span></div>
        <div className="card"><span className="metric-label">Completadas</span><strong className="metric-value">{countByStatus.get("COMPLETED") ?? 0}</strong><span className="metric-foot">Servicios cerrados</span></div>
      </section>

      <section className="card">
        <div className="section-head">
          <div><h2 className="section-title"><Filter size={17} style={{ display: "inline", verticalAlign: "-3px", marginRight: 6 }} />Filtros y búsqueda</h2><p className="muted">Busca por cliente, correo, teléfono, dirección o descripción del problema.</p></div>
          <span className="pill blue">{total} resultado(s)</span>
        </div>
        <form method="get" className="visit-filters">
          <label>Buscar<input name="q" defaultValue={q} placeholder="Cliente, correo, dirección…" /></label>
          <label>Estado<select name="status" defaultValue={selectedStatus}><option value="">Todos los estados</option>{STATUS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Desde<input type="date" name="from" defaultValue={from} /></label>
          <label>Hasta<input type="date" name="to" defaultValue={to} /></label>
          {session.role === "ADMIN" ? <label>Técnico<select name="assigned" defaultValue={assigned}><option value="">Todos los técnicos</option><option value="unassigned">Sin asignar</option>{technicians.map((technician) => <option key={technician.id} value={technician.id}>{technician.name}</option>)}</select></label> : null}
          <div className="visit-filter-buttons"><button type="submit" className="generate-button"><Filter size={15} /> Aplicar</button><Link href="/dashboard/visitas" className="btn-ghost">Limpiar</Link></div>
        </form>
      </section>

      <section className="card visit-results">
        <div className="section-head">
          <div><h2 className="section-title"><ClipboardList size={18} style={{ display: "inline", verticalAlign: "-3px", marginRight: 6 }} />Solicitudes</h2><p className="muted">Página {page} de {pages} · {pageSize} por página</p></div>
          <Link href="/calendario" className="btn-ghost"><CalendarDays size={15} /> Agenda mensual</Link>
        </div>

        {visits.length === 0 ? (
          <div className="empty">No hay visitas que coincidan con estos filtros. Prueba cambiando el estado o limpiando la búsqueda.</div>
        ) : (
          <div className="visit-list">
            {visits.map((visit) => {
              const meta = statusMeta[visit.status] ?? { label: visit.status, tone: "gray" };
              const effectiveDate = visit.status === "RESCHEDULE_REQUESTED" ? visit.customerSuggestedDate : visit.proposedDate ?? visit.preferredDate;
              const confirmationDate = visit.status === "AWAITING_CONFIRMATION" ? visit.proposedDate : visit.customerSuggestedDate;
              const canConfirm = Boolean(confirmationDate) && (visit.status === "AWAITING_CONFIRMATION" || visit.status === "RESCHEDULE_REQUESTED");
              const canClose = visit.status === "CONFIRMED" && (!effectiveDate || effectiveDate <= new Date());
              const scheduledInFuture = visit.status === "CONFIRMED" && Boolean(effectiveDate && effectiveDate > new Date());
              const isClosed = ["COMPLETED", "CANCELLED", "REJECTED"].includes(visit.status);
              return (
                <article className="visit-management-card" key={visit.id}>
                  <div className="visit-management-main">
                    <div className="visit-card-heading">
                      <div>
                        <h3>{visit.customerName}</h3>
                        <div className="item-sub">{visit.customerEmail}{visit.customerPhone ? ` · ${visit.customerPhone}` : ""}</div>
                      </div>
                      <span className={`pill ${meta.tone}`}>{meta.label}</span>
                    </div>
                    <p className="visit-issue">{visit.issueDescription}</p>
                    <div className="visit-meta-grid">
                      <span><MapPin size={14} />{visit.address}</span>
                      <span><CalendarClock size={14} />{formatDate(effectiveDate)}</span>
                      <span><Wrench size={14} />{visit.equipment?.name ?? "Sin equipo asociado"}{visit.equipment?.location ? ` · ${visit.equipment.location}` : ""}</span>
                      <span><UserRound size={14} />{visit.assignedTo ? `Asignado a ${visit.assignedTo.name}` : "Sin técnico asignado"}</span>
                    </div>
                    {visit.customerSuggestedDate && visit.status === "RESCHEDULE_REQUESTED" ? <div className="visit-customer-note">Nueva fecha sugerida por el cliente: <strong>{formatDate(visit.customerSuggestedDate)}</strong>{visit.customerNote ? <span> · {visit.customerNote}</span> : null}</div> : null}
                    {visit.proposedMessage ? <div className="item-sub">Mensaje enviado al cliente: {visit.proposedMessage}</div> : null}
                    {visit.completionNotes ? <div className="visit-customer-note">Resultado: {visit.completionNotes}</div> : null}
                    <div className="visit-card-footer">
                      <span className="item-sub">Solicitud creada: {formatDate(visit.createdAt)}</span>
                      {visit.acceptedBy ? <span className="item-sub">Confirmada por: {visit.acceptedBy.name}</span> : null}
                    </div>
                  </div>
                  <div className="visit-management-actions">
                    {session.role === "ADMIN" ? <VisitAssignmentSelect visitId={visit.id} assignedToId={visit.assignedToId} technicians={technicians} /> : null}
                    {canConfirm ? <AcceptDateButton visitId={visit.id} suggestedDate={confirmationDate!.toISOString()} /> : null}
                    {session.role === "ADMIN" && !isClosed && !canClose && visit.status !== "AWAITING_CONFIRMATION" ? <ProposeDateForm visitId={visit.id} status={visit.status} customerName={visit.customerName} /> : null}
                    {canClose ? <CloseTicketForm visitId={visit.id} customerName={visit.customerName} needsEquipment={!visit.equipment} /> : null}
                    {scheduledInFuture ? <span className="item-sub">Visita programada. El cierre estará disponible después de la fecha agendada.</span> : null}
                    {isClosed ? <span className="item-sub">Esta solicitud está cerrada.</span> : null}
                    {visit.status === "CONFIRMED" ? <a className="btn-ghost small" href={`/api/visitas/${visit.id}/calendar`} download>Añadir al calendario (.ics)</a> : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {pages > 1 ? (
          <div className="visit-pagination">
            <span className="item-sub">Mostrando {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} de {total}</span>
            <div>
              {page > 1 ? <Link href={`/dashboard/visitas?${buildQuery({ ...common, page: String(page - 1) })}`} className="btn-ghost"><ChevronLeft size={15} /> Anterior</Link> : null}
              {page < pages ? <Link href={`/dashboard/visitas?${buildQuery({ ...common, page: String(page + 1) })}`} className="btn-ghost"><ChevronRight size={15} /> Siguiente</Link> : null}
            </div>
          </div>
        ) : null}
      </section>
      <p className="footer-note">Las visitas asignadas a tu usuario aparecen en tu panel de trabajo. La asignación y reasignación están reservadas a administradores.</p>
    </main>
  );
}
