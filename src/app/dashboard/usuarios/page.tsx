import { redirect } from "next/navigation";
import { ShieldCheck, UserCog, Users } from "lucide-react";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CreateForm, type UserRow } from "./create-form";
import { UserActions } from "./user-actions";
import { EditUserForm } from "./edit-user-form";

export const dynamic = "force-dynamic";

const roleLabels: Record<string, string> = { ADMIN: "Administrador", TECHNICIAN: "Técnico" };

export default async function UsuariosPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  // Solo los administradores pueden gestionar cuentas.
  if (session.role !== "ADMIN") redirect("/equipos");

  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { createdAt: "desc" }],
    select: { id: true, name: true, email: true, role: true, mustChangePassword: true, createdAt: true },
  });

  const rows: UserRow[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    mustChangePassword: u.mustChangePassword,
    createdAt: u.createdAt.toISOString(),
  }));

  return (
    <div className="shell shell-single">
      <main className="main">
        <div className="topline">
          <div>
            <p className="eyebrow">Panel de administrador</p>
            <h1 className="h1">Usuarios y accesos</h1>
            <p className="muted">
              Crea cuentas de administrador o técnico con solo nombre, correo y permiso. El sistema genera una
              contraseña temporal y envía un correo de bienvenida con los datos de acceso.
            </p>
          </div>
          <div className="avatar" title={session.email}>
            {session.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "AD"}
          </div>
        </div>

        <section className="card" style={{ marginBottom: 18 }}>
          <h2 className="section-title">
            <UserCog size={17} style={{ verticalAlign: "-3px", marginRight: 6, color: "#1456c0" }} />
            Crear cuenta
          </h2>
          <p className="muted" style={{ margin: "4px 0 14px" }}>
            Al crearse, el usuario recibirá por correo su contraseña temporal; deberá cambiarla al primer inicio de sesión.
          </p>
          <CreateForm />
        </section>

        <section className="card">
          <h2 className="section-title">
            <Users size={17} style={{ verticalAlign: "-3px", marginRight: 6, color: "#1456c0" }} />
            Cuentas registradas ({users.length})
          </h2>
          {users.length > 0 ? (
            <div style={{ marginTop: 14, overflowX: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Correo</th>
                    <th>Permiso</th>
                    <th>Contraseña</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <strong>{u.name}</strong>
                        {u.id === session.sub ? (
                          <span className="pill blue" style={{ marginLeft: 8 }}>Tú</span>
                        ) : null}
                      </td>
                      <td style={{ overflowWrap: "anywhere" }}>{u.email}</td>
                      <td>
                        <span className={`pill ${u.role === "ADMIN" ? "green" : "blue"}`}>{roleLabels[u.role]}</span>
                      </td>
                      <td>
                        {u.mustChangePassword ? (
                          <span className="pill">Temporal pendiente</span>
                        ) : (
                          <span className="muted" style={{ fontSize: 12 }}>Propia</span>
                        )}
                      </td>
                      <td>
                        <UserActions userId={u.id} currentRole={u.role} isSelf={u.id === session.sub} />
                        <EditUserForm userId={u.id} initialName={u.name} initialEmail={u.email} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty">Todavía no hay cuentas creadas desde el panel.</div>
          )}
        </section>

        <div className="footer-note">
          <ShieldCheck size={14} style={{ display: "inline", verticalAlign: "-2px", marginRight: 5 }} />
          La gestión de usuarios es exclusiva de administradores. Los correos de bienvenida y recuperación se
          envían por SMTP configurado en <code>.env</code>.
        </div>
      </main>
    </div>
  );
}
