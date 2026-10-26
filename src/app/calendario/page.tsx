import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { VisitRequest, VisitStatus } from "@prisma/client";

type VisitWithEquipment = VisitRequest & { equipment: { name: string; location: string | null } | null };

export const dynamic = "force-dynamic";

const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/** Fecha efectiva de la visita: confirmada > propuesta > preferida. */
function effectiveDate(v: VisitRequest): Date | null {
  if (v.status === "CONFIRMED" && v.proposedDate) return v.proposedDate;
  if (v.proposedDate) return v.proposedDate;
  return v.preferredDate ?? null;
}

const statusMeta: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Pendiente", cls: "amber" },
  PROPOSED: { label: "Propuesta enviada", cls: "blue" },
  RESCHEDULE_REQUESTED: { label: "Cliente sugiere otra fecha", cls: "blue" },
  CONFIRMED: { label: "Confirmada", cls: "green" },
  REJECTED: { label: "Rechazada", cls: "red" },
  CANCELLED: { label: "Cancelada", cls: "red" },
  COMPLETED: { label: "Completada", cls: "gray" },
};

function keyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const session = await getSession().catch(() => null);
  if (!session || (session.role !== "ADMIN" && session.role !== "TECHNICIAN")) redirect("/login");

  const sp = await searchParams;
  const now = new Date();
  const year = Math.min(2100, Math.max(2000, Number(sp.y) || now.getFullYear()));
  const monthParam = sp.m !== undefined ? Number(sp.m) : now.getMonth();
  const month = Math.min(11, Math.max(0, Number.isFinite(monthParam) ? monthParam : now.getMonth()));

  // Visitas con fecha asignada (preferida, propuesta o confirmada)
  const visits = await prisma.visitRequest.findMany({
    where: {
      status: { notIn: ["CANCELLED"] as VisitStatus[] },
      OR: [{ preferredDate: { not: null } }, { proposedDate: { not: null } }],
    },
    orderBy: { createdAt: "desc" },
    take: 500,
    include: { equipment: { select: { name: true, location: true } } },
  });

  // Agrupa por día (clave YYYY-MM-DD)
  const withEquip = visits as unknown as VisitWithEquipment[];
  const byDay = new Map<string, VisitWithEquipment[]>();
  for (const v of visits) {
    const d = effectiveDate(v);
    if (!d) continue;
    const k = keyOf(d);
    const arr = byDay.get(k) ?? [];
    arr.push(v);
    byDay.set(k, arr);
  }

  // Construcción de la grilla mensual (lunes a domingo)
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // días vacíos antes del 1
  const cells: (Date | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1))];
  while (cells.length % 7 !== 0) cells.push(null);

  const prev = month === 0 ? { y: year - 1, m: 11 } : { y: year, m: month - 1 };
  const next = month === 11 ? { y: year + 1, m: 0 } : { y: year, m: month + 1 };
  const todayKey = keyOf(new Date());
  const selectedRaw = typeof sp.d === "string" ? sp.d : todayKey;
  const selectedVisits = byDay.get(selectedRaw) ?? [];
  const upcoming = withEquip
    .map((v) => ({ v, d: effectiveDate(v)! }))
    .filter(({ d }) => d >= new Date(now.getFullYear(), now.getMonth(), now.getDate()))
    .sort((a, b) => a.d.getTime() - b.d.getTime())
    .slice(0, 6);

  const totalMonth = [...byDay.entries()]
    .filter(([k]) => k.startsWith(`${year}-${String(month + 1).padStart(2, "0")}-`))
    .reduce((acc, [, arr]) => acc + arr.length, 0);

  const [sy, sm, sd] = selectedRaw.split("-").map(Number);
  const selectedLabel = sy
    ? `${WEEKDAYS[(new Date(sy, sm - 1, sd).getDay() + 6) % 7]} ${sd} de ${MONTHS[sm - 1]} de ${sy}`
    : "Día seleccionado";

  return (
    <main className="cal-page">
      <div className="cal-topline">
        <div>
          <div className="eyebrow">Agenda técnica</div>
          <h1 className="h1">Calendario de visitas</h1>
          <p className="muted">{totalMonth} visita(s) programada(s) en {MONTHS[month]} {year}. Colores según estado · toca un día para ver el detalle.</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span className="avatar" title={session.email}>{session.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}</span>
          <Link href="/dashboard" className="btn-ghost">← Volver al panel</Link>
        </div>
      </div>

      <div className="cal-layout">
        {/* ======= Calendario mensual ======= */}
        <section className="card cal-card">
          <div className="cal-head">
            <a className="cal-arrow" href={`/calendario?y=${prev.y}&m=${prev.m}`} aria-label="Mes anterior">‹</a>
            <strong>{MONTHS[month]} {year}</strong>
            <a className="cal-arrow" href={`/calendario?y=${next.y}&m=${next.m}`} aria-label="Mes siguiente">›</a>
          </div>
          <div className="cal-grid cal-weekdays">
            {WEEKDAYS.map((w) => <span key={w}>{w}</span>)}
          </div>
          <div className="cal-grid">
            {cells.map((date, i) => {
              if (!date) return <span key={`e${i}`} className="cal-cell empty-cell" />;
              const k = keyOf(date);
              const dayVisits = byDay.get(k) ?? [];
              const isToday = k === todayKey;
              const isSelected = k === selectedRaw;
              return (
                <a
                  key={k}
                  href={`/calendario?y=${year}&m=${month}&d=${k}`}
                  className={`cal-cell ${isToday ? "today" : ""} ${isSelected ? "selected" : ""} ${dayVisits.length ? "has-visits" : ""}`}
                >
                  <span className="cal-daynum">{date.getDate()}</span>
                  {dayVisits.length > 0 && (
                    <span className="cal-dots">
                      {dayVisits.slice(0, 3).map((v) => <i key={v.id} className={`cal-dot ${statusMeta[v.status]?.cls ?? "blue"}`} />)}
                    </span>
                  )}
                </a>
              );
            })}
          </div>
          <div className="cal-legend">
            <span><i className="cal-dot amber" /> Pendiente</span>
            <span><i className="cal-dot blue" /> Propuesta / reagendada</span>
            <span><i className="cal-dot green" /> Confirmada</span>
            <span><i className="cal-dot red" /> Rechazada</span>
          </div>
        </section>

        {/* ======= Panel derecho: día seleccionado + próximas ======= */}
        <aside className="cal-side">
          <section className="card">
            <div className="section-head" style={{ marginBottom: 10 }}>
              <h2 className="section-title">{selectedLabel}</h2>
              <a className="btn-ghost small" href="/calendario">Hoy</a>
            </div>
            {selectedVisits.length === 0 ? (
              <div className="empty">No hay visitas agendadas este día.</div>
            ) : (
              <div className="list">
                {selectedVisits.map((v) => {
                  const d = effectiveDate(v)!;
                  const meta = statusMeta[v.status] ?? { label: v.status, cls: "blue" };
                  return (
                    <div key={v.id} className="list-item visit-item">
                      <div>
                        <div className="item-title">
                          {d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })} — {v.customerName}
                        </div>
                        <div className="item-sub">{v.issueDescription.slice(0, 90)}{v.issueDescription.length > 90 ? "…" : ""}</div>
                        <div className="item-sub">📍 {v.address}</div>
                        {v.equipment ? <div className="item-sub">🖥 {v.equipment.name}{v.equipment.location ? ` · ${v.equipment.location}` : ""}</div> : null}
                      </div>
                      <div style={{ textAlign: "right", display: "grid", gap: 6, justifyItems: "end" }}>
                        <span className={`pill ${meta.cls}`}>{meta.label}</span>
                        {v.status === "CONFIRMED" ? (
                          <a className="btn-ghost small" href={`/api/visitas/${v.id}/calendar`} download>📅 .ics</a>
                        ) : (
                          <Link className="btn-ghost small" href="/dashboard">Gestionar →</Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="card">
            <h2 className="section-title" style={{ marginBottom: 14 }}>Próximas visitas</h2>
            {upcoming.length === 0 ? (
              <div className="empty">Nada programado a partir de hoy.</div>
            ) : (
              <div className="list">
                {upcoming.map(({ v, d }) => {
                  const meta = statusMeta[v.status] ?? { label: v.status, cls: "blue" };
                  return (
                    <div key={v.id} className="list-item">
                      <div>
                        <div className="item-title">{d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" })} · {d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</div>
                        <div className="item-sub">{v.customerName} — {v.address}</div>
                      </div>
                      <span className={`pill ${meta.cls}`}>{meta.label}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
