import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (session?.role !== "ADMIN") return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const { id } = await params;
  try {
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "El nombre de la sucursal es obligatorio." }, { status: 400 });
    const sucursal = await prisma.branch.create({ data: { customerId: id, name, contactName: String(body.contactName ?? "").trim() || null, contactEmail: String(body.contactEmail ?? "").trim().toLowerCase() || null, contactPhone: String(body.contactPhone ?? "").trim() || null } });
    return NextResponse.json({ sucursal }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "No se pudo crear la sucursal." }, { status: 400 });
  }
}
