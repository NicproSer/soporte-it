import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { EquipmentStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const STATUSES: EquipmentStatus[] = ["ACTIVE", "MAINTENANCE", "INACTIVE", "REPLACED"];

function toDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function cleanStr(value: unknown, max = 500): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

/**
 * POST /api/q/[uid]/ficha
 * Crea o actualiza la ficha técnica del equipo asociado a una etiqueta QR.
 * Solo permitida con sesión iniciada de ADMIN o TECHNICIAN (el escaneo del QR
 * por un visitante sin sesión puede VER la ficha, pero no editarla).
 */
export async function POST(request: Request, { params }: { params: Promise<{ uid: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Debes iniciar sesión para llenar la ficha técnica." }, { status: 401 });
  }

  const { uid } = await params;
  const label = await prisma.label.findUnique({ where: { uid } });
  if (!label) {
    return NextResponse.json({ error: "Etiqueta no encontrada." }, { status: 404 });
  }
  if (label.status === "RETIRED") {
    return NextResponse.json({ error: "Esta etiqueta fue retirada y ya no puede editarse." }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida (se esperaba JSON)." }, { status: 400 });
  }

  const name = cleanStr(body.name, 160);
  const category = cleanStr(body.category, 80);
  if (!name || !category) {
    return NextResponse.json({ error: "El nombre y la categoría del equipo son obligatorios." }, { status: 400 });
  }

  const rawStatus = cleanStr(body.status, 20)?.toUpperCase();
  const status: EquipmentStatus = (STATUSES as string[]).includes(rawStatus ?? "") ? (rawStatus as EquipmentStatus) : "ACTIVE";

  // Datos del cliente (propietario): obligatorios al registrar por primera vez.
  const ownerName = cleanStr(body.ownerName, 160);
  const rawOwnerEmail = cleanStr(body.ownerEmail, 160)?.toLowerCase();
  const emailOk = !!rawOwnerEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawOwnerEmail);
  if (!ownerName || !emailOk) {
    return NextResponse.json(
      { error: "El nombre y un correo válido del cliente son obligatorios." },
      { status: 400 },
    );
  }

  const data = {
    name,
    category,
    brand: cleanStr(body.brand, 80) ?? null,
    model: cleanStr(body.model, 120) ?? null,
    serialNumber: cleanStr(body.serialNumber, 120) ?? null,
    location: cleanStr(body.location, 200) ?? null,
    installationAt: toDate(body.installationAt),
    warrantyUntil: toDate(body.warrantyUntil),
    status,
    notes: cleanStr(body.notes, 2000) ?? null,
    ownerName,
    ownerEmail: rawOwnerEmail ?? null,
    ownerPhone: cleanStr(body.ownerPhone, 40) ?? null,
  };

  // upsert sobre labelId (campo único en Equipment)
  const existingEquipment = await prisma.equipment.findUnique({ where: { labelId: label.id } });
  const equipment = await prisma.equipment.upsert({
    where: { labelId: label.id },
    update: data,
    create: { labelId: label.id, ...data },
  });

  // La etiqueta pasa a ASIGNADA cuando ya tiene equipo registrado.
  if (label.status === "AVAILABLE") {
    await prisma.label.update({ where: { id: label.id }, data: { status: "ASSIGNED" } });
  }

  return NextResponse.json({ ok: true, created: !existingEquipment, equipmentId: equipment.id });
}
