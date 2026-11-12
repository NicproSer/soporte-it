import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (session?.role !== "ADMIN") return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const { id } = await params;
  try {
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!name || !email) return NextResponse.json({ error: "Nombre y correo principal son obligatorios." }, { status: 400 });
    const cliente = await prisma.customer.update({ where: { id }, data: { name, email, phone: String(body.phone ?? "").trim() || null } });
    return NextResponse.json({ cliente });
  } catch {
    return NextResponse.json({ error: "No se pudo actualizar el cliente." }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (session?.role !== "ADMIN") return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const { id } = await params;
  try {
    const [equipmentCount, customer] = await Promise.all([
      prisma.equipment.count({ where: { customerId: id } }),
      prisma.customer.findUnique({ where: { id }, include: { branches: { include: { sites: true } } } }),
    ]);
    if (!customer) return NextResponse.json({ error: "El cliente no existe." }, { status: 404 });
    if (equipmentCount > 0) return NextResponse.json({ error: "No se puede eliminar este cliente porque tiene equipos asociados. Reasigna esos equipos primero." }, { status: 409 });
    const branchIds = customer.branches.map((branch) => branch.id);
    await prisma.site.deleteMany({ where: { branchId: { in: branchIds } } });
    await prisma.branch.deleteMany({ where: { customerId: id } });
    await prisma.customer.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "No se pudo eliminar el cliente." }, { status: 400 });
  }
}
