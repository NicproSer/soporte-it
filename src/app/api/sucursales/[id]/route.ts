import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function authorized() {
  const session = await getSession();
  return session?.role === "ADMIN";
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await authorized())) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const { id } = await params;
  try {
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "El nombre de la sucursal es obligatorio." }, { status: 400 });
    const sucursal = await prisma.branch.update({ where: { id }, data: {
      name,
      contactName: String(body.contactName ?? "").trim() || null,
      contactEmail: String(body.contactEmail ?? "").trim().toLowerCase() || null,
      contactPhone: String(body.contactPhone ?? "").trim() || null,
    } });
    return NextResponse.json({ sucursal });
  } catch {
    return NextResponse.json({ error: "No se pudo actualizar la sucursal." }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await authorized())) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const { id } = await params;
  try {
    const [equipmentCount, branch] = await Promise.all([
      prisma.equipment.count({ where: { branchId: id } }),
      prisma.branch.findUnique({ where: { id }, include: { sites: true } }),
    ]);
    if (!branch) return NextResponse.json({ error: "La sucursal no existe." }, { status: 404 });
    if (equipmentCount > 0) return NextResponse.json({ error: "No se puede eliminar esta sucursal porque tiene equipos asociados. Reasigna esos equipos primero." }, { status: 409 });
    await prisma.site.deleteMany({ where: { branchId: id } });
    await prisma.branch.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "No se pudo eliminar la sucursal." }, { status: 400 });
  }
}
