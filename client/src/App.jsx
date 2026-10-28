import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BarChart3, Check, CheckCircle2, ChevronRight, CircleHelp, Coins, Leaf, LockKeyhole, Mic2, Sparkles, Trophy, UserRound, Volume2, VolumeX, Vibrate, X } from 'lucide-react';
import { useExperienceFeedback } from './feedback.js';

const API = '/api';
const EMPTY_PROGRESS = { challenges: [], talks: [], coins: 0, badges: [] };
const iconFor = (icon, size = 22) => icon === 'leaf' ? <Leaf size={size} /> : icon === 'chart' ? <BarChart3 size={size} /> : <Mic2 size={size} />;
const gameLabels = { builder: 'Arma', market: 'Presupuesta', sequence: 'Ordena', detective: 'Investiga', allocation: 'Distribuye', headline: 'Comunica' };

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

function FeedbackControls({ feedback }) {
  return <div className="feedback-controls" aria-label="Preferencias de sonido y vibración">
    <button type="button" className={`icon-toggle ${feedback.settings.sound ? 'enabled' : ''}`} aria-label={feedback.settings.sound ? 'Desactivar sonidos' : 'Activar sonidos'} aria-pressed={feedback.settings.sound} title={feedback.settings.sound ? 'Sonidos activados' : 'Sonidos desactivados'} onClick={() => feedback.toggle('sound')}>{feedback.settings.sound ? <Volume2 size={16} /> : <VolumeX size={16} />}</button>
    <button type="button" className={`icon-toggle ${feedback.settings.vibration ? 'enabled' : ''}`} aria-label={feedback.settings.vibration ? 'Desactivar vibración' : 'Activar vibración'} aria-pressed={feedback.settings.vibration} title={feedback.settings.vibration ? 'Vibración activada' : 'Vibración desactivada'} onClick={() => feedback.toggle('vibration')}><Vibrate size={16} /></button>
  </div>;
}

export default function App() {
  const feedback = useExperienceFeedback();
  const [event, setEvent] = useState(null);
  const [user, setUser] = useState(null);
  const [progress, setProgress] = useState(EMPTY_PROGRESS);
  const [view, setView] = useState('loading');
  const [activeProgram, setActiveProgram] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [guide, setGuide] = useState(null);
  const [deviceTilt, setDeviceTilt] = useState({ beta: 0, gamma: 0 });
  const [motionEnabled, setMotionEnabled] = useState(false);

  async function enableMotion() {
    if (motionEnabled) return;
    try {
      const orientation = window.DeviceOrientationEvent;
      if (orientation && typeof orientation.requestPermission === 'function') {
        if (await orientation.requestPermission() !== 'granted') return;
      }
      setMotionEnabled(true);
    } catch { /* Device tilt is an optional enhancement. */ }
  }

  useEffect(() => {
    if (!motionEnabled) return undefined;
    const handleOrientation = (event) => {
      if (event.beta == null || event.gamma == null) return;
      setDeviceTilt({ beta: Math.max(-7, Math.min(7, event.beta - 35)), gamma: Math.max(-7, Math.min(7, event.gamma)) });
    };
    window.addEventListener('deviceorientation', handleOrientation, { passive: true });
    return () => window.removeEventListener('deviceorientation', handleOrientation);
  }, [motionEnabled]);

  useEffect(() => {
    if (!guide) return undefined;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => document.querySelector('.guide-continue')?.focus(), 0);
    const keepDialogFocused = (event) => {
      if (event.key === 'Escape') event.preventDefault();
      if (event.key === 'Tab') { event.preventDefault(); document.querySelector('.guide-continue')?.focus(); }
    };
    document.addEventListener('keydown', keepDialogFocused);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', keepDialogFocused);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.();
    };
  }, [guide]);

  useEffect(() => {
    let alive = true;
    Promise.all([request('/event'), request('/me').catch(() => null)]).then(([data, session]) => {
      if (!alive) return;
      setEvent(data.event);
      if (session?.participant) {
        setUser(session.participant);
        setProgress(session.progress);
        setView('journey');
      } else {
        setView('welcome');
        setGuide({ title: '¡Hola! Soy Tommy', text: 'Te acompañaré por una misión individual. Visita los dos stands, completa los niveles y al final escucha las charlas. ¿Listo para empezar?', image: data.event.mascot.welcomeImage });
      }
    }).catch((error) => {
      if (alive) { setLoadError(error.message); setView('unavailable'); }
    });
    return () => { alive = false; };
  }, []);

  const earnedPrograms = useMemo(() => (event?.programs || []).filter((program) => program.challenges.every((challenge) => progress.challenges.some((row) => row.program_id === program.id && row.challenge_id === challenge.id))), [event, progress]);
  const auditoriumEarned = Boolean(event?.talks?.length && event.talks.every((talk) => progress.talks.some((row) => row.talk_id === talk.id)));
  const challengeCount = progress.challenges.length;
  const totalChallenges = event?.programs?.reduce((total, program) => total + program.challenges.length, 0) || 0;
  const totalActivities = totalChallenges + (event?.talks?.length || 0);
  const percent = totalActivities ? Math.round(((challengeCount + progress.talks.length) / totalActivities) * 100) : 0;

  function onRegistered(data) {
    setUser(data.participant);
    setProgress(data.progress);
    setView('journey');
    setGuide({ title: '¡Pasaporte creado!', text: 'Tu recorrido queda guardado con este correo. Completa cada nivel para coleccionar las insignias de Tommy y sumar monedas simbólicas.', image: event.mascot.welcomeImage });
    feedback.feedback('success');
  }
  function updateProgress(data) { setProgress(data.progress); }
  function openProgram(id) {
    setActiveProgram(id);
    setView('program');
  }
  function openAuditorium() {
    setView('auditorium');
    setGuide({ title: 'Misión del auditorio', text: 'Escucha cada charla y, cuando termine, pide al ponente el código de asistencia. Guarda un sello por cada charla para completar esta parte del pasaporte.', image: event.mascot.welcomeImage });
  }
  if (!event || view === 'loading') return <main className="loading-screen"><div className="loader-mark"><Sparkles size={24} /></div><p>Tommy está preparando tu pasaporte…</p></main>;
  if (view === 'unavailable') return <main className="loading-screen"><CircleHelp size={30} /><h1>No podemos conectar ahora</h1><p>{loadError || 'Vuelve a intentarlo en un momento.'}</p><button className="button button-primary" onClick={() => location.reload()}>Reintentar</button></main>;
  const tommyGuideImage = view === 'program' ? event.mascot.programImages[activeProgram] || event.mascot.welcomeImage : event.mascot.welcomeImage;

  return <div className="app-shell">
    <header className="topbar">
      <button className="brand-lockup" onClick={() => setView(user ? 'journey' : 'welcome')} aria-label="Ir al inicio"><span className="brand-seal">S</span><span className="brand-copy"><strong>SANTOTO</strong><small>TUNJA · EXPERIENCIA</small></span></button>
      <div className="topbar-right"><FeedbackControls feedback={feedback} />{user && <div className="coin-counter" aria-label={`${progress.coins} Tommy Coins`}><Coins size={17} /><strong>{progress.coins}</strong><span>Tommy Coins</span></div>}{user && <span className="user-greeting"><UserRound size={16} /> {user.first_name}</span>}</div>
    </header>

    {view === 'welcome' && <Welcome event={event} onRegistered={onRegistered} onFeedback={feedback.feedback} />}
    {view === 'journey' && <Journey event={event} user={user} progress={progress} earnedPrograms={earnedPrograms} auditoriumEarned={auditoriumEarned} percent={percent} setView={setView} onOpenProgram={openProgram} onOpenAuditorium={openAuditorium} deviceTilt={deviceTilt} motionEnabled={motionEnabled} onEnableMotion={enableMotion} />}
    {view === 'program' && <ProgramDetail key={activeProgram} event={event} program={event.programs.find((program) => program.id === activeProgram)} progress={progress} updateProgress={updateProgress} onBack={() => setView('journey')} onFeedback={feedback.feedback} onGuide={(challenge, currentProgram) => { const key = `challenge:${currentProgram.id}:${challenge.id}`; if (!sessionStorage.getItem(key)) { sessionStorage.setItem(key, 'seen'); setGuide({ title: challenge.title, text: currentProgram.guide, image: event.mascot.programImages[currentProgram.id] || event.mascot.welcomeImage }); } }} />}
    {view === 'auditorium' && <Auditorium event={event} progress={progress} updateProgress={updateProgress} onBack={() => setView('journey')} onFeedback={feedback.feedback} />}
    {view === 'finish' && <Finish event={event} user={user} progress={progress} onBack={() => setView('journey')} onFeedback={feedback.feedback} />}
    <footer className="site-footer"><span>Universidad Santo Tomás · Seccional Tunja</span><a href={event.privacyUrl} target="_blank" rel="noreferrer">Privacidad y tratamiento de datos <ArrowRight size={13} /></a></footer>
    <button type="button" className="tommy-fab" onClick={() => setGuide({ title: 'Aquí estoy para ayudarte', text: 'Avanza por los niveles en orden. Si necesitas una pista, vuelve aquí cuando quieras.', image: tommyGuideImage })} aria-label="Pedir ayuda a Tommy"><img src={tommyGuideImage} alt="" /><span>Tommy</span></button>
    {guide && <div className="guide-backdrop"><section className="guide-dialog" role="dialog" aria-modal="true" aria-labelledby="guide-title"><div className="guide-dialog-art"><img src={guide.image} alt="Tommy" /></div><div className="guide-dialog-copy"><span className="eyebrow">TOMMY TE CUENTA</span><h2 id="guide-title">{guide.title}</h2><p>{guide.text}</p><button className="button button-primary guide-continue" onClick={() => setGuide(null)}>{view === 'welcome' ? 'Entendido, empezar' : 'Entendido, continuar'} <ArrowRight size={17} /></button><small>El sonido y el movimiento del teléfono son opcionales y se pueden apagar.</small></div></section></div>}
  </div>;
}

function Welcome({ event, onRegistered, onFeedback }) {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', school: '', city: '', consentPrivacy: false, consentMarketing: false });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm((previous) => ({ ...previous, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  async function submit(e) {
    e.preventDefault(); setError('');
    if (!/^[\p{L}\p{M}][\p{L}\p{M}\s'.-]{1,79}$/u.test(form.firstName.trim())) return setError('Escribe tu nombre con al menos dos letras.');
    if (!/^[\p{L}\p{M}][\p{L}\p{M}\s'.-]{1,99}$/u.test(form.lastName.trim())) return setError('Escribe tu apellido con al menos dos letras.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return setError('Revisa que el correo tenga un formato válido.');
    if (form.phone && !/^\+?[0-9\s()\-]{7,20}$/.test(form.phone.trim())) return setError('Revisa el número de celular o déjalo vacío.');
    if (!form.consentPrivacy) return setError('Necesitamos tu autorización para gestionar tu participación.');
    setBusy(true);
    try { onRegistered(await request('/auth/register', { method: 'POST', body: JSON.stringify({ ...form, firstName: form.firstName.trim(), lastName: form.lastName.trim(), email: form.email.trim().toLowerCase() }) })); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return <main className="welcome-layout page-wrap">
    <section className="welcome-copy">
      <p className="eyebrow"><Sparkles size={15} /> {event.edition}</p>
      <h1>Tu futuro<br /><span>empieza explorando.</span></h1>
      <p className="welcome-lede">{event.intro}</p>
      <div className="welcome-highlights"><div><span className="highlight-number">02</span><span>programas<br />por descubrir</span></div><div><span className="highlight-number">06</span><span>misiones<br />interactivas</span></div><div><span className="highlight-number">03</span><span>charlas para<br />inspirarte</span></div></div>
      <div className="program-peek-list">{event.programs.map((program) => <div className={`program-peek ${program.tone}`} key={program.id}><span className="peek-icon">{iconFor(program.icon, 20)}</span><span><strong>{program.name}</strong><small>{program.tagline}</small></span><ArrowRight size={17} /></div>)}</div>
    </section>
    <section className="register-card">
      <div className="card-kicker"><span className="step-marker">01</span><span>Tu pasaporte explorador</span></div>
      <h2>Regístrate para<br />comenzar la misión</h2>
      <p className="card-subtitle">Tu recorrido es individual y te tomará menos de un minuto iniciar.</p>
      <form onSubmit={submit} className="registration-form" noValidate>
        <div className="form-row"><label>Nombre<input autoComplete="given-name" required minLength="2" maxLength="80" value={form.firstName} onChange={set('firstName')} placeholder="Tu nombre" aria-invalid={Boolean(error && !form.firstName)} /></label><label>Apellido<input autoComplete="family-name" required minLength="2" maxLength="100" value={form.lastName} onChange={set('lastName')} placeholder="Tu apellido" /></label></div>
        <label>Correo electrónico<input type="email" autoComplete="email" required maxLength="254" value={form.email} onChange={set('email')} placeholder="tunombre@correo.com" /></label>
        <div className="form-row"><label>Celular <span className="optional">Opcional</span><input type="tel" autoComplete="tel" maxLength="32" value={form.phone} onChange={set('phone')} placeholder="300 000 0000" /></label><label>Ciudad <span className="optional">Opcional</span><input maxLength="100" value={form.city} onChange={set('city')} placeholder="Tunja" /></label></div>
        <label>Colegio <span className="optional">Opcional</span><input maxLength="140" value={form.school} onChange={set('school')} placeholder="Nombre de tu colegio" /></label>
        <label className="consent-row"><input type="checkbox" checked={form.consentPrivacy} onChange={set('consentPrivacy')} required /><span>Autorizo el tratamiento de mis datos para gestionar mi participación en esta experiencia, conforme a la <a href={event.privacyUrl} target="_blank" rel="noreferrer">Política de Protección de Datos</a>.</span></label>
        <label className="consent-row"><input type="checkbox" checked={form.consentMarketing} onChange={set('consentMarketing')} /><span>Quiero recibir información sobre programas y procesos de admisión de la Santoto Tunja. (Opcional)</span></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button button-primary button-wide" type="submit" disabled={busy}>{busy ? 'Tommy prepara tu pasaporte…' : <>Comenzar mi misión <ArrowRight size={17} /></>}</button>
      </form>
      <p className="secure-note"><LockKeyhole size={13} /> Tus datos se usan conforme a la política institucional.</p>
    </section>
  </main>;
}

function Journey({ event, user, progress, earnedPrograms, auditoriumEarned, percent, setView, onOpenProgram, onOpenAuditorium, deviceTilt, motionEnabled, onEnableMotion }) {
  const finished = earnedPrograms.length === event.programs.length && auditoriumEarned;
  const totalBadges = event.programs.reduce((total, program) => total + program.challenges.length, 0) + (event.talks.length ? 1 : 0);
  return <main className="page-wrap journey-page">
    <section className="journey-hero"><div className="journey-copy"><p className="eyebrow"><Sparkles size={15} /> PASAPORTE EXPLORADOR</p><h1>¡Hola, {user.first_name}!<br /><span>Tommy te acompaña.</span></h1><p>Sigue el mapa, completa misiones individuales y colecciona insignias.</p></div><div className="progress-orbit" style={{ '--progress': `${percent}%` }}><div className="orbit-inner"><strong>{percent}%</strong><span>de tu misión</span></div><Sparkles className="orbit-star" size={17} /></div></section>
    <div className="passport-strip"><div className="passport-stamp"><Sparkles size={17} /></div><div className="passport-copy"><strong>Pasaporte de {user.first_name}</strong><span>{progress.badges.length} de {totalBadges} insignias · {progress.coins} Tommy Coins</span></div><div className="passport-progress"><span style={{ width: `${percent}%` }} /></div><div className="coin-counter passport-coins"><Coins size={18} /><strong>{progress.coins}</strong><span>Tommy Coins</span></div></div>
    <section className="collection-card side-card"><div className="section-heading compact"><div><p className="eyebrow">TU COLECCIÓN</p><h2>Insignias de Tommy</h2></div><Trophy size={20} /></div><p className="collection-intro">Cada nivel completado desbloquea una insignia que puedes guardar como imagen en tu celular.</p><button type="button" className={`motion-toggle ${motionEnabled ? 'active' : ''}`} onClick={onEnableMotion}><Vibrate size={14} /> {motionEnabled ? 'Movimiento activado' : 'Activar movimiento del teléfono'}</button><div className="badge-gallery">{event.programs.flatMap((program) => program.challenges.map((challenge, index) => { const earned = progress.challenges.some((row) => row.program_id === program.id && row.challenge_id === challenge.id); return <MissionBadge key={`${program.id}:${challenge.id}`} title={challenge.title} programName={program.shortName} image={event.mascot.programImages[program.id] || event.mascot.welcomeImage} earned={earned} serial={`${program.id === 'nutrition' ? 'N' : 'I'}-${index + 1}`} tilt={deviceTilt} />; }))}{event.talks.length > 0 && <MissionBadge title="Voz del futuro" programName="Auditorio" image={event.mascot.welcomeImage} earned={auditoriumEarned} serial="A-1" tilt={deviceTilt} />}</div></section>
    <div className="map-heading"><div><p className="eyebrow">TU MAPA DE AVENTURA</p><h2>Una misión, paso a paso</h2></div><span className="count-label">{progress.challenges.length} de {event.programs.reduce((sum, program) => sum + program.challenges.length, 0)} niveles</span></div>
    <section className="adventure-map">
      {event.programs.map((program, programIndex) => <ProgramPath key={program.id} program={program} programIndex={programIndex} progress={progress} onOpen={() => onOpenProgram(program.id)} />)}
      <AuditoriumMapNode event={event} progress={progress} auditoriumEarned={auditoriumEarned} onOpen={onOpenAuditorium} />
    </section>
    <section className="side-card coin-explainer"><div className="coin-big"><Coins size={25} /></div><p className="eyebrow">TOMMY COINS</p><h3>Un recuerdo de cada logro</h3><p>Ganas monedas simbólicas al completar retos, misiones e intervenciones. Son parte de tu pasaporte y no se canjean por premios.</p><span className="coin-balance"><Coins size={15} /> {progress.coins} acumuladas</span></section>
    {finished && <section className="finish-banner"><div><p className="eyebrow">¡PASAPORTE COMPLETO!</p><h2>Tommy tiene una última pregunta</h2><p>¿Cuál programa te gustaría conocer mejor?</p></div><button className="button button-primary" onClick={() => setView('finish')}>Elegir programa <ArrowRight size={17} /></button></section>}
  </main>;
}

function ProgramPath({ program, programIndex, progress, onOpen }) {
  const completed = program.challenges.filter((challenge) => progress.challenges.some((row) => row.program_id === program.id && row.challenge_id === challenge.id));
  const nextChallenge = program.challenges.find((challenge) => !completed.some((item) => item.id === challenge.id));
  const allDone = !nextChallenge;
  const mascot = program.id === 'nutrition' ? '/images/tommy/nutrition.png' : '/images/tommy/business.png';
  return <article className={`path-section ${program.tone}`}>
    <div className="path-section-head"><div className="path-program-icon">{iconFor(program.icon, 23)}</div><div className="path-program-copy"><span className="path-kicker">MISIÓN 0{programIndex + 1}</span><h3>{program.name}</h3><p>{program.description}</p></div><span className="path-total">{completed.length}/{program.challenges.length} niveles</span></div>
    <div className="level-path">{program.challenges.map((challenge, index) => {
      const done = completed.some((item) => item.id === challenge.id);
      const available = !done && nextChallenge?.id === challenge.id;
      return <div className={`path-stop ${done ? 'done' : available ? 'available' : 'locked'}`} key={challenge.id}>
        {index > 0 && <span className={`path-connector ${done ? 'done' : ''}`} aria-hidden="true" />}
        <button className="level-node" type="button" onClick={available ? onOpen : undefined} disabled={!available} aria-label={`${done ? 'Nivel completado' : available ? 'Iniciar nivel' : 'Nivel bloqueado'}: ${challenge.title}`}>
          <span className="node-circle">{done ? <Check size={20} /> : available ? iconFor(program.icon, 20) : <LockKeyhole size={17} />}</span>
          <span className="node-title">{challenge.title}</span><span className="node-type">{done ? 'COMPLETADO' : available ? `${gameLabels[challenge.type] || 'Juega'} · ${challenge.duration}` : 'BLOQUEADO'}</span>
        </button>
        {available && <span className="node-tommy"><img src={mascot} alt="" /></span>}
      </div>;
    })}<div className={`badge-stop ${allDone ? 'unlocked' : 'locked'}`}><span>{allDone ? <Trophy size={20} /> : <LockKeyhole size={17} />}</span><strong>Insignia</strong><small>{allDone ? program.badge : 'Completa los 3 niveles'}</small></div></div>
  </article>;
}

function AuditoriumMapNode({ event, progress, auditoriumEarned, onOpen }) {
  const checked = progress.talks.length;
  const unlocked = event.programs.every((program) => program.challenges.every((challenge) => progress.challenges.some((row) => row.program_id === program.id && row.challenge_id === challenge.id)));
  return <article className={`auditorium-map-node ${auditoriumEarned ? 'done' : unlocked ? 'available' : 'locked'}`}>
    <span className="auditorium-node-icon">{auditoriumEarned ? <Check size={21} /> : unlocked ? <Mic2 size={22} /> : <LockKeyhole size={18} />}</span><div><span className="path-kicker">MISIÓN FINAL</span><h3>El gran encuentro</h3><p>Escucha las charlas, descubre ideas y gana tu última insignia.</p><div className="talk-progress-dots">{event.talks.map((talk, index) => <span key={talk.id} className={progress.talks.some((row) => row.talk_id === talk.id) ? 'done' : ''}>{progress.talks.some((row) => row.talk_id === talk.id) ? <Check size={12} /> : `0${index + 1}`}</span>)}</div></div><button type="button" className="button button-ghost" onClick={onOpen} disabled={!unlocked && !auditoriumEarned}>{auditoriumEarned ? 'Insignia lista' : unlocked ? 'Entrar al auditorio' : 'Completa los stands'} <ChevronRight size={17} /></button><span className="auditorium-count">{checked}/{event.talks.length}</span>
  </article>;
}

function MissionBadge({ title, programName, image, earned, serial, tilt }) {
  async function saveBadge() {
    if (!earned) return;
    const art = new Image(); art.src = image;
    try { await art.decode(); } catch { return; }
    const canvas = document.createElement('canvas'); canvas.width = 900; canvas.height = 1100;
    const context = canvas.getContext('2d');
    const gradient = context.createLinearGradient(0, 0, 900, 1100);
    gradient.addColorStop(0, '#f5fbf8'); gradient.addColorStop(1, '#e6f1ee');
    context.fillStyle = gradient; context.fillRect(0, 0, 900, 1100);
    context.fillStyle = '#12213a'; context.beginPath(); context.roundRect(52, 52, 796, 996, 54); context.fill();
    context.strokeStyle = '#e7bd56'; context.lineWidth = 16; context.beginPath(); context.arc(450, 420, 296, 0, Math.PI * 2); context.stroke();
    context.save(); context.beginPath(); context.arc(450, 420, 278, 0, Math.PI * 2); context.clip(); context.drawImage(art, 177, 147, 546, 546); context.restore();
    context.textAlign = 'center'; context.fillStyle = '#a4ead0'; context.font = '700 30px Arial'; context.fillText(`${programName.toLocaleUpperCase('es')} · INSIGNIA ${serial}`, 450, 790);
    context.fillStyle = '#ffffff'; context.font = '700 43px Arial';
    const lines = []; let line = '';
    for (const word of title.split(' ')) { const next = line ? `${line} ${word}` : word; if (context.measureText(next).width > 680 && line) { lines.push(line); line = word; } else line = next; }
    if (line) lines.push(line);
    lines.slice(0, 2).forEach((text, index) => context.fillText(text, 450, 866 + index * 54));
    context.fillStyle = '#f5cc68'; context.font = '600 26px Arial'; context.fillText('PASAPORTE EXPLORADOR · TOMMY', 450, 1000);
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const filename = `insignia-tommy-${serial.toLowerCase()}.png`;
      const file = new File([blob], filename, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] }) && navigator.share) {
        try { await navigator.share({ files: [file], title: `Insignia de Tommy · ${title}` }); return; }
        catch (error) { if (error.name === 'AbortError') return; }
      }
      const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
      anchor.href = url; anchor.download = filename; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  }
  const style = { '--tilt-x': `${tilt.beta * -0.35}deg`, '--tilt-y': `${tilt.gamma * 0.35}deg` };
  return <article className={`mission-badge ${earned ? 'earned' : 'locked'}`} style={style}>
    <div className="badge-coin-art"><div className="badge-image-wrap"><img src={image} alt="" /></div><span className="badge-serial">{earned ? serial : <LockKeyhole size={15} />}</span></div>
    <div className="badge-card-copy"><small>{programName}</small><strong>{title}</strong><span>{earned ? 'Insignia desbloqueada' : 'Completa el nivel para desbloquearla'}</span></div>
    <button type="button" className="badge-save" disabled={!earned} onClick={saveBadge}>{earned ? 'Guardar en el celular' : 'Bloqueada'}{earned && <ArrowDown size={14} />}</button>
  </article>;
}

function ProgramDetail({ event, program, progress, updateProgress, onBack, onFeedback, onGuide }) {
  const [selectedItems, setSelectedItems] = useState([]);
  const [sequence, setSequence] = useState(program?.challenges[0]?.items?.map((item) => item.id) || []);
  const [detectiveChoice, setDetectiveChoice] = useState('');
  const [allocation, setAllocation] = useState({});
  const [headline, setHeadline] = useState({ sales: '', returns: '' });
  const [celebration, setCelebration] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const completedIds = progress.challenges.filter((row) => row.program_id === program.id).map((row) => row.challenge_id);
  const challenge = program.challenges.find((item) => !completedIds.includes(item.id));
  const allDone = !challenge;
  const current = challenge;

  useEffect(() => {
    if (!current) return;
    setSelectedItems([]);
    setSequence(current.items?.map((item) => item.id) || []);
    setDetectiveChoice('');
    setAllocation(Object.fromEntries((current.buckets || []).map((bucket) => [bucket.id, 0])));
    setHeadline({ sales: '', returns: '' });
    setError('');
    onGuide(current, program);
  }, [current?.id]);

  if (!program) return null;
  function buildAnswer() {
    if (current.type === 'builder' || current.type === 'market') return selectedItems;
    if (current.type === 'sequence') return sequence;
    if (current.type === 'detective') return detectiveChoice;
    if (current.type === 'allocation') return allocation;
    if (current.type === 'headline') return `${headline.sales}|${headline.returns}`;
    return null;
  }

  function missingAnswer() {
    if (current.type === 'builder' && (selectedItems.length < current.minimumSelections || selectedItems.length > current.maximumSelections)) return `Elige entre ${current.minimumSelections} y ${current.maximumSelections} ingredientes.`;
    if (current.type === 'market' && selectedItems.length < current.minimumSelections) return `Elige al menos ${current.minimumSelections} productos para tu canasta.`;
    if (current.type === 'detective' && !detectiveChoice) return 'Elige qué pista revisarías primero.';
    if (current.type === 'allocation' && Object.values(allocation).reduce((sum, value) => sum + value, 0) !== current.totalTokens) return `Reparte las ${current.totalTokens} fichas antes de confirmar.`;
    if (current.type === 'headline' && (!headline.sales || !headline.returns)) return 'Completa las dos partes del titular.';
    return '';
  }

  async function submit() {
    const validation = missingAnswer();
    if (validation) { setError(validation); onFeedback('tap'); return; }
    setBusy(true); setError('');
    try {
      const data = await request(`/challenges/${program.id}/${current.id}/complete`, { method: 'POST', body: JSON.stringify({ answer: buildAnswer() }) });
      updateProgress(data);
      setCelebration({ feedback: data.feedback, badgeEarned: data.badgeEarned, coinsAwarded: data.coinsAwarded });
      onFeedback(data.badgeEarned ? 'success' : 'coin');
    } catch (err) { setError(err.message); onFeedback('tap'); }
    finally { setBusy(false); }
  }

  function toggleItem(id, cap = Infinity) {
    setSelectedItems((previous) => previous.includes(id) ? previous.filter((item) => item !== id) : previous.length >= cap ? previous : [...previous, id]);
    setError(''); onFeedback('tap');
  }

  function moveStep(id, direction) {
    setSequence((previous) => {
      const index = previous.indexOf(id); const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= previous.length) return previous;
      const next = [...previous]; [next[index], next[nextIndex]] = [next[nextIndex], next[index]]; return next;
    });
    onFeedback('tap');
  }

  function changeAllocation(id, amount) {
    const used = Object.values(allocation).reduce((sum, value) => sum + value, 0);
    const value = allocation[id] || 0;
    if (amount > 0 && (used >= current.totalTokens || value >= current.maxTokensPerBucket)) return;
    setAllocation((previous) => ({ ...previous, [id]: Math.max(0, value + amount) }));
    setError(''); onFeedback('tap');
  }

  return <main className="page-wrap inner-page"><button className="back-link" onClick={onBack}><ArrowLeft size={16} /> Volver al mapa</button><div className={`challenge-layout ${program.tone}`}>
    <aside className="challenge-sidebar"><div className="program-symbol large">{iconFor(program.icon, 28)}</div><p className="eyebrow">MISIÓN INDIVIDUAL</p><h1>{program.name}</h1><p>{program.tagline}</p><div className="challenge-steps">{program.challenges.map((item, index) => { const done = completedIds.includes(item.id); const active = item.id === current?.id; return <div key={item.id} className={`challenge-step ${done ? 'complete' : active ? 'active' : ''}`}><span>{done ? <Check size={14} /> : active ? iconFor(program.icon, 13) : <LockKeyhole size={12} />}</span><div><strong>{item.title}</strong><small>{done ? 'Completado' : active ? `${gameLabels[item.type]} · ${item.duration}` : 'Bloqueado'}</small></div></div>; })}</div><Badge title={program.badge} earned={allDone} icon={iconFor(program.icon, 14)} /></aside>
    <section className="challenge-content">
      {celebration ? <div className="level-celebration"><div className="win-illustration"><Coins size={39} /></div><p className="eyebrow">¡NIVEL COMPLETADO!</p><h2>+{celebration.coinsAwarded} Tommy Coins</h2><p>{celebration.feedback}</p>{celebration.badgeEarned && <div className="new-badge-banner"><Trophy size={18} /><span>¡Insignia de Tommy desbloqueada y guardada en tu colección!</span></div>}<button className="button button-primary" onClick={() => setCelebration(null)}>Seguir el mapa <ArrowRight size={17} /></button></div> : allDone ? <div className="challenge-done"><div className="win-illustration"><Trophy size={40} /></div><p className="eyebrow">¡MISIÓN COMPLETADA!</p><h2>Insignia<br /><span>{program.badge}</span></h2><p>Tommy guardó tu logro en el pasaporte. ¡Puedes continuar con la otra misión!</p><button className="button button-primary" onClick={onBack}>Volver al mapa <ArrowRight size={17} /></button></div> : <>
        <div className="challenge-content-head"><span className="eyebrow">NIVEL {String(completedIds.length + 1).padStart(2, '0')} DE 03</span><span className="time-chip">✦ {gameLabels[current.type]} · {current.duration}</span></div><div className="challenge-progress-full"><span style={{ width: `${(completedIds.length / program.challenges.length) * 100}%` }} /></div>
        <div className="question-block"><h2>{current.title}</h2><p>{current.prompt}</p></div>
        <GameBoard challenge={current} selectedItems={selectedItems} toggleItem={toggleItem} sequence={sequence} moveStep={moveStep} detectiveChoice={detectiveChoice} setDetectiveChoice={(value) => { setDetectiveChoice(value); setError(''); onFeedback('tap'); }} allocation={allocation} changeAllocation={changeAllocation} headline={headline} setHeadline={(value) => { setHeadline(value); setError(''); onFeedback('tap'); }} />
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="challenge-actions"><button className="button button-primary" disabled={busy} onClick={submit}>{busy ? 'Tommy revisa tu misión…' : <>Completar y ganar <Coins size={16} /> +{event.gamification.coinsPerChallenge + event.gamification.coinsPerBadge}</>}</button></div>
        <p className="challenge-footnote"><CircleHelp size={14} /> Prueba, explora y aprende. Cada misión es individual.</p>
      </>}
    </section>
  </div></main>;
}

function GameBoard({ challenge, selectedItems, toggleItem, sequence, moveStep, detectiveChoice, setDetectiveChoice, allocation, changeAllocation, headline, setHeadline }) {
  if (challenge.type === 'builder') return <div className="ingredient-game"><div className="game-counter"><span>Tu plato</span><strong>{selectedItems.length}/{challenge.maximumSelections} ingredientes</strong></div><div className="plate-preview"><span className="plate-icon">🍽️</span>{selectedItems.length ? selectedItems.map((id) => <span className="plate-food" key={id}>{challenge.items.find((item) => item.id === id)?.emoji}</span>) : <small>Agrega alimentos variados</small>}</div><div className="game-item-grid">{challenge.items.map((item) => <button key={item.id} className={`food-tile ${selectedItems.includes(item.id) ? 'selected' : ''}`} type="button" aria-pressed={selectedItems.includes(item.id)} onClick={() => toggleItem(item.id, challenge.maximumSelections)}><span className="food-emoji">{item.emoji}</span><strong>{item.label}</strong><small>{item.displayGroup || item.group}</small></button>)}</div></div>;
  if (challenge.type === 'market') {
    const cost = selectedItems.reduce((sum, id) => sum + challenge.items.find((item) => item.id === id).cost, 0);
    return <div className="market-game"><div className="budget-meter"><div><span>Tu presupuesto</span><strong>{challenge.budget - cost} <small>fichas disponibles</small></strong></div><div className="budget-coins">{Array.from({ length: challenge.budget }, (_, index) => <span key={index} className={index < cost ? 'spent' : ''}><Coins size={15} /></span>)}</div></div><div className="market-grid">{challenge.items.map((item) => <button key={item.id} type="button" className={`market-item ${selectedItems.includes(item.id) ? 'selected' : ''}`} aria-pressed={selectedItems.includes(item.id)} onClick={() => { if (!selectedItems.includes(item.id) && item.cost + cost > challenge.budget) return; toggleItem(item.id); }}><span className="market-emoji">{item.emoji}</span><span><strong>{item.label}</strong><small>{item.group}</small></span><b>{item.cost} <Coins size={12} /></b>{selectedItems.includes(item.id) && <Check size={15} className="market-check" />}</button>)}</div></div>;
  }
  if (challenge.type === 'sequence') return <div className="sequence-game"><div className="sequence-hint"><Sparkles size={15} /> Ordena los pasos con las flechas</div>{sequence.map((id, index) => { const item = challenge.items.find((candidate) => candidate.id === id); return <div className="sequence-row" key={id}><span className="sequence-number">{index + 1}</span><span className="sequence-emoji">{item.emoji}</span><strong>{item.label}</strong><div className="sequence-controls"><button type="button" aria-label={`Subir ${item.label}`} disabled={index === 0} onClick={() => moveStep(id, -1)}><ArrowUp size={15} /></button><button type="button" aria-label={`Bajar ${item.label}`} disabled={index === sequence.length - 1} onClick={() => moveStep(id, 1)}><ArrowDown size={15} /></button></div></div>; })}</div>;
  if (challenge.type === 'detective') return <div className="detective-game"><div className="dashboard-metrics">{challenge.metrics.map((metric) => <div className={`metric-tile ${metric.trend}`} key={metric.label}><small>{metric.label}</small><strong>{metric.value}</strong><span>{metric.trend === 'up' ? '↗' : '→'}</span></div>)}</div><p className="game-instruction">Toca una pista para investigarla:</p><div className="clue-list">{challenge.items.map((item) => <button type="button" key={item.id} className={`clue-card ${detectiveChoice === item.id ? 'selected' : ''}`} aria-pressed={detectiveChoice === item.id} onClick={() => setDetectiveChoice(item.id)}><span>{item.emoji}</span><div><strong>{item.label}</strong><small>{item.detail}</small></div>{detectiveChoice === item.id && <CheckCircle2 size={17} />}</button>)}</div></div>;
  if (challenge.type === 'allocation') {
    const used = Object.values(allocation).reduce((sum, value) => sum + value, 0);
    return <div className="allocation-game"><div className="allocation-header"><span>Fichas asignadas</span><strong className={used === challenge.totalTokens ? 'ready' : ''}>{used}<small> / {challenge.totalTokens}</small></strong></div>{challenge.buckets.map((bucket) => <div className="allocation-row" key={bucket.id}><span className="allocation-emoji">{bucket.emoji}</span><div className="allocation-name"><strong>{bucket.label}</strong><small>{allocation[bucket.id] || 0} fichas</small></div><div className="allocation-controls"><button type="button" aria-label={`Quitar ficha de ${bucket.label}`} disabled={(allocation[bucket.id] || 0) <= 0} onClick={() => changeAllocation(bucket.id, -1)}>−</button><span>{allocation[bucket.id] || 0}</span><button type="button" aria-label={`Agregar ficha a ${bucket.label}`} onClick={() => changeAllocation(bucket.id, 1)}>+</button></div></div>)}<div className="token-rail">{Array.from({ length: challenge.totalTokens }, (_, index) => <span className={index < used ? 'used' : ''} key={index}><Coins size={15} /></span>)}</div></div>;
  }
  if (challenge.type === 'headline') return <div className="headline-game"><div className="headline-chart">{challenge.metrics.map((metric) => <div className="headline-metric" key={metric.label}><span>{metric.label}</span><strong>{metric.before}<ArrowRight size={14} />{metric.after}</strong></div>)}</div><div className="headline-builder"><span>Las ventas</span><select value={headline.sales} onChange={(e) => setHeadline({ ...headline, sales: e.target.value })} aria-label="Comportamiento de las ventas"><option value="">elige…</option>{challenge.headlineOptions.sales.map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}</select><span>y las devoluciones</span><select value={headline.returns} onChange={(e) => setHeadline({ ...headline, returns: e.target.value })} aria-label="Comportamiento de las devoluciones"><option value="">elige…</option>{challenge.headlineOptions.returns.map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}</select><span>.</span></div><p className="headline-preview">“Las ventas {challenge.headlineOptions.sales.find((item) => item.id === headline.sales)?.label || '…'} y las devoluciones {challenge.headlineOptions.returns.find((item) => item.id === headline.returns)?.label || '…'}.”</p></div>;
  return null;
}

function Auditorium({ event, progress, updateProgress, onBack, onFeedback }) {
  const [codes, setCodes] = useState({});
  const [error, setError] = useState({});
  const [awards, setAwards] = useState({});
  const [busyId, setBusyId] = useState('');
  const checked = progress.talks.map((row) => row.talk_id);
  const earned = event.talks.every((talk) => checked.includes(talk.id));

  async function checkIn(talk) {
    const code = (codes[talk.id] || '').trim();
    if (!code) return setError((previous) => ({ ...previous, [talk.id]: 'Escribe el código que anunció el ponente.' }));
    setBusyId(talk.id); setError((previous) => ({ ...previous, [talk.id]: '' }));
    try {
      const data = await request(`/talks/${talk.id}/check-in`, { method: 'POST', body: JSON.stringify({ code }) });
      updateProgress(data);
      setAwards((previous) => ({ ...previous, [talk.id]: data.coinsAwarded }));
      setCodes((previous) => ({ ...previous, [talk.id]: '' }));
      onFeedback('coin');
    } catch (err) { setError((previous) => ({ ...previous, [talk.id]: err.message })); onFeedback('tap'); }
    finally { setBusyId(''); }
  }

  return <main className="page-wrap inner-page"><button className="back-link" onClick={onBack}><ArrowLeft size={16} /> Volver al mapa</button><section className="auditorium-page"><div className="auditorium-banner"><span className="banner-icon"><Mic2 size={28} /></span><p className="eyebrow">MISIÓN FINAL · AUDITORIO</p><h1>Escucha.<br /><span>Conecta ideas.</span></h1><p>Cada ponente compartirá un código distinto. Registra cada charla para completar el pasaporte.</p><div className="speaker-art"><span /><span /><span /></div><div className="auditorium-mascot"><img src={event.mascot.welcomeImage} alt="Tommy te acompaña en el auditorio" /></div></div><div className="talks-panel"><div className="section-heading"><div><p className="eyebrow">PASAPORTE DE CHARLAS</p><h2>Tres ideas para tu futuro</h2></div><span className="count-label">{checked.length}/{event.talks.length} completas</span></div><div className="talk-list">{event.talks.map((talk, index) => { const isDone = checked.includes(talk.id); return <article className={`talk-row ${isDone ? 'checked' : ''}`} key={talk.id}><span className="talk-index">{isDone ? <Check size={15} /> : `0${index + 1}`}</span><div className="talk-info"><strong>{talk.title}</strong><span>{talk.speaker}</span>{isDone ? <span className="attendance-done"><CheckCircle2 size={14} /> Sello guardado en tu pasaporte</span> : <div className="talk-code-entry"><label className="sr-only" htmlFor={`code-${talk.id}`}>Código para {talk.label}</label><input id={`code-${talk.id}`} value={codes[talk.id] || ''} onChange={(e) => setCodes((previous) => ({ ...previous, [talk.id]: e.target.value }))} placeholder={`Código de ${talk.label}`} autoComplete="off" maxLength="40" /><button type="button" className="text-button" disabled={!codes[talk.id]?.trim() || busyId === talk.id} onClick={() => checkIn(talk)}>{busyId === talk.id ? 'Validando…' : 'Guardar asistencia'} <ArrowRight size={14} /></button></div>}{error[talk.id] && <span className="talk-error" role="alert">{error[talk.id]}</span>}</div></article>; })}</div>{earned && <div className="auditorium-earned"><Trophy size={21} /><div><strong>¡Insignia Voz del futuro desbloqueada!</strong><span>+{event.gamification.coinsPerAuditoriumBadge} Tommy Coins · {event.rewards.description}</span></div></div>}<p className="challenge-footnote"><LockKeyhole size={14} /> Cada charla se registra una sola vez con un código propio.</p></div></section></main>;
}

function Finish({ event, user, progress, onBack, onFeedback }) {
  const [choice, setChoice] = useState(user.preferred_program || ''); const [saved, setSaved] = useState(false); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function save() {
    if (!choice) return setError('Elige un programa o marca “Aún no lo sé”.');
    setError(''); setBusy(true);
    try { await request('/me/preference', { method: 'PATCH', body: JSON.stringify({ program: choice }) }); setSaved(true); onFeedback('success'); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <main className="page-wrap inner-page"><button className="back-link" onClick={onBack}><ArrowLeft size={16} /> Volver al mapa</button><section className="finish-layout"><div className="finish-art"><div className="finish-medal"><Trophy size={38} /></div><span className="spark spark-one">✦</span><span className="spark spark-two">✧</span><span className="spark spark-three">✦</span><img src={event.mascot.welcomeImage} alt="Tommy celebra tu recorrido" /></div><div className="finish-copy"><p className="eyebrow">¡RECORRIDO COMPLETADO!</p><h1>Exploraste.<br /><span>Ahora elige tu camino.</span></h1><p>Hola {user.first_name}, cuéntanos cuál programa te gustaría conocer mejor. La preferencia se registra por separado de tus resultados en los juegos.</p><div className="preference-list">{[...event.programs.map((program) => program.name), ...event.otherPrograms, 'Aún no lo sé'].map((name) => <label className={`preference-option ${choice === name ? 'selected' : ''}`} key={name}><input type="radio" name="preference" value={name} checked={choice === name} onChange={() => { setChoice(name); setSaved(false); }} /><span>{name}</span>{choice === name && <Check size={17} />}</label>)}</div>{error && <p className="form-error" role="alert">{error}</p>}{saved ? <div className="feedback success"><CheckCircle2 size={18} /><span>¡Gracias! Tu interés quedó registrado.</span></div> : <button className="button button-primary" disabled={!choice || busy} onClick={save}>{busy ? 'Guardando…' : <>Guardar mi preferencia <ArrowRight size={17} /></>}</button>}<p className="challenge-footnote">{progress.challenges.length} niveles y {progress.talks.length} charlas completadas · {progress.coins} Tommy Coins reunidas.</p></div></section></main>;
}
