import { redirect } from "next/navigation";
import Link from "next/link";
import { Search, ShieldCheck } from "lucide-react";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LogoutButton } from "../dashboard/actions";

export const dynamic = "force-dynamic";

const labelStatusLabels: Record<string, string> = {
  AVAILABLE: "Disponible",
  ASSIGNED: "Asignada",
  RETIRED: "Retirada",
};

/**
 * /equipos — área de trabajo para usuarios autenticados (ADMIN o TECHNICIAN).
 * Permite buscar una etiqueta por su código (el que viene bajo el QR) y abrir
 * su ficha técnica para llenarla/editarla. El escaneo del QR lleva directo a
 * /q/[uid]; esta página es la alternativa cuando no se tiene la cámara a mano.
 */
export default async function EquiposPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { q } = await searchParams;
  const query = (q ?? "").trim();

  const labels = query
    ? await prisma.label.findMany({
        where: {
          OR: [
            { code: { contains: query, mode: "insensitive" } },
            ...(query.length >= 10 && query.length <= 32 ? [{ uid: query }] : []),
          ],
        },
        include: { equipment: true },
        orderBy: { createdAt: "desc" },
        take: 15,
      })
    : await prisma.label.findMany({
        include: { equipment: true },
        orderBy: { createdAt: "desc" },
        take: 15,
      });

  return (
    <main className="public-wrap" style={{ display: "block", placeItems: "initial", padding: 0 }}>
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "34px 20px" }}>
        <div className="topline">
          <div>
            <div className="eyebrow">Gestión en terreno</div>
            <h1 className="h1">Fichas técnicas por etiqueta</h1>
            <div className="muted">
              Sesión de {session.role === "ADMIN" ? "administrador" : "técnico"} ({session.name}). Escanea el QR de un equipo o busca el código de etiqueta para llenar su ficha técnica.
            </div>
          </div>
          <LogoutButton />
        </div>

        <section className="card" style={{ marginBottom: 18 }}>
          <form method="GET" action="/equipos" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input
              name="q"
              defaultValue={query}
              placeholder="Buscar por código de etiqueta (ej. ST-XXXXXX)…"
              style={{ flex: 1, minWidth: 220, padding: "11px 14px", border: "1px solid #cbd5e1", borderRadius: 10, fontSize: 14 }}
            />
            <button
              type="submit"
              style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#1456c0", color: "#fff", fontWeight: 700, fontSize: 14, border: 0, borderRadius: 10, padding: "11px 18px", cursor: "pointer" }}
            >
              <Search size={16} /> Buscar
            </button>
          </form>
          <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
            Consejo: desde el celular, usa la cámara para escanear el sticker. Si iniciaste sesión aquí en el navegador, la ficha se podrá llenar directamente al abrir el enlace del QR.
          </div>
        </section>

        <section className="card">
          <div className="section-head">
            <div>
              <h2 className="section-title">{query ? `Resultados para “${query}”` : "Etiquetas más recientes"}</h2>
              <div className="muted">Toca una etiqueta para ver o llenar su ficha técnica.</div>
            </div>
          </div>
          {labels.length ? (
            <div className="list">
              {labels.map((label) => (
                <div className="list-item" key={label.id}>
                  <div>
                    <div className="item-title">{label.equipment ? label.equipment.name : "Sin equipo asignado"}</div>
                    <div className="item-sub">{label.code}{label.equipment?.category ? ` · ${label.equipment.category}` : ""}{label.equipment?.location ? ` · ${label.equipment.location}` : ""}</div>
                  </div>
                  <div style={{ textAlign: "right", display: "grid", gap: 6, justifyItems: "end" }}>
                    <span className={`pill ${label.status === "AVAILABLE" ? "green" : "blue"}`}>{labelStatusLabels[label.status]}</span>
                    <Link href={`/q/${label.uid}`} style={{ fontSize: 12, fontWeight: 700, color: "#1456c0" }}>
                      {label.equipment ? "Ver / editar ficha →" : "Llenar ficha →"}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">No se encontró ninguna etiqueta con ese código. Verifica que esté bien escrito (va bajo el QR, ej. ST-1A2B3C4D).</div>
          )}
        </section>

        <div className="footer-note">
          <ShieldCheck size={14} style={{ display: "inline", verticalAlign: "-2px", marginRight: 5 }} />
          Solo usuarios autenticados pueden editar fichas. Los visitantes sin sesión ven la información en modo lectura.
        </div>
      </div>
    </main>
  );
}
