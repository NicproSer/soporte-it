import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendWelcomeEmail, sendPasswordResetEmail } from "@/lib/mail";
import { generateTempPassword, hashToken } from "@/lib/passwords";

const createSchema = z.object({
  name: z.string().trim().min(2, "Indica el nombre completo.").max(120),
  email: z.string().trim().email("Correo electrónico inválido.").max(160),
  role: z.enum(["ADMIN", "TECHNICIAN"], { message: "El permiso debe ser Administrador o Técnico." }),
});

/** Solo administradores pueden gestionar cuentas. */
async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return null;
  return session;
}

export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { createdAt: "desc" }],
    select: { id: true, name: true, email: true, role: true, mustChangePassword: true, createdAt: true },
  });
  return NextResponse.json({ users });
}

/** Crea un admin/técnico (nombre, correo y permiso) y envía credenciales por correo. */
export async function POST(req: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
  }
  const { name, role } = parsed.data;
  const email = parsed.data.email.toLowerCase();

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return NextResponse.json({ error: "Ya existe una cuenta con ese correo." }, { status: 409 });

  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);
  const user = await prisma.user.create({
    data: { name, email, role, passwordHash, mustChangePassword: true },
  });

  // El usuario ya quedó creado; el correo de bienvenida va en segundo plano
  // para no bloquear la petición (evita 504 si Gmail responde lento).
  void sendWelcomeEmail({ name, email, role, tempPassword }).catch((e) =>
    console.error("[usuarios] no se pudo enviar el correo de bienvenida:", e)
  );

  return NextResponse.json({ ok: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
}

const resetSchema = z.object({ userId: z.string().min(1) });

/** Reset desde el panel: genera enlace temporal y lo envía al correo del usuario. */
export async function PUT(req: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const parsed = resetSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Falta el usuario." }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
  if (!user) return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });

  const rawToken = crypto.randomBytes(32).toString("hex");
  await prisma.user.update({
    where: { id: user.id },
    data: { resetTokenHash: hashToken(rawToken), resetTokenExpiresAt: new Date(Date.now() + 2 * 3600 * 1000) },
  });

  void sendPasswordResetEmail({ name: user.name, email: user.email, token: rawToken }).catch((e) =>
    console.error("[usuarios] no se pudo enviar el correo de recuperación:", e)
  );

  return NextResponse.json({ ok: true });
}
