import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function canRead() {
  const session = await getSession();
  return session?.role === "ADMIN" || session?.role === "TECHNICIAN";
}
async function admin() {
  const session = await getSession();
  return session?.role === "ADMIN";
}

export async function GET() {
  if (!(await canRead())) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const clientes = await prisma.customer.findMany({
    orderBy: { name: "asc" },
    include: { branches: { orderBy: { name: "asc" }, include: { sites: { orderBy: { name: "asc" } } } }, equipment: { select: { id: true, name: true, location: true, branchId: true, siteId: true } } },
  });
  return NextResponse.json({ clientes });
}

export async function POST(request: Request) {
  if (!(await admin())) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  try {
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!name || !email) return NextResponse.json({ error: "Nombre y correo principal son obligatorios." }, { status: 400 });
    const customer = await prisma.customer.create({ data: { name, email, phone: String(body.phone ?? "").trim() || null } });
    return NextResponse.json({ cliente: customer }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "No se pudo crear el cliente." }, { status: 400 });
  }
}
