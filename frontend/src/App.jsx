import { useState, useMemo, useEffect, useRef, useCallback } from "react";

const STATUSES = [
  { key: "queue", label: "File d'attente", icon: "⏳", color: "#6366f1" },
  { key: "sent", label: "Envoyés", icon: "📤", color: "#0ea5e9" },
  { key: "waiting", label: "En attente", icon: "⏱", color: "#f59e0b" },
  { key: "received", label: "Reçus", icon: "📩", color: "#10b981" },
  { key: "negotiation", label: "Négociation", icon: "🤝", color: "#8b5cf6" },
  { key: "accepted", label: "Acceptés", icon: "✅", color: "#22c55e" },
  { key: "refused", label: "Refusés", icon: "❌", color: "#ef4444" },
];
const STATUS_MAP = Object.fromEntries(STATUSES.map((s) => [s.key, s]));

const FREQUENCIES = [
  { key: "instant", label: "Instantané", seconds: 0 },
  { key: "1min", label: "1 min", seconds: 60 },
  { key: "5min", label: "5 min", seconds: 300 },
  { key: "10min", label: "10 min", seconds: 600 },
  { key: "20min", label: "20 min", seconds: 1200 },
  { key: "30min", label: "30 min", seconds: 1800 },
  { key: "1h", label: "1 heure", seconds: 3600 },
  { key: "1d", label: "1x / jour", seconds: 86400 },
];

const themes = {
  dark: {
    bg: "#0b0f1a", surface: "#131828", surface2: "#1a2035", border: "#1e2a42",
    text1: "#e8ecf4", text2: "#8892a8", accent: "#6366f1", accentSoft: "rgba(99,102,241,0.12)",
    accentText: "#a5b4fc", overlay: "rgba(0,0,0,0.6)", cardHover: "#1f2b45",
    inputBg: "#1a2035", warn: "rgba(245,158,11,0.08)", warnBorder: "rgba(245,158,11,0.2)", warnText: "#fbbf24",
    successBg: "rgba(34,197,94,0.08)", successBorder: "rgba(34,197,94,0.2)",
    dangerBg: "rgba(239,68,68,0.08)", dangerBorder: "rgba(239,68,68,0.2)",
  },
  light: {
    bg: "#f4f6f9", surface: "#ffffff", surface2: "#f0f2f5", border: "#dfe3ea",
    text1: "#1a1d26", text2: "#6b7280", accent: "#6366f1", accentSoft: "rgba(99,102,241,0.08)",
    accentText: "#4f46e5", overlay: "rgba(0,0,0,0.25)", cardHover: "#eef0f4",
    inputBg: "#f7f8fa", warn: "rgba(245,158,11,0.06)", warnBorder: "rgba(245,158,11,0.25)", warnText: "#b45309",
    successBg: "rgba(34,197,94,0.05)", successBorder: "rgba(34,197,94,0.2)",
    dangerBg: "rgba(239,68,68,0.04)", dangerBorder: "rgba(239,68,68,0.15)",
  },
};

const DEMO = [];

const DEMO_BL = [];

const DEFAULT_TPL = `Bonjour {nom},

Je me permets de vous contacter car {entreprise} pourrait bénéficier de notre solution de gestion d'entreprise.

GoLynk simplifie la comptabilité, la facturation QR, le CRM et bien plus — le tout dans une seule plateforme pensée pour les PME et indépendants suisses.

Seriez-vous disponible pour un échange de 15 minutes cette semaine ?

Cordialement,
Bergosy`;

/* ═══ Responsive hook ═══ */
function useIsMobile(breakpoint = 768) {
  const [m, setM] = useState(window.innerWidth < breakpoint);
  useEffect(() => { const h = () => setM(window.innerWidth < breakpoint); window.addEventListener("resize", h); return () => window.removeEventListener("resize", h); }, [breakpoint]);
  return m;
}

/* ════════════════════════════════════════════ */
export default function App() {
  const isMobile = useIsMobile();
  const [theme, setTheme] = useState("dark");
  const t = themes[theme];
  const [sideOpen, setSideOpen] = useState(false);
  const [prospects, setProspects] = useState(DEMO);
  const [blacklist, setBlacklist] = useState(DEMO_BL);
  const [view, setView] = useState("pipeline");
  const [search, setSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [selectedProspect, setSelectedProspect] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showSmtp, setShowSmtp] = useState(false);
  const [showTpl, setShowTpl] = useState(false);
  const [tpl, setTpl] = useState(DEFAULT_TPL);
  const [smtp, setSmtp] = useState({ host: "", port: "587", email: "", password: "", senderName: "" });
  const [np, setNp] = useState({ name: "", email: "", company: "" });
  const [bulk, setBulk] = useState("");
  const [addMode, setAddMode] = useState("single");
  const [addErr, setAddErr] = useState("");
  const [sortBy, setSortBy] = useState("date");
  const [blSearch, setBlSearch] = useState("");
  const [blAdd, setBlAdd] = useState("");
  const searchRef = useRef(null);

  /* Shortcuts */
  useEffect(() => {
    const h = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "f" || e.key === "k")) { e.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); }
      if (e.key === "Escape") {
        if (searchFocused) { searchRef.current?.blur(); setSearch(""); }
        else if (selectedProspect) setSelectedProspect(null);
        else if (showAdd) setShowAdd(false);
        else if (showSmtp) setShowSmtp(false);
        else if (showTpl) setShowTpl(false);
        else if (sideOpen) setSideOpen(false);
      }
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [searchFocused, selectedProspect, showAdd, showSmtp, showTpl, sideOpen]);

  /* Send system */
  const [sending, setSending] = useState(false);
  const [freqKey, setFreqKey] = useState("20min");
  const [countdown, setCountdown] = useState(0);
  const [lastSent, setLastSent] = useState(null);
  const [totalSent, setTotalSent] = useState(0);
  const sRef = useRef(null); const cRef = useRef(null);
  const freq = FREQUENCIES.find((f) => f.key === freqKey) || FREQUENCIES[4];

  const sendNext = useCallback(() => {
    setProspects((prev) => { const i = prev.findIndex((p) => p.status === "queue"); if (i === -1) return prev; const u = [...prev]; u[i] = { ...u[i], status: "sent", sentAt: new Date().toISOString() }; setLastSent(u[i].name || u[i].email); setTotalSent((c) => c + 1); return u; });
  }, []);

  useEffect(() => {
    clearInterval(sRef.current); clearInterval(cRef.current); setCountdown(0);
    if (!sending) return;
    if (!prospects.some((p) => p.status === "queue")) return;
    if (freq.seconds === 0) {
      setProspects((prev) => { let c = 0, ln = null; const u = prev.map((p) => { if (p.status === "queue") { c++; ln = p.name || p.email; return { ...p, status: "sent", sentAt: new Date().toISOString() }; } return p; }); if (ln) { setLastSent(ln); setTotalSent((x) => x + c); } return u; });
    } else { sendNext(); setCountdown(freq.seconds); sRef.current = setInterval(() => { sendNext(); setCountdown(freq.seconds); }, freq.seconds * 1000); }
    return () => { clearInterval(sRef.current); clearInterval(cRef.current); };
  }, [sending, freqKey]);

  useEffect(() => { clearInterval(cRef.current); if (countdown > 0 && sending) cRef.current = setInterval(() => setCountdown((c) => c <= 1 ? 0 : c - 1), 1000); return () => clearInterval(cRef.current); }, [countdown > 0, sending]);

  const qc = prospects.filter((p) => p.status === "queue").length;
  const fmtCd = (s) => s >= 3600 ? `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}` : `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  /* Blacklist */
  const isBl = (email) => blacklist.some((b) => b.email.toLowerCase() === email.toLowerCase().trim());

  /* Context menu */
  const [ctx, setCtx] = useState(null);
  useEffect(() => { const c = () => setCtx(null); window.addEventListener("click", c); window.addEventListener("scroll", c, true); return () => { window.removeEventListener("click", c); window.removeEventListener("scroll", c, true); }; }, []);
  const onCtx = (e, p) => { e.preventDefault(); setCtx({ x: Math.min(e.clientX, window.innerWidth - 220), y: Math.min(e.clientY, window.innerHeight - 280), prospect: p }); };

  /* Filter */
  const filtered = useMemo(() => {
    let l = [...prospects];
    if (search) { const q = search.toLowerCase(); l = l.filter((p) => p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q) || p.company.toLowerCase().includes(q)); }
    if (sortBy === "date") l.sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));
    else if (sortBy === "name") l.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortBy === "company") l.sort((a, b) => a.company.localeCompare(b.company));
    else { const o = STATUSES.map((s) => s.key); l.sort((a, b) => o.indexOf(a.status) - o.indexOf(b.status)); }
    return l;
  }, [prospects, search, sortBy]);

  const kpis = useMemo(() => {
    const tot = prospects.filter((p) => p.status !== "queue").length;
    const op = prospects.filter((p) => p.openedAt).length, rp = prospects.filter((p) => p.repliedAt).length;
    const ac = prospects.filter((p) => p.status === "accepted").length, rf = prospects.filter((p) => p.status === "refused").length, ng = prospects.filter((p) => p.status === "negotiation").length;
    return { total: tot, opened: op, replied: rp, accepted: ac, refused: rf, negotiation: ng, openRate: tot ? ((op / tot) * 100).toFixed(1) : "0", replyRate: tot ? ((rp / tot) * 100).toFixed(1) : "0", conversionRate: tot ? ((ac / tot) * 100).toFixed(1) : "0", blacklisted: blacklist.length };
  }, [prospects, blacklist]);

  /* Actions */
  const addSingle = () => {
    if (!np.email) return; setAddErr("");
    if (isBl(np.email)) { setAddErr(`⛔ ${np.email} est blacklisté.`); return; }
    if (prospects.some((p) => p.email.toLowerCase() === np.email.toLowerCase().trim())) { setAddErr(`⚠ ${np.email} existe déjà.`); return; }
    setProspects((prev) => [...prev, { id: Date.now(), ...np, email: np.email.trim().toLowerCase(), status: "queue", addedAt: new Date().toISOString(), sentAt: null, openedAt: null, repliedAt: null, notes: "" }]);
    setNp({ name: "", email: "", company: "" }); setShowAdd(false);
  };
  const addBulk = () => {
    setAddErr(""); const lines = bulk.split("\n").filter(Boolean); const errs = [], added = [];
    lines.forEach((l, i) => { const p = l.split(/[,;\t]/).map((s) => s.trim()); const em = (p[0] || "").toLowerCase(); if (!em) return; if (isBl(em)) { errs.push(`${em} (blacklisté)`); return; } if (prospects.some((pr) => pr.email === em) || added.some((a) => a.email === em)) { errs.push(`${em} (doublon)`); return; } added.push({ id: Date.now() + i, email: em, name: p[1] || "", company: p[2] || "", status: "queue", addedAt: new Date().toISOString(), sentAt: null, openedAt: null, repliedAt: null, notes: "" }); });
    if (errs.length) setAddErr(`Ignorés: ${errs.join(", ")}`);
    if (added.length) setProspects((prev) => [...prev, ...added]);
    if (!errs.length) { setBulk(""); setShowAdd(false); }
  };
  const updStatus = (id, ns) => { setProspects((prev) => prev.map((p) => { if (p.id !== id) return p; const u = { status: ns }; if (ns === "sent" && !p.sentAt) u.sentAt = new Date().toISOString(); return { ...p, ...u }; })); };
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString("fr-CH", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

  const inp = { padding: "10px 12px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.inputBg, color: t.text1, fontSize: 13, outline: "none", fontFamily: "inherit", width: "100%", boxSizing: "border-box" };
  const btnP = { padding: "10px 18px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer", marginTop: 6 };

  const navItems = [{ key: "pipeline", label: "Pipeline", icon: "◫" }, { key: "list", label: "Liste", icon: "☰" }, { key: "kpi", label: "KPI", icon: "◎" }, { key: "blacklist", label: "Blacklist", icon: "⊘" }];

  const goTo = (v) => { setView(v); setSideOpen(false); };
  const filteredBl = useMemo(() => { if (!blSearch) return blacklist; const q = blSearch.toLowerCase(); return blacklist.filter((b) => b.email.toLowerCase().includes(q)); }, [blacklist, blSearch]);

  /* ─── Sidebar content (shared desktop/mobile) ─── */
  const SideContent = () => (
    <>
      <div style={{ padding: "20px 18px", borderBottom: `1px solid ${t.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.5px" }}><span style={{ color: t.accent }}>◆</span> ProspectFlow</div>
          <div style={{ fontSize: 11, color: t.text2, marginTop: 4 }}>Prospection Email — Local</div>
        </div>
        {isMobile && <span onClick={() => setSideOpen(false)} style={{ fontSize: 22, cursor: "pointer", color: t.text2, lineHeight: 1 }}>✕</span>}
      </div>
      <div style={{ padding: "12px 10px", flex: 1 }}>
        {navItems.map((item) => (
          <div key={item.key} onClick={() => goTo(item.key)} style={{ padding: "10px 12px", borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", gap: 10, marginBottom: 2, background: view === item.key ? t.accentSoft : "transparent", color: view === item.key ? t.accentText : t.text2, fontWeight: view === item.key ? 600 : 400 }}>
            <span style={{ fontSize: 15, width: 20, textAlign: "center" }}>{item.icon}</span>
            {item.label}
            {item.key === "blacklist" && blacklist.length > 0 && <span style={{ marginLeft: "auto", fontSize: 10, background: t.accentSoft, color: t.accentText, padding: "1px 6px", borderRadius: 8, fontWeight: 600 }}>{blacklist.length}</span>}
          </div>
        ))}
      </div>
      <div style={{ padding: "10px 10px 14px", borderTop: `1px solid ${t.border}`, display: "flex", flexDirection: "column", gap: 1 }}>
        {[{ l: "⚙ Config SMTP", f: () => { setShowSmtp(true); setSideOpen(false); } }, { l: "✉ Template", f: () => { setShowTpl(true); setSideOpen(false); } }, { l: theme === "dark" ? "☀ Thème clair" : "☾ Thème sombre", f: () => setTheme(theme === "dark" ? "light" : "dark") }].map((x) => (
          <div key={x.l} onClick={x.f} style={{ padding: "9px 12px", borderRadius: 8, cursor: "pointer", color: t.text2, fontSize: 13 }} onMouseEnter={(e) => (e.currentTarget.style.background = t.accentSoft)} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>{x.l}</div>
        ))}
      </div>
    </>
  );

  return (
    <div style={{ fontFamily: "'DM Sans','Segoe UI',system-ui,sans-serif", background: t.bg, color: t.text1, minHeight: "100vh", display: "flex", fontSize: 14, transition: "background .3s,color .3s" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* DESKTOP SIDEBAR */}
      {!isMobile && (
        <div style={{ width: 220, background: t.surface, borderRight: `1px solid ${t.border}`, display: "flex", flexDirection: "column", flexShrink: 0 }}>
          <SideContent />
        </div>
      )}

      {/* MOBILE SIDEBAR OVERLAY */}
      {isMobile && sideOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex" }}>
          <div style={{ width: 260, background: t.surface, display: "flex", flexDirection: "column", boxShadow: "4px 0 20px rgba(0,0,0,0.3)", zIndex: 1001 }}><SideContent /></div>
          <div onClick={() => setSideOpen(false)} style={{ flex: 1, background: t.overlay }} />
        </div>
      )}

      {/* MAIN */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        {/* TOP BAR */}
        <div style={{ padding: isMobile ? "10px 12px" : "10px 20px", borderBottom: `1px solid ${t.border}`, display: "flex", alignItems: "center", gap: 8, background: t.surface, flexWrap: "wrap" }}>
          {/* Hamburger */}
          {isMobile && (
            <div onClick={() => setSideOpen(true)} style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, cursor: "pointer", flexShrink: 0, border: `1px solid ${t.border}` }}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect y="3" width="18" height="2" rx="1" fill={t.text2}/><rect y="8" width="18" height="2" rx="1" fill={t.text2}/><rect y="13" width="18" height="2" rx="1" fill={t.text2}/></svg>
            </div>
          )}

          {/* Search */}
          <div style={{ position: "relative", flex: "1 1 140px", maxWidth: isMobile ? "100%" : 280, minWidth: 0 }}>
            <input ref={searchRef} placeholder={isMobile ? "Rechercher..." : "Rechercher... (Ctrl+K)"} value={search} onChange={(e) => setSearch(e.target.value)} onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)} style={{ ...inp, paddingLeft: 34, paddingRight: search ? 30 : 12, fontSize: 12 }} />
            <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: t.text2, fontSize: 13 }}>⌕</span>
            {search && <span onClick={() => setSearch("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: t.text2, cursor: "pointer", lineHeight: 1, fontSize: 14 }}>✕</span>}
          </div>

          {!isMobile && (
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ padding: "8px 8px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.inputBg, color: t.text2, fontSize: 11, outline: "none", flexShrink: 0 }}>
              <option value="date">Date</option><option value="name">Nom</option><option value="company">Entreprise</option><option value="status">Statut</option>
            </select>
          )}

          {/* SEND CONTROL — FIXED GRID */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "36px 1fr 60px" : "40px 130px 1fr 64px", alignItems: "center", gap: 8, background: t.surface2, borderRadius: 10, padding: "7px 12px", border: `1px solid ${sending ? "rgba(34,197,94,0.3)" : t.border}`, width: isMobile ? "100%" : 390, flexShrink: 0, boxSizing: "border-box", transition: "border-color .2s", order: isMobile ? 1 : 0 }}>
            <div onClick={() => setSending(!sending)} style={{ width: isMobile ? 36 : 40, height: 22, borderRadius: 11, background: sending ? "#22c55e" : t.border, cursor: "pointer", position: "relative", transition: "background .2s" }}>
              <div style={{ width: 16, height: 16, borderRadius: 8, background: "#fff", position: "absolute", top: 3, left: sending ? (isMobile ? 17 : 21) : 3, transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,0.18)" }} />
            </div>
            {!isMobile && (
              <div style={{ fontSize: 12, overflow: "hidden", whiteSpace: "nowrap" }}>
                {sending ? (<><span style={{ color: "#22c55e", fontWeight: 600 }}>Actif</span><span style={{ color: t.text2 }}> · {countdown > 0 ? fmtCd(countdown) : freq.seconds === 0 ? "instant" : "envoi..."}</span></>) : (<span style={{ color: t.text2, fontWeight: 500 }}>Envoi désactivé</span>)}
              </div>
            )}
            <select value={freqKey} onChange={(e) => setFreqKey(e.target.value)} style={{ padding: "5px 4px", borderRadius: 6, border: `1px solid ${t.border}`, background: t.inputBg, color: t.text2, fontSize: 11, outline: "none", width: "100%" }}>
              {FREQUENCIES.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
            <div style={{ fontSize: 11, color: qc > 0 ? t.accentText : t.text2, background: qc > 0 ? t.accentSoft : "transparent", padding: "3px 0", borderRadius: 6, fontWeight: 600, textAlign: "center", whiteSpace: "nowrap" }}>{qc} file</div>
          </div>

          <button onClick={() => { setAddErr(""); setShowAdd(true); }} style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${t.accent}`, background: "transparent", color: t.accentText, fontWeight: 600, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>+ Ajouter</button>
        </div>

        {/* Activity bar */}
        {lastSent && (
          <div style={{ padding: "6px 20px", background: t.successBg, borderBottom: `1px solid ${t.successBorder}`, display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
            <span style={{ color: "#22c55e", fontSize: 8 }}>●</span>
            <span style={{ color: t.text2 }}>Dernier : <strong style={{ color: t.text1 }}>{lastSent}</strong></span>
            <span style={{ marginLeft: "auto", color: t.text2 }}>{totalSent} envoyé{totalSent > 1 ? "s" : ""}</span>
          </div>
        )}

        {/* Content */}
        <div style={{ flex: 1, overflow: "auto", padding: isMobile ? 12 : 20 }}>
          {view === "pipeline" && <PipelineView prospects={filtered} onSelect={setSelectedProspect} onCtx={onCtx} fmtDate={fmtDate} t={t} isMobile={isMobile} />}
          {view === "list" && <ListView prospects={filtered} fmtDate={fmtDate} onSelect={setSelectedProspect} onCtx={onCtx} t={t} />}
          {view === "kpi" && <KPIView kpis={kpis} prospects={prospects} t={t} />}
          {view === "blacklist" && <BlacklistView list={filteredBl} search={blSearch} setSearch={setBlSearch} addEmail={blAdd} setAddEmail={setBlAdd} onAdd={(em) => { if (!em.trim() || isBl(em)) return; setBlacklist((prev) => [...prev, { id: Date.now(), email: em.trim().toLowerCase(), reason: "manual", addedAt: new Date().toISOString(), source: "manual" }]); setBlAdd(""); }} onRemove={(id) => setBlacklist((prev) => prev.filter((b) => b.id !== id))} t={t} inp={inp} isMobile={isMobile} />}
        </div>
      </div>

      {/* Detail panel (overlay on mobile) */}
      {selectedProspect && (
        isMobile ? (
          <div style={{ position: "fixed", inset: 0, zIndex: 999, display: "flex", alignItems: "flex-end", justifyContent: "center", background: t.overlay }} onClick={() => setSelectedProspect(null)}>
            <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxHeight: "85vh", background: t.surface, borderRadius: "16px 16px 0 0", overflowY: "auto" }}>
              <DetailPanel prospect={prospects.find((p) => p.id === selectedProspect)} onClose={() => setSelectedProspect(null)} onUpdate={(id, d) => setProspects((prev) => prev.map((p) => (p.id === id ? { ...p, ...d } : p)))} updStatus={updStatus} fmtDate={fmtDate} tpl={tpl} t={t} />
            </div>
          </div>
        ) : (
          <DetailPanel prospect={prospects.find((p) => p.id === selectedProspect)} onClose={() => setSelectedProspect(null)} onUpdate={(id, d) => setProspects((prev) => prev.map((p) => (p.id === id ? { ...p, ...d } : p)))} updStatus={updStatus} fmtDate={fmtDate} tpl={tpl} t={t} />
        )
      )}

      {/* Context menu */}
      {ctx && (
        <div style={{ position: "fixed", top: ctx.y, left: ctx.x, zIndex: 9999, background: t.surface, border: `1px solid ${t.border}`, borderRadius: 10, boxShadow: theme === "dark" ? "0 8px 30px rgba(0,0,0,0.4)" : "0 8px 30px rgba(0,0,0,0.12)", minWidth: 200, padding: "5px 0" }}>
          {ctx.prospect.status === "queue" && <CI onClick={() => { setProspects((prev) => prev.map((p) => (p.id === ctx.prospect.id && p.status === "queue" ? { ...p, status: "sent", sentAt: new Date().toISOString() } : p))); setTotalSent((c) => c + 1); setCtx(null); }} t={t}>📤 Envoyer maintenant</CI>}
          <CI onClick={() => { setSelectedProspect(ctx.prospect.id); setCtx(null); }} t={t}>👁 Voir les détails</CI>
          <div style={{ height: 1, background: t.border, margin: "3px 8px" }} />
          {STATUSES.filter((s) => s.key !== ctx.prospect.status).slice(0, 4).map((s) => <CI key={s.key} onClick={() => { updStatus(ctx.prospect.id, s.key); setCtx(null); }} t={t}>{s.icon} → {s.label}</CI>)}
          <div style={{ height: 1, background: t.border, margin: "3px 8px" }} />
          <CI onClick={() => { setBlacklist((prev) => [...prev, { id: Date.now(), email: ctx.prospect.email, reason: "manual", addedAt: new Date().toISOString(), source: "manual" }]); updStatus(ctx.prospect.id, "refused"); setCtx(null); }} t={t}>⊘ Blacklister</CI>
          <CI onClick={() => { setProspects((prev) => prev.filter((p) => p.id !== ctx.prospect.id)); setCtx(null); }} t={t} danger>✕ Supprimer</CI>
        </div>
      )}

      {/* ─── MODALS (click outside = close) ─── */}
      {showAdd && <Modal onClose={() => setShowAdd(false)} title="Ajouter des prospects" t={t} isMobile={isMobile}>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {[["single", "Un seul"], ["bulk", "Import en masse"]].map(([m, l]) => <button key={m} onClick={() => { setAddMode(m); setAddErr(""); }} style={{ padding: "7px 16px", borderRadius: 6, border: `1px solid ${addMode === m ? t.accent : t.border}`, background: addMode === m ? t.accentSoft : "transparent", color: addMode === m ? t.accentText : t.text2, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>{l}</button>)}
        </div>
        {addErr && <div style={{ padding: "8px 12px", borderRadius: 8, background: t.dangerBg, border: `1px solid ${t.dangerBorder}`, fontSize: 12, color: "#ef4444", marginBottom: 12 }}>{addErr}</div>}
        <div style={{ minHeight: 245 }}>
          {addMode === "single" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input placeholder="Nom" value={np.name} onChange={(e) => setNp({ ...np, name: e.target.value })} style={inp} />
              <input placeholder="Email *" value={np.email} onChange={(e) => { setNp({ ...np, email: e.target.value }); setAddErr(""); }} style={inp} onKeyDown={(e) => e.key === "Enter" && addSingle()} />
              <input placeholder="Entreprise" value={np.company} onChange={(e) => setNp({ ...np, company: e.target.value })} style={inp} onKeyDown={(e) => e.key === "Enter" && addSingle()} />
              <button onClick={addSingle} style={btnP}>Ajouter à la file</button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 12, color: t.text2 }}>email, nom, entreprise (un par ligne) — blacklistés ignorés</div>
              <textarea value={bulk} onChange={(e) => { setBulk(e.target.value); setAddErr(""); }} rows={7} placeholder={"marie@test.ch, Marie Dupont, StartupVS\nlucas@corp.com, Lucas M, Corp SA"} style={{ ...inp, resize: "vertical", fontFamily: "monospace", fontSize: 12 }} />
              <button onClick={addBulk} style={btnP}>Importer tout</button>
            </div>
          )}
        </div>
      </Modal>}

      {showSmtp && <Modal onClose={() => setShowSmtp(false)} title="Configuration SMTP" t={t} isMobile={isMobile}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[["Serveur SMTP", "host", "smtp.gmail.com"], ["Port", "port", "587"], ["Email", "email", "votre@email.com"], ["Mot de passe / App Password", "password", ""], ["Nom expéditeur", "senderName", "GoLynk Team"]].map(([label, key, ph]) => <div key={key}><label style={{ fontSize: 12, color: t.text2, marginBottom: 4, display: "block" }}>{label}</label><input type={key === "password" ? "password" : "text"} placeholder={ph} value={smtp[key]} onChange={(e) => setSmtp({ ...smtp, [key]: e.target.value })} style={inp} /></div>)}
          <div style={{ padding: 12, borderRadius: 8, background: t.warn, border: `1px solid ${t.warnBorder}`, fontSize: 12, color: t.warnText, marginTop: 4 }}>💡 Gmail : 2FA → Mot de passe d'application dans Sécurité Google.</div>
          <button onClick={() => setShowSmtp(false)} style={btnP}>Sauvegarder</button>
        </div>
      </Modal>}

      {showTpl && <Modal onClose={() => setShowTpl(false)} title="Template Email" t={t} isMobile={isMobile}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 12, color: t.text2 }}>Variables : <code style={{ color: t.accentText }}>{"{nom}"}</code> <code style={{ color: t.accentText }}>{"{entreprise}"}</code> <code style={{ color: t.accentText }}>{"{email}"}</code></div>
          <textarea value={tpl} onChange={(e) => setTpl(e.target.value)} rows={10} style={{ ...inp, resize: "vertical", lineHeight: 1.6 }} />
          <div style={{ padding: 12, borderRadius: 8, background: t.surface2, border: `1px solid ${t.border}` }}>
            <div style={{ fontSize: 11, color: t.text2, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Aperçu</div>
            <div style={{ fontSize: 13, color: t.text1, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{tpl.replace("{nom}", "Marie Dupont").replace("{entreprise}", "StartupVS").replace("{email}", "marie@startup.ch")}</div>
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${t.border}`, fontSize: 11, color: t.text2, textAlign: "center" }}><span style={{ textDecoration: "underline" }}>Je ne souhaite plus être contacté</span></div>
          </div>
          <button onClick={() => setShowTpl(false)} style={btnP}>Sauvegarder</button>
        </div>
      </Modal>}
    </div>
  );
}

/* ═══ Components ═══ */
function CI({ children, onClick, t, danger }) {
  return <div onClick={onClick} style={{ padding: "8px 16px", fontSize: 13, cursor: "pointer", color: danger ? "#ef4444" : t.text1, display: "flex", alignItems: "center", gap: 8 }} onMouseEnter={(e) => (e.currentTarget.style.background = t.surface2)} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>{children}</div>;
}

function PipelineView({ prospects, onSelect, onCtx, fmtDate, t, isMobile }) {
  return (
    <div style={{ display: "flex", gap: 12, overflowX: "auto", height: "100%", paddingBottom: 10, justifyContent: "center" }}>
      {STATUSES.map((s) => { const items = prospects.filter((p) => p.status === s.key); return (
        <div key={s.key} style={{ minWidth: isMobile ? 165 : 195, maxWidth: 225, flex: `0 0 ${isMobile ? 165 : 195}px`, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.color }} />
            <span style={{ fontWeight: 600, fontSize: 13 }}>{s.label}</span>
            <span style={{ marginLeft: "auto", fontSize: 11, color: t.text2, background: t.surface2, padding: "2px 8px", borderRadius: 10 }}>{items.length}</span>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, overflowY: "auto", paddingTop: 6 }}>
            {items.map((p) => (
              <div key={p.id} onClick={() => onSelect(p.id)} onContextMenu={(e) => onCtx(e, p)} style={{ padding: "12px 14px", background: t.surface2, borderRadius: 10, border: `1px solid ${t.border}`, cursor: "pointer", transition: "border-color .15s,transform .1s" }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = s.color; e.currentTarget.style.transform = "translateY(-1px)"; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = t.border; e.currentTarget.style.transform = "none"; }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 3 }}>{p.name || p.email}</div>
                <div style={{ fontSize: 11, color: t.text2 }}>{p.company || "—"}</div>
                <div style={{ fontSize: 10, color: t.text2, marginTop: 6 }}>{fmtDate(p.addedAt)}</div>
              </div>
            ))}
            {items.length === 0 && <div style={{ padding: 20, textAlign: "center", color: t.text2, fontSize: 12, opacity: 0.5 }}>Vide</div>}
          </div>
        </div>
      ); })}
    </div>
  );
}

function ListView({ prospects, fmtDate, onSelect, onCtx, t }) {
  return (
    <div style={{ background: t.surface, borderRadius: 12, border: `1px solid ${t.border}`, overflow: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
        <thead><tr style={{ borderBottom: `1px solid ${t.border}` }}>{["Nom", "Email", "Entreprise", "Statut", "Ajouté", "Envoyé", "Répondu"].map((h) => <th key={h} style={{ padding: "12px 14px", textAlign: "left", fontSize: 11, color: t.text2, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>)}</tr></thead>
        <tbody>{prospects.map((p) => (
          <tr key={p.id} onClick={() => onSelect(p.id)} onContextMenu={(e) => onCtx(e, p)} style={{ borderBottom: `1px solid ${t.border}`, cursor: "pointer" }} onMouseEnter={(e) => (e.currentTarget.style.background = t.cardHover)} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
            <td style={{ padding: "11px 14px", fontWeight: 500, fontSize: 13 }}>{p.name || "—"}</td>
            <td style={{ padding: "11px 14px", fontSize: 12, color: t.text2 }}>{p.email}</td>
            <td style={{ padding: "11px 14px", fontSize: 12, color: t.text2 }}>{p.company || "—"}</td>
            <td style={{ padding: "11px 14px" }}><span style={{ padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: `${STATUS_MAP[p.status]?.color}18`, color: STATUS_MAP[p.status]?.color }}>{STATUS_MAP[p.status]?.icon} {STATUS_MAP[p.status]?.label}</span></td>
            <td style={{ padding: "11px 14px", fontSize: 11, color: t.text2 }}>{fmtDate(p.addedAt)}</td>
            <td style={{ padding: "11px 14px", fontSize: 11, color: t.text2 }}>{fmtDate(p.sentAt)}</td>
            <td style={{ padding: "11px 14px", fontSize: 11, color: t.text2 }}>{fmtDate(p.repliedAt)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function KPIView({ kpis, prospects, t }) {
  const cards = [{ label: "Emails envoyés", value: kpis.total, color: "#0ea5e9" }, { label: "Taux d'ouverture", value: `${kpis.openRate}%`, color: "#f59e0b" }, { label: "Taux de réponse", value: `${kpis.replyRate}%`, color: "#10b981" }, { label: "Taux de conversion", value: `${kpis.conversionRate}%`, color: "#8b5cf6" }, { label: "Clients acquis", value: kpis.accepted, color: "#22c55e" }, { label: "Refusés", value: kpis.refused, color: "#ef4444" }, { label: "En négociation", value: kpis.negotiation, color: "#8b5cf6" }, { label: "Blacklistés", value: kpis.blacklisted, color: "#ef4444" }];
  const sc = STATUSES.map((s) => ({ ...s, count: prospects.filter((p) => p.status === s.key).length }));
  const mx = Math.max(...sc.map((s) => s.count), 1);
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
        {cards.map((c) => <div key={c.label} style={{ padding: 20, background: t.surface, borderRadius: 12, border: `1px solid ${t.border}` }}><div style={{ fontSize: 11, color: t.text2, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>{c.label}</div><div style={{ fontSize: 28, fontWeight: 700, color: c.color }}>{c.value}</div></div>)}
      </div>
      <div style={{ padding: 24, background: t.surface, borderRadius: 12, border: `1px solid ${t.border}`, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 20 }}>Répartition par statut</div>
        {sc.map((s) => <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}><div style={{ width: 100, fontSize: 12, color: t.text2, flexShrink: 0 }}>{s.icon} {s.label}</div><div style={{ flex: 1, height: 28, background: t.surface2, borderRadius: 6, overflow: "hidden", position: "relative" }}><div style={{ width: `${(s.count / mx) * 100}%`, height: "100%", background: `${s.color}40`, borderRadius: 6, transition: "width .4s", minWidth: s.count > 0 ? 28 : 0 }} /><span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 12, fontWeight: 600, color: s.color }}>{s.count}</span></div></div>)}
      </div>
      <div style={{ padding: 20, background: t.surface, borderRadius: 12, border: `1px solid ${t.border}` }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Funnel</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 160 }}>
          {["sent", "waiting", "received", "negotiation", "accepted"].map((key) => { const count = prospects.filter((p) => p.status === key).length; const s = STATUS_MAP[key]; const h = mx > 0 ? Math.max((count / mx) * 140, 4) : 4; return <div key={key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}><div style={{ fontSize: 12, fontWeight: 600, color: s.color }}>{count}</div><div style={{ width: "100%", height: h, background: `${s.color}50`, borderRadius: "4px 4px 0 0", transition: "height .4s" }} /><div style={{ fontSize: 10, color: t.text2, textAlign: "center" }}>{s.label}</div></div>; })}
        </div>
      </div>
    </div>
  );
}

function BlacklistView({ list, search, setSearch, addEmail, setAddEmail, onAdd, onRemove, t, inp, isMobile }) {
  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 200px", maxWidth: 300 }}>
          <input placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...inp, paddingLeft: 34, fontSize: 12 }} />
          <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: t.text2, fontSize: 13 }}>⌕</span>
        </div>
        <input placeholder="Ajouter un email..." value={addEmail} onChange={(e) => setAddEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onAdd(addEmail)} style={{ ...inp, flex: "1 1 200px", maxWidth: 260, fontSize: 12 }} />
        <button onClick={() => onAdd(addEmail)} style={{ padding: "10px 16px", borderRadius: 8, border: "none", background: "#ef4444", color: "#fff", fontWeight: 600, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>+ Blacklister</button>
      </div>
      <div style={{ padding: "14px 16px", background: t.dangerBg, border: `1px solid ${t.dangerBorder}`, borderRadius: 10, marginBottom: 20, fontSize: 13, color: t.text2 }}>
        ⊘ <strong style={{ color: t.text1 }}>{list.length} email{list.length > 1 ? "s" : ""}</strong> — ne recevront plus de mails. Le lien de désabonnement dans chaque email ajoute automatiquement ici.
      </div>
      <div style={{ background: t.surface, borderRadius: 12, border: `1px solid ${t.border}`, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: isMobile ? 500 : 0 }}>
          <thead><tr style={{ borderBottom: `1px solid ${t.border}` }}>{["Email", "Raison", "Source", "Date", ""].map((h) => <th key={h} style={{ padding: "12px 14px", textAlign: "left", fontSize: 11, color: t.text2, fontWeight: 600, textTransform: "uppercase" }}>{h}</th>)}</tr></thead>
          <tbody>
            {list.map((b) => <tr key={b.id} style={{ borderBottom: `1px solid ${t.border}` }} onMouseEnter={(e) => (e.currentTarget.style.background = t.cardHover)} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
              <td style={{ padding: "11px 14px", fontWeight: 500, fontSize: 13 }}>{b.email}</td>
              <td style={{ padding: "11px 14px" }}><span style={{ padding: "2px 8px", borderRadius: 5, fontSize: 11, fontWeight: 600, background: b.reason === "unsubscribe" ? "rgba(239,68,68,0.12)" : "rgba(245,158,11,0.12)", color: b.reason === "unsubscribe" ? "#ef4444" : "#f59e0b" }}>{b.reason === "unsubscribe" ? "Désabonné" : "Manuel"}</span></td>
              <td style={{ padding: "11px 14px", fontSize: 11, color: t.text2 }}>{b.source === "unsubscribe_link" ? "Lien email" : "Manuel"}</td>
              <td style={{ padding: "11px 14px", fontSize: 11, color: t.text2 }}>{new Date(b.addedAt).toLocaleDateString("fr-CH", { day: "2-digit", month: "short", year: "numeric" })}</td>
              <td style={{ padding: "11px 14px", textAlign: "right" }}><button onClick={() => onRemove(b.id)} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${t.border}`, background: "transparent", color: t.text2, fontSize: 11, cursor: "pointer" }}>Retirer</button></td>
            </tr>)}
            {list.length === 0 && <tr><td colSpan={5} style={{ padding: 32, textAlign: "center", color: t.text2 }}>Aucun email blacklisté</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DetailPanel({ prospect, onClose, onUpdate, updStatus, fmtDate, tpl, t }) {
  if (!prospect) return null; const s = STATUS_MAP[prospect.status];
  const preview = tpl.replace("{nom}", prospect.name || "prospect").replace("{entreprise}", prospect.company || "votre entreprise").replace("{email}", prospect.email);
  return (
    <div style={{ width: 340, maxWidth: "100%", background: t.surface, borderLeft: `1px solid ${t.border}`, display: "flex", flexDirection: "column", flexShrink: 0, overflowY: "auto" }}>
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${t.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ fontWeight: 700, fontSize: 15 }}>Détails</span><span onClick={onClose} style={{ cursor: "pointer", color: t.text2, fontSize: 18, lineHeight: 1 }}>✕</span></div>
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: `${s.color}20`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{s.icon}</div>
          <div style={{ minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{prospect.name || prospect.email}</div><div style={{ fontSize: 12, color: t.text2 }}>{prospect.company || "—"}</div></div>
        </div>
        <div style={{ padding: "8px 12px", borderRadius: 8, background: `${s.color}12`, color: s.color, fontSize: 12, fontWeight: 600, textAlign: "center" }}>{s.icon} {s.label}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>{[["Email", prospect.email], ["Ajouté", fmtDate(prospect.addedAt)], ["Envoyé", fmtDate(prospect.sentAt)], ["Ouvert", fmtDate(prospect.openedAt)], ["Répondu", fmtDate(prospect.repliedAt)]].map(([k, v]) => <div key={k} style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: t.text2 }}>{k}</span><span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{v}</span></div>)}</div>
        <div><label style={{ fontSize: 11, color: t.text2, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Statut</label><select value={prospect.status} onChange={(e) => updStatus(prospect.id, e.target.value)} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.inputBg, color: t.text1, fontSize: 12, outline: "none" }}>{STATUSES.map((st) => <option key={st.key} value={st.key}>{st.icon} {st.label}</option>)}</select></div>
        <div><label style={{ fontSize: 11, color: t.text2, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Notes</label><textarea value={prospect.notes} onChange={(e) => onUpdate(prospect.id, { notes: e.target.value })} rows={3} placeholder="Note..." style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.inputBg, color: t.text1, fontSize: 12, outline: "none", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }} /></div>
        <div><div style={{ fontSize: 11, color: t.text2, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Aperçu email</div><div style={{ padding: 14, borderRadius: 8, background: t.surface2, border: `1px solid ${t.border}`, fontSize: 12, color: t.text2, whiteSpace: "pre-wrap", lineHeight: 1.5, maxHeight: 200, overflowY: "auto" }}>{preview}</div><div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${t.border}`, fontSize: 11, color: t.text2, textAlign: "center" }}><span style={{ textDecoration: "underline" }}>Je ne souhaite plus être contacté</span></div></div>
      </div>
    </div>
  );
}

function Modal({ children, onClose, title, t, isMobile }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 999, display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", background: t.overlay, backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: t.surface, borderRadius: isMobile ? "16px 16px 0 0" : 16, border: `1px solid ${t.border}`, padding: 24, width: isMobile ? "100%" : 460, maxWidth: "100%", maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}><span style={{ fontWeight: 700, fontSize: 16 }}>{title}</span><span onClick={onClose} style={{ cursor: "pointer", color: t.text2, fontSize: 18, lineHeight: 1 }}>✕</span></div>
        {children}
      </div>
    </div>
  );
}