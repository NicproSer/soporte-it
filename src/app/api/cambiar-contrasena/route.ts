import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  currentPassword: z.string().min(1, "Ingresa tu contraseña actual."),
  newPassword: z.string().min(8, "La nueva contraseña debe tener al menos 8 caracteres."),
});

/** Cambio de contraseña autenticado (obligatorio al primer ingreso con clave temporal). */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Inicia sesión primero." }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.sub } });
  if (!user) return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });

  const ok = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!ok) return NextResponse.json({ error: "La contraseña actual es incorrecta." }, { status: 400 });
  if (parsed.data.newPassword === parsed.data.currentPassword) {
    return NextResponse.json({ error: "La nueva contraseña debe ser distinta." }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash, mustChangePassword: false } });

  // Renueva la sesión para reflejar el estado ya verificado.
  const { setSessionCookie } = await import("@/lib/auth");
  await setSessionCookie({ sub: user.id, email: user.email, name: user.name, role: user.role });

  return NextResponse.json({ ok: true });
}
