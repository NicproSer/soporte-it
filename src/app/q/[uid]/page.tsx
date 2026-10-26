import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { CalendarDays, MapPin, PencilLine, ShieldCheck } from "lucide-react";
import { getSession } from "@/lib/auth";
import FichaForm from "./ficha-form";

export const dynamic = "force-dynamic";

function toDateInputValue(date: Date | null | undefined): string {
  if (!date) return "";
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default async function PublicEquipmentPage({ params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params;
  const [label, session] = await Promise.all([
    prisma.label.findUnique({ where: { uid }, include: { equipment: { include: { interventions: { orderBy: { performedAt: "desc" }, take: 10 } } } } }),
    getSession(),
  ]);
  if (!label || label.status === "RETIRED") notFound();
  const equipment = label.equipment;
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
        ownerName: (equipment as { ownerName?: string | null }).ownerName ?? "",
        ownerEmail: (equipment as { ownerEmail?: string | null }).ownerEmail ?? "",
        ownerPhone: (equipment as { ownerPhone?: string | null }).ownerPhone ?? "",
      }
    : undefined;
  return <main className="public-wrap"><article className="public-card"><header className="public-head"><strong>SOPORTE IT</strong><div style={{color:"#c7d8ec",fontSize:13,marginTop:7}}>Ficha técnica del equipo</div></header><div className="public-body"><div className="eyebrow">Etiqueta {label.code}</div><h1 className="h1" style={{fontSize:27}}>{equipment?.name ?? "Etiqueta pendiente de asignación"}</h1><p className="muted">{equipment ? "Información técnica disponible para consulta." : canEdit ? "Este sticker todavía no tiene un equipo asociado. Llena la ficha técnica para registrarlo ahora mismo." : "Este sticker todavía no tiene un equipo asociado. Contacta al administrador para completar el registro."}</p>{canEdit ? <section style={{marginTop:24}}><h2 className="section-title" style={{display:"flex",alignItems:"center",gap:8}}><PencilLine size={17} color="#1456c0"/> {equipment ? "Editar ficha técnica" : "Llenar ficha técnica"}</h2><div className="muted">Sesión de {session?.role === "ADMIN" ? "administrador" : "técnico"}: los cambios se guardan en la base de datos y se ven reflejados aquí mismo.</div><FichaForm uid={label.uid} initial={formInitial}/></section>:null}{equipment ? <><div className="field-grid" style={{marginTop:26}}><div><div className="field-label">Categoría</div><div className="field-value">{equipment.category}</div></div><div><div className="field-label">Estado</div><div className="field-value">{equipment.status === "ACTIVE" ? "Activo" : equipment.status === "MAINTENANCE" ? "En mantenimiento" : equipment.status === "REPLACED" ? "Reemplazado" : "Inactivo"}</div></div><div><div className="field-label">Marca</div><div className="field-value">{equipment.brand || "No especificada"}</div></div><div><div className="field-label">Modelo</div><div className="field-value">{equipment.model || "No especificado"}</div></div><div><div className="field-label">Instalación</div><div className="field-value">{equipment.installationAt ? equipment.installationAt.toLocaleDateString("es-ES") : "Sin registrar"}</div></div><div><div className="field-label">Ubicación</div><div className="field-value"><MapPin size={14} style={{display:"inline",verticalAlign:"-2px"}}/> {equipment.location || "No especificada"}</div></div></div><section style={{marginTop:30}}><h2 className="section-title">Historial de intervenciones</h2><p className="muted">Se mostrarán los mantenimientos que el administrador haya habilitado para consulta pública.</p>{equipment.interventions.length ? <div className="list" style={{marginTop:18}}>{equipment.interventions.map((item)=><div className="list-item" key={item.id}><div><div className="item-title">{item.type}</div><div className="item-sub">{item.description}</div><div className="item-sub"><CalendarDays size={12} style={{display:"inline",verticalAlign:"-2px"}}/> {item.performedAt.toLocaleDateString("es-ES")}</div></div></div>)}</div>:<div className="empty">Todavía no hay intervenciones registradas.</div>}</section></>:null}<div style={{borderTop:"1px solid #e2e8f0",marginTop:28,paddingTop:18,fontSize:12,color:"#68788b"}}><ShieldCheck size={14} style={{display:"inline",verticalAlign:"-2px",marginRight:5}}/>Identificador permanente: {label.code}</div></div></article></main>;
}
