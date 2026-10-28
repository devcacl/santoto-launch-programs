import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, BarChart3, Check, CheckCircle2, ChevronRight, CircleHelp, Compass, Leaf, LockKeyhole, LogOut, MapPin, Medal, Mic2, Sparkles, Trophy, UserRound, X } from 'lucide-react';

const API = '/api';
const iconFor = (icon, size = 22) => icon === 'leaf' ? <Leaf size={size} /> : icon === 'chart' ? <BarChart3 size={size} /> : <Mic2 size={size} />;

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, { credentials: 'include', headers: { 'Content-Type': 'application/json', ...options.headers }, ...options });
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok) {
    const data = contentType.includes('json') ? await response.json() : {};
    throw new Error(data.error || 'No pudimos completar la solicitud. Inténtalo de nuevo.');
  }
  return contentType.includes('json') ? response.json() : response;
}

function Badge({ title, earned, icon }) {
  return <div className={`badge-chip ${earned ? 'is-earned' : ''}`}><span className="badge-icon">{earned ? <Check size={15} /> : icon}</span><span>{title}</span><span className="badge-status">{earned ? 'Lista' : 'Por ganar'}</span></div>;
}

export default function App() {
  const [event, setEvent] = useState(null);
  const [user, setUser] = useState(null);
  const [progress, setProgress] = useState({ challenges: [], talks: [] });
  const [view, setView] = useState('loading');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let alive = true;
    Promise.all([request('/event'), request('/me').catch(() => null)]).then(([data, session]) => {
      if (!alive) return;
      setEvent(data.event);
      if (session?.participant) {
        setUser(session.participant);
        setProgress(session.progress);
        setView('journey');
      } else setView('welcome');
    }).catch(() => alive && setView('unavailable'));
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    const selectProgram = (event) => setNotice(event.detail);
    window.addEventListener('select-program', selectProgram);
    return () => window.removeEventListener('select-program', selectProgram);
  }, []);

  const earnedPrograms = useMemo(() => (event?.programs || []).filter((p) => p.challenges.every((c) => progress.challenges.some((x) => x.program_id === p.id && x.challenge_id === c.id))), [event, progress]);
  const auditoriumEarned = Boolean(event?.talks?.length && event.talks.every((t) => progress.talks.some((x) => x.talk_id === t.id)));
  const challengeCount = progress.challenges.length;
  const totalCount = event?.programs?.reduce((total, p) => total + p.challenges.length, 0) || 0;
  const overall = totalCount + (event?.talks?.length || 0);
  const completedCount = challengeCount + progress.talks.length;
  const percent = overall ? Math.round((completedCount / overall) * 100) : 0;

  function onRegistered(data) {
    setUser(data.participant);
    setProgress(data.progress);
    setView('journey');
  }
  function updateProgress(data) { setProgress(data.progress); }

  if (!event || view === 'loading') return <main className="loading-screen"><div className="loader-mark"><Sparkles size={24} /></div><p>Preparando tu recorrido</p></main>;
  if (view === 'unavailable') return <main className="loading-screen"><CircleHelp size={30} /><h1>No podemos conectar ahora</h1><p>Vuelve a intentarlo en un momento.</p><button className="button button-primary" onClick={() => location.reload()}>Reintentar</button></main>;

  return <div className="app-shell">
    <header className="topbar">
      <button className="brand-lockup" onClick={() => setView(user ? 'journey' : 'welcome')} aria-label="Inicio">
        <span className="brand-seal">S</span><span className="brand-copy"><strong>SANTOTO</strong><small>TUNJA · EXPERIENCIA</small></span>
      </button>
      <div className="topbar-right"><span className="event-pill"><span className="live-dot" /> EXPERIENCIA DE LANZAMIENTO</span>{user && <span className="user-greeting"><UserRound size={16} /> {user.first_name}</span>}</div>
    </header>

    {view === 'welcome' && <Welcome event={event} onRegistered={onRegistered} />}
    {view === 'journey' && <Journey event={event} user={user} progress={progress} earnedPrograms={earnedPrograms} auditoriumEarned={auditoriumEarned} percent={percent} setView={setView} />}
    {view === 'program' && <ProgramDetail event={event} program={event.programs.find((p) => p.id === notice)} progress={progress} updateProgress={updateProgress} onBack={() => setView('journey')} />}
    {view === 'auditorium' && <Auditorium event={event} progress={progress} updateProgress={updateProgress} onBack={() => setView('journey')} />}
    {view === 'finish' && <Finish event={event} user={user} progress={progress} onBack={() => setView('journey')} />}
    <footer className="site-footer"><span>Universidad Santo Tomás · Seccional Tunja</span><a href={event.privacyUrl} target="_blank" rel="noreferrer">Privacidad y tratamiento de datos <ArrowRight size={13} /></a></footer>
  </div>;
}

function Welcome({ event, onRegistered }) {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', school: '', city: '', consentPrivacy: false, consentMarketing: false });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  async function submit(e) {
    e.preventDefault(); setError(''); setBusy(true);
    try { onRegistered(await request('/auth/register', { method: 'POST', body: JSON.stringify(form) })); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <main className="welcome-layout page-wrap">
    <section className="welcome-copy">
      <p className="eyebrow"><Sparkles size={15} /> {event.edition}</p>
      <h1>Tu futuro<br /><span>empieza explorando.</span></h1>
      <p className="welcome-lede">{event.intro}</p>
      <div className="welcome-highlights"><div><span className="highlight-number">02</span><span>programas<br />por descubrir</span></div><div><span className="highlight-number">06</span><span>retos para<br />poner a prueba tus ideas</span></div><div><span className="highlight-number">03</span><span>charlas para<br />inspirarte</span></div></div>
      <div className="program-peek-list">{event.programs.map((p) => <div className={`program-peek ${p.tone}`} key={p.id}><span className="peek-icon">{iconFor(p.icon, 20)}</span><span><strong>{p.name}</strong><small>{p.tagline}</small></span><ArrowRight size={17} /></div>)}</div>
    </section>
    <section className="register-card">
      <div className="card-kicker"><span className="step-marker">01</span><span>Tu experiencia comienza aquí</span></div>
      <h2>Regístrate para<br />empezar tu recorrido</h2>
      <p className="card-subtitle">Te tomará menos de un minuto. Al final podrás elegir el programa que más te interesa.</p>
      <form onSubmit={submit} className="registration-form">
        <div className="form-row"><label>Nombre<input autoComplete="given-name" required minLength="2" maxLength="80" value={form.firstName} onChange={set('firstName')} placeholder="Tu nombre" /></label><label>Apellido<input autoComplete="family-name" required minLength="2" maxLength="100" value={form.lastName} onChange={set('lastName')} placeholder="Tu apellido" /></label></div>
        <label>Correo electrónico<input type="email" autoComplete="email" required maxLength="254" value={form.email} onChange={set('email')} placeholder="tunombre@correo.com" /></label>
        <div className="form-row"><label>Celular <span className="optional">Opcional</span><input type="tel" autoComplete="tel" maxLength="32" value={form.phone} onChange={set('phone')} placeholder="300 000 0000" /></label><label>Ciudad <span className="optional">Opcional</span><input maxLength="100" value={form.city} onChange={set('city')} placeholder="Tunja" /></label></div>
        <label>Colegio <span className="optional">Opcional</span><input maxLength="140" value={form.school} onChange={set('school')} placeholder="Nombre de tu colegio" /></label>
        <label className="consent-row"><input type="checkbox" checked={form.consentPrivacy} onChange={set('consentPrivacy')} required /><span>Autorizo el tratamiento de mis datos para gestionar mi participación en esta experiencia, conforme a la <a href={event.privacyUrl} target="_blank" rel="noreferrer">Política de Protección de Datos</a>.</span></label>
        <label className="consent-row"><input type="checkbox" checked={form.consentMarketing} onChange={set('consentMarketing')} /><span>Quiero recibir información sobre programas y procesos de admisión de la Santoto Tunja. (Opcional)</span></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button button-primary button-wide" type="submit" disabled={busy}>{busy ? 'Preparando tu espacio…' : <>Comenzar mi recorrido <ArrowRight size={17} /></>}</button>
      </form>
      <p className="secure-note"><LockKeyhole size={13} /> Tus datos se usan conforme a la política institucional.</p>
    </section>
  </main>;
}

function Journey({ event, user, progress, earnedPrograms, auditoriumEarned, percent, setView }) {
  const finished = earnedPrograms.length === event.programs.length && auditoriumEarned;
  const openProgram = (id) => { setView('program'); window.dispatchEvent(new CustomEvent('select-program', { detail: id })); };
  return <main className="page-wrap journey-page">
    <section className="journey-hero"><div className="journey-copy"><p className="eyebrow"><Compass size={15} /> TU MAPA DE EXPERIENCIA</p><h1>¡Hola, {user.first_name}!<br /><span>¿Listo para explorar?</span></h1><p>Completa los retos, suma insignias y encuentra el programa que conecta contigo.</p></div><div className="progress-orbit" style={{ '--progress': `${percent}%` }}><div className="orbit-inner"><strong>{percent}%</strong><span>completado</span></div><Sparkles className="orbit-star" size={17} /></div></section>
    <div className="journey-grid"><section className="journey-main">
      <div className="section-heading"><div><p className="eyebrow">TU MISIÓN</p><h2>Explora a tu ritmo</h2></div><span className="count-label">{progress.challenges.length}/{event.programs.reduce((n, p) => n + p.challenges.length, 0)} retos</span></div>
      <div className="program-cards">{event.programs.map((program, index) => {
        const completed = progress.challenges.filter((x) => x.program_id === program.id).length;
        const earned = program.challenges.length === completed;
        return <article className={`program-card ${program.tone}`} key={program.id}>
          <div className="program-card-top"><div className="program-symbol">{iconFor(program.icon, 24)}</div><span className={`status-tag ${earned ? 'done' : ''}`}>{earned ? <><CheckCircle2 size={13} /> Insignia obtenida</> : `MISIÓN 0${index + 1}`}</span></div>
          <h3>{program.name}</h3><p>{program.description}</p><div className="challenge-progress"><div className="mini-track"><span style={{ width: `${Math.round(completed / program.challenges.length * 100)}%` }} /></div><span>{completed}/{program.challenges.length} retos</span></div>
          <button className="card-link" onClick={() => openProgram(program.id)}>{earned ? 'Ver mi insignia' : completed ? 'Continuar reto' : 'Explorar programa'} <ArrowRight size={17} /></button>
          <div className="card-watermark">{iconFor(program.icon, 116)}</div>
        </article>;
      })}</div>
      <article className={`auditorium-card ${auditoriumEarned ? 'done' : ''}`}><div className="auditorium-icon"><Mic2 size={23} /></div><div className="auditorium-copy"><span className="eyebrow">EL GRAN ENCUENTRO</span><h3>Charlas en el auditorio</h3><p>Inspírate con tres conversaciones sobre tu futuro.</p><div className="talk-dots">{event.talks.map((talk) => <span key={talk.id} className={progress.talks.some((x) => x.talk_id === talk.id) ? 'complete' : ''}>{progress.talks.some((x) => x.talk_id === talk.id) ? <Check size={11} /> : '•'} {talk.label}</span>)}</div></div><button className="button button-ghost" onClick={() => setView('auditorium')}>{auditoriumEarned ? 'Insignia lista' : 'Registrar asistencia'} <ChevronRight size={17} /></button></article>
    </section><aside className="journey-side"><div className="side-card badge-collection"><div className="section-heading compact"><div><p className="eyebrow">COLECCIÓN</p><h2>Tus insignias</h2></div><Trophy size={20} /></div>{event.programs.map((p) => <Badge key={p.id} title={p.badge} earned={earnedPrograms.includes(p)} icon={iconFor(p.icon, 14)} />)}<Badge title="Voz del futuro" earned={auditoriumEarned} icon={<Mic2 size={14} />} /><div className="badge-tip"><Sparkles size={15} /><span>Completa cada misión para desbloquear una insignia especial.</span></div></div>
      <div className="side-card next-step"><div className="next-step-icon"><MapPin size={19} /></div><p className="eyebrow">TU SIGUIENTE PASO</p><h3>{finished ? '¡Lo lograste!' : earnedPrograms.length < event.programs.length ? 'Visita los stands' : 'Pasa por el auditorio'}</h3><p>{finished ? 'Ya tienes las tres insignias. Cuéntanos qué programa te interesa.' : earnedPrograms.length < event.programs.length ? 'Cada stand es una oportunidad para probar algo nuevo.' : 'Asiste a las tres charlas para completar tu colección.'}</p>{finished && <button onClick={() => setView('finish')} className="text-button">Elegir programa <ArrowRight size={15} /></button>}</div>
      {event.rewards.enabled && <div className="reward-callout"><Medal size={18} /><span>{event.rewards.description}</span></div>}
    </aside></div>
  </main>;
}

function ProgramDetail({ event, program, progress, updateProgress, onBack }) {
  const [challengeIndex, setChallengeIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    function select(e) { if (e.detail === program?.id) setChallengeIndex(0); }
    window.addEventListener('select-program', select); return () => window.removeEventListener('select-program', select);
  }, [program?.id]);
  if (!program) return null;
  const completed = progress.challenges.filter((x) => x.program_id === program.id).map((x) => x.challenge_id);
  const challenge = program.challenges.find((item) => !completed.includes(item.id));
  const done = !challenge;
  const activeIndex = done ? program.challenges.length - 1 : program.challenges.findIndex((item) => item.id === challenge.id);
  const current = challenge || program.challenges[program.challenges.length - 1];
  const options = current.options;
  async function submit() {
    if (selected === null) return;
    setBusy(true); setError(''); setFeedback('');
    try {
      const data = await request(`/challenges/${program.id}/${current.id}/complete`, { method: 'POST', body: JSON.stringify({ answerIndex: selected }) });
      updateProgress(data); setFeedback(data.feedback); setSelected(null);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <main className="page-wrap inner-page"><button className="back-link" onClick={onBack}><ArrowLeft size={16} /> Volver a mi mapa</button><div className={`challenge-layout ${program.tone}`}>
    <aside className="challenge-sidebar"><div className="program-symbol large">{iconFor(program.icon, 28)}</div><p className="eyebrow">MISIÓN DE PROGRAMA</p><h1>{program.name}</h1><p>{program.tagline}</p><div className="challenge-steps">{program.challenges.map((item, index) => <div key={item.id} className={`challenge-step ${completed.includes(item.id) ? 'complete' : item.id === challenge?.id ? 'active' : ''}`}><span>{completed.includes(item.id) ? <Check size={14} /> : `0${index + 1}`}</span><div><strong>{item.title}</strong><small>{completed.includes(item.id) ? 'Completado' : item.id === challenge?.id ? 'En curso' : 'Por descubrir'}</small></div></div>)}</div><Badge title={program.badge} earned={done} icon={iconFor(program.icon, 14)} /></aside>
    <section className="challenge-content">{done ? <div className="challenge-done"><div className="win-illustration"><Trophy size={40} /></div><p className="eyebrow">¡MISIÓN COMPLETADA!</p><h2>Tu nueva insignia<br /><span>{program.badge}</span></h2><p>Ya completaste todos los retos de {program.name}. Sigue explorando para desbloquear las demás insignias.</p><button className="button button-primary" onClick={onBack}>Volver a mi mapa <ArrowRight size={17} /></button></div> : <>
      <div className="challenge-content-head"><span className="eyebrow">RETO 0{activeIndex + 1} DE 0{program.challenges.length}</span><span className="time-chip">✦ Reto rápido</span></div><div className="challenge-progress-full"><span style={{ width: `${(activeIndex / program.challenges.length) * 100}%` }} /></div>
      <div className="question-block"><span className="question-icon">{iconFor(program.icon, 23)}</span><h2>{current.title}</h2><p>{current.prompt}</p></div>
      <div className="answer-options">{options.map((option, index) => <button key={option} className={`answer-option ${selected === index ? 'selected' : ''}`} onClick={() => { setSelected(index); setError(''); }}><span className="option-letter">{String.fromCharCode(65 + index)}</span><span>{option}</span>{selected === index && <Check size={17} />}</button>)}</div>
      {feedback && <div className="feedback success" role="status"><CheckCircle2 size={18} /><span>{feedback}</span></div>}{error && <div className="feedback error" role="alert"><X size={18} /><span>{error}</span></div>}
      <div className="challenge-actions">{feedback ? <button className="button button-primary" onClick={() => { setFeedback(''); if (activeIndex + 1 < program.challenges.length) setChallengeIndex(activeIndex + 1); }}>Siguiente paso <ArrowRight size={17} /></button> : <button className="button button-primary" disabled={selected === null || busy} onClick={submit}>{busy ? 'Revisando…' : <>Confirmar respuesta <ArrowRight size={17} /></>}</button>}</div>
      <p className="challenge-footnote"><CircleHelp size={14} /> No necesitas conocimientos previos. ¡Ven a descubrir!</p>
    </>}</section>
  </div></main>;
}

function Auditorium({ event, progress, updateProgress, onBack }) {
  const [code, setCode] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const checked = progress.talks.map((x) => x.talk_id);
  async function checkIn(id) {
    setBusy(true); setError('');
    try { updateProgress(await request(`/talks/${id}/check-in`, { method: 'POST', body: JSON.stringify({ code }) })); setCode(''); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  const earned = event.talks.every((talk) => checked.includes(talk.id));
  return <main className="page-wrap inner-page"><button className="back-link" onClick={onBack}><ArrowLeft size={16} /> Volver a mi mapa</button><section className="auditorium-page"><div className="auditorium-banner"><span className="banner-icon"><Mic2 size={28} /></span><p className="eyebrow">EL GRAN ENCUENTRO</p><h1>Ideas que abren<br /><span>nuevos caminos.</span></h1><p>Asiste a las charlas y registra tu asistencia con el código que comparta cada ponente.</p><div className="speaker-art"><span /><span /><span /></div></div><div className="talks-panel"><div className="section-heading"><div><p className="eyebrow">AUDITORIO</p><h2>Tu agenda de inspiración</h2></div><span className="count-label">{checked.length}/{event.talks.length} charlas</span></div><div className="talk-list">{event.talks.map((talk, index) => <article className={`talk-row ${checked.includes(talk.id) ? 'checked' : ''}`} key={talk.id}><span className="talk-index">0{index + 1}</span><div className="talk-info"><strong>{talk.title}</strong><span>{talk.speaker}</span></div>{checked.includes(talk.id) ? <span className="attendance-done"><CheckCircle2 size={16} /> Asistencia registrada</span> : <button className="text-button" onClick={() => checkIn(talk.id)} disabled={!code || busy}>Validar código <ArrowRight size={15} /></button>}</article>)}</div><label className="code-label">CÓDIGO DE ASISTENCIA<input value={code} onChange={(e) => setCode(e.target.value.trim())} placeholder="Ingresa el código anunciado" /></label>{error && <p className="form-error" role="alert">{error}</p>}{earned && <div className="feedback success"><CheckCircle2 size={18} /><span>¡Insignia Voz del futuro desbloqueada!</span></div>}<p className="challenge-footnote"><LockKeyhole size={14} /> El código se valida de forma segura y cada charla se registra una sola vez.</p></div></section></main>;
}

function Finish({ event, user, progress, onBack }) {
  const [choice, setChoice] = useState(user.preferred_program || ''); const [saved, setSaved] = useState(false); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function save() {
    setError(''); setBusy(true);
    try { await request('/me/preference', { method: 'PATCH', body: JSON.stringify({ program: choice }) }); setSaved(true); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <main className="page-wrap inner-page"><button className="back-link" onClick={onBack}><ArrowLeft size={16} /> Volver a mi mapa</button><section className="finish-layout"><div className="finish-art"><div className="finish-medal"><Trophy size={38} /></div><span className="spark spark-one">✦</span><span className="spark spark-two">✧</span><span className="spark spark-three">✦</span></div><div className="finish-copy"><p className="eyebrow">¡RECORRIDO COMPLETADO!</p><h1>Exploraste.<br /><span>Ahora elige tu camino.</span></h1><p>Hola {user.first_name}, cuéntanos cuál programa te gustaría conocer mejor. Tu respuesta orienta el seguimiento de Admisiones.</p><div className="preference-list">{[...event.programs.map((p) => p.name), ...event.otherPrograms, 'Aún no lo sé'].map((name) => <label className={`preference-option ${choice === name ? 'selected' : ''}`} key={name}><input type="radio" name="preference" value={name} checked={choice === name} onChange={() => { setChoice(name); setSaved(false); }} /><span>{name}</span>{choice === name && <Check size={17} />}</label>)}</div>{error && <p className="form-error">{error}</p>}{saved ? <div className="feedback success"><CheckCircle2 size={18} /><span>¡Gracias! Tu interés quedó registrado.</span></div> : <button className="button button-primary" disabled={!choice || busy} onClick={save}>{busy ? 'Guardando…' : <>Guardar mi preferencia <ArrowRight size={17} /></>}</button>}<p className="challenge-footnote">{progress.challenges.length} retos y {progress.talks.length} charlas completadas.</p></div></section></main>;
}
