import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { setSessionCookie } from "@/lib/auth";

const loginSchema = z.object({
  email: z.string().email("Correo electrónico inválido."),
  password: z.string().min(1, "La contraseña es obligatoria."),
});

export async function POST(request: Request) {
  let parsed;
  try {
    parsed = loginSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Datos de inicio de sesión inválidos." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.email.toLowerCase() } });
  const valid = user && (await bcrypt.compare(parsed.password, user.passwordHash));
  if (!valid || !user) {
    return NextResponse.json({ error: "Correo o contraseña incorrectos." }, { status: 401 });
  }

  // Los administradores van al panel; los técnicos también entran pero son
  // dirigidos a la búsqueda de etiquetas para llenar fichas técnicas.
  const redirect = user.role === "ADMIN" ? "/dashboard" : "/equipos";
  await setSessionCookie({ sub: user.id, email: user.email, name: user.name, role: user.role });
  return NextResponse.json({ ok: true, role: user.role, redirect });
}
