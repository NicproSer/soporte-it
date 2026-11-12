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
