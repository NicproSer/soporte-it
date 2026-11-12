"use client";

import { useEffect, useState } from "react";
import { MapPin, Plus, Save, LocateFixed, ExternalLink, Building2, Mail, Pencil, Trash2, X, AlertTriangle } from "lucide-react";

type Site = { id: string; name: string; address: string; latitude: number | null; longitude: number | null; directions?: string | null };
type Branch = { id: string; name: string; contactName?: string | null; contactEmail?: string | null; contactPhone?: string | null; sites: Site[] };
type Customer = { id: string; name: string; email: string; phone?: string | null; branches: Branch[]; equipment: { id: string; name: string; branchId?: string | null; siteId?: string | null }[] };
type ConfirmAction = { kind: "customer-save" | "customer-delete" | "branch-save" | "branch-delete"; id?: string; title: string; description: string };
const input: React.CSSProperties = { width: "100%", padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: 9, background: "#fff", color: "#102a43", fontSize: 14 };
const button: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 13px", border: 0, borderRadius: 9, background: "#1456c0", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13 };
const overlay: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 1000, background: "rgba(10,25,45,.58)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18 };
const modal: React.CSSProperties = { width: "100%", maxWidth: 460, background: "#fff", borderRadius: 16, padding: 22, boxShadow: "0 24px 70px rgba(0,0,0,.25)" };

export default function ClientesManager() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [customerForm, setCustomerForm] = useState({ name: "", email: "", phone: "" });
  const [branchFor, setBranchFor] = useState<string | null>(null);
  const [branchEditing, setBranchEditing] = useState<string | null>(null);
  const [branchForm, setBranchForm] = useState({ name: "", contactName: "", contactEmail: "", contactPhone: "" });
  const [siteFor, setSiteFor] = useState<string | null>(null);
  const [siteForm, setSiteForm] = useState({ name: "", address: "", latitude: "", longitude: "", directions: "" });
  const [confirmation, setConfirmation] = useState<ConfirmAction | null>(null);

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

  async function send(url: string, method: string, body?: unknown) {
    setBusy(true); setError("");
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo completar la operación.");
      await load();
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : "Error al guardar."); return false;; }
    finally { setBusy(false); }
  }
  function startEdit(c: Customer) {
    setEditing(c.id); setCustomerForm({ name: c.name, email: c.email, phone: c.phone ?? "" });
  }
  function requestCustomerSave(e: React.FormEvent) {
    e.preventDefault();
    setConfirmation({ kind: "customer-save", id: editing ?? undefined, title: editing ? "Confirmar cambios del cliente" : "Confirmar creación del cliente", description: editing ? "Se actualizarán los datos generales de este cliente." : "Se registrará un nuevo cliente con los datos indicados." });
  }
  async function commitCustomer() {
    const ok = await send(editing ? `/api/clientes/${editing}` : "/api/clientes", editing ? "PUT" : "POST", customerForm);
    if (ok) { setEditing(null); setCustomerForm({ name: "", email: "", phone: "" }); setConfirmation(null); }
  }
  function requestBranchSave(e: React.FormEvent) {
    e.preventDefault();
    setConfirmation({ kind: "branch-save", id: branchEditing ?? undefined, title: branchEditing ? "Confirmar cambios de sucursal" : "Confirmar creación de sucursal", description: branchEditing ? "Se actualizarán el nombre y los datos de contacto de esta sucursal." : "Se agregará una sucursal a este cliente con su propio correo de notificaciones." });
  }
  async function commitBranch() {
    const url = branchEditing ? `/api/sucursales/${branchEditing}` : `/api/clientes/${branchFor}/sucursales`;
    const ok = await send(url, branchEditing ? "PUT" : "POST", branchForm);
    if (ok) { setBranchFor(null); setBranchEditing(null); setBranchForm({ name: "", contactName: "", contactEmail: "", contactPhone: "" }); setConfirmation(null); }
  }
  async function commitDelete() {
    if (!confirmation?.id) return;
    const url = confirmation.kind === "customer-delete" ? `/api/clientes/${confirmation.id}` : `/api/sucursales/${confirmation.id}`;
    const ok = await send(url, "DELETE");
    if (ok) {
      if (confirmation.kind === "customer-delete" && editing === confirmation.id) setEditing(null);
      if (confirmation.kind === "branch-delete" && branchEditing === confirmation.id) setBranchEditing(null);
      setConfirmation(null);
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
  function editBranch(b: Branch) {
    setBranchFor(null); setBranchEditing(b.id);
    setBranchForm({ name: b.name, contactName: b.contactName ?? "", contactEmail: b.contactEmail ?? "", contactPhone: b.contactPhone ?? "" });
  }

  return <div style={{ display: "grid", gap: 18 }}>
    <section className="card">
      <h2 className="section-title">{editing ? "Editar cliente" : "Registrar cliente"}</h2>
      <p className="muted" style={{ marginBottom: 14 }}>El correo principal identifica al cliente. Cada sucursal tendrá su propio correo de contacto para notificaciones.</p>
      <form onSubmit={requestCustomerSave} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 12 }}>
        <label><span className="field-label">Nombre / razón social *</span><input required style={input} value={customerForm.name} onChange={e => setCustomerForm(v => ({...v,name:e.target.value}))} /></label>
        <label><span className="field-label">Correo principal *</span><input required type="email" style={input} value={customerForm.email} onChange={e => setCustomerForm(v => ({...v,email:e.target.value}))} /></label>
        <label><span className="field-label">Teléfono general</span><input style={input} value={customerForm.phone} onChange={e => setCustomerForm(v => ({...v,phone:e.target.value}))} /></label>
        <div style={{ display: "flex", alignItems: "end", gap: 8 }}><button style={button} disabled={busy}><Save size={15}/>{editing ? "Guardar cambios" : "Crear cliente"}</button>{editing && <button type="button" onClick={() => {setEditing(null);setCustomerForm({name:"",email:"",phone:""});}} style={{...button,background:"#64748b"}}>Cancelar</button>}</div>
      </form>
    </section>
    {error && <div className="generate-status" role="alert">{error}</div>}
    {loading ? <div className="empty">Cargando clientes…</div> : customers.length === 0 ? <div className="card empty">Todavía no hay clientes registrados. Crea el primero arriba.</div> : customers.map(c => <section className="card" key={c.id}>
      <div className="section-head"><div><h2 className="section-title"><Building2 size={17} style={{display:"inline",verticalAlign:"-3px",marginRight:7,color:"#1456c0"}}/>{c.name}</h2><div className="muted"><Mail size={12} style={{display:"inline",verticalAlign:"-2px",marginRight:4}}/>{c.email}{c.phone ? " · "+c.phone : ""}</div></div><div style={{display:"flex",gap:7,flexWrap:"wrap"}}><button onClick={() => startEdit(c)} style={{...button,background:"#eaf1fb",color:"#1456c0"}}><Pencil size={14}/>Editar</button><button onClick={() => setConfirmation({kind:"customer-delete",id:c.id,title:"¿Eliminar este cliente?",description:"Se eliminarán también sus sucursales y sitios. Esta acción no se puede deshacer. Si tiene equipos asociados, el sistema bloqueará la eliminación."})} style={{...button,background:"#fff1f2",color:"#be123c"}}><Trash2 size={14}/>Eliminar</button></div></div>
      <div className="muted" style={{fontSize:12,marginBottom:12}}>{c.branches.length} sucursales · {c.equipment.length} equipos</div>
      {c.branches.map(b => <div key={b.id} style={{borderTop:"1px solid #e2e8f0",paddingTop:14,marginTop:12}}>
        <div style={{display:"flex",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}><div><strong>{b.name}</strong><div className="muted" style={{fontSize:12,marginTop:4}}>Contacto: {b.contactName || "Sin asignar"} · {b.contactEmail || "Sin correo de contacto"}{b.contactPhone ? " · "+b.contactPhone : ""}</div></div><div style={{display:"flex",gap:7,flexWrap:"wrap"}}><button onClick={() => editBranch(b)} style={{...button,background:"#eaf1fb",color:"#1456c0"}}><Pencil size={13}/>Editar</button><button onClick={() => setConfirmation({kind:"branch-delete",id:b.id,title:"¿Eliminar esta sucursal?",description:"Se eliminarán también sus sitios. Si la sucursal tiene equipos asociados, el sistema bloqueará la eliminación."})} style={{...button,background:"#fff1f2",color:"#be123c"}}><Trash2 size={13}/>Eliminar</button><button onClick={() => {setSiteFor(b.id);setSiteForm({name:"",address:"",latitude:"",longitude:"",directions:""});}} style={{...button,background:"#eef5ff",color:"#1456c0"}}><Plus size={14}/>Agregar sitio</button></div></div>
        {b.sites.map(s => <div key={s.id} style={{background:"#f8fafc",borderRadius:10,padding:12,marginTop:9}}><strong>{s.name}</strong><div className="muted" style={{fontSize:12,marginTop:3}}>{s.address}</div>{s.directions && <div className="muted" style={{fontSize:12,marginTop:3}}>Referencia: {s.directions}</div>}{s.latitude != null && s.longitude != null ? <a href={`https://www.google.com/maps?q=${s.latitude},${s.longitude}`} target="_blank" rel="noreferrer" style={{display:"inline-flex",alignItems:"center",gap:5,marginTop:7,color:"#1456c0",fontSize:12,fontWeight:700}}><MapPin size={13}/>Ver GPS en Maps <ExternalLink size={12}/></a> : <span className="muted" style={{fontSize:12}}>GPS pendiente</span>}</div>)}
        {siteFor === b.id && <form onSubmit={saveSite} style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:9,marginTop:12,padding:12,background:"#f1f5f9",borderRadius:10}}>
          <label><span className="field-label">Nombre del sitio *</span><input required style={input} value={siteForm.name} onChange={e=>setSiteForm(v=>({...v,name:e.target.value}))} placeholder="Casa matriz, bodega…"/></label>
          <label><span className="field-label">Dirección *</span><input required style={input} value={siteForm.address} onChange={e=>setSiteForm(v=>({...v,address:e.target.value}))}/></label>
          <label><span className="field-label">Latitud</span><input style={input} value={siteForm.latitude} onChange={e=>setSiteForm(v=>({...v,latitude:e.target.value}))}/></label>
          <label><span className="field-label">Longitud</span><input style={input} value={siteForm.longitude} onChange={e=>setSiteForm(v=>({...v,longitude:e.target.value}))}/></label>
          <label style={{gridColumn:"1/-1"}}><span className="field-label">Referencias para llegar</span><input style={input} value={siteForm.directions} onChange={e=>setSiteForm(v=>({...v,directions:e.target.value}))} placeholder="Entrada por calle lateral, recepción…"/></label>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",gridColumn:"1/-1"}}><button type="button" onClick={locate} style={{...button,background:"#0f766e"}}><LocateFixed size={14}/>Usar mi ubicación GPS</button><button disabled={busy} style={button}><Save size={14}/>Guardar sitio</button><button type="button" onClick={()=>setSiteFor(null)} style={{...button,background:"#64748b"}}>Cancelar</button></div>
        </form>}
        {branchEditing === b.id && <form onSubmit={requestBranchSave} style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:9,marginTop:12,padding:12,background:"#f1f5f9",borderRadius:10}}>
          <label><span className="field-label">Nombre de sucursal *</span><input required style={input} value={branchForm.name} onChange={e=>setBranchForm(v=>({...v,name:e.target.value}))}/></label>
          <label><span className="field-label">Persona de contacto</span><input style={input} value={branchForm.contactName} onChange={e=>setBranchForm(v=>({...v,contactName:e.target.value}))}/></label>
          <label><span className="field-label">Correo de contacto / notificaciones</span><input type="email" style={input} value={branchForm.contactEmail} onChange={e=>setBranchForm(v=>({...v,contactEmail:e.target.value}))}/></label>
          <label><span className="field-label">Teléfono de contacto</span><input style={input} value={branchForm.contactPhone} onChange={e=>setBranchForm(v=>({...v,contactPhone:e.target.value}))}/></label>
          <div style={{display:"flex",gap:8,alignItems:"end"}}><button disabled={busy} style={button}><Save size={14}/>Guardar sucursal</button><button type="button" onClick={()=>setBranchEditing(null)} style={{...button,background:"#64748b"}}>Cancelar</button></div>
        </form>}
      </div>)}
      {branchFor === c.id ? <form onSubmit={e=>{e.preventDefault();setConfirmation({kind:"branch-save",title:"Confirmar creación de sucursal",description:"Se agregará una sucursal a este cliente con su propio correo de notificaciones."});}} style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:9,marginTop:14,padding:12,background:"#f1f5f9",borderRadius:10}}>
        <label><span className="field-label">Nombre de sucursal *</span><input required style={input} value={branchForm.name} onChange={e=>setBranchForm(v=>({...v,name:e.target.value}))} placeholder="Sucursal Centro"/></label>
        <label><span className="field-label">Persona de contacto</span><input style={input} value={branchForm.contactName} onChange={e=>setBranchForm(v=>({...v,contactName:e.target.value}))}/></label>
        <label><span className="field-label">Correo de contacto / notificaciones</span><input type="email" style={input} value={branchForm.contactEmail} onChange={e=>setBranchForm(v=>({...v,contactEmail:e.target.value}))}/></label>
        <label><span className="field-label">Teléfono de contacto</span><input style={input} value={branchForm.contactPhone} onChange={e=>setBranchForm(v=>({...v,contactPhone:e.target.value}))}/></label>
        <div style={{display:"flex",gap:8,alignItems:"end"}}><button disabled={busy} style={button}><Save size={14}/>Guardar sucursal</button><button type="button" onClick={()=>setBranchFor(null)} style={{...button,background:"#64748b"}}>Cancelar</button></div>
      </form> : <button onClick={()=>{setBranchFor(c.id);setBranchEditing(null);setBranchForm({name:"",contactName:"",contactEmail:"",contactPhone:""});}} style={{...button,marginTop:14}}><Plus size={14}/>Agregar sucursal</button>}
    </section>)}
    {confirmation && <div style={overlay} role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget && !busy)setConfirmation(null);}}><section role="dialog" aria-modal="true" aria-labelledby="confirm-title" style={modal}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}><span style={{width:38,height:38,borderRadius:12,background:confirmation.kind.includes("delete")?"#fff1f2":"#eaf1fb",display:"grid",placeItems:"center",color:confirmation.kind.includes("delete")?"#be123c":"#1456c0"}}>{confirmation.kind.includes("delete")?<AlertTriangle size={19}/>:<Save size={19}/>}</span><h3 id="confirm-title" style={{margin:0,fontSize:18,color:"#102a43"}}>{confirmation.title}</h3></div>
      <p style={{fontSize:14,lineHeight:1.6,color:"#526579",margin:"0 0 20px"}}>{confirmation.description}</p>
      <div style={{display:"flex",justifyContent:"flex-end",gap:9,flexWrap:"wrap"}}><button disabled={busy} onClick={()=>setConfirmation(null)} style={{...button,background:"#e8edf3",color:"#334155"}}><X size={14}/>Cancelar</button><button disabled={busy} onClick={()=>confirmation.kind==="customer-save"?void commitCustomer():confirmation.kind==="branch-save"?void commitBranch():void commitDelete()} style={{...button,background:confirmation.kind.includes("delete")?"#be123c":"#1456c0"}}>{busy?"Procesando…":confirmation.kind.includes("delete")?"Sí, eliminar":"Sí, confirmar"}</button></div>
    </section></div>}
  </div>;
}
