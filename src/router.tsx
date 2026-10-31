import { createRootRoute, createRoute, createRouter, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { FlightMap } from "./components/FlightMap";
import { categoryLabels, classifyZones, type RectangleBounds } from "./lib/map";
import type { CameraSpecs, Drone } from "./lib/types";
import { trpc } from "./trpc";

const rootRoute = createRootRoute({ component: () => <Outlet /> });

function LoginPage() {
  const [registering, setRegistering] = useState(false);
  const [formError, setFormError] = useState("");
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const login = trpc.auth.login.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      await navigate({ to: "/home" });
    },
    onError: (error) => setFormError(error.message)
  });
  const register = trpc.auth.register.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      await navigate({ to: "/home" });
    },
    onError: (error) => setFormError(error.message)
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    if (registering) {
      register.mutate({ name: String(form.get("name")), email, password });
    } else {
      login.mutate({ email, password });
    }
  };
  const submitting = login.isPending || register.isPending;

  return (
    <main className="auth-page">
      <a className="brand" href="/login"><span className="brand-mark">↗</span> aripi<span className="brand-period">.</span></a>
      <div className="auth-layout">
        <section className="auth-story">
          <span className="eyebrow"><i /> PLANIFICARE CLARĂ, ZBORURI MAI BUNE</span>
          <h1>Lasă grijile<br />la sol.<br /><span>Tu vezi de zbor.</span></h1>
          <p>Dronele tale, locația și regulile spațiului aerian — organizate într-un singur loc.</p>
          <div className="auth-benefits"><span>01 <b>Profil securizat</b></span><span>02 <b>Toată flota ta</b></span><span>03 <b>Harta României</b></span></div>
        </section>
        <section className="auth-card">
          <span className="section-eyebrow">BINE AI VENIT LA ARIPI</span>
          <h2>{registering ? "Creează-ți contul" : "Intră în cont"}</h2>
          <p>{registering ? "Înregistrează-te și configurează-ți flota." : "Continuă de unde ai rămas."}</p>
          <form onSubmit={submit}>
            {registering && <Field label="Nume și prenume" name="name" autoComplete="name" required />}
            <Field label="E-mail" name="email" type="email" autoComplete="email" required />
            <Field label="Parolă" name="password" type="password" autoComplete={registering ? "new-password" : "current-password"} minLength={8} required />
            {formError && <p className="form-error" role="alert">{formError}</p>}
            <button className="button button-primary button-wide" disabled={submitting}>{submitting ? "Se încarcă…" : registering ? "Creează contul" : "Intră în cont"} <span>→</span></button>
          </form>
          <div className="auth-switch">
            {registering ? "Ai deja un cont?" : "Nu ai cont încă?"}{" "}
            <button type="button" onClick={() => { setFormError(""); setRegistering(!registering); }}>
              {registering ? "Intră în cont" : "Creează unul"}
            </button>
          </div>
          <div className="auth-security">Cont real, cu sesiune securizată. Parola este protejată prin hash cu salt și nu este păstrată în browser.</div>
        </section>
      </div>
      <footer className="auth-footer"><span>© 2026 aripi · Zboară informat, zboară responsabil.</span><span>OpenStreetMap · ROMATSA</span></footer>
    </main>
  );
}

function Field({ label, name, type = "text", required = false, autoComplete, min, max, minLength, placeholder, defaultValue, step, value, onChange }: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  min?: number;
  max?: number;
  minLength?: number;
  placeholder?: string;
  defaultValue?: string | number;
  step?: string;
  value?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}{required && " *"}</span>
      <input name={name} type={type} required={required} autoComplete={autoComplete} min={min} max={max} minLength={minLength} step={step} placeholder={placeholder} defaultValue={value === undefined ? defaultValue : undefined} value={value} onChange={onChange ? (event) => onChange(event.target.value) : undefined} />
    </label>
  );
}

function ProtectedLayout() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { data: user, isLoading, error } = trpc.auth.me.useQuery();
  const academy = trpc.academy.get.useQuery(undefined, { enabled: Boolean(user) });
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => navigate({ to: "/login" })
  });
  useEffect(() => {
    if (!isLoading && !user) navigate({ to: "/login" });
  }, [isLoading, user, navigate]);
  const flightPathLocked = pathname === "/planner" || pathname === "/aerofoto";
  useEffect(() => {
    if (user && academy.data && !academy.data.passed && flightPathLocked) navigate({ to: "/academy" });
  }, [user, academy.data, flightPathLocked, navigate]);
  if (isLoading || !user) return <div className="loading-screen">{error ? `Nu am putut verifica sesiunea: ${error.message}` : "Se deschide spațiul tău…"}</div>;
  if (academy.isLoading) return <div className="loading-screen">Se verifică progresul Academiei…</div>;
  if (academy.isError || !academy.data) return <div className="loading-screen" role="alert">Nu am putut verifica Academia: {academy.error?.message || "Date indisponibile."}</div>;
  if (!academy.data.passed && flightPathLocked) {
    return <div className="loading-screen academy-lock"><strong>Planificarea zborului este blocată.</strong><p>Promovează Academia Aripi pentru a continua.</p><Link className="button button-primary" to="/academy">Mergi la academie →</Link></div>;
  }
  return (
    <div className="app-shell" data-theme={theme}>
      <Sidebar name={user.name} onLogout={() => logout.mutate()} theme={theme} onThemeToggle={() => setTheme(theme === "dark" ? "light" : "dark")} />
      <main className="main-content">
        {logout.error && <div className="notice-banner" role="alert"><span>!</span><p>Nu am putut încheia sesiunea: {logout.error.message}</p></div>}
        <Outlet />
        <footer className="footer"><span>© 2026 aripi</span><span>Verifică NOTAM-urile și sursele oficiale înainte de zbor.</span></footer>
      </main>
    </div>
  );
}

function IndexPage() {
  const navigate = useNavigate();
  const { data: user, isLoading, error } = trpc.auth.me.useQuery();
  useEffect(() => {
    if (!isLoading) navigate({ to: user ? "/home" : "/login" });
  }, [isLoading, user, navigate]);
  if (error) return <div className="loading-screen">Nu am putut verifica sesiunea: {error.message}</div>;
  return <div className="loading-screen">Se deschide spațiul tău…</div>;
}

function Sidebar({ name, onLogout, theme, onThemeToggle }: { name: string; onLogout: () => void; theme: "dark" | "light"; onThemeToggle: () => void }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase("ro-RO")).join("");
  const nav = [
    { to: "/home" as const, label: "Acasă", icon: "home" as const },
    { to: "/planner" as const, label: "Hartă", icon: "map" as const },
    { to: "/drones" as const, label: "Drone", icon: "drone" as const },
    { to: "/academy" as const, label: "Academia", icon: "learn" as const },
    { to: "/aerofoto" as const, label: "Cerere", icon: "flight" as const }
  ];
  return (
    <>
      <header className="app-header">
        <div className="app-header-inner">
          <Link className="brand" to="/home"><span className="brand-mark">↗</span> aripi<span className="brand-period">.</span></Link>
          <div className="header-actions">
            <Link className="header-plan" to="/planner"><span aria-hidden="true">⌖</span><span>Planifică zborul</span></Link>
            <button className="header-icon-button" onClick={onThemeToggle} aria-label={theme === "dark" ? "Activează modul luminos" : "Activează modul întunecat"} title={theme === "dark" ? "Mod luminos" : "Mod întunecat"}>{theme === "dark" ? "☼" : "☾"}</button>
            <button className="header-avatar" onClick={onLogout} aria-label={`Ieși din contul ${name}`} title={`${name} · Ieși din cont`}>{initials || "P"}</button>
          </div>
        </div>
      </header>
      <nav className="bottom-nav" aria-label="Navigare principală">
        {nav.map((item) => <Link key={item.to} to={item.to} activeProps={{ className: "bottom-nav-item nav-active" }} className="bottom-nav-item"><NavIcon name={item.icon} /><span>{item.label}</span></Link>)}
      </nav>
    </>
  );
}

function NavIcon({ name }: { name: "home" | "map" | "drone" | "learn" | "flight" }) {
  const paths = {
    home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-6h6v6" /></>,
    map: <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z" /><path d="M9 3v15m6-12v15" /></>,
    drone: <><path d="M12 12 7 7m5 5 5-5m-5 5-5 5m5-5 5 5" /><circle cx="5" cy="5" r="2.5" /><circle cx="19" cy="5" r="2.5" /><circle cx="5" cy="19" r="2.5" /><circle cx="19" cy="19" r="2.5" /><circle cx="12" cy="12" r="2" /></>,
    learn: <><path d="m2 8 10-5 10 5-10 5z" /><path d="M6 10v5c3.5 3 8.5 3 12 0v-5m4-2v7" /></>,
    flight: <><path d="m22 2-7 20-4-9-9-4 20-7Z" /><path d="M22 2 11 13" /></>
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function HomePage() {
  const { data: drones = [], isLoading } = trpc.drones.list.useQuery();
  const academy = trpc.academy.get.useQuery();
  const navigate = useNavigate();
  const name = trpc.auth.me.useQuery().data?.name.split(/\s+/)[0] || "pilot";
  return (
    <div className="page-content">
      <section className="welcome-row">
        <div><span className="eyebrow"><i /> BUN VENIT, PILOT</span><h1>Hai să pregătim următorul zbor.</h1><p>Echipamentul, harta și pașii importanți — într-un singur loc.</p></div>
        <button className="button button-outline" onClick={() => navigate({ to: academy.data?.passed ? "/planner" : "/academy" })}><span aria-hidden="true">{academy.data?.passed ? "⌖" : "✦"}</span> {academy.data?.passed ? "Deschide harta" : "Promovează academia"}</button>
      </section>
      <section className="hero-panel">
        <div className="hero-copy"><span className="hero-badge"><span aria-hidden="true">✦</span> {academy.data?.passed ? "GATA DE PLANIFICARE" : "ACADEMIA ÎNAINTE DE ZBOR"}</span><h2>{academy.data?.passed ? <>Un plan clar.<br /><span>Un zbor mai bun.</span></> : <>Învață întâi.<br /><span>Zboară responsabil.</span></>}</h2><p>{academy.data?.passed ? "Adaugă drona, trasează zona și verifică informațiile aeronautice disponibile înainte de decolare." : "Parcurge Academia și promovează testul înainte să poți accesa planificarea zborului."}</p><div className="hero-actions"><button className="button button-light" onClick={() => navigate({ to: academy.data?.passed ? (drones.length ? "/planner" : "/drones") : "/academy" })}>{academy.data?.passed ? (drones.length ? "Planifică zborul" : "Adaugă prima dronă") : "Începe academia"} <span>→</span></button><button className="button button-glass" onClick={() => navigate({ to: "/academy" })}>{academy.data?.passed ? "Recapitulează" : "Vezi pașii"} <span>↗</span></button></div><div className="hero-footnote"><span>●</span>{academy.data?.passed ? "Date ROMATSA orientative · confirmă prin sursele oficiale" : "Planificarea rămâne blocată până promovezi testul"}</div></div>
        <div className="hero-illustration" aria-hidden="true"><div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" /><div className="hero-drone">✣</div><span className="hero-coordinate">45° 56′ N<br />24° 58′ E</span><span className="hero-spark spark-one">✦</span><span className="hero-spark spark-two">✦</span></div>
      </section>
      <div className="dashboard-grid">
        <section className="surface-card dashboard-drones">
          <div className="section-heading"><div><span className="section-eyebrow">ECHIPAMENTUL TĂU</span><h2>Dronele mele</h2></div><Link to="/drones" className="text-link">Vezi flota <span>→</span></Link></div>
          {isLoading ? <p className="muted">Se încarcă flota…</p> : drones.length ? <div className="home-drone-list">{drones.slice(0, 3).map((drone) => <DroneSummary key={drone.id} drone={drone} />)}</div> : <div className="empty-state"><span className="empty-icon">⌁</span><strong>Flota ta începe aici</strong><p>Adaugă dronele și detaliile camerelor lor.</p><Link to="/drones" className="text-link">Adaugă prima dronă →</Link></div>}
        </section>
        <section className="surface-card dashboard-map">
          <span className="section-eyebrow">PLANIFICARE</span><div className="map-card-icon">⌖</div><h2>{academy.data?.passed ? "Unde vrei să zbori?" : "Deblochează harta"}</h2><p>{academy.data?.passed ? "Găsește-te pe hartă, desenează o zonă și consultă stratul public ROMATSA." : "Promovează Academia Aripi înainte să poți planifica un zbor."}</p><button className="button button-outline button-wide" onClick={() => navigate({ to: academy.data?.passed ? (drones.length ? "/planner" : "/drones") : "/academy" })}>{academy.data?.passed ? "Deschide harta" : "Mergi la academie"} <span>→</span></button>
        </section>
        <section className="surface-card dashboard-learn">
          <div className="section-heading"><div><span className="section-eyebrow">ÎNCEPUT RAPID</span><h2>Primii pași</h2></div><Link to="/academy" className="text-link">Deschide Academia <span>→</span></Link></div>
          <div className="quick-steps"><Link to="/drones"><span>01</span><strong>Configurează drona</strong><b>→</b></Link><Link to={academy.data?.passed ? "/planner" : "/academy"}><span>02</span><strong>{academy.data?.passed ? "Alege zona de zbor" : "Promovează Academia"}</strong><b>→</b></Link><Link to={academy.data?.passed ? "/aerofoto" : "/academy"}><span>03</span><strong>Pregătește un draft</strong><b>→</b></Link></div>
        </section>
      </div>
      <div className="notice-banner"><span>ⓘ</span><p>Aripi verifică orientativ zonele și traficul disponibil. Statusurile de aprobare din demo sunt simulate; nu sunt autorizații reale și nu includ NOTAM-uri curente.</p></div>
    </div>
  );
}

function AcademyPage() {
  const { data: academy, isLoading, error } = trpc.academy.get.useQuery();
  const utils = trpc.useUtils();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ passed: boolean; score: number; total: number; passingScore: number } | null>(null);
  const submit = trpc.academy.submit.useMutation({
    onSuccess: async (submission) => {
      setResult(submission);
      await utils.academy.get.invalidate();
    }
  });
  if (isLoading) return <div className="loading-card">Se încarcă Academia…</div>;
  if (error || !academy) return <div className="notice-banner" role="alert">Nu am putut încărca Academia: {error?.message || "Date indisponibile."}</div>;
  const completed = Object.keys(answers).length === academy.questions.length;
  const displayedResult = result || (academy.score !== null && !academy.passed
    ? { passed: false, score: academy.score, total: academy.total, passingScore: academy.passingScore }
    : null);
  const submitAnswers = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setResult(null);
    submit.mutate({ answers: academy.questions.map((question) => ({ questionId: question.id, optionId: answers[question.id] || "" })) });
  };
  return (
    <div className="page-content">
      <section className="page-intro"><span className="eyebrow">ÎNVĂȚARE ȘI SIGURANȚĂ</span><h1>Academia Aripi</h1><p>Învață verificările de bază și promovează testul pentru a debloca planificarea zborului.</p></section>
      <section className={`academy-status ${academy.passed ? "academy-status-passed" : ""}`}>
        <span className="academy-status-icon">{academy.passed ? "✓" : "✦"}</span>
        <div><strong>{academy.passed ? "Academie promovată" : "Planificarea zborului este blocată"}</strong><p>{academy.passed ? `Ai obținut ${academy.score}/${academy.total}. Poți accesa plannerul; verifică în continuare sursele oficiale înainte de orice zbor.` : `Răspunde corect la cel puțin ${academy.passingScore} din ${academy.total} întrebări pentru a debloca plannerul.`}</p></div>
        {academy.passed && <Link className="button button-primary" to="/planner">Deschide harta →</Link>}
      </section>
      <section className="learn-hero"><span className="hero-badge"><span aria-hidden="true">✦</span> ÎNAINTE DE DECOLARE</span><h2>Siguranța începe cu verificări simple.</h2><p>Confirmă condițiile și restricțiile folosind sursele oficiale actuale. Un rezultat din Aripi nu este o autorizație de zbor și nu înlocuiește instruirea oficială.</p></section>
      <div className="academy-topics">
        <article className="surface-card academy-topic"><span>01</span><strong>Verifică zona</strong><p>Consultă restricțiile și NOTAM-urile actuale înainte să alegi aria de operare.</p></article>
        <article className="surface-card academy-topic"><span>02</span><strong>Verifică drona și vremea</strong><p>Respectă limitele producătorului și amână zborul când condițiile nu sunt sigure.</p></article>
        <article className="surface-card academy-topic"><span>03</span><strong>Protejează oamenii</strong><p>Păstrează controlul, evaluează riscurile și nu interfera cu intervențiile de urgență.</p></article>
      </div>
      <form className="academy-exam" onSubmit={submitAnswers}>
        <div className="academy-exam-heading"><div><span className="section-eyebrow">TEST DE SIGURANȚĂ</span><h2>Verifică ce ai învățat</h2><p>10 întrebări · prag de promovare {academy.passingScore}/{academy.questions.length}</p></div><span className="exam-progress">{Object.keys(answers).length}/{academy.questions.length}</span></div>
        <div className="academy-questions">
          {academy.questions.map((question, index) => (
            <fieldset className="academy-question" key={question.id}>
              <legend><span>{String(index + 1).padStart(2, "0")}</span>{question.question}</legend>
              <div className="academy-options">{question.options.map((option) => (
                <label key={option.id} className={answers[question.id] === option.id ? "academy-option option-selected" : "academy-option"}>
                  <input type="radio" name={question.id} value={option.id} checked={answers[question.id] === option.id} onChange={() => { setAnswers((current) => ({ ...current, [question.id]: option.id })); setResult(null); }} />
                  <span>{option.text}</span>
                </label>
              ))}</div>
            </fieldset>
          ))}
        </div>
        {submit.error && <p className="form-error" role="alert">Nu am putut înregistra testul: {submit.error.message}</p>}
        {displayedResult && <div className={displayedResult.passed ? "exam-result exam-result-passed" : "exam-result exam-result-failed"} role="status"><strong>{displayedResult.passed ? "Ai promovat Academia." : "Test nepromovat încă."}</strong><span>Scor: {displayedResult.score}/{displayedResult.total} · prag: {displayedResult.passingScore}/{displayedResult.total}</span>{!displayedResult.passed && <button className="button button-quiet" type="button" onClick={() => { setAnswers({}); setResult(null); }}>Reia testul</button>}</div>}
        {!academy.passed && <button className="button button-primary academy-submit" type="submit" disabled={!completed || submit.isPending}>{submit.isPending ? "Se verifică răspunsurile…" : "Trimite testul"} <span>→</span></button>}
        <p className="academy-disclaimer">Acest test este un ghid introductiv creat pentru aplicație, nu un examen oficial, o calificare de pilot sau o autorizare de zbor.</p>
      </form>
      <div className="notice-banner"><span>ⓘ</span><p>Accesul la planner se deblochează numai după promovarea testului. Chiar și după promovare, verifică NOTAM-urile, restricțiile și aprobările necesare prin canalele oficiale.</p></div>
    </div>
  );
}

function DroneSummary({ drone }: { drone: Drone }) {
  return <article className="drone-summary"><span className="drone-icon">⌁</span><div><strong>{drone.manufacturer ? `${drone.manufacturer} ${drone.model}` : drone.model}</strong><small>{categoryLabels[drone.category]} · {drone.weightGrams} g · {drone.camera.model || "Fără cameră specificată"}</small></div><span className="class-tag">{drone.uasClass || "—"}</span></article>;
}

function DroneForm({ drone, onCancel, onSaved }: { drone?: Drone; onCancel?: () => void; onSaved: () => void }) {
  const [error, setError] = useState("");
  const utils = trpc.useUtils();
  const create = trpc.drones.create.useMutation({
    onSuccess: async () => { await utils.drones.list.invalidate(); onSaved(); },
    onError: (mutationError) => setError(mutationError.message)
  });
  const update = trpc.drones.update.useMutation({
    onSuccess: async () => { await utils.drones.list.invalidate(); onSaved(); },
    onError: (mutationError) => setError(mutationError.message)
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    const data = new FormData(event.currentTarget);
    const focalLength = String(data.get("focalLengthMm") || "").trim();
    const input = {
      model: String(data.get("model")),
      manufacturer: String(data.get("manufacturer")),
      weightGrams: Number(data.get("weightGrams")),
      category: String(data.get("category")) as Drone["category"],
      uasClass: String(data.get("uasClass")),
      serial: String(data.get("serial")),
      operatorId: String(data.get("operatorId")),
      remoteId: String(data.get("remoteId")),
      camera: {
        manufacturer: String(data.get("cameraManufacturer")),
        model: String(data.get("cameraModel")),
        sensor: String(data.get("sensor")),
        resolution: String(data.get("resolution")),
        focalLengthMm: focalLength ? Number(focalLength) : null,
        videoResolution: String(data.get("videoResolution")),
        stabilization: String(data.get("stabilization"))
      }
    };
    if (drone) update.mutate({ ...input, id: drone.id });
    else create.mutate(input);
  };
  const busy = create.isPending || update.isPending;
  const camera = drone?.camera;
  return (
    <form className="drone-form" onSubmit={submit}>
      <div className="form-section-title"><span>01</span><div><strong>Identificare dronă</strong><small>Categoria și datele pentru flota ta</small></div></div>
      <div className="form-grid">
        <Field label="Model" name="model" placeholder="Ex. Mini 4 Pro" required defaultValue={drone?.model} />
        <Field label="Producător" name="manufacturer" placeholder="Ex. DJI" defaultValue={drone?.manufacturer} />
        <Field label="Masă maximă la decolare (g)" name="weightGrams" type="number" min={1} max={250000} step="any" placeholder="249" required defaultValue={drone?.weightGrams} />
        <label className="field"><span>Categorie *</span><select name="category" required defaultValue={drone?.category || "multirotor"}><option value="multirotor">Multirotor</option><option value="fixed-wing">Aripă fixă</option><option value="fpv">FPV</option><option value="cinewhoop">Cinewhoop</option><option value="other">Alt tip</option></select></label>
        <label className="field"><span>Clasa UE</span><select name="uasClass" defaultValue={drone?.uasClass || ""}><option value="">Nespecificată</option>{["C0", "C1", "C2", "C3", "C4", "Fără clasă / legacy", "Nu știu încă"].map((item) => <option key={item}>{item}</option>)}</select></label>
        <Field label="Serie" name="serial" placeholder="Opțional" defaultValue={drone?.serial} />
        <Field label="Număr operator UAS" name="operatorId" placeholder="Opțional" defaultValue={drone?.operatorId} />
        <label className="field"><span>Identificare la distanță</span><select name="remoteId" defaultValue={drone?.remoteId || ""}><option value="">Nespecificată</option><option>Activă</option><option>Nu este disponibilă</option><option>Nu știu</option></select></label>
      </div>
      <div className="form-section-title camera-section-title"><span>02</span><div><strong>Cameră și senzor</strong><small>Parametri separați pentru fiecare dronă</small></div></div>
      <div className="form-grid">
        <Field label="Producător cameră" name="cameraManufacturer" placeholder="Ex. DJI" defaultValue={camera?.manufacturer} />
        <Field label="Model cameră" name="cameraModel" placeholder="Ex. Hasselblad L2D-20c" defaultValue={camera?.model} />
        <Field label="Senzor" name="sensor" placeholder="Ex. CMOS 1 inch" defaultValue={camera?.sensor} />
        <Field label="Rezoluție foto" name="resolution" placeholder="Ex. 20 MP · 5472 × 3648" defaultValue={camera?.resolution} />
        <Field label="Distanță focală (mm)" name="focalLengthMm" type="number" min={0} max={2000} step="any" placeholder="Ex. 24" defaultValue={camera?.focalLengthMm ?? ""} />
        <Field label="Rezoluție video" name="videoResolution" placeholder="Ex. 4K / 60 fps" defaultValue={camera?.videoResolution} />
        <Field label="Stabilizare" name="stabilization" placeholder="Ex. Gimbal 3 axe" defaultValue={camera?.stabilization} />
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-buttons"><button type="button" className="button button-quiet" onClick={onCancel}>Anulează</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? "Se salvează…" : drone ? "Salvează modificările" : "Salvează drona"} <span>→</span></button></div>
    </form>
  );
}

function DronesPage() {
  const { data: drones = [], isLoading, error } = trpc.drones.list.useQuery();
  const [category, setCategory] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Drone | undefined>();
  const [deleteError, setDeleteError] = useState("");
  const utils = trpc.useUtils();
  const remove = trpc.drones.delete.useMutation({
    onSuccess: () => utils.drones.list.invalidate(),
    onError: (mutationError) => setDeleteError(mutationError.message)
  });
  const categories = [
    { id: "all", label: "Toate" },
    ...Object.entries(categoryLabels).map(([id, label]) => ({ id, label }))
  ];
  const filtered = category === "all" ? drones : drones.filter((drone) => drone.category === category);
  const startAdd = () => { setEditing(undefined); setShowForm(true); };
  return (
    <div className="page-content">
      <section className="page-intro drones-intro"><div><span className="eyebrow">ECHIPAMENT PERSONAL</span><h1>Dronele mele</h1><p>Adaugă toate dronele tale. Fiecare are categoria și fișa proprie pentru cameră.</p></div><button className="button button-primary" onClick={startAdd}>＋ Adaugă dronă</button></section>
      <section className="fleet-summary"><div className="fleet-icon">⌁</div><div><strong>{drones.length} {drones.length === 1 ? "dronă în flota ta" : "drone în flota ta"}</strong><span>Detaliile se salvează în contul tău.</span></div><span className="fleet-count">{String(drones.length).padStart(2, "0")}</span></section>
      {showForm && <section className="surface-card edit-drone-panel"><div className="section-heading"><div><span className="section-eyebrow">{editing ? "EDITEAZĂ FIȘA" : "ECHIPAMENT NOU"}</span><h2>{editing ? "Actualizează drona" : "Adaugă o dronă"}</h2></div><button className="icon-button" aria-label="Închide formularul" onClick={() => setShowForm(false)}>×</button></div><DroneForm key={editing?.id || "new"} drone={editing} onCancel={() => setShowForm(false)} onSaved={() => { setShowForm(false); setEditing(undefined); }} /></section>}
      <section className="fleet-section">
        <div className="fleet-toolbar"><div><span className="section-eyebrow">FLOTA TA</span><h2>Toate echipamentele</h2></div><div className="category-tabs" aria-label="Filtrează după categorie">{categories.map((item) => <button key={item.id} className={category === item.id ? "category-tab tab-selected" : "category-tab"} onClick={() => setCategory(item.id)}>{item.label}{item.id === "all" && <span>{drones.length}</span>}</button>)}</div></div>
        {error && <p className="form-error" role="alert">Nu am putut încărca dronele: {error.message}</p>}
        {deleteError && <p className="form-error" role="alert">{deleteError}</p>}
        {isLoading ? <div className="loading-card">Se încarcă flota ta…</div> : filtered.length ? <div className="fleet-grid">{filtered.map((drone) => <DroneCard key={drone.id} drone={drone} onEdit={() => { setEditing(drone); setShowForm(true); window.scrollTo({ top: 0, behavior: "smooth" }); }} onDelete={() => { if (window.confirm(`Ștergi ${drone.model} din flota ta?`)) remove.mutate({ id: drone.id }); }} />)}</div> : <div className="empty-state fleet-empty"><span className="empty-icon">⌁</span><strong>{category === "all" ? "Flota ta este încă goală" : "Nu ai drone în categoria aceasta"}</strong><p>{category === "all" ? "Începe prin a adăuga modelul primei drone." : "Poți adăuga o dronă în această categorie oricând."}</p>{category === "all" && <button className="button button-primary" onClick={startAdd}>＋ Adaugă prima dronă</button>}</div>}
      </section>
      <div className="notice-banner"><span>ⓘ</span><p>Detaliile sunt pentru organizarea ta. Confirmă încadrarea și datele oficiale în <a href="https://uas.caa.ro/" target="_blank" rel="noreferrer">portalul UAS CAA ↗</a>.</p></div>
    </div>
  );
}

function DroneCard({ drone, onEdit, onDelete }: { drone: Drone; onEdit: () => void; onDelete: () => void }) {
  const camera = drone.camera;
  const cameraData = [
    ["Model", camera.model],
    ["Senzor", camera.sensor],
    ["Rezoluție foto", camera.resolution],
    ["Distanță focală", camera.focalLengthMm ? `${camera.focalLengthMm} mm` : ""],
    ["Video", camera.videoResolution],
    ["Stabilizare", camera.stabilization]
  ].filter(([, value]) => value);
  return (
    <article className="drone-card">
      <div className="drone-card-head"><span className="large-drone-icon">⌁</span><div><span className="category-badge">{categoryLabels[drone.category]}</span><h3>{drone.manufacturer ? `${drone.manufacturer} ${drone.model}` : drone.model}</h3><span className="drone-weight">{drone.weightGrams} g · {drone.uasClass || "Clasă nespecificată"}</span></div><button className="icon-button" onClick={onEdit} aria-label={`Editează ${drone.model}`}>✎</button></div>
      <div className="drone-metadata"><div><span>Serie</span><strong>{drone.serial || "—"}</strong></div><div><span>Operator UAS</span><strong>{drone.operatorId || "—"}</strong></div><div><span>Remote ID</span><strong>{drone.remoteId || "—"}</strong></div></div>
      <div className="camera-specs"><div className="camera-heading"><span>◎</span><strong>{camera.manufacturer ? `${camera.manufacturer} ${camera.model}` : camera.model || "Cameră / senzor"}</strong></div>{cameraData.length ? <dl>{cameraData.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl> : <p>Adaugă parametrii camerei din editare.</p>}</div>
      <button className="delete-link" onClick={onDelete}>Șterge drona</button>
    </article>
  );
}

type FlightPlan = { area: RectangleBounds | null; date: string; time: string; droneId: string };
const flightPlanKey = "aripi.flight.plan.v1";
const defaultFlightTime = () => {
  const date = new Date();
  date.setMinutes(0, 0, 0);
  return `${String(date.getHours()).padStart(2, "0")}:00`;
};
const today = () => {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
function readFlightPlan(): FlightPlan {
  try {
    const value = JSON.parse(localStorage.getItem(flightPlanKey) || "null") as FlightPlan | null;
    return value ? { ...value, time: value.time || defaultFlightTime() } : { area: null, date: today(), time: defaultFlightTime(), droneId: "" };
  } catch (error) {
    console.error("Could not read the saved flight plan from this browser:", error);
    return { area: null, date: today(), time: defaultFlightTime(), droneId: "" };
  }
}

function PlannerPage() {
  const [plan, setPlan] = useState<FlightPlan>(readFlightPlan);
  const [checkedItems, setCheckedItems] = useState<string[]>([]);
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const { data: drones = [], isLoading: dronesLoading } = trpc.drones.list.useQuery();
  const { data: zones, isLoading: zonesLoading, error: zonesError } = trpc.zones.list.useQuery(undefined, { staleTime: 60 * 60 * 1000 });
  const { data: flightRequests = [], error: flightRequestsError } = trpc.flightRequests.mine.useQuery();
  const heliportQueryArea = plan.area || { west: 25, east: 25.001, south: 45, north: 45.001 };
  const { data: heliportData, isLoading: heliportsLoading, error: heliportsError } = trpc.heliports.nearby.useQuery(heliportQueryArea, {
    enabled: Boolean(plan.area),
    staleTime: 10 * 60 * 1000,
    retry: 1
  });
  const submitDemoRequest = trpc.flightRequests.submitDemo.useMutation({
    onSuccess: async () => { await utils.flightRequests.mine.invalidate(); }
  });
  const changePlan = useCallback((next: FlightPlan) => {
    setPlan(next);
    try {
      localStorage.setItem(flightPlanKey, JSON.stringify(next));
    } catch (error) {
      console.error("Could not save the selected flight plan in this browser:", error);
    }
  }, []);
  const changeArea = useCallback((area: RectangleBounds | null) => {
    setPlan((current) => {
      const next = { ...current, area };
      try {
        localStorage.setItem(flightPlanKey, JSON.stringify(next));
      } catch (error) {
        console.error("Could not save the selected flight plan in this browser:", error);
      }
      return next;
    });
  }, []);
  const areaText = plan.area ? [
    [plan.area.west, plan.area.south],
    [plan.area.east, plan.area.south],
    [plan.area.east, plan.area.north],
    [plan.area.west, plan.area.north],
    [plan.area.west, plan.area.south]
  ].map(([lng, lat]) => `${lat.toFixed(5)}, ${lng.toFixed(5)}`).join("\n") : "";
  const selection = plan.area && zones ? classifyZones(zones.features, plan.area) : null;
  const isCtr = Boolean(selection?.ctr.length);
  const planCenter = {
    latitude: plan.area ? (plan.area.north + plan.area.south) / 2 : 45,
    longitude: plan.area ? (plan.area.east + plan.area.west) / 2 : 25
  };
  const weather = trpc.weather.at.useQuery({
    ...planCenter,
    date: plan.date || today(),
    time: plan.time || defaultFlightTime()
  }, {
    enabled: Boolean(plan.area && plan.date && plan.time),
    staleTime: 10 * 60 * 1000,
    retry: 1
  });
  const traffic = trpc.traffic.nearby.useQuery(planCenter, {
    enabled: Boolean(plan.area),
    staleTime: 12_000,
    refetchInterval: 15_000,
    retry: false
  });
  useEffect(() => {
    setCheckedItems([]);
  }, [plan.date, plan.time, plan.droneId, plan.area?.west, plan.area?.east, plan.area?.south, plan.area?.north]);
  const checklistItems = [
    { id: "official", label: "Am verificat NOTAM-urile, restricțiile și condițiile oficiale pentru zonă." },
    { id: "aircraft", label: "Am verificat drona, bateria, elicele, failsafe-ul și locul de aterizare." },
    { id: "people", label: "Am evaluat persoanele, proprietățile, intimitatea și păstrez controlul/contactul vizual." },
    ...(selection?.ctr.length ? [{ id: "atc", label: "În CTR: am contactat direct unitatea ATC și am confirmarea necesară pentru acest zbor." }] : []),
    ...(selection?.mapn.length ? [{ id: "mapn", label: "Am verificat cerințele AEROFOTO și am avizul necesar înainte de activitatea foto." }] : [])
  ];
  const checklistComplete = checklistItems.every((item) => checkedItems.includes(item.id));
  const weatherAllowsPlanning = Boolean(weather.data?.recommendFlight);
  const trafficSnapshotFresh = Boolean(traffic.data && Date.now() - traffic.dataUpdatedAt < 90_000);
  const heliports = heliportData?.facilities ?? [];
  const hasNearbyHeliport = heliports.length > 0;
  const emergencyArea = isCtr || hasNearbyHeliport;
  const checksAllowPlanning = Boolean(zones && !zonesError && (!isCtr || (
    trafficSnapshotFresh && !traffic.error && traffic.data?.nearby.length === 0
  )));
  if (dronesLoading) return <div className="loading-card">Se încarcă dronele tale…</div>;
  if (!drones.length) return <div className="page-content"><div className="empty-state"><span className="empty-icon">⌖</span><strong>Adaugă întâi cel puțin o dronă</strong><p>Selectează drona folosită pentru a începe planificarea.</p><Link className="button button-primary" to="/drones">Deschide Dronele mele →</Link></div></div>;
  return (
    <div className="page-content">
      <section className="page-intro planner-intro"><div><span className="eyebrow">PLANIFICAREA ZBORULUI</span><h1>Alege locul pe hartă</h1><p>Găsește locația ta sau mută harta, apoi desenează dreptunghiul zonei de zbor.</p></div><span className="source-tag"><i /> Date ROMATSA {zones?.timeStamp?.slice(0, 10) || ""}</span></section>
      <div className="planner-layout">
        <FlightMap zones={zones} loading={zonesLoading} error={zonesError?.message} selectedArea={plan.area} onAreaChange={changeArea} aircraft={traffic.data?.nearby} heliports={heliports} />
        <aside className="flight-side">
          <section className="surface-card flight-details">
            <span className="section-eyebrow">DETALII ZBOR</span><h2>Configurează planul</h2>
            <label className="field"><span>Drona</span><select value={plan.droneId || drones[0].id} onChange={(event) => changePlan({ ...plan, droneId: event.target.value })}>{drones.map((drone) => <option key={drone.id} value={drone.id}>{drone.manufacturer ? `${drone.manufacturer} ${drone.model}` : drone.model} · {drone.weightGrams} g</option>)}</select></label>
            <div className="form-grid flight-dates"><Field label="Data" name="flight-date" type="date" value={plan.date} onChange={(date) => changePlan({ ...plan, date })} /><Field label="Ora locală" name="flight-time" type="time" value={plan.time} onChange={(time) => changePlan({ ...plan, time })} /></div>
            <div className="selection-summary">
              <span className="section-eyebrow">ZONA SELECTATĂ</span>
              {plan.area ? <><strong>{plan.area.north.toFixed(5)}° N · {plan.area.east.toFixed(5)}° E</strong><small>{selection?.matches.length ? `${selection.matches.length} suprapuneri în stratul ROMATSA` : zones ? "Nicio suprapunere în stratul ROMATSA" : "Așteaptă încărcarea datelor"}</small></> : <p>Desenează un dreptunghi pe hartă ca să verifici zona.</p>}
            </div>
            <button className="button button-primary button-wide" disabled={!plan.area || !weatherAllowsPlanning || !checklistComplete || !checksAllowPlanning || submitDemoRequest.isPending} onClick={() => {
              if (!plan.area) return;
              submitDemoRequest.mutate({
                area: plan.area,
                date: plan.date,
                time: plan.time,
                droneId: plan.droneId || drones[0].id
              });
            }}>{submitDemoRequest.isPending ? "Se trimite cererea demo…" : "Trimite cererea de zbor · DEMO"} <span>→</span></button>
            <button className="button button-quiet button-wide" disabled={!plan.area || !weatherAllowsPlanning || !checklistComplete || !checksAllowPlanning} onClick={() => navigate({ to: "/aerofoto" })}>Pregătește draftul AEROFOTO ↗</button>
            {submitDemoRequest.error && <p className="request-error" role="alert">Cererea demo nu a putut fi înregistrată: {submitDemoRequest.error.message}</p>}
            {flightRequestsError && <p className="request-error" role="alert">Nu am putut încărca statusurile: {flightRequestsError.message}</p>}
            {flightRequests.slice(0, 3).map((request) => <div className="demo-approval-card" key={request.id}>
              <span className="demo-approval-tag">SIMULARE · FĂRĂ VALOARE OFICIALĂ</span>
              <strong>APROBATĂ ÎN ARIPI · DEMO</strong>
              <span>{request.request.droneModel} · {request.request.date} · {request.request.time}</span>
              <p>Status demonstrativ al platformei Aripi. Nu este aviz emis de ROMATSA, CAA sau MApN și nu înlocuiește aprobările oficiale.</p>
            </div>)}
          </section>
          <section className="surface-card weather-card" aria-live="polite">
            <div className="weather-card-heading"><span className="weather-icon">☼</span><div><span className="section-eyebrow">PROGNOZĂ LA ZONĂ</span><h2>Vreme la zbor</h2></div></div>
            {!plan.area && <p className="weather-message">Desenează zona pentru a verifica prognoza la centrul ei.</p>}
            {plan.area && weather.isFetching && <p className="weather-message">Se verifică prognoza meteo…</p>}
            {plan.area && weather.error && <p className="weather-message weather-warning">Prognoza nu este disponibilă: {weather.error.message} Planificarea rămâne blocată.</p>}
            {plan.area && weather.data && <>
              <div className={`weather-verdict ${weather.data.recommendFlight ? "weather-ok" : "weather-no"}`}>
                <strong>{weather.data.recommendFlight ? "Condiții meteo favorabile" : weather.data.stopFlight ? "Nu zbura · noapte / ceață" : "Nu recomandăm zborul"}</strong>
                <span>{weather.data.description} · {weather.data.isDay ? "zi" : "noapte"} · {weather.data.time.replace("T", " ")}</span>
              </div>
              <div className="weather-metrics">
                <span><strong>{weather.data.temperatureC === null ? "—" : `${Math.round(weather.data.temperatureC)}°`}</strong><small>Temperatură</small></span>
                <span><strong>{weather.data.windKmh === null ? "—" : `${Math.round(weather.data.windKmh)} km/h`}</strong><small>Vânt</small></span>
                <span><strong>{weather.data.gustKmh === null ? "—" : `${Math.round(weather.data.gustKmh)} km/h`}</strong><small>Rafale</small></span>
                <span><strong>{weather.data.visibilityMeters === null ? "—" : `${(weather.data.visibilityMeters / 1000).toFixed(1)} km`}</strong><small>Vizibilitate</small></span>
              </div>
              {weather.data.reasons.length > 0 && <ul className="weather-reasons">{weather.data.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}
              <p className="weather-attribution">Sursă: <a href={weather.data.sourceUrl} target="_blank" rel="noreferrer">{weather.data.source}</a>. Prognoza este orientativă.</p>
            </>}
          </section>
          <section className="surface-card preflight-card">
            <div className="preflight-heading"><span className="section-eyebrow">ÎNAINTE DE DECOLARE</span><h2>Checklist obligatoriu</h2><p>Bifează verificările pentru planul și intervalul selectat.</p></div>
            {plan.area && <section className="traffic-panel">
              <div className="traffic-panel-heading">
                <div><span className="section-eyebrow">TRAFIC ADS-B LIVE</span><h3>OpenSky · raza {traffic.data?.radiusKm ?? 15} km</h3><span className="traffic-refresh-note">Actualizare automată la 15 secunde</span></div>
                <button className="button button-quiet" type="button" disabled={traffic.isFetching} onClick={() => traffic.refetch()}>{traffic.isFetching ? "Se verifică…" : "Actualizează"}</button>
              </div>
              {traffic.isLoading && <p className="traffic-message">Se verifică aeronavele raportate în apropiere…</p>}
              {traffic.error && <p className="traffic-message">{isCtr ? `Traficul live nu este disponibil: ${traffic.error.message} În CTR, verifică direct cu ATC.` : `Traficul live nu este disponibil: ${traffic.error.message}`}</p>}
              {traffic.data && !trafficSnapshotFresh && <p className="traffic-message">Instantaneul a expirat. Se așteaptă o verificare live nouă.</p>}
              {traffic.data && <>
                <div className={`traffic-status ${isCtr && traffic.data.nearby.length ? "traffic-detected" : ""}`}>
                  <strong>{traffic.data.nearby.length ? `${traffic.data.nearby.length} aeronave detectate în raza de 15 km` : "Nicio aeronavă ADS-B detectată acum"}</strong>
                  <span>Instantaneu: {new Date(traffic.data.capturedAt).toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC · {traffic.data.detectedCount} ținte</span>
                </div>
                {traffic.data.nearby.length > 0 && <ul className="traffic-list">{traffic.data.nearby.slice(0, 5).map((aircraft) => <li key={aircraft.icao24}><span><strong>{aircraft.callsign || aircraft.icao24}</strong><small>{aircraft.onGround ? "La sol" : `În aer${aircraft.altitudeMeters === null ? "" : ` · ${Math.round(aircraft.altitudeMeters)} m`}`}</small></span><b>{aircraft.distanceKm.toFixed(1)} km</b></li>)}</ul>}
                {isCtr && traffic.data.nearby.length > 0 && <div className="traffic-critical" role="alert">
                  <strong>ATENȚIE · TRAFIC DETECTAT ÎN CTR</strong>
                  <p>Într-un CTR poți fi contactat(ă) de ATC, inclusiv telefonic, dacă traficul sau o intervenție impune eliberarea zonei. Dacă ești deja în zbor, coboară și aterizează cât mai repede într-un loc sigur și urmează instrucțiunile ATC.</p>
                </div>}
                <p className="traffic-disclaimer">Sursă: <a href={traffic.data.sourceUrl} target="_blank" rel="noreferrer">{traffic.data.source}</a>. Sunt afișate numai poziții ADS-B observate acum; OpenSky nu furnizează orarele viitoare Wizz Air sau alte curse. Acoperirea poate fi incompletă, iar zero ținte nu înseamnă spațiu liber.{isCtr ? " Confirmă slotul direct cu ATC." : " Acest flux informativ nu reprezintă o autorizare."}</p>
              </>}
            </section>}
            {plan.area && heliportsLoading && <p className="heliport-status">Se verifică heliporturile OpenStreetMap din apropiere…</p>}
            {plan.area && heliportsError && <p className="heliport-status">Verificarea OpenStreetMap nu este disponibilă acum; datele despre heliporturi sunt necunoscute. Verifică sursele oficiale.</p>}
            {emergencyArea && <div className="traffic-notice" role="alert">
              <strong>{isCtr ? "CTR detectat · ATC și procedura de urgență" : "Heliport / landing site în apropierea zonei"}</strong>
              <p>{isCtr && "În CTR există șanse să fii contactat(ă), inclusiv telefonic, dacă traficul se schimbă sau intervine o aeronavă de urgență. Obține confirmarea directă de la ATC. "}Dacă intervine un elicopter SMURD sau altă aeronavă de urgență, coboară și aterizează cât mai repede într-un loc sigur, fără a pune persoane în pericol, și urmează instrucțiunile ATC / serviciilor de urgență.{hasNearbyHeliport && ` OpenStreetMap indică: ${heliports.map((place) => `${place.name} (${place.distanceKm} km)`).join(", ")}.`}</p>
              {hasNearbyHeliport && <small>Raza de alertă Aripi: {heliportData?.radiusKm} km față de zona desenată; indicator orientativ, nu limită legală.</small>}
            </div>}
            {plan.area && heliportData && <p className="heliport-attribution">Heliporturi: <a href={heliportData.sourceUrl} target="_blank" rel="noreferrer">OpenStreetMap</a>. Datele pot fi incomplete; verifică sursele oficiale.</p>}
            {checklistItems.map((item) => <label className="checklist-item" key={item.id}><input type="checkbox" checked={checkedItems.includes(item.id)} onChange={(event) => setCheckedItems((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} /><span>{item.label}</span></label>)}
            {(!weather.data?.recommendFlight || weather.isError) && <p className="checklist-blocker">{weather.data?.stopFlight ? "Noaptea și ceața sunt condiții de oprire: nu decola." : "Plannerul rămâne blocat până când prognoza pentru intervalul selectat este disponibilă și nu indică vreme nefavorabilă."}</p>}
            {!checklistComplete && <p className="checklist-hint">Bifează toate verificările obligatorii pentru a continua.</p>}
          </section>
          <section className="safety-card"><span>ⓘ</span><div><strong>Verificare orientativă</strong><p>Acest strat ROMATSA este un instantaneu. Nu include NOTAM-uri curente și nu reprezintă o autorizare de zbor.</p><a href="https://flightplan.romatsa.ro/init/drones/index" target="_blank" rel="noreferrer">Verifică ROMATSA și NOTAM ↗</a></div></section>
        </aside>
      </div>
    </div>
  );
}

function AerofotoPage() {
  const user = trpc.auth.me.useQuery().data;
  const { data: drones = [] } = trpc.drones.list.useQuery();
  const plan = readFlightPlan();
  const [submitted, setSubmitted] = useState(false);
  const [selectedDroneId, setSelectedDroneId] = useState(plan.droneId || drones[0]?.id || "");
  useEffect(() => {
    if (!selectedDroneId && drones.length) setSelectedDroneId(plan.droneId || drones[0].id);
  }, [selectedDroneId, drones, plan.droneId]);
  const selectedDrone = drones.find((drone) => drone.id === selectedDroneId);
  const area = plan.area;
  const coords = area ? [
    [area.west, area.south], [area.east, area.south], [area.east, area.north],
    [area.west, area.north], [area.west, area.south]
  ] : null;
  const generateDraft = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const request = {
      document: "Cerere pregătită pentru depunere AEROFOTO MApN",
      generatedAt: new Date().toISOString(),
      status: "DRAFT_NOT_SUBMITTED",
      applicant: {
        name: String(formData.get("name")).trim(),
        email: String(formData.get("email")).trim(),
        phone: String(formData.get("phone")).trim(),
        address: String(formData.get("address")).trim()
      },
      aircraft: selectedDrone ? {
        model: selectedDrone.model,
        manufacturer: selectedDrone.manufacturer,
        weightGrams: selectedDrone.weightGrams,
        category: categoryLabels[selectedDrone.category],
        uasClass: selectedDrone.uasClass,
        serial: selectedDrone.serial,
        operatorId: selectedDrone.operatorId,
        camera: selectedDrone.camera
      } : null,
      activity: {
        date: String(formData.get("date")),
        localTime: String(formData.get("time")).trim(),
        location: String(formData.get("location")).trim(),
        purpose: String(formData.get("purpose")).trim(),
        notes: String(formData.get("notes") || "").trim(),
        selectedRectangleWgs84: coords
      },
      notice: "Acesta este un draft pregătit în aplicația Aripi, nu o cerere depusă, un aviz MApN sau o autorizare de zbor. Depune prin portalul oficial AEROFOTO."
    };
    const link = document.createElement("a");
    const url = URL.createObjectURL(new Blob([JSON.stringify(request, null, 2)], { type: "application/json" }));
    link.href = url;
    link.download = `aripi-cerere-aerofoto-${request.activity.date || today()}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setSubmitted(true);
  };
  return (
    <div className="page-content">
      <section className="page-intro"><span className="eyebrow">DOCUMENTE PENTRU ACTIVITATE</span><h1>Cerere foto / MApN</h1><p>Pregătește un draft cu datele dronei și ale zonei selectate. Depunerea se face separat, pe portalul oficial.</p></section>
      {submitted && <div className="success-banner" role="status">Draftul JSON a fost generat. Verifică cerințele și depune cererea prin portalul AEROFOTO.</div>}
      <div className="aerofoto-layout">
        <form className="surface-card aerofoto-form" onSubmit={generateDraft}>
          <div className="form-section-title"><span>01</span><div><strong>Date solicitant</strong><small>Informații despre persoana care solicită avizul</small></div></div>
          <div className="form-grid"><Field label="Nume și prenume" name="name" required defaultValue={user?.name} /><Field label="E-mail" name="email" type="email" required defaultValue={user?.email} /><Field label="Telefon" name="phone" type="tel" required /><Field label="Adresă" name="address" required /></div>
          <div className="form-section-title camera-section-title"><span>02</span><div><strong>Detalii activitate</strong><small>Echipamentul și aria selectate</small></div></div>
          <label className="field"><span>Dronă *</span><select required value={selectedDroneId} onChange={(event) => setSelectedDroneId(event.target.value)}><option value="">Selectează drona</option>{drones.map((drone) => <option value={drone.id} key={drone.id}>{drone.manufacturer ? `${drone.manufacturer} ${drone.model}` : drone.model}</option>)}</select></label>
          <div className="form-grid"><Field label="Data propusă" name="date" type="date" required defaultValue={plan.date || today()} /><Field label="Interval orar" name="time" placeholder="Ex. 10:00–12:00" required defaultValue={plan.time} /></div>
          <Field label="Localitate / adresă zonă" name="location" required />
          <label className="field"><span>Scopul filmării / fotografierii / cartografierii *</span><textarea name="purpose" rows={3} required placeholder="Descrie pe scurt activitatea planificată" /></label>
          <label className="field"><span>Informații suplimentare</span><textarea name="notes" rows={3} placeholder="Detalii utile pentru solicitare" /></label>
          <label className="checkbox-field"><input type="checkbox" required /><span>Confirm că informațiile sunt corecte și înțeleg că acest draft nu reprezintă depunerea sau aprobarea cererii.</span></label>
          <button type="submit" className="button button-primary button-wide">Descarcă draftul JSON ↓</button>
          <p className="form-footnote">Nu trimitem datele tale către MApN.</p>
        </form>
        <aside className="aerofoto-aside">
          <section className="surface-card request-summary"><span className="section-eyebrow">REZUMATUL CERERII</span><h2>{selectedDrone ? selectedDrone.model : "Alege drona"}</h2><p>{selectedDrone ? `${categoryLabels[selectedDrone.category]} · ${selectedDrone.weightGrams} g` : "Selectează echipamentul înainte de pregătire."}</p>
            <div className="summary-box"><strong>Zona selectată pe hartă</strong>{area ? <p>Nord {area.north.toFixed(5)} · Est {area.east.toFixed(5)}<br />Sud {area.south.toFixed(5)} · Vest {area.west.toFixed(5)}</p> : <p>Nu ai selectat încă o zonă.</p>}</div>
            {selectedDrone?.camera.model && <div className="summary-box"><strong>Cameră</strong><p>{selectedDrone.camera.model}{selectedDrone.camera.resolution ? ` · ${selectedDrone.camera.resolution}` : ""}</p></div>}
          </section>
          <section className="safety-card"><span>ⓘ</span><div><strong>Ce urmează</strong><p>Verifică documentele necesare și depune solicitarea prin portalul AEROFOTO.</p><a href="https://aerofoto.mapn.ro/" target="_blank" rel="noreferrer">Deschide AEROFOTO MApN ↗</a></div></section>
        </aside>
      </div>
    </div>
  );
}

const loginRoute = createRoute({ getParentRoute: () => rootRoute, path: "/login", component: LoginPage });
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: IndexPage });
const appRoute = createRoute({ getParentRoute: () => rootRoute, id: "_app", component: ProtectedLayout });
const homeRoute = createRoute({ getParentRoute: () => appRoute, path: "home", component: HomePage });
const dronesRoute = createRoute({ getParentRoute: () => appRoute, path: "drones", component: DronesPage });
const plannerRoute = createRoute({ getParentRoute: () => appRoute, path: "planner", component: PlannerPage });
const aerofotoRoute = createRoute({ getParentRoute: () => appRoute, path: "aerofoto", component: AerofotoPage });
const academyRoute = createRoute({ getParentRoute: () => appRoute, path: "academy", component: AcademyPage });
const legacyLearnRoute = createRoute({ getParentRoute: () => appRoute, path: "learn", component: () => {
  const navigate = useNavigate();
  useEffect(() => { navigate({ to: "/academy", replace: true }); }, [navigate]);
  return <div className="loading-screen">Se deschide Academia Aripi…</div>;
} });
const routeTree = rootRoute.addChildren([
  loginRoute,
  indexRoute,
  appRoute.addChildren([homeRoute, dronesRoute, plannerRoute, aerofotoRoute, academyRoute, legacyLearnRoute])
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
