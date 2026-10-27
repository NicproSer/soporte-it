import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/passwords";

const schema = z.object({
  token: z.string().min(10),
  password: z.string().min(8, "La nueva contraseña debe tener al menos 8 caracteres."),
});

/** Completa el reset de contraseña usando el token enviado al correo del usuario. */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
  }
  const { token, password } = parsed.data;

  const user = await prisma.user.findFirst({ where: { resetTokenHash: hashToken(token) } });
  if (!user || !user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date()) {
    return NextResponse.json({ error: "El enlace no es válido o expiró. Pide a un administrador enviar uno nuevo." }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, mustChangePassword: false, resetTokenHash: null, resetTokenExpiresAt: null },
  });

  // Sesión inmediata tras cambiar la contraseña (token de un solo uso ya consumido).
  const { setSessionCookie } = await import("@/lib/auth");
  await setSessionCookie({ sub: user.id, email: user.email, name: user.name, role: user.role });

  return NextResponse.json({ ok: true, redirect: user.role === "ADMIN" ? "/dashboard" : "/equipos" });
}

/** Verifica si un token de recuperación sigue vigente (para mostrar el formulario). */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!token) return NextResponse.json({ valid: false });
  const user = await prisma.user.findFirst({
    where: { resetTokenHash: hashToken(token) },
    select: { name: true, email: true, resetTokenExpiresAt: true },
  });
  const valid = !!user && !!user.resetTokenExpiresAt && user.resetTokenExpiresAt > new Date();
  return NextResponse.json({ valid, name: user?.name ?? "", email: user?.email ?? "" });
}
