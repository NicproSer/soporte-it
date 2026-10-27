import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendWelcomeEmail, sendPasswordResetEmail, sendMail } from "@/lib/mail";
import { createSession, SESSION_COOKIE } from "@/lib/auth";
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
  // `resetTokenHash` / `resetTokenExpiresAt` se dejan explícitos en null:
  // así el documento nuevo nunca hereda un hash huérfano y la búsqueda por
  // token de recuperación solo puede coincidir con enlaces realmente emitidos.
  const user = await prisma.user.create({
    data: {
      name,
      email,
      role,
      passwordHash,
      mustChangePassword: true,
      resetTokenHash: null,
      resetTokenExpiresAt: null,
    },
  });

  // El usuario ya quedó creado; el correo de bienvenida va en segundo plano
  // para no bloquear la petición (evita 504 si Gmail responde lento).
  void sendWelcomeEmail({ name, email, role, tempPassword }).catch((e) =>
    console.error("[usuarios] no se pudo enviar el correo de bienvenida:", e)
  );

  return NextResponse.json({ ok: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
}

const actionSchema = z.object({
  userId: z.string().min(1),
  action: z.enum(["reset", "role", "edit"]),
  role: z.enum(["ADMIN", "TECHNICIAN"]).optional(),
  name: z.string().trim().min(2, "Indica el nombre completo.").max(120).optional(),
  email: z.string().trim().email("Correo electrónico inválido.").max(160).optional(),
});

/** Acciones del panel sobre una cuenta: editar datos, reset de contraseña o cambio de permiso. */
export async function PUT(req: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const parsed = actionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
  const { action, role } = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
  if (!user) return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });

  // Edición de datos (nombre / correo) desde la tabla de cuentas.
  if (action === "edit") {
    const name = parsed.data.name?.trim();
    const email = parsed.data.email?.trim().toLowerCase();
    if (!name && !email) return NextResponse.json({ error: "No hay cambios que guardar." }, { status: 400 });

    const data: { name?: string; email?: string } = {};
    if (name && name !== user.name) data.name = name;
    if (email && email !== user.email.toLowerCase()) {
      const clash = await prisma.user.findUnique({ where: { email } });
      if (clash) return NextResponse.json({ error: "Ya existe otra cuenta con ese correo." }, { status: 409 });
      data.email = email;
    }
    if (Object.keys(data).length === 0) return NextResponse.json({ ok: true, unchanged: true });

    const updated = await prisma.user.update({
      where: { id: user.id },
      data,
      select: { id: true, name: true, email: true, role: true },
    });

    // Si el admin editó SU propia cuenta, re-firma la cookie para que el
    // nombre/correo nuevos se reflejen en toda la interfaz sin cerrar sesión.
    if (user.id === session.sub) {
      const token = await createSession({ sub: updated.id, email: updated.email, name: updated.name, role: updated.role });
      const res = NextResponse.json({ ok: true, user: updated });
      res.cookies.set(SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 8,
      });
      return res;
    }

    // Aviso por correo al usuario cuya cuenta fue modificada (no bloquea la respuesta).
    if (data.email) {
      void sendMail(
        [updated.email],
        "Tu cuenta de Soporte IT fue actualizada",
        `<p>Hola ${updated.name}, un administrador actualizó los datos de tu cuenta.</p>` +
          `<p>Tu nuevo correo de acceso es <strong>${updated.email}</strong> (la contraseña no cambió).</p>`,
        `Tu cuenta de Soporte IT ahora usa el correo ${updated.email}.`
      ).catch((e) => console.error("[usuarios] aviso de edición no enviado:", e));
    }

    return NextResponse.json({ ok: true, user: updated });
  }

  // Cambio de permiso (ADMIN ⇄ TECHNICIAN). No permite degradarse a sí mismo
  // para evitar quedar sin administradores en el sistema.
  if (action === "role") {
    if (!role) return NextResponse.json({ error: "Falta el nuevo permiso." }, { status: 400 });
    if (user.id === session.sub && role !== "ADMIN") {
      return NextResponse.json({ error: "No puedes quitarte tu propio permiso de administrador." }, { status: 400 });
    }
    if (role === user.role) return NextResponse.json({ ok: true, unchanged: true });
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { role },
      select: { id: true, name: true, email: true, role: true },
    });
    return NextResponse.json({ ok: true, user: updated });
  }

  // Reset de contraseña: enlace temporal enviado al correo del usuario.
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
