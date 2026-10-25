import { CalendarX2 } from "lucide-react";

export default function ExpiredLinkPage() {
  return (
    <main className="public-wrap">
      <article className="public-card" style={{ textAlign: "center" }}>
        <div style={{ padding: "44px 34px" }}>
          <CalendarX2 size={54} color="#8a5a00" style={{ margin: "0 auto 16px", display: "block" }} />
          <h1 className="h1" style={{ fontSize: 24 }}>Este enlace expiró</h1>
          <p className="muted" style={{ maxWidth: 430, margin: "10px auto 24px" }}>
            La propuesta de visita perdió validez o ya fue respondida. Puedes crear una nueva solicitud y un
            administrador te contactará nuevamente.
          </p>
          <a className="home-login-button" href="/solicitar">Nueva solicitud</a>
        </div>
      </article>
    </main>
  );
}
