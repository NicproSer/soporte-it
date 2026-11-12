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
    const address = String(body.address ?? "").trim();
    if (!name || !address) return NextResponse.json({ error: "Nombre y dirección del sitio son obligatorios." }, { status: 400 });
    const latitude = body.latitude === "" || body.latitude == null ? null : Number(body.latitude);
    const longitude = body.longitude === "" || body.longitude == null ? null : Number(body.longitude);
    if ((latitude !== null && !Number.isFinite(latitude)) || (longitude !== null && !Number.isFinite(longitude))) return NextResponse.json({ error: "Coordenadas GPS inválidas." }, { status: 400 });
    const sitio = await prisma.site.create({ data: { branchId: id, name, address, latitude, longitude, directions: String(body.directions ?? "").trim() || null } });
    return NextResponse.json({ sitio }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "No se pudo crear el sitio." }, { status: 400 });
  }
}
