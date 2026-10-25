import { LogIn, Mail } from "lucide-react";

export default function Home() {
  return (
    <main className="home-simple">
      <div className="home-simple-card">
        <div className="brand" style={{ color: "#092746", fontSize: 26 }}>
          SOPORTE IT
          <small style={{ color: "#4a6c8f" }}>GESTIÓN TÉCNICA</small>
        </div>
        <p className="muted" style={{ margin: "18px 0 30px", fontSize: 15 }}>
          Inventario de equipos, etiquetas QR y coordinación de visitas técnicas.
        </p>
        <div className="home-simple-actions">
          <a className="home-login-button" href="/login">
            <LogIn size={16} /> Ingresar como administrador
          </a>
          <a className="home-secondary-button" href="/solicitar">
            <Mail size={16} /> Solicitar visita técnica
          </a>
        </div>
      </div>
    </main>
  );
}
