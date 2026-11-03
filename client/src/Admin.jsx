import { useCallback, useEffect, useState } from 'react';
import { Download, KeyRound, LogOut, RefreshCw, Search, Users, Trophy, Mic2, CheckCircle2 } from 'lucide-react';
import './admin.css';

const API = '/api/admin';
const sessionKey = 'santoto-admin-key';

export default function Admin() {
  const [key, setKey] = useState(() => sessionStorage.getItem(sessionKey) || '');
  const [input, setInput] = useState('');
  const [authorized, setAuthorized] = useState(false);
  const [overview, setOverview] = useState(null);
  const [leads, setLeads] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pageSize = 25;

  const api = useCallback(async (path, token = key) => {
    const response = await fetch(`${API}${path}`, { headers: { 'x-admin-key': token }, cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(response.status === 401 || response.status === 503 ? 'Clave incorrecta o panel no configurado.' : data.error || 'No se pudo cargar la información.');
    return data;
  }, [key]);

  const load = useCallback(async (token, currentPage = page, term = search) => {
    setBusy(true); setError('');
    try {
      const query = new URLSearchParams({ page: String(currentPage), pageSize: String(pageSize), search: term });
      const [summary, results] = await Promise.all([api('/overview', token), api(`/leads?${query}`, token)]);
      setOverview(summary); setLeads(results.leads); setTotal(results.total); setPage(results.page);
      setAuthorized(true); setKey(token); sessionStorage.setItem(sessionKey, token);
    } catch (cause) { setAuthorized(false); setError(cause.message); }
    finally { setBusy(false); }
  }, [api, page, search]);

  useEffect(() => { if (key) load(key); }, []); // Restore the administrator's session only after an explicit API check.

  async function signIn(event) { event.preventDefault(); await load(input.trim(), 1, ''); }
  function signOut() { sessionStorage.removeItem(sessionKey); setKey(''); setInput(''); setAuthorized(false); setOverview(null); setLeads([]); }
  async function exportCsv() {
    try {
      const response = await fetch(`${API}/leads.csv`, { headers: { 'x-admin-key': key }, cache: 'no-store' });
      if (!response.ok) throw new Error('No se pudo exportar el archivo.');
      const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement('a');
      link.href = url; link.download = 'santoto-event-leads.csv'; link.click(); URL.revokeObjectURL(url);
    } catch (cause) { setError(cause.message); }
  }

  if (!authorized) return <main className="admin-login"><form onSubmit={signIn} className="admin-login-card"><div className="admin-mark">S</div><p className="admin-kicker">SANTOTO · TUNJA</p><h1>Panel de evento</h1><p>Ingresa la clave administrativa autorizada para consultar leads y avance.</p><label>Clave administrativa<input autoComplete="current-password" type="password" value={input} onChange={(event) => setInput(event.target.value)} required minLength={32} /></label>{error && <p className="admin-error" role="alert">{error}</p>}<button className="admin-primary" disabled={busy}><KeyRound size={16} /> {busy ? 'Verificando…' : 'Ingresar de forma segura'}</button><small>La clave se valida en el servidor y solo se conserva en esta sesión del navegador.</small></form></main>;

  return <main className="admin-shell"><header className="admin-header"><div><p className="admin-kicker">EVOLUCIONA-T · ADMINISTRACIÓN</p><h1>Resumen del evento</h1></div><div className="admin-actions"><button onClick={() => load(key)} disabled={busy}><RefreshCw size={15} /> Actualizar</button><button onClick={exportCsv}><Download size={15} /> Exportar CSV</button><button onClick={signOut}><LogOut size={15} /> Salir</button></div></header>
    {error && <p className="admin-error" role="alert">{error}</p>}
    {overview && <><section className="admin-metrics"><Metric icon={<Users />} label="Leads registrados" value={overview.totals.leads} detail={`${overview.totals.today} hoy`} /><Metric icon={<CheckCircle2 />} label="Con preferencia definida" value={overview.totals.with_preference || 0} detail={`${overview.totals.marketing_opt_in || 0} aceptaron información`} /><Metric icon={<Trophy />} label="Retos completados" value={overview.activities.challenges} detail="Suma de niveles registrados" /><Metric icon={<Mic2 />} label="Asistencias a charlas" value={overview.activities.talk_checkins} detail="Sellos individuales guardados" /></section>
    <section className="admin-panel"><div className="admin-panel-title"><div><h2>Preferencia académica</h2><p>Distribución entre los programas seleccionados.</p></div></div><div className="preference-bars">{overview.preferences.map((item) => <div key={item.name}><span>{item.name}</span><strong>{item.count}</strong><i><b style={{ width: `${Math.max(4, 100 * item.count / Math.max(1, overview.preferences[0]?.count))}%` }} /></i></div>)}{!overview.preferences.length && <p>Aún no hay preferencias registradas.</p>}</div></section>
    <section className="admin-panel"><div className="admin-table-heading"><div><h2>Leads</h2><p>{total.toLocaleString('es-CO')} registros · información de acceso restringido</p></div><label className="admin-search"><Search size={16} /><input value={search} placeholder="Buscar nombre, correo o carrera" onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') load(key, 1, search); }} /><button onClick={() => load(key, 1, search)}>Buscar</button></label></div><div className="admin-table-wrap"><table><thead><tr><th>Aspirante</th><th>Contacto</th><th>Colegio / ciudad</th><th>Preferencia</th><th>Avance</th><th>Autorización</th><th>Registro</th></tr></thead><tbody>{leads.map((lead) => <tr key={lead.id}><td><strong>{lead.first_name} {lead.last_name}</strong><small>{lead.email}</small></td><td>{lead.phone || '—'}</td><td>{[lead.school, lead.city].filter(Boolean).join(' · ') || '—'}</td><td>{lead.preferred_program || 'Pendiente'}</td><td>{lead.completed_challenges} retos · {lead.talks_attended} charlas</td><td>{lead.consent_privacy ? 'Privacidad ✓' : '—'}<small>{lead.consent_marketing ? 'Información ✓' : 'Sin info comercial'}</small></td><td>{new Date(lead.created_at).toLocaleString('es-CO')}</td></tr>)}{!leads.length && <tr><td colSpan="7">No hay resultados para esta búsqueda.</td></tr>}</tbody></table></div><div className="admin-pagination"><span>Página {page} de {Math.max(1, Math.ceil(total / pageSize))}</span><div><button disabled={page <= 1 || busy} onClick={() => load(key, page - 1)}>Anterior</button><button disabled={page * pageSize >= total || busy} onClick={() => load(key, page + 1)}>Siguiente</button></div></div></section></>}
  </main>;
}

function Metric({ icon, label, value, detail }) { return <article className="admin-metric"><span>{icon}</span><small>{label}</small><strong>{Number(value || 0).toLocaleString('es-CO')}</strong><p>{detail}</p></article>; }
