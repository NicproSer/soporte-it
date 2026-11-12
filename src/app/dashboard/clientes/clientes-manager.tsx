"use client";

import { useEffect, useState } from "react";
import { MapPin, Plus, Save, LocateFixed, ExternalLink, Building2, Mail, Pencil } from "lucide-react";

type Site = { id: string; name: string; address: string; latitude: number | null; longitude: number | null; directions?: string | null };
type Branch = { id: string; name: string; contactName?: string | null; contactEmail?: string | null; contactPhone?: string | null; sites: Site[] };
type Customer = { id: string; name: string; email: string; phone?: string | null; branches: Branch[]; equipment: { id: string; name: string; branchId?: string | null; siteId?: string | null }[] };
const input: React.CSSProperties = { width: "100%", padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: 9, background: "#fff", color: "#102a43", fontSize: 14 };
const button: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 13px", border: 0, borderRadius: 9, background: "#1456c0", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13 };

export default function ClientesManager() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [customerForm, setCustomerForm] = useState({ name: "", email: "", phone: "" });
  const [branchFor, setBranchFor] = useState<string | null>(null);
  const [branchForm, setBranchForm] = useState({ name: "", contactName: "", contactEmail: "", contactPhone: "" });
  const [siteFor, setSiteFor] = useState<string | null>(null);
  const [siteForm, setSiteForm] = useState({ name: "", address: "", latitude: "", longitude: "", directions: "" });

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/clientes");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudieron cargar los clientes.");
      setCustomers(data.clientes);
    } catch (e) { setError(e instanceof Error ? e.message : "Error al cargar."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function send(url: string, method: string, body: unknown) {
    setBusy(true); setError("");
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo guardar.");
      await load();
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : "Error al guardar."); return false; }
    finally { setBusy(false); }
  }
  function startEdit(c: Customer) {
    setEditing(c.id); setCustomerForm({ name: c.name, email: c.email, phone: c.phone ?? "" });
  }
  async function saveCustomer(e: React.FormEvent) {
    e.preventDefault();
    const ok = await send(editing ? `/api/clientes/${editing}` : "/api/clientes", editing ? "PUT" : "POST", customerForm);
    if (ok) { setEditing(null); setCustomerForm({ name: "", email: "", phone: "" }); }
  }
  async function saveBranch(e: React.FormEvent) {
    e.preventDefault(); if (!branchFor) return;
    if (await send(`/api/clientes/${branchFor}/sucursales`, "POST", branchForm)) {
      setBranchFor(null); setBranchForm({ name: "", contactName: "", contactEmail: "", contactPhone: "" });
    }
  }
  async function saveSite(e: React.FormEvent) {
    e.preventDefault(); if (!siteFor) return;
    if (await send(`/api/sucursales/${siteFor}/sitios`, "POST", siteForm)) {
      setSiteFor(null); setSiteForm({ name: "", address: "", latitude: "", longitude: "", directions: "" });
    }
  }
  function locate() {
    if (!navigator.geolocation) { setError("Este navegador no permite obtener la ubicación GPS."); return; }
    navigator.geolocation.getCurrentPosition(
      p => setSiteForm(v => ({ ...v, latitude: String(p.coords.latitude), longitude: String(p.coords.longitude) })),
      () => setError("No se pudo obtener el GPS. Revisa los permisos de ubicación del navegador."),
      { enableHighAccuracy: true, timeout: 12000 }
    );
  }

  return <div style={{ display: "grid", gap: 18 }}>
    <section className="card">
      <h2 className="section-title">{editing ? "Editar cliente" : "Registrar cliente"}</h2>
      <p className="muted" style={{ marginBottom: 14 }}>El correo principal identifica al cliente. Cada sucursal tendrá su propio correo de contacto para notificaciones.</p>
      <form onSubmit={saveCustomer} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 12 }}>
        <label><span className="field-label">Nombre / razón social *</span><input required style={input} value={customerForm.name} onChange={e => setCustomerForm(v => ({...v,name:e.target.value}))} /></label>
        <label><span className="field-label">Correo principal *</span><input required type="email" style={input} value={customerForm.email} onChange={e => setCustomerForm(v => ({...v,email:e.target.value}))} /></label>
        <label><span className="field-label">Teléfono general</span><input style={input} value={customerForm.phone} onChange={e => setCustomerForm(v => ({...v,phone:e.target.value}))} /></label>
        <div style={{ display: "flex", alignItems: "end", gap: 8 }}><button style={button} disabled={busy}><Save size={15}/>{busy ? "Guardando…" : editing ? "Guardar cambios" : "Crear cliente"}</button>{editing && <button type="button" onClick={() => setEditing(null)} style={{...button,background:"#64748b"}}>Cancelar</button>}</div>
      </form>
    </section>
    {error && <div className="generate-status" role="alert">{error}</div>}
    {loading ? <div className="empty">Cargando clientes…</div> : customers.length === 0 ? <div className="card empty">Todavía no hay clientes registrados. Crea el primero arriba.</div> : customers.map(c => <section className="card" key={c.id}>
      <div className="section-head"><div><h2 className="section-title"><Building2 size={17} style={{display:"inline",verticalAlign:"-3px",marginRight:7,color:"#1456c0"}}/>{c.name}</h2><div className="muted"><Mail size={12} style={{display:"inline",verticalAlign:"-2px",marginRight:4}}/>{c.email}{c.phone ? " · "+c.phone : ""}</div></div><button onClick={() => startEdit(c)} style={{...button,background:"#eaf1fb",color:"#1456c0"}}><Pencil size={14}/>Editar</button></div>
      <div className="muted" style={{fontSize:12,marginBottom:12}}>{c.branches.length} sucursales · {c.equipment.length} equipos</div>
      {c.branches.map(b => <div key={b.id} style={{borderTop:"1px solid #e2e8f0",paddingTop:14,marginTop:12}}>
        <div style={{display:"flex",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}><div><strong>{b.name}</strong><div className="muted" style={{fontSize:12,marginTop:4}}>Contacto: {b.contactName || "Sin asignar"} · {b.contactEmail || "Sin correo de contacto"}{b.contactPhone ? " · "+b.contactPhone : ""}</div></div><button onClick={() => {setSiteFor(b.id);setSiteForm({name:"",address:"",latitude:"",longitude:"",directions:""});}} style={{...button,background:"#eef5ff",color:"#1456c0"}}><Plus size={14}/>Agregar sitio</button></div>
        {b.sites.map(s => <div key={s.id} style={{background:"#f8fafc",borderRadius:10,padding:12,marginTop:9}}><strong>{s.name}</strong><div className="muted" style={{fontSize:12,marginTop:3}}>{s.address}</div>{s.directions && <div className="muted" style={{fontSize:12,marginTop:3}}>Referencia: {s.directions}</div>}{s.latitude != null && s.longitude != null ? <a href={`https://www.google.com/maps?q=${s.latitude},${s.longitude}`} target="_blank" rel="noreferrer" style={{display:"inline-flex",alignItems:"center",gap:5,marginTop:7,color:"#1456c0",fontSize:12,fontWeight:700}}><MapPin size={13}/>Ver GPS en Maps <ExternalLink size={12}/></a> : <span className="muted" style={{fontSize:12}}>GPS pendiente</span>}</div>)}
        {siteFor === b.id && <form onSubmit={saveSite} style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:9,marginTop:12,padding:12,background:"#f1f5f9",borderRadius:10}}>
          <label><span className="field-label">Nombre del sitio *</span><input required style={input} value={siteForm.name} onChange={e=>setSiteForm(v=>({...v,name:e.target.value}))} placeholder="Casa matriz, bodega…"/></label>
          <label><span className="field-label">Dirección *</span><input required style={input} value={siteForm.address} onChange={e=>setSiteForm(v=>({...v,address:e.target.value}))}/></label>
          <label><span className="field-label">Latitud</span><input style={input} value={siteForm.latitude} onChange={e=>setSiteForm(v=>({...v,latitude:e.target.value}))}/></label>
          <label><span className="field-label">Longitud</span><input style={input} value={siteForm.longitude} onChange={e=>setSiteForm(v=>({...v,longitude:e.target.value}))}/></label>
          <label style={{gridColumn:"1/-1"}}><span className="field-label">Referencias para llegar</span><input style={input} value={siteForm.directions} onChange={e=>setSiteForm(v=>({...v,directions:e.target.value}))} placeholder="Entrada por calle lateral, recepción…"/></label>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",gridColumn:"1/-1"}}><button type="button" onClick={locate} style={{...button,background:"#0f766e"}}><LocateFixed size={14}/>Usar mi ubicación GPS</button><button disabled={busy} style={button}><Save size={14}/>Guardar sitio</button><button type="button" onClick={()=>setSiteFor(null)} style={{...button,background:"#64748b"}}>Cancelar</button></div>
        </form>}
      </div>)}
      {branchFor === c.id ? <form onSubmit={saveBranch} style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:9,marginTop:14,padding:12,background:"#f1f5f9",borderRadius:10}}>
        <label><span className="field-label">Nombre de sucursal *</span><input required style={input} value={branchForm.name} onChange={e=>setBranchForm(v=>({...v,name:e.target.value}))} placeholder="Sucursal Centro"/></label>
        <label><span className="field-label">Persona de contacto</span><input style={input} value={branchForm.contactName} onChange={e=>setBranchForm(v=>({...v,contactName:e.target.value}))}/></label>
        <label><span className="field-label">Correo de contacto / notificaciones</span><input type="email" style={input} value={branchForm.contactEmail} onChange={e=>setBranchForm(v=>({...v,contactEmail:e.target.value}))}/></label>
        <label><span className="field-label">Teléfono de contacto</span><input style={input} value={branchForm.contactPhone} onChange={e=>setBranchForm(v=>({...v,contactPhone:e.target.value}))}/></label>
        <div style={{display:"flex",gap:8,alignItems:"end"}}><button disabled={busy} style={button}><Save size={14}/>Guardar sucursal</button><button type="button" onClick={()=>setBranchFor(null)} style={{...button,background:"#64748b"}}>Cancelar</button></div>
      </form> : <button onClick={()=>{setBranchFor(c.id);setBranchForm({name:"",contactName:"",contactEmail:"",contactPhone:""});}} style={{...button,marginTop:14}}><Plus size={14}/>Agregar sucursal</button>}
    </section>)}
  </div>;
}
