import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Lista ligera de dispositivos (id, nombre, código de etiqueta y ubicación)
 * para los selectores del dashboard: enlazar un equipo a un ticket al
 * cerrarlo, buscar por cliente, etc. Requiere sesión ADMIN o TECHNICIAN.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "TECHNICIAN")) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limite = Math.min(Math.max(Number(searchParams.get("limite") ?? 300) || 300, 1), 1000);
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();

  const equipos = await prisma.equipment.findMany({
    orderBy: { createdAt: "desc" },
    take: limite,
    select: {
      id: true,
      name: true,
      location: true,
      label: { select: { code: true } },
    },
  });

  const list = equipos
    .map((e) => ({ id: e.id, name: e.name, code: e.label?.code ?? undefined, location: e.location }))
    .filter((e) => {
      if (!q) return true;
      return (
        e.name.toLowerCase().includes(q) ||
        (e.code ?? "").toLowerCase().includes(q) ||
        (e.location ?? "").toLowerCase().includes(q)
      );
    });

  return NextResponse.json({ equipos: list });
}
