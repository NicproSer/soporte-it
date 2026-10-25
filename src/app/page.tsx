import { Activity, CalendarClock, Cpu, LockKeyhole, LogIn, QrCode, Tags, Wrench } from "lucide-react";

const metrics = [
  { label: "Etiquetas disponibles", value: "50", foot: "Listas para asignar", icon: Tags },
  { label: "Equipos registrados", value: "0", foot: "Se actualizará con la base de datos", icon: Cpu },
  { label: "Visitas pendientes", value: "0", foot: "Solicitudes por revisar", icon: CalendarClock },
  { label: "Intervenciones", value: "0", foot: "Mantenimientos registrados", icon: Wrench },
];
export default function Home() {
  return <div className="shell">
    <aside className="sidebar">
      <div className="brand">SOPORTE IT<small>GESTIÓN TÉCNICA</small></div>
      <nav className="nav" aria-label="Navegación principal">
        <a className="active" href="#inicio">▦ &nbsp; Resumen</a><a href="#etiquetas">▧ &nbsp; Etiquetas QR</a><a href="#equipos">▣ &nbsp; Equipos</a><a href="#visitas">◷ &nbsp; Visitas técnicas</a><a href="#historial">☷ &nbsp; Intervenciones</a><a href="/login">⚙ &nbsp; Acceso administrador</a>
      </nav>
      <div className="side-note">Plataforma de inventario, trazabilidad y soporte técnico.<br/>Versión inicial · 0.1.0</div>
    </aside>
    <main className="main" id="inicio">
      <div className="topline"><div><div className="eyebrow">Panel de control</div><h1 className="h1">Resumen general</h1><div className="muted">Administra tus equipos, stickers QR y solicitudes de soporte desde un solo lugar.</div></div><a className="home-login-button" href="/login"><LogIn size={16}/> Ingresar como administrador</a></div>
      <section className="cards" aria-label="Indicadores">
        {metrics.map(({label,value,foot,icon:Icon})=><div className="card" key={label}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><span className="metric-label">{label}</span><Icon size={19} color="#1456c0"/></div><div className="metric-value">{value}</div><div className="metric-foot">{foot}</div></div>)}
      </section>
      <div className="content-grid">
        <section className="card" id="visitas"><div className="section-head"><div><h2 className="section-title">Solicitudes recientes</h2><div className="muted">Seguimiento de visitas técnicas</div></div><span className="pill">Pendientes</span></div><div className="empty"><CalendarClock size={22} style={{marginBottom:10}}/><br/><strong>Aún no hay solicitudes</strong><br/>Cuando un cliente solicite una visita técnica, aparecerá aquí. Recibirás un aviso por correo cuando conectemos el servicio de email.</div></section>
        <section className="card"><div className="section-head"><div><h2 className="section-title">Acciones rápidas</h2><div className="muted">Accesos para tu trabajo diario</div></div></div><div className="quick-grid"><a className="quick" href="/dashboard"><QrCode size={20} color="#1456c0"/><strong>Generar etiquetas</strong><span>Crear un lote de QR para imprimir (requiere sesión).</span></a><a className="quick" href="/dashboard#equipos"><LockKeyhole size={20} color="#1456c0"/><strong>Registrar equipo</strong><span>Asignar una etiqueta a un dispositivo.</span></a><a className="quick" href="/dashboard#visitas"><CalendarClock size={20} color="#1456c0"/><strong>Ver visitas</strong><span>Proponer fechas y confirmar citas.</span></a><a className="quick" href="/dashboard#historial"><Wrench size={20} color="#1456c0"/><strong>Registrar servicio</strong><span>Documentar mantenimiento o reparación.</span></a></div></section>
      </div>
      <section className="qr-panel" id="etiquetas"><div><h2>Etiquetas QR permanentes</h2><p>Genera una vez, imprime y asigna cada etiqueta cuando instales un equipo.<br/>Los datos podrán cambiar sin alterar la dirección del QR.</p></div><QrCode className="qr-icon" size={52}/></section>
      <div className="footer-note"><Activity size={14} style={{display:"inline",verticalAlign:"-2px",marginRight:5}}/> Esta vista pública es una maqueta. El panel real con datos de la base de datos, autenticación de administrador y generación de etiquetas con un clic está disponible en <a href="/login" style={{color:"#1456c0",fontWeight:700}}>Iniciar sesión → /dashboard</a>.</div>
    </main>
  </div>;
}
