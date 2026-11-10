import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const schema = z.object({
  userId: z.string().regex(/^[a-f0-9]{24}$/i).nullable(),
});

/** Asigna o desasigna una visita a un técnico. Solo administradores. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession().catch(() => null);
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Solo un administrador puede asignar visitas." }, { status: 403 });
  }

  const { id } = await params;
  if (!/^[a-f0-9]{24}$/i.test(id)) {
    return NextResponse.json({ error: "Identificador de visita inválido." }, { status: 400 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Selecciona un técnico válido o deja la visita sin asignar." }, { status: 400 });
  }

  try {
    const visit = await prisma.visitRequest.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!visit) return NextResponse.json({ error: "Visita no encontrada." }, { status: 404 });
    if (["COMPLETED", "CANCELLED", "REJECTED"].includes(visit.status)) {
      return NextResponse.json({ error: "No se puede asignar una visita cerrada." }, { status: 409 });
    }

    if (parsed.data.userId) {
      const technician = await prisma.user.findUnique({
        where: { id: parsed.data.userId },
        select: { id: true, role: true },
      });
      if (!technician || technician.role !== "TECHNICIAN") {
        return NextResponse.json({ error: "La cuenta seleccionada no es un técnico activo." }, { status: 400 });
      }
    }

    await prisma.visitRequest.update({
      where: { id },
      data: {
        assignedToId: parsed.data.userId,
        assignedAt: parsed.data.userId ? new Date() : null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[visitas/asignar] error:", error);
    return NextResponse.json({ error: "No se pudo actualizar la asignación." }, { status: 500 });
  }
}
