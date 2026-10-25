// Crea (o actualiza) el usuario administrador para poder iniciar sesión en /login.
// Uso: npm run seed:admin  [ADMIN_EMAIL=otro@correo.com ADMIN_PASSWORD=clave node scripts/seed-admin.ts]
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

const email = (process.env.ADMIN_EMAIL ?? "admin@empresa.com").toLowerCase();
const password = process.env.ADMIN_PASSWORD ?? "Admin123!";
const name = process.env.ADMIN_NAME ?? "Administrador";

async function main() {
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.upsert({
    where: { email },
    update: { role: "ADMIN", passwordHash, name },
    create: { email, name, passwordHash, role: "ADMIN" },
  });
  console.log(`Administrador listo:\n  Correo: ${user.email}\n  Contraseña: ${password}${process.env.ADMIN_PASSWORD ? "" : "\n  (cámbiala con ADMIN_PASSWORD=... antes de producir)"}`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
