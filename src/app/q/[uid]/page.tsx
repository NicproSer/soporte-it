import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { CalendarClock, CalendarDays, MapPin, PencilLine, ShieldCheck } from "lucide-react";
import { getSession } from "@/lib/auth";
import FichaForm from "./ficha-form";
import RequestVisitForm from "./request-visit-form";

export const dynamic = "force-dynamic";

/** Historial combinado (intervenciones + solicitudes de visita) como línea de tiempo vertical. */
type TimelineItem = { date: Date; kind: "INTERVENCIÓN" | "SOLICITUD DE VISITA" | "VISITA CONFIRMADA" | "VISITA RECHAZADA"; title: string; detail?: string };

async function getEquipmentWithHistory(uid: string) {
  const label = await prisma.label.findUnique({
    where: { uid },
    include: {
      equipment: {
        include: {
          interventions: { orderBy: { performedAt: "desc" } },
          visits: { orderBy: { createdAt: "desc" } },
        },
      },
    },
  });
  return label;
}

type EquipmentWithHistory = NonNullable<Awaited<ReturnType<typeof getEquipmentWithHistory>>>["equipment"];

function buildTimeline(equipment: NonNullable<EquipmentWithHistory>): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const i of equipment.interventions) {
    items.push({ date: i.performedAt, kind: "INTERVENCIÓN", title: i.type, detail: i.description });
  }
  for (const v of equipment.visits) {
    items.push({
      date: v.createdAt,
      kind: "SOLICITUD DE VISITA",
      title: `Solicitud de ${v.contactName ?? v.customerName}`,
      detail: `${v.issueDescription}${v.proposedDate ? ` · Fecha propuesta: ${v.proposedDate.toLocaleDateString("es-ES")}` : ""}`,
    });
    if ((v.status === "CONFIRMED" || v.status === "COMPLETED") && v.proposedDate) {
      items.push({ date: v.proposedDate, kind: "VISITA CONFIRMADA", title: "Visita técnica agendada", detail: v.address });
    }
    if (v.status === "REJECTED") {
      items.push({ date: v.updatedAt, kind: "VISITA RECHAZADA", title: "Visita rechazada", detail: v.customerNote ?? undefined });
    }
  }
  return items.sort((a, b) => b.date.getTime() - a.date.getTime());
}

function toDateInputValue(date: Date | null | undefined): string {
  if (!date) return "";
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default async function PublicEquipmentPage({ params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params;
  const [label, session] = await Promise.all([getEquipmentWithHistory(uid), getSession()]);
  if (!label || label.status === "RETIRED") notFound();
  const equipment = label.equipment;
  const timeline = equipment ? buildTimeline(equipment) : [];
  // Con sesión de ADMIN o TECHNICIAN se puede llenar/editar la ficha técnica
  // directamente desde el escaneo del QR. Sin sesión, la página es solo lectura.
  const canEdit = !!session && (session.role === "ADMIN" || session.role === "TECHNICIAN");
  const formInitial = equipment
    ? {
        name: equipment.name,
        category: equipment.category,
        brand: equipment.brand ?? "",
        model: equipment.model ?? "",
        serialNumber: equipment.serialNumber ?? "",
        location: equipment.location ?? "",
        installationAt: toDateInputValue(equipment.installationAt),
        warrantyUntil: toDateInputValue(equipment.warrantyUntil),
        status: equipment.status,
        notes: equipment.notes ?? "",
        ownerName: equipment.ownerName ?? "",
        ownerEmail: equipment.ownerEmail ?? "",
        ownerPhone: equipment.ownerPhone ?? "",
      }
    : undefined;
  return (
    <main className="public-wrap">
      <article className="public-card">
        <header className="public-head">
          <strong>SOPORTE IT</strong>
          <div style={{ color: "#c7d8ec", fontSize: 13, marginTop: 7 }}>Ficha técnica del equipo</div>
        </header>
        <div className="public-body">
          <div className="eyebrow">Etiqueta {label.code}</div>
          <h1 className="h1" style={{ fontSize: 27 }}>{equipment?.name ?? "Etiqueta pendiente de asignación"}</h1>
          <p className="muted">
            {equipment
              ? equipment.ownerName
                ? <>Equipo de <strong>{equipment.ownerName}</strong>. Información técnica disponible para consulta y solicitud de visita.</>
                : "Información técnica disponible para consulta."
              : canEdit
                ? "Este sticker todavía no tiene un equipo asociado. Llena la ficha técnica para registrarlo ahora mismo."
                : "Este sticker todavía no tiene un equipo asociado. Contacta al administrador para completar el registro."}
          </p>

          {canEdit ? (
            <section style={{ marginTop: 24 }}>
              <h2 className="section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <PencilLine size={17} color="#1456c0" /> {equipment ? "Editar ficha técnica" : "Llenar ficha técnica"}
              </h2>
              <div className="muted">Sesión de {session?.role === "ADMIN" ? "administrador" : "técnico"}: los cambios se guardan en la base de datos y se ven reflejados aquí mismo.</div>
              <FichaForm uid={label.uid} initial={formInitial} />
            </section>
          ) : null}

          {equipment ? (
            <>
              <div className="field-grid" style={{ marginTop: 26 }}>
                <div><div className="field-label">Cliente</div><div className="field-value">{equipment.ownerName || "Sin registrar"}</div></div>
                <div><div className="field-label">Correo del cliente</div><div className="field-value">{equipment.ownerEmail || "Sin registrar"}</div></div>
                <div><div className="field-label">Categoría</div><div className="field-value">{equipment.category}</div></div>
                <div><div className="field-label">Estado</div><div className="field-value">{equipment.status === "ACTIVE" ? "Activo" : equipment.status === "MAINTENANCE" ? "En mantenimiento" : equipment.status === "REPLACED" ? "Reemplazado" : "Inactivo"}</div></div>
                <div><div className="field-label">Marca</div><div className="field-value">{equipment.brand || "No especificada"}</div></div>
                <div><div className="field-label">Modelo</div><div className="field-value">{equipment.model || "No especificado"}</div></div>
                <div><div className="field-label">Instalación</div><div className="field-value">{equipment.installationAt ? equipment.installationAt.toLocaleDateString("es-ES") : "Sin registrar"}</div></div>
                <div><div className="field-label">Ubicación</div><div className="field-value"><MapPin size={14} style={{ display: "inline", verticalAlign: "-2px" }} /> {equipment.location || "No especificada"}</div></div>
              </div>

              {/* Cualquier persona que escanee el QR puede pedir la visita:
                  el cliente ya viene vinculado desde la ficha técnica. */}
              <section style={{ marginTop: 30 }}>
                <h2 className="section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <CalendarClock size={17} color="#1456c0" /> ¿Necesitas soporte para este equipo?
                </h2>
                <p className="muted" style={{ marginBottom: 14 }}>
                  Escanea, completa tus datos de contacto y envía la solicitud. Quedará vinculada a la etiqueta {label.code} y te propondremos un día por correo.
                </p>
                <RequestVisitForm
                  uid={label.uid}
                  equipmentId={equipment.id}
                  labelCode={label.code}
                  equipmentName={equipment.name}
                  ownerName={equipment.ownerName}
                  ownerEmail={equipment.ownerEmail}
                  location={equipment.location}
                />
              </section>

              <section style={{ marginTop: 30 }}>
                <h2 className="section-title">Historial del equipo</h2>
                <p className="muted">Intervenciones y solicitudes de visita en orden cronológico.</p>
                {timeline.length ? (
                  <ol className="timeline" style={{ marginTop: 18 }}>
                    {timeline.map((item, i) => (
                      <li className={`timeline-item${i === timeline.length - 1 ? " last" : ""}`} key={`${item.kind}-${item.date.toISOString()}-${i}`}>
                        <span className={`timeline-dot ${item.kind === "VISITA CONFIRMADA" ? "green" : item.kind === "VISITA RECHAZADA" ? "red" : ""}`} />
                        <div className="timeline-body">
                          <div className="timeline-kind">{item.kind}</div>
                          <div className="item-title">{item.title}</div>
                          {item.detail ? <div className="item-sub">{item.detail}</div> : null}
                          <div className="item-sub"><CalendarDays size={12} style={{ display: "inline", verticalAlign: "-2px" }} /> {item.date.toLocaleDateString("es-ES")} · {item.date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</div>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="empty">Todavía no hay intervenciones ni solicitudes registradas para este equipo.</div>
                )}
              </section>
            </>
          ) : null}

          <div style={{ borderTop: "1px solid #e2e8f0", marginTop: 28, paddingTop: 18, fontSize: 12, color: "#68788b" }}>
            <ShieldCheck size={14} style={{ display: "inline", verticalAlign: "-2px", marginRight: 5 }} />
            Identificador permanente: {label.code}
          </div>
        </div>
      </article>
    </main>
  );
}
