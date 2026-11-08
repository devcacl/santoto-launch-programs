import { useCallback, useEffect, useState } from 'react';
import { Download, KeyRound, LogOut, RefreshCw, Search, Users, Trophy, Mic2, CheckCircle2 } from 'lucide-react';
import './admin.css';

const API = '/api/admin';
export default function Admin() {
  const [user, setUser] = useState(null); const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [authorized, setAuthorized] = useState(false); const [overview, setOverview] = useState(null); const [leads, setLeads] = useState([]);
  const [total, setTotal] = useState(0); const [page, setPage] = useState(1); const [search, setSearch] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const pageSize = 25;

  const api = useCallback(async (path, options = {}) => {
    const response = await fetch(`${API}${path}`, { credentials: 'include', cache: 'no-store', ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(response.status === 401 || response.status === 503 ? 'Inicia sesión con una cuenta autorizada.' : data.error || 'No se pudo cargar la información.');
    return data;
  }, []);
  const load = useCallback(async (currentPage = 1, term = '') => {
    setBusy(true); setError('');
    try {
      const query = new URLSearchParams({ page: String(currentPage), pageSize: String(pageSize), search: term });
      const [summary, results] = await Promise.all([api('/overview'), api(`/leads?${query}`)]);
      setOverview(summary); setLeads(results.leads); setTotal(results.total); setPage(results.page);
    } catch (cause) { setError(cause.message); if (cause.message.startsWith('Inicia sesión')) { setAuthorized(false); setUser(null); } }
    finally { setBusy(false); }
  }, [api]);
  useEffect(() => { api('/auth/me').then(({ user: account }) => { setUser(account); setAuthorized(true); }).catch(() => {}); }, [api]);
  useEffect(() => { if (authorized) load(1, ''); }, [authorized, load]);
  async function signIn(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { const result = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: email.trim(), password }) }); setUser(result.user); setPassword(''); setAuthorized(true); }
    catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }
  async function signOut() { await api('/auth/logout', { method: 'POST' }).catch(() => {}); setAuthorized(false); setUser(null); setOverview(null); setLeads([]); }
  async function exportCsv() {
    try { const response = await fetch(`${API}/leads.csv`, { credentials: 'include', cache: 'no-store' }); if (!response.ok) throw new Error('No se pudo exportar el archivo.'); const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'santoto-event-leads.csv'; link.click(); URL.revokeObjectURL(url); }
    catch (cause) { setError(cause.message); }
  }
  if (!authorized) return <main className="admin-login"><form onSubmit={signIn} className="admin-login-card"><div className="admin-mark">S</div><p className="admin-kicker">SANTOTO · TUNJA</p><h1>Panel de evento</h1><p>Ingresa con tu cuenta individual autorizada.</p><label>Correo<input autoComplete="username" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={254} /></label><label>Contraseña<input autoComplete="current-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={12} maxLength={200} /></label>{error && <p className="admin-error" role="alert">{error}</p>}<button className="admin-primary" disabled={busy}><KeyRound size={16} />{busy ? 'Verificando…' : 'Ingresar de forma segura'}</button><small>Sesión en cookie HttpOnly, SameSite Strict, expira en 8 horas.</small></form></main>;
  return <main className="admin-shell"><header className="admin-header"><div><p className="admin-kicker">EVOLUCIONA-T · ADMINISTRACIÓN</p><h1>Resumen del evento</h1><p>{user?.email} · rol {user?.role}</p></div><div className="admin-actions"><button onClick={() => load()} disabled={busy}><RefreshCw size={15}/> Actualizar</button>{user?.role !== 'analyst' && <button onClick={exportCsv}><Download size={15}/> Exportar CSV</button>}<button onClick={signOut}><LogOut size={15}/> Salir</button></div></header>
    {error && <p className="admin-error" role="alert">{error}</p>}{overview && <><section className="admin-metrics"><Metric icon={<Users/>} label="Leads registrados" value={overview.totals.leads} detail={`${overview.totals.today} hoy`}/><Metric icon={<CheckCircle2/>} label="Con preferencia definida" value={overview.totals.with_preference||0} detail={`${overview.totals.marketing_opt_in||0} aceptaron información`}/><Metric icon={<Trophy/>} label="Retos completados" value={overview.activities.challenges} detail="Niveles registrados"/><Metric icon={<Mic2/>} label="Asistencias a charlas" value={overview.activities.talk_checkins} detail="Sellos guardados"/></section>
    <section className="admin-panel"><h2>Preferencia académica</h2><p>Distribución de programas seleccionados.</p><div className="preference-bars">{overview.preferences.map((item)=><div key={item.name}><span>{item.name}</span><strong>{item.count}</strong><i><b style={{width:`${Math.max(4,100*item.count/Math.max(1,overview.preferences[0]?.count))}%`}}/></i></div>)}{!overview.preferences.length&&<p>Aún no hay preferencias registradas.</p>}</div></section>
    <section className="admin-panel"><div className="admin-table-heading"><div><h2>Leads</h2><p>{total.toLocaleString('es-CO')} registros · información restringida</p></div><label className="admin-search"><Search size={16}/><input value={search} placeholder="Buscar nombre, correo o carrera" onChange={(e)=>setSearch(e.target.value)} onKeyDown={(e)=>{if(e.key==='Enter')load(1,search)}}/><button onClick={()=>load(1,search)}>Buscar</button></label></div><div className="admin-table-wrap"><table><thead><tr><th>Aspirante</th><th>Contacto</th><th>Colegio / ciudad</th><th>Preferencia</th><th>Avance</th><th>Autorización</th><th>Registro</th></tr></thead><tbody>{leads.map((lead)=><tr key={lead.id}><td><strong>{lead.first_name} {lead.last_name}</strong><small>{lead.email}</small></td><td>{lead.phone||'—'}</td><td>{[lead.school,lead.city].filter(Boolean).join(' · ')||'—'}</td><td>{lead.preferred_program||'Pendiente'}</td><td>{lead.completed_challenges} retos · {lead.talks_attended} charlas</td><td>{lead.consent_privacy?'Privacidad ✓':'—'}<small>{lead.consent_marketing?'Información ✓':'Sin info comercial'}</small></td><td>{new Date(lead.created_at).toLocaleString('es-CO')}</td></tr>)}{!leads.length&&<tr><td colSpan="7">No hay resultados para esta búsqueda.</td></tr>}</tbody></table></div><div className="admin-pagination"><span>Página {page} de {Math.max(1,Math.ceil(total/pageSize))}</span><div><button disabled={page<=1||busy} onClick={()=>load(page-1,search)}>Anterior</button><button disabled={page*pageSize>=total||busy} onClick={()=>load(page+1,search)}>Siguiente</button></div></div></section></>}
  </main>;
}
function Metric({icon,label,value,detail}){return <article className="admin-metric"><span>{icon}</span><small>{label}</small><strong>{Number(value||0).toLocaleString('es-CO')}</strong><p>{detail}</p></article>}
