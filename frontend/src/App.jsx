import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { api } from "./api.js";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from "recharts";

const STATUSES = [
  { key: "queue", label: "Queue", icon: "⏳", color: "#6366f1" },
  { key: "sent", label: "Sent", icon: "📤", color: "#0ea5e9" },
  { key: "waiting", label: "Waiting", icon: "⏱", color: "#f59e0b" },
  { key: "received", label: "Replied", icon: "📩", color: "#10b981" },
  { key: "negotiation", label: "Negotiation", icon: "🤝", color: "#8b5cf6" },
  { key: "accepted", label: "Accepted", icon: "✅", color: "#22c55e" },
  { key: "refused", label: "Refused", icon: "❌", color: "#ef4444" },
];
const SM = Object.fromEntries(STATUSES.map((s) => [s.key, s]));
const SC = { queue: "#6366f1", sent: "#0ea5e9", waiting: "#f59e0b", received: "#10b981", negotiation: "#8b5cf6", accepted: "#22c55e", refused: "#ef4444", opened: "#f59e0b" };

const FREQ = [
  { key: "1min", label: "1 / min", seconds: 60, batch: 1 },
  { key: "5min-batch", label: "5 / min", seconds: 60, batch: 5 },
  { key: "5min", label: "1 / 5 min", seconds: 300, batch: 1 },
  { key: "10min", label: "1 / 10 min", seconds: 600, batch: 1 },
  { key: "20min", label: "1 / 20 min", seconds: 1200, batch: 1 },
  { key: "30min", label: "1 / 30 min", seconds: 1800, batch: 1 },
  { key: "1h", label: "1 / heure", seconds: 3600, batch: 1 },
  { key: "1d", label: "1x / jour", seconds: 86400, batch: 1 },
];

const TH = {
  dark: { bg: "#0b0f1a", surface: "#131828", surface2: "#1a2035", border: "#1e2a42", text1: "#e8ecf4", text2: "#8892a8", accent: "#6366f1", accentSoft: "rgba(99,102,241,0.12)", accentText: "#a5b4fc", overlay: "rgba(0,0,0,0.6)", cardHover: "#1f2b45", inputBg: "#1a2035", warn: "rgba(245,158,11,0.08)", warnBorder: "rgba(245,158,11,0.2)", warnText: "#fbbf24", successBg: "rgba(34,197,94,0.08)", successBorder: "rgba(34,197,94,0.2)", dangerBg: "rgba(239,68,68,0.08)", dangerBorder: "rgba(239,68,68,0.2)" },
  light: { bg: "#f4f6f9", surface: "#ffffff", surface2: "#f0f2f5", border: "#dfe3ea", text1: "#1a1d26", text2: "#6b7280", accent: "#6366f1", accentSoft: "rgba(99,102,241,0.08)", accentText: "#4f46e5", overlay: "rgba(0,0,0,0.25)", cardHover: "#eef0f4", inputBg: "#f7f8fa", warn: "rgba(245,158,11,0.06)", warnBorder: "rgba(245,158,11,0.25)", warnText: "#b45309", successBg: "rgba(34,197,94,0.05)", successBorder: "rgba(34,197,94,0.2)", dangerBg: "rgba(239,68,68,0.04)", dangerBorder: "rgba(239,68,68,0.15)" },
};

function useIsMobile(bp = 768) { const [m, setM] = useState(window.innerWidth < bp); useEffect(() => { const h = () => setM(window.innerWidth < bp); window.addEventListener("resize", h); return () => window.removeEventListener("resize", h); }, [bp]); return m; }

/* ════════════════ MAIN APP ════════════════ */
export default function App() {
  const isMobile = useIsMobile();
  const [theme, setTheme] = useState("dark");
  const t = TH[theme];
  const [sideOpen, setSideOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const [prospects, setProspects] = useState([]);
  const [blacklist, setBlacklist] = useState([]);
  const [sendConfig, setSendConfig] = useState({ sending: false, frequency_seconds: 1200 });
  const [sequences, setSequences] = useState([]);
  const [seqSteps, setSeqSteps] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [tags, setTags] = useState([]);
  const [prospectTags, setProspectTags] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const [lastSeenNotifCount, setLastSeenNotifCount] = useState(() => parseInt(localStorage.getItem("pf_seen_notifs") || "0"));
  const [dismissedNotifs, setDismissedNotifs] = useState(() => { try { return JSON.parse(localStorage.getItem("pf_dismissed_notifs") || "[]"); } catch { return []; } });
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterTag, setFilterTag] = useState("all");
  const [notes, setNotes] = useState([]);

  const [view, setView] = useState("pipeline");
  const [search, setSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [selectedProspect, setSelectedProspect] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showSmtp, setShowSmtp] = useState(false);
  const [showTpl, setShowTpl] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showPreview, setShowPreview] = useState(null); // prospect object or null
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState("");
  const [tpl, setTpl] = useState(""); const [tplSubject, setTplSubject] = useState("");
  const [np, setNp] = useState({ name: "", email: "", company: "" });
  const [bulk, setBulk] = useState("");
  const [addMode, setAddMode] = useState("single");
  const [addErr, setAddErr] = useState("");
  const [addCampaign, setAddCampaign] = useState("");
  const [sortBy, setSortBy] = useState("date");
  const [blSearch, setBlSearch] = useState(""); const [blAdd, setBlAdd] = useState("");
  const [lastSent, setLastSent] = useState(null); const [totalSent, setTotalSent] = useState(0);
  const searchRef = useRef(null);

  /* ─── Load all data ─── */
  const loadAll = useCallback(async () => {
    const [p, b, sc, tpl, sq, ss, c, ta, pt, n] = await Promise.all([
      api.getProspects(), api.getBlacklist(), api.getSendConfig(), api.getTemplate(),
      api.getSequences(), api.getSteps(), api.getCampaigns(), api.getTags(), api.getProspectTags(), api.getNotes(),
    ]);
    if (p) setProspects(p);
    if (b) setBlacklist(b);
    if (sc) setSendConfig(sc);
    if (tpl) { setTpl(tpl.body || ""); setTplSubject(tpl.subject || ""); }
    if (sq) setSequences(sq);
    if (ss) setSeqSteps(ss);
    if (c) setCampaigns(c);
    if (ta) setTags(ta);
    if (pt) setProspectTags(pt);
    if (n) setNotes(n);
    setLoading(false);
  }, []);
  useEffect(() => { loadAll(); }, [loadAll]);

  /* ─── Polling ─── */
  useEffect(() => { const i = setInterval(loadAll, 15000); return () => clearInterval(i); }, [loadAll]);

  /* ─── Notifications polling ─── */
  useEffect(() => {
    const checkNotifs = async () => {
      const since = new Date(Date.now() - 3600000).toISOString();
      const data = await api.getActivity();
      if (data) setNotifications(data.filter((n) => !dismissedNotifs.includes(n.id)));
    };
    checkNotifs();
    const interval = setInterval(checkNotifs, 30000);
    return () => clearInterval(interval);
  }, [dismissedNotifs]);

  /* ─── Shortcuts ─── */
  useEffect(() => {
    const h = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "f" || e.key === "k")) { e.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); }
      if (e.key === "Escape") { if (searchFocused) { searchRef.current?.blur(); setSearch(""); } else if (selectedProspect) setSelectedProspect(null); else if (showPreview) setShowPreview(null); else if (showAdd) setShowAdd(false); else if (showSmtp) setShowSmtp(false); else if (showTpl) setShowTpl(false); else if (showExport) setShowExport(false); else if (showSchedule) setShowSchedule(false); else if (sideOpen) setSideOpen(false); }
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [searchFocused, selectedProspect, showAdd, showSmtp, showTpl, showExport, sideOpen]);

  /* ─── Send toggle ─── */
  const sending = sendConfig.sending;
  const freqKey = FREQ.find((f) => f.seconds === sendConfig.frequency_seconds && f.batch === (sendConfig.batch_size || 1))?.key || "20min";
  const toggleSending = async () => { const nv = !sendConfig.sending; await api.updateSendConfig({ sending: nv }); setSendConfig((p) => ({ ...p, sending: nv })); };
  const setFreq = async (k) => { const f = FREQ.find((fr) => fr.key === k); if (!f) return; await api.updateSendConfig({ frequency_seconds: f.seconds, batch_size: f.batch }); setSendConfig((p) => ({ ...p, frequency_seconds: f.seconds, batch_size: f.batch })); };

  /* ─── Context menu ─── */
  const [ctx, setCtx] = useState(null);
  useEffect(() => { const c = () => setCtx(null); window.addEventListener("click", c); window.addEventListener("scroll", c, true); return () => { window.removeEventListener("click", c); window.removeEventListener("scroll", c, true); }; }, []);
  const onCtx = (e, p) => { e.preventDefault(); setCtx({ x: Math.min(e.clientX, window.innerWidth - 220), y: Math.min(e.clientY, window.innerHeight - 280), prospect: p }); };

  /* ─── Data ─── */
  const qc = prospects.filter((p) => p.status === "queue").length;
  const isBl = (email) => blacklist.some((b) => b.email.toLowerCase() === email.toLowerCase().trim());

  const filtered = useMemo(() => {
    let l = [...prospects];
    if (search) { const q = search.toLowerCase(); l = l.filter((p) => (p.name || "").toLowerCase().includes(q) || p.email.toLowerCase().includes(q) || (p.company || "").toLowerCase().includes(q)); }
    if (filterStatus !== "all") l = l.filter((p) => p.status === filterStatus);
    if (filterTag !== "all") { const tagPIds = prospectTags.filter((pt) => pt.tag_id === parseInt(filterTag)).map((pt) => pt.prospect_id); l = l.filter((p) => tagPIds.includes(p.id)); }
    if (sortBy === "date") l.sort((a, b) => new Date(b.added_at) - new Date(a.added_at));
    else if (sortBy === "name") l.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    else if (sortBy === "company") l.sort((a, b) => (a.company || "").localeCompare(b.company || ""));
    else if (sortBy === "heat") l.sort((a, b) => (b.heat_score || 0) - (a.heat_score || 0));
    else { const o = STATUSES.map((s) => s.key); l.sort((a, b) => o.indexOf(a.status) - o.indexOf(b.status)); }
    return l;
  }, [prospects, search, sortBy, filterStatus, filterTag, prospectTags]);

  /* ─── CRUD ─── */
  const addSingle = async () => {
    if (!np.email) return; setAddErr("");
    const em = np.email.trim().toLowerCase();
    if (isBl(em)) { setAddErr(`⛔ ${em} est blacklisté.`); return; }
    if (prospects.some((p) => p.email === em)) { setAddErr(`⚠ ${em} existe déjà.`); return; }
    const defaultSeq = sequences.find((s) => s.is_active);
    const campId = addCampaign ? parseInt(addCampaign) : (campaigns.find((c) => c.is_active)?.id || null);
    const { error } = await api.addProspect({ name: np.name.trim(), email: em, company: np.company.trim(), sequence_id: defaultSeq?.id || null, current_step: 1, campaign_id: campId });
    if (error) { setAddErr(error.message); return; }
    await loadAll(); setNp({ name: "", email: "", company: "" }); setShowAdd(false);
  };
  const addBulk = async () => {
    setAddErr(""); const lines = bulk.split("\n").filter(Boolean); const errs = []; const toIns = [];
    const defaultSeq = sequences.find((s) => s.is_active);
    const campId = addCampaign ? parseInt(addCampaign) : (campaigns.find((c) => c.is_active)?.id || null);
    for (const l of lines) { const p = l.split(/[,;\t]/).map((s) => s.trim()); const em = (p[0] || "").toLowerCase(); if (!em) continue; if (isBl(em)) { errs.push(`${em} (blacklisté)`); continue; } if (prospects.some((pr) => pr.email === em) || toIns.some((a) => a.email === em)) { errs.push(`${em} (doublon)`); continue; } toIns.push({ email: em, name: p[1] || "", company: p[2] || "", sequence_id: defaultSeq?.id || null, current_step: 1, campaign_id: campId }); }
    if (errs.length) setAddErr(`Ignorés: ${errs.join(", ")}`);
    if (toIns.length) { await api.addBulk(toIns); await loadAll(); }
    if (!errs.length) { setBulk(""); setShowAdd(false); }
  };
  const importCSV = async (e) => {
    const file = e.target.files?.[0]; if (!file) return; setAddErr("");
    const text = await file.text();
    const lines = text.split("\n").filter((l) => l.trim());
    const errs = []; const toIns = [];
    const defaultSeq = sequences.find((s) => s.is_active);
    const campId = addCampaign ? parseInt(addCampaign) : (campaigns.find((c) => c.is_active)?.id || null);
    // Skip header if it looks like one
    const startIdx = lines[0]?.toLowerCase().includes("email") ? 1 : 0;
    for (let i = startIdx; i < lines.length; i++) {
      const p = lines[i].split(/[,;\t]/).map((s) => s.trim().replace(/^["']|["']$/g, ""));
      const em = (p[0] || "").toLowerCase();
      if (!em || !em.includes("@")) continue;
      if (isBl(em)) { errs.push(`${em} (blacklisté)`); continue; }
      if (prospects.some((pr) => pr.email === em) || toIns.some((a) => a.email === em)) { errs.push(`${em} (doublon)`); continue; }
      toIns.push({ email: em, name: p[1] || "", company: p[2] || "", sequence_id: defaultSeq?.id || null, current_step: 1, campaign_id: campId });
    }
    if (errs.length) setAddErr(`Ignorés: ${errs.join(", ")}`);
    if (toIns.length) { await api.addBulk(toIns); await loadAll(); setAddErr((prev) => prev ? prev + ` — ${toIns.length} importés` : `✓ ${toIns.length} prospects importés`); }
    else if (!errs.length) setAddErr("Aucun email valide trouvé dans le fichier.");
  };
  const updStatus = async (id, ns) => { const u = { status: ns }; if (ns === "sent") u.sent_at = new Date().toISOString(); await api.updateProspect(id, u); await loadAll(); };
  const updProspect = async (id, data) => { await api.updateProspect(id, data); await loadAll(); };
  const delProspect = async (id) => { await api.deleteProspect(id); await loadAll(); };
  const sendManually = async (id) => { await api.updateProspect(id, { status: "sent", sent_at: new Date().toISOString(), last_step_sent_at: new Date().toISOString() }); await loadAll(); setTotalSent((c) => c + 1); setCtx(null); };
  const addToBl = async (email) => { if (!email.trim() || isBl(email)) return; await api.addBlacklist({ email: email.trim().toLowerCase(), reason: "manual", source: "manual" }); await loadAll(); setBlAdd(""); };
  const removeFromBl = async (id) => { await api.removeBlacklist(id); await loadAll(); };
  const saveTpl = async () => { await api.updateTemplate({ subject: tplSubject, body: tpl }); setShowTpl(false); };

  /* ─── Test email ─── */
  const sendTestEmail = async () => {
    if (!sendConfig.test_email) { setTestResult("⚠ Configure ton email test dans Config SMTP d'abord."); return; }
    setTestSending(true); setTestResult("");
    try {
      const data = await api.sendTest(sendConfig.test_email);
      if (error) { setTestResult(`❌ ${error.message}`); }
      else if (data?.ok) { setTestResult(`✅ Email test envoyé à ${sendConfig.test_email}`); }
      else { setTestResult(`❌ ${data?.error || "Erreur inconnue"}`); }
    } catch (e) { setTestResult(`❌ ${e.message}`); }
    setTestSending(false);
  };

  /* ─── Preview builder ─── */
  const buildPreviewHtml = (prospect) => {
    if (!prospect) return "";
    const subject = tplSubject.replace(/\{nom\}/g, prospect.name || "").replace(/\{entreprise\}/g, prospect.company || "").replace(/\{email\}/g, prospect.email);
    const body = tpl.replace(/\{nom\}/g, prospect.name || "").replace(/\{entreprise\}/g, prospect.company || "").replace(/\{email\}/g, prospect.email);
    return { subject, body };
  };

  /* ─── Schedule config ─── */
  const saveSchedule = async (updates) => {
    await api.updateSendConfig(updates);
    setSendConfig((prev) => ({ ...prev, ...updates }));
  };

  /* ─── Export/Import ─── */
  const exportJSON = () => { const d = { prospects, blacklist, template: { subject: tplSubject, body: tpl }, sequences, seqSteps, campaigns, sendConfig, exportedAt: new Date().toISOString() }; const b = new Blob([JSON.stringify(d, null, 2)], { type: "application/json" }); const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = `prospectflow-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(u); };
  const exportCSV = () => { const hdr = "email,name,company,status,added_at,sent_at,opened_at,replied_at\n"; const rows = prospects.map((p) => `${p.email},${p.name || ""},${p.company || ""},${p.status},${p.added_at || ""},${p.sent_at || ""},${p.opened_at || ""},${p.replied_at || ""}`).join("\n"); const b = new Blob([hdr + rows], { type: "text/csv" }); const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = `prospectflow-export-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(u); };
  const importJSON = async (e) => { const f = e.target.files?.[0]; if (!f) return; try { const txt = await f.text(); const d = JSON.parse(txt); if (d.prospects?.length) { /* bulk delete not supported */; await api.addBulk(d.prospects.map(({ id, ...r }) => r)); } if (d.blacklist?.length) { /* bulk delete not supported */; await api.addBlacklist(d.blacklist.map(({ id, ...r }) => r)); } if (d.template) { await api.updateTemplate(d.template); } loadAll(); setShowExport(false); } catch { setAddErr("Fichier JSON invalide"); } };

  /* ─── Sequence CRUD ─── */
  const saveStep = async (stepId, data) => { await api.updateStep(stepId, data); await loadAll(); };
  const addStep = async (seqId) => { const maxOrder = seqSteps.filter((s) => s.sequence_id === seqId).length; await api.addStep({ sequence_id: seqId, step_order: maxOrder + 1, delay_days: 3, subject: "Relance — {entreprise}", body: "Bonjour {nom},\n\nJe me permets de revenir vers vous.\n\nCordialement" }); await loadAll(); };
  const deleteStep = async (stepId) => { await api.deleteStep(stepId); await loadAll(); };

  /* ─── Campaign CRUD ─── */
  const addCampaignFn = async (name, seqId) => { await api.addCampaign({ name, sequence_id: seqId || sequences[0]?.id, is_active: true }); await loadAll(); };
  const updateCampaign = async (id, data) => { await api.updateCampaign(id, data); await loadAll(); };
  const deleteCampaign = async (id) => { await api.deleteCampaign(id); await loadAll(); };

  /* ─── Tags CRUD ─── */
  const addTag = async (name, color) => { await api.addTag({ name, color: color || "#6366f1" }); await loadAll(); };
  const deleteTag = async (id) => { await api.deleteTag(id); await loadAll(); };
  const assignTag = async (prospectId, tagId) => { await api.assignTag({ prospect_id: prospectId, tag_id: tagId }); await loadAll(); };
  const removeTag = async (prospectId, tagId) => { await api.removeTag({ prospect_id: prospectId, tag_id: tagId }); await loadAll(); };
  const getProspectTags = (prospectId) => { const tagIds = prospectTags.filter((pt) => pt.prospect_id === prospectId).map((pt) => pt.tag_id); return tags.filter((t) => tagIds.includes(t.id)); };
  const heatIcon = (score) => { if (score >= 70) return "🔥"; if (score >= 40) return "🟠"; if (score >= 20) return "🟡"; return ""; };

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString("fr-CH", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
  const inp = { padding: "10px 12px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.inputBg, color: t.text1, fontSize: 13, outline: "none", fontFamily: "inherit", width: "100%", boxSizing: "border-box" };
  const btnP = { padding: "10px 18px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer", marginTop: 6 };

  const navItems = [{ key: "pipeline", label: "Pipeline", icon: "◫" }, { key: "list", label: "Liste", icon: "☰" }, { key: "kpi", label: "KPI", icon: "◎" }, { key: "campaigns", label: "Campagnes", icon: "▤" }, { key: "sequences", label: "Séquences", icon: "↻" }, { key: "notes", label: "Notes", icon: "✎" }, { key: "blacklist", label: "Blacklist", icon: "⊘" }];
  const goTo = (v) => { setView(v); setSideOpen(false); };
  const filteredBl = useMemo(() => { if (!blSearch) return blacklist; const q = blSearch.toLowerCase(); return blacklist.filter((b) => b.email.toLowerCase().includes(q)); }, [blacklist, blSearch]);

  const SideContent = () => (
    <>
      <div style={{ padding: "20px 18px", borderBottom: `1px solid ${t.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div><div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.5px" }}><span style={{ color: t.accent }}>◆</span> ProspectFlow</div><div style={{ fontSize: 11, color: t.text2, marginTop: 4 }}>Prospection Email</div></div>
        {isMobile && <span onClick={() => setSideOpen(false)} style={{ fontSize: 22, cursor: "pointer", color: t.text2, lineHeight: 1 }}>✕</span>}
      </div>
      <div style={{ padding: "12px 10px", flex: 1 }}>
        {navItems.map((item) => (
          <div key={item.key} onClick={() => goTo(item.key)} style={{ padding: "10px 12px", borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", gap: 10, marginBottom: 2, background: view === item.key ? t.accentSoft : "transparent", color: view === item.key ? t.accentText : t.text2, fontWeight: view === item.key ? 600 : 400 }}>
            <span style={{ fontSize: 15, width: 20, textAlign: "center" }}>{item.icon}</span>{item.label}
            {item.key === "blacklist" && blacklist.length > 0 && <span style={{ marginLeft: "auto", fontSize: 10, background: t.accentSoft, color: t.accentText, padding: "1px 6px", borderRadius: 8, fontWeight: 600 }}>{blacklist.length}</span>}
          </div>
        ))}
      </div>
      <div style={{ padding: "10px 10px 14px", borderTop: `1px solid ${t.border}`, display: "flex", flexDirection: "column", gap: 1 }}>
        {[{ l: "⚙ Config SMTP", f: () => { setShowSmtp(true); setSideOpen(false); } }, { l: "✉ Template", f: () => { setShowTpl(true); setSideOpen(false); } }, { l: "◷ Horaires d'envoi", f: () => { setShowSchedule(true); setSideOpen(false); } }, { l: "⇄ Export / Import", f: () => { setShowExport(true); setSideOpen(false); } }, { l: theme === "dark" ? "☀ Thème clair" : "☾ Thème sombre", f: () => setTheme(theme === "dark" ? "light" : "dark") }].map((x) => (
          <div key={x.l} onClick={x.f} style={{ padding: "9px 12px", borderRadius: 8, cursor: "pointer", color: t.text2, fontSize: 13 }} onMouseEnter={(e) => (e.currentTarget.style.background = t.accentSoft)} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>{x.l}</div>
        ))}
      </div>
    </>
  );

  if (loading) return <div style={{ fontFamily: "'DM Sans',sans-serif", background: t.bg, color: t.text2, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>Chargement...</div>;

  return (
    <div style={{ fontFamily: "'DM Sans','Segoe UI',system-ui,sans-serif", background: t.bg, color: t.text1, height: "100vh", display: "flex", fontSize: 14, transition: "background .3s,color .3s", overflow: "hidden" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <style>{`html, body, #root { background: ${t.bg}; margin: 0; padding: 0; height: 100vh; overflow: hidden; }`}</style>
      {!isMobile && <div style={{ width: 220, background: t.surface, borderRight: `1px solid ${t.border}`, display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden" }}><SideContent /></div>}
      {isMobile && sideOpen && <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex" }}><div style={{ width: 260, background: t.surface, display: "flex", flexDirection: "column", boxShadow: "4px 0 20px rgba(0,0,0,0.3)", zIndex: 1001 }}><SideContent /></div><div onClick={() => setSideOpen(false)} style={{ flex: 1, background: t.overlay }} /></div>}

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, overflow: "hidden" }}>
        {/* TOP BAR */}
        <div style={{ padding: isMobile ? "10px 12px" : "10px 20px", borderBottom: `1px solid ${t.border}`, display: "flex", alignItems: "center", gap: 8, background: t.surface, flexWrap: "wrap" }}>
          {isMobile && <div onClick={() => setSideOpen(true)} style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, cursor: "pointer", flexShrink: 0, border: `1px solid ${t.border}` }}><svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect y="3" width="18" height="2" rx="1" fill={t.text2}/><rect y="8" width="18" height="2" rx="1" fill={t.text2}/><rect y="13" width="18" height="2" rx="1" fill={t.text2}/></svg></div>}
          <div style={{ position: "relative", flex: "1 1 140px", maxWidth: isMobile ? "100%" : 280, minWidth: 0 }}>
            <input ref={searchRef} placeholder={isMobile ? "Rechercher..." : "Rechercher... (Ctrl+K)"} value={search} onChange={(e) => setSearch(e.target.value)} onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)} style={{ ...inp, paddingLeft: 34, paddingRight: search ? 30 : 12, fontSize: 12 }} />
            <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: t.text2, fontSize: 13 }}>⌕</span>
            {search && <span onClick={() => setSearch("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: t.text2, cursor: "pointer", lineHeight: 1, fontSize: 14 }}>✕</span>}
          </div>
          {!isMobile && <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ padding: "8px 8px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.inputBg, color: t.text2, fontSize: 11, outline: "none", flexShrink: 0 }}><option value="date">Date</option><option value="name">Nom</option><option value="company">Entreprise</option><option value="status">Statut</option><option value="heat">Score 🔥</option></select>}
          {!isMobile && <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ padding: "8px 6px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.inputBg, color: t.text2, fontSize: 11, outline: "none", flexShrink: 0 }}><option value="all">Tous statuts</option>{STATUSES.map((s) => <option key={s.key} value={s.key}>{s.icon} {s.label}</option>)}</select>}
          {!isMobile && tags.length > 0 && <select value={filterTag} onChange={(e) => setFilterTag(e.target.value)} style={{ padding: "8px 6px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.inputBg, color: t.text2, fontSize: 11, outline: "none", flexShrink: 0 }}><option value="all">Tous tags</option>{tags.map((tg) => <option key={tg.id} value={tg.id}>{tg.name}</option>)}</select>}
          {/* Notification bell */}
          <div onClick={() => { setShowNotifs(!showNotifs); if (!showNotifs) { setLastSeenNotifCount(notifications.length); localStorage.setItem("pf_seen_notifs", String(notifications.length)); } }} style={{ position: "relative", width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, cursor: "pointer", border: `1px solid ${t.border}`, flexShrink: 0 }}>
            <span style={{ fontSize: 16 }}>🔔</span>
            {notifications.length > lastSeenNotifCount && <span style={{ position: "absolute", top: -4, right: -4, width: 18, height: 18, borderRadius: 9, background: "#ef4444", color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{notifications.length - lastSeenNotifCount}</span>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "36px 1fr 60px" : "40px 130px 1fr 64px", alignItems: "center", gap: 8, background: t.surface2, borderRadius: 10, padding: "7px 12px", border: `1px solid ${sending ? "rgba(34,197,94,0.3)" : t.border}`, width: isMobile ? "100%" : 390, flexShrink: 0, boxSizing: "border-box", order: isMobile ? 1 : 0 }}>
            <div onClick={toggleSending} style={{ width: isMobile ? 36 : 40, height: 22, borderRadius: 11, background: sending ? "#22c55e" : t.border, cursor: "pointer", position: "relative", transition: "background .2s" }}><div style={{ width: 16, height: 16, borderRadius: 8, background: "#fff", position: "absolute", top: 3, left: sending ? (isMobile ? 17 : 21) : 3, transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,0.18)" }} /></div>
            {!isMobile && <div style={{ fontSize: 12, overflow: "hidden", whiteSpace: "nowrap" }}>{sending ? (<><span style={{ color: "#22c55e", fontWeight: 600 }}>Actif</span><span style={{ color: t.text2 }}> · auto {FREQ.find((f) => f.seconds === sendConfig.frequency_seconds)?.label || ""}</span></>) : (<span style={{ color: t.text2, fontWeight: 500 }}>Envoi désactivé</span>)}</div>}
            <select value={freqKey} onChange={(e) => setFreq(e.target.value)} style={{ padding: "5px 4px", borderRadius: 6, border: `1px solid ${t.border}`, background: t.inputBg, color: t.text2, fontSize: 11, outline: "none", width: "100%" }}>{FREQ.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</select>
            <div style={{ fontSize: 11, color: qc > 0 ? t.accentText : t.text2, background: qc > 0 ? t.accentSoft : "transparent", padding: "3px 0", borderRadius: 6, fontWeight: 600, textAlign: "center", whiteSpace: "nowrap" }}>{qc} file</div>
          </div>
          <button onClick={() => { setAddErr(""); setShowAdd(true); }} style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${t.accent}`, background: "transparent", color: t.accentText, fontWeight: 600, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>+ Ajouter</button>
        </div>

        {lastSent && <div style={{ padding: "6px 20px", background: t.successBg, borderBottom: `1px solid ${t.successBorder}`, display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}><span style={{ color: "#22c55e", fontSize: 8 }}>●</span><span style={{ color: t.text2 }}>Dernier : <strong style={{ color: t.text1 }}>{lastSent}</strong></span><span style={{ marginLeft: "auto", color: t.text2 }}>{totalSent} envoyé{totalSent > 1 ? "s" : ""}</span></div>}

        <div style={{ flex: 1, overflow: "auto", padding: isMobile ? 12 : 20, minHeight: 0 }}>
          {view === "pipeline" && <PipelineView prospects={filtered} onSelect={setSelectedProspect} onCtx={onCtx} updStatus={updStatus} fmtDate={fmtDate} t={t} isMobile={isMobile} seqSteps={seqSteps} heatIcon={heatIcon} getProspectTags={getProspectTags} />}
          {view === "list" && <ListView prospects={filtered} fmtDate={fmtDate} onSelect={setSelectedProspect} onCtx={onCtx} t={t} seqSteps={seqSteps} />}
          {view === "kpi" && <AnalyticsView prospects={prospects} blacklist={blacklist} t={t} />}
          {view === "campaigns" && <CampaignsView campaigns={campaigns} sequences={sequences} prospects={prospects} addCampaign={addCampaignFn} updateCampaign={updateCampaign} deleteCampaign={deleteCampaign} t={t} inp={inp} btnP={btnP} />}
          {view === "sequences" && <SequencesView sequences={sequences} steps={seqSteps} saveStep={saveStep} addStep={addStep} deleteStep={deleteStep} toggleSequence={async (id, active) => { await api.updateSequence(id, { is_active: active }); await loadAll(); }} t={t} inp={inp} btnP={btnP} />}
          {view === "notes" && <NotesView notes={notes} setNotes={setNotes} t={t} inp={inp} />}
          {view === "blacklist" && <BlacklistView list={filteredBl} search={blSearch} setSearch={setBlSearch} addEmail={blAdd} setAddEmail={setBlAdd} onAdd={addToBl} onRemove={removeFromBl} t={t} inp={inp} isMobile={isMobile} />}
        </div>
      </div>

      {/* Detail panel */}
      {/* Detail panel - overlay */}
      {selectedProspect && (
        <>
          <div onClick={() => setSelectedProspect(null)} style={{ position: "fixed", inset: 0, zIndex: 997, background: "transparent" }} />
          <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 360, maxWidth: "100%", zIndex: 998, boxShadow: "-4px 0 20px rgba(0,0,0,0.3)" }}>
            {isMobile ? (
              <div style={{ position: "fixed", inset: 0, zIndex: 999, display: "flex", alignItems: "flex-end", justifyContent: "center", background: t.overlay }} onClick={() => setSelectedProspect(null)}>
                <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxHeight: "85vh", background: t.surface, borderRadius: "16px 16px 0 0", overflowY: "auto" }}>
                  <DetailPanel prospect={prospects.find((p) => p.id === selectedProspect)} onClose={() => setSelectedProspect(null)} onUpdate={updProspect} updStatus={updStatus} fmtDate={fmtDate} tpl={tpl} t={t} seqSteps={seqSteps} tags={tags} getProspectTags={getProspectTags} assignTag={assignTag} removeTag={removeTag} heatIcon={heatIcon} />
                </div>
              </div>
            ) : (
              <DetailPanel prospect={prospects.find((p) => p.id === selectedProspect)} onClose={() => setSelectedProspect(null)} onUpdate={updProspect} updStatus={updStatus} fmtDate={fmtDate} tpl={tpl} t={t} seqSteps={seqSteps} tags={tags} getProspectTags={getProspectTags} assignTag={assignTag} removeTag={removeTag} heatIcon={heatIcon} />
            )}
          </div>
        </>
      )}

      {/* Context menu */}
      {ctx && <div style={{ position: "fixed", top: ctx.y, left: ctx.x, zIndex: 9999, background: t.surface, border: `1px solid ${t.border}`, borderRadius: 10, boxShadow: theme === "dark" ? "0 8px 30px rgba(0,0,0,0.4)" : "0 8px 30px rgba(0,0,0,0.12)", minWidth: 200, padding: "5px 0" }}>
        {ctx.prospect.status === "queue" && <CI onClick={() => sendManually(ctx.prospect.id)} t={t}>📤 Envoyer maintenant</CI>}
        <CI onClick={() => { setShowPreview(ctx.prospect); setCtx(null); }} t={t}>👁 Aperçu email</CI>
        <CI onClick={() => { setSelectedProspect(ctx.prospect.id); setCtx(null); }} t={t}>📋 Voir les détails</CI>
        <div style={{ height: 1, background: t.border, margin: "3px 8px" }} />
        {STATUSES.filter((s) => s.key !== ctx.prospect.status).slice(0, 4).map((s) => <CI key={s.key} onClick={() => { updStatus(ctx.prospect.id, s.key); setCtx(null); }} t={t}>{s.icon} → {s.label}</CI>)}
        <div style={{ height: 1, background: t.border, margin: "3px 8px" }} />
        <CI onClick={async () => { await addToBl(ctx.prospect.email); await updStatus(ctx.prospect.id, "refused"); setCtx(null); }} t={t}>⊘ Blacklister</CI>
        <CI onClick={() => { delProspect(ctx.prospect.id); setCtx(null); }} t={t} danger>✕ Supprimer</CI>
      </div>}

      {/* Modals */}
      {/* Notification dropdown */}
      {showNotifs && <div style={{ position: "fixed", top: 56, right: 20, zIndex: 9999, width: 340, maxHeight: 400, background: t.surface, border: `1px solid ${t.border}`, borderRadius: 12, boxShadow: theme === "dark" ? "0 8px 30px rgba(0,0,0,0.4)" : "0 8px 30px rgba(0,0,0,0.12)", overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${t.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ fontWeight: 700, fontSize: 14 }}>Notifications</span><span onClick={() => setShowNotifs(false)} style={{ cursor: "pointer", color: t.text2, fontSize: 16 }}>✕</span></div>
        <div style={{ maxHeight: 340, overflowY: "auto" }}>
          {notifications.length > 0 ? notifications.map((n) => (
            <div key={n.id} onContextMenu={(e) => { e.preventDefault(); const newDismissed = [...dismissedNotifs, n.id]; setDismissedNotifs(newDismissed); localStorage.setItem("pf_dismissed_notifs", JSON.stringify(newDismissed)); setNotifications((prev) => prev.filter((x) => x.id !== n.id)); }} style={{ padding: "10px 16px", borderBottom: `1px solid ${t.border}`, display: "flex", alignItems: "center", gap: 10, fontSize: 13, cursor: "default" }} onMouseEnter={(e) => (e.currentTarget.style.background = t.surface2)} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")} title="Clic droit pour supprimer">
              <span style={{ fontSize: 16 }}>{n.event_type === "opened" ? "👁" : n.event_type === "received" || n.event_type === "replied" ? "📩" : "•"}</span>
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ color: t.text1, fontWeight: 500 }}>{n.event_type === "opened" ? "Email ouvert" : "Réponse reçue"}</div><div style={{ fontSize: 11, color: t.text2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.prospect_email}</div></div>
              <span style={{ fontSize: 10, color: t.text2, flexShrink: 0 }}>{new Date(n.created_at).toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
          )) : <div style={{ padding: 24, textAlign: "center", color: t.text2, fontSize: 13 }}>Aucune notification récente</div>}
        </div>
      </div>}

      {showAdd && <Modal onClose={() => setShowAdd(false)} title="Ajouter des prospects" t={t} isMobile={isMobile}>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>{[["single", "Un seul"], ["bulk", "Texte"], ["csv", "CSV/Excel"]].map(([m, l]) => <button key={m} onClick={() => { setAddMode(m); setAddErr(""); }} style={{ padding: "7px 16px", borderRadius: 6, border: `1px solid ${addMode === m ? t.accent : t.border}`, background: addMode === m ? t.accentSoft : "transparent", color: addMode === m ? t.accentText : t.text2, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>{l}</button>)}</div>
        {/* Campaign selector */}
        {campaigns.length > 0 && <div style={{ marginBottom: 12 }}><label style={{ fontSize: 12, color: t.text2, marginBottom: 4, display: "block" }}>Campagne</label><select value={addCampaign} onChange={(e) => setAddCampaign(e.target.value)} style={{ ...inp, fontSize: 12 }}><option value="">Campagne par défaut</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>}
        {addErr && <div style={{ padding: "8px 12px", borderRadius: 8, background: addErr.startsWith("✓") ? t.successBg : t.dangerBg, border: `1px solid ${addErr.startsWith("✓") ? t.successBorder : t.dangerBorder}`, fontSize: 12, color: addErr.startsWith("✓") ? "#22c55e" : "#ef4444", marginBottom: 12 }}>{addErr}</div>}
        <div style={{ minHeight: 200 }}>
          {addMode === "single" && <div style={{ display: "flex", flexDirection: "column", gap: 10 }}><input placeholder="Nom" value={np.name} onChange={(e) => setNp({ ...np, name: e.target.value })} style={inp} /><input placeholder="Email *" value={np.email} onChange={(e) => { setNp({ ...np, email: e.target.value }); setAddErr(""); }} style={inp} onKeyDown={(e) => e.key === "Enter" && addSingle()} /><input placeholder="Entreprise" value={np.company} onChange={(e) => setNp({ ...np, company: e.target.value })} style={inp} onKeyDown={(e) => e.key === "Enter" && addSingle()} /><button onClick={addSingle} style={btnP}>Ajouter à la file</button></div>}
          {addMode === "bulk" && <div style={{ display: "flex", flexDirection: "column", gap: 10 }}><div style={{ fontSize: 12, color: t.text2 }}>email, nom, entreprise (un par ligne)</div><textarea value={bulk} onChange={(e) => { setBulk(e.target.value); setAddErr(""); }} rows={7} placeholder={"marie@test.ch, Marie, StartupVS"} style={{ ...inp, resize: "vertical", fontFamily: "monospace", fontSize: 12 }} /><button onClick={addBulk} style={btnP}>Importer tout</button></div>}
          {addMode === "csv" && <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 12, color: t.text2, lineHeight: 1.6 }}>Importe un fichier CSV ou Excel (.csv). Le fichier doit avoir les colonnes : <strong>email</strong>, nom, entreprise. La première ligne peut être un en-tête.</div>
            <label style={{ padding: 24, borderRadius: 12, border: `2px dashed ${t.border}`, background: t.surface2, textAlign: "center", cursor: "pointer", display: "block" }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>📄</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: t.text1, marginBottom: 4 }}>Glisse un fichier ici ou clique pour choisir</div>
              <div style={{ fontSize: 11, color: t.text2 }}>.csv — email, nom, entreprise</div>
              <input type="file" accept=".csv,.txt,.tsv" onChange={importCSV} style={{ display: "none" }} />
            </label>
          </div>}
        </div>
      </Modal>}

      {showSmtp && <Modal onClose={() => setShowSmtp(false)} title="Configuration SMTP" t={t} isMobile={isMobile}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ padding: 14, borderRadius: 10, background: t.accentSoft, border: `1px solid ${t.border}`, fontSize: 13, color: t.text1, lineHeight: 1.6 }}>La config SMTP se fait dans <strong>Supabase Dashboard</strong> → Edge Functions → Secrets.<br/>Variables : <code style={{ color: t.accentText }}>SMTP_HOST</code>, <code style={{ color: t.accentText }}>SMTP_PORT</code>, <code style={{ color: t.accentText }}>SMTP_EMAIL</code>, <code style={{ color: t.accentText }}>SMTP_PASSWORD</code>, <code style={{ color: t.accentText }}>SMTP_SENDER_NAME</code></div>
          <button onClick={() => setShowSmtp(false)} style={btnP}>Compris</button>
        </div>
      </Modal>}

      {showTpl && <Modal onClose={() => setShowTpl(false)} title="Template Email (premier contact)" t={t} isMobile={isMobile} wide>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 12, color: t.text2 }}>Variables : <code style={{ color: t.accentText }}>{"{nom}"}</code> <code style={{ color: t.accentText }}>{"{entreprise}"}</code> <code style={{ color: t.accentText }}>{"{email}"}</code></div>
          <input placeholder="Sujet" value={tplSubject} onChange={(e) => setTplSubject(e.target.value)} style={inp} />
          <textarea value={tpl} onChange={(e) => setTpl(e.target.value)} rows={10} style={{ ...inp, resize: "vertical", lineHeight: 1.6 }} />
          <div style={{ padding: 12, borderRadius: 8, background: t.surface2, border: `1px solid ${t.border}` }}>
            <div style={{ fontSize: 11, color: t.text2, marginBottom: 6, textTransform: "uppercase" }}>Aperçu</div>
            <div style={{ fontSize: 13, color: t.text1, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{tpl.replace("{nom}", "Marie Dupont").replace("{entreprise}", "StartupVS").replace("{email}", "marie@startup.ch")}</div>
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${t.border}`, fontSize: 11, color: t.text2, textAlign: "center" }}><span style={{ textDecoration: "underline" }}>Je ne souhaite plus être contacté</span></div>
          </div>
          <button onClick={saveTpl} style={btnP}>Sauvegarder</button>
          <div style={{ marginTop: 12, padding: 14, borderRadius: 10, background: t.surface2, border: `1px solid ${t.border}` }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>📧 Envoyer un email test</div>
            <div style={{ fontSize: 12, color: t.text2, marginBottom: 8 }}>Envoie-toi cet email pour voir exactement à quoi il ressemble dans ta boîte.</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input placeholder="ton@email.com" value={sendConfig.test_email || ""} onChange={(e) => saveSchedule({ test_email: e.target.value })} style={{ ...inp, flex: 1, fontSize: 12 }} />
              <button onClick={sendTestEmail} disabled={testSending} style={{ ...btnP, marginTop: 0, opacity: testSending ? 0.6 : 1, whiteSpace: "nowrap" }}>{testSending ? "Envoi..." : "Tester"}</button>
            </div>
            {testResult && <div style={{ marginTop: 8, fontSize: 12, color: testResult.startsWith("✅") ? "#22c55e" : "#ef4444" }}>{testResult}</div>}
          </div>
        </div>
      </Modal>}

      {showExport && <Modal onClose={() => setShowExport(false)} title="Export / Import" t={t} isMobile={isMobile}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div><div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Exporter</div><div style={{ display: "flex", gap: 8 }}><button onClick={exportJSON} style={btnP}>⬇ Backup JSON</button><button onClick={exportCSV} style={{ ...btnP, background: "linear-gradient(135deg, #0ea5e9, #06b6d4)" }}>⬇ Export CSV</button></div></div>
          <div style={{ height: 1, background: t.border }} />
          <div><div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Importer</div><div style={{ padding: 12, borderRadius: 8, background: t.dangerBg, border: `1px solid ${t.dangerBorder}`, fontSize: 12, color: "#ef4444", marginBottom: 10 }}>⚠ L'import JSON écrase toutes les données.</div><label style={{ ...btnP, display: "inline-block", cursor: "pointer", background: t.surface2, color: t.text1, border: `1px solid ${t.border}` }}>⬆ Choisir un fichier JSON<input type="file" accept=".json" onChange={importJSON} style={{ display: "none" }} /></label></div>
        </div>
      </Modal>}

      {/* Schedule modal */}
      {showSchedule && <Modal onClose={() => setShowSchedule(false)} title="◷ Planification horaire" t={t} isMobile={isMobile}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minHeight: 340 }}>
          <div style={{ padding: 14, borderRadius: 10, background: t.accentSoft, border: `1px solid ${t.border}`, fontSize: 13, color: t.text1, lineHeight: 1.6 }}>
            Les emails ne sont envoyés que pendant les plages horaires définies, en semaine uniquement. Cela maximise les taux d'ouverture.
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <label style={{ fontSize: 13, color: t.text2, flex: 1 }}>Activer la planification</label>
            <div onClick={() => saveSchedule({ use_schedule: !sendConfig.use_schedule })} style={{ width: 40, height: 22, borderRadius: 11, background: sendConfig.use_schedule ? "#22c55e" : t.border, cursor: "pointer", position: "relative" }}>
              <div style={{ width: 16, height: 16, borderRadius: 8, background: "#fff", position: "absolute", top: 3, left: sendConfig.use_schedule ? 21 : 3, transition: "left .2s" }} />
            </div>
          </div>

          {sendConfig.use_schedule && <>
            <div style={{ fontSize: 12, color: t.text2, fontWeight: 600, marginBottom: 4 }}>Plage du matin</div>
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14 }}>
              <input type="number" min="0" max="23" value={sendConfig.send_hour_start || 9} onChange={(e) => saveSchedule({ send_hour_start: parseInt(e.target.value) })} style={{ ...inp, width: 80, textAlign: "center", fontSize: 16, fontWeight: 600 }} /><span style={{ color: t.text2, fontSize: 14 }}>h  à</span>
              <input type="number" min="0" max="23" value={sendConfig.send_hour_end_morning || 12} onChange={(e) => saveSchedule({ send_hour_end_morning: parseInt(e.target.value) })} style={{ ...inp, width: 80, textAlign: "center", fontSize: 16, fontWeight: 600 }} /><span style={{ color: t.text2, fontSize: 14 }}>h</span>
            </div>

            <div style={{ fontSize: 12, color: t.text2, fontWeight: 600, marginBottom: 4 }}>Plage de l'après-midi</div>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <input type="number" min="0" max="23" value={sendConfig.send_hour_start_afternoon || 14} onChange={(e) => saveSchedule({ send_hour_start_afternoon: parseInt(e.target.value) })} style={{ ...inp, width: 80, textAlign: "center", fontSize: 16, fontWeight: 600 }} /><span style={{ color: t.text2, fontSize: 14 }}>h  à</span>
              <input type="number" min="0" max="23" value={sendConfig.send_hour_end || 17} onChange={(e) => saveSchedule({ send_hour_end: parseInt(e.target.value) })} style={{ ...inp, width: 80, textAlign: "center", fontSize: 16, fontWeight: 600 }} /><span style={{ color: t.text2, fontSize: 14 }}>h</span>
            </div>

            <div style={{ padding: 12, borderRadius: 8, background: t.surface2, border: `1px solid ${t.border}`, fontSize: 12, color: t.text2 }}>
              📅 Envois uniquement <strong style={{ color: t.text1 }}>du lundi au vendredi</strong> entre <strong style={{ color: t.text1 }}>{sendConfig.send_hour_start || 9}h-{sendConfig.send_hour_end_morning || 12}h</strong> et <strong style={{ color: t.text1 }}>{sendConfig.send_hour_start_afternoon || 14}h-{sendConfig.send_hour_end || 17}h</strong> (fuseau: {sendConfig.timezone || "Europe/Zurich"})
            </div>
          </>}

          {!sendConfig.use_schedule && <div style={{ padding: 12, borderRadius: 8, background: t.warn, border: `1px solid ${t.warnBorder}`, fontSize: 12, color: t.warnText }}>⚠ Les emails seront envoyés à toute heure, y compris la nuit et le week-end.</div>}

          <button onClick={() => setShowSchedule(false)} style={btnP}>Fermer</button>
        </div>
      </Modal>}

      {/* Email Preview modal */}
      {showPreview && <Modal onClose={() => setShowPreview(null)} title="📧 Aperçu de l'email" t={t} isMobile={isMobile}>
        {(() => { const pv = buildPreviewHtml(showPreview); return (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 12, color: t.text2 }}>Voici exactement ce que <strong style={{ color: t.text1 }}>{showPreview.name || showPreview.email}</strong> recevra :</div>

            <div style={{ padding: "10px 14px", background: t.surface2, borderRadius: 8, border: `1px solid ${t.border}` }}>
              <div style={{ fontSize: 11, color: t.text2, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>Sujet</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: t.text1 }}>{pv.subject}</div>
            </div>

            <div style={{ padding: "10px 14px", background: t.surface2, borderRadius: 8, border: `1px solid ${t.border}` }}>
              <div style={{ fontSize: 11, color: t.text2, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>De</div>
              <div style={{ fontSize: 13, color: t.text1 }}>hello@golynk.ch</div>
            </div>

            <div style={{ padding: "10px 14px", background: t.surface2, borderRadius: 8, border: `1px solid ${t.border}` }}>
              <div style={{ fontSize: 11, color: t.text2, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>À</div>
              <div style={{ fontSize: 13, color: t.text1 }}>{showPreview.email}</div>
            </div>

            {/* Rendered email body */}
            <div style={{ padding: 20, background: "#ffffff", borderRadius: 10, border: `1px solid ${t.border}`, color: "#333", fontSize: 15, lineHeight: 1.6, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
              {pv.body.split("\n").map((line, i) => line.trim() ? <p key={i} style={{ margin: "0 0 12px" }}>{line}</p> : <br key={i} />)}
              <div style={{ marginTop: 32, paddingTop: 14, borderTop: "1px solid #e5e7eb", fontSize: 11, color: "#9ca3af", textAlign: "center" }}>
                <span style={{ textDecoration: "underline" }}>Je ne souhaite plus être contacté</span>
              </div>
            </div>

            {showPreview.bounced && <div style={{ padding: 10, borderRadius: 8, background: t.dangerBg, border: `1px solid ${t.dangerBorder}`, fontSize: 12, color: "#ef4444" }}>⚠ Cet email a bouncé : {showPreview.bounce_reason || "adresse invalide"}</div>}
          </div>
        ); })()}
      </Modal>}
    </div>
  );
}

/* ═══ Small components ═══ */
function CI({ children, onClick, t, danger }) { return <div onClick={onClick} style={{ padding: "8px 16px", fontSize: 13, cursor: "pointer", color: danger ? "#ef4444" : t.text1, display: "flex", alignItems: "center", gap: 8 }} onMouseEnter={(e) => (e.currentTarget.style.background = t.surface2)} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>{children}</div>; }
function Modal({ children, onClose, title, t, isMobile, wide }) { return (<div style={{ position: "fixed", inset: 0, zIndex: 999, display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", background: t.overlay, backdropFilter: "blur(4px)" }} onClick={onClose}><div onClick={(e) => e.stopPropagation()} style={{ background: t.surface, borderRadius: isMobile ? "16px 16px 0 0" : 16, border: `1px solid ${t.border}`, padding: 24, width: isMobile ? "100%" : wide ? 720 : 460, maxWidth: "95%", maxHeight: "85vh", overflowY: "auto" }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}><span style={{ fontWeight: 700, fontSize: 16 }}>{title}</span><span onClick={onClose} style={{ cursor: "pointer", color: t.text2, fontSize: 18, lineHeight: 1 }}>✕</span></div>{children}</div></div>); }

/* ═══ PIPELINE ═══ */
function PipelineView({ prospects, onSelect, onCtx, updStatus, fmtDate, t, isMobile, seqSteps, heatIcon, getProspectTags }) {
  const [dragId, setDragId] = useState(null); const [dragOver, setDragOver] = useState(null);
  return (
    <div style={{ display: "flex", gap: 12, overflowX: "auto", height: "100%", paddingBottom: 10, margin: "0 auto", width: "fit-content", minWidth: "100%" }}>
      {STATUSES.map((s) => { const items = prospects.filter((p) => p.status === s.key); const isOver = dragOver === s.key && dragId !== null; return (
        <div key={s.key} onDragOver={(e) => { e.preventDefault(); setDragOver(s.key); }} onDragLeave={() => setDragOver(null)} onDrop={(e) => { e.preventDefault(); if (dragId) updStatus(dragId, s.key); setDragOver(null); setDragId(null); }} style={{ minWidth: isMobile ? 165 : 195, maxWidth: 225, flex: `0 0 ${isMobile ? 165 : 195}px`, display: "flex", flexDirection: "column", borderRadius: 12, border: isOver ? `2px dashed ${s.color}` : "2px solid transparent", background: isOver ? `${s.color}08` : "transparent", transition: "border-color .2s, background .2s" }}>
          <div style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: s.color }} /><span style={{ fontWeight: 600, fontSize: 13 }}>{s.label}</span><span style={{ marginLeft: "auto", fontSize: 11, color: t.text2, background: t.surface2, padding: "2px 8px", borderRadius: 10 }}>{items.length}</span></div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, overflowY: "auto", padding: "6px 4px" }}>
            {items.map((p) => { const step = p.sequence_id ? seqSteps.find((ss) => ss.sequence_id === p.sequence_id && ss.step_order === p.current_step) : null; const pTags = getProspectTags(p.id); const hi = heatIcon(p.heat_score || 0); return (
              <div key={p.id} draggable onDragStart={(e) => { setDragId(p.id); e.dataTransfer.effectAllowed = "move"; e.currentTarget.style.opacity = "0.5"; }} onDragEnd={(e) => { e.currentTarget.style.opacity = "1"; setDragId(null); setDragOver(null); }} onClick={() => onSelect(p.id)} onContextMenu={(e) => onCtx(e, p)} style={{ padding: "12px 14px", background: t.surface2, borderRadius: 10, border: `1px solid ${t.border}`, cursor: "grab", transition: "border-color .15s,transform .1s", userSelect: "none" }} onMouseEnter={(e) => { if (!dragId) { e.currentTarget.style.borderColor = s.color; e.currentTarget.style.transform = "translateY(-1px)"; } }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = t.border; e.currentTarget.style.transform = "none"; }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                  <span style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{p.name || p.email}</span>
                  {p.bounced && <span style={{ fontSize: 11, color: "#ef4444", flexShrink: 0 }} title="Bounce - email invalide">⚠</span>}
                  {hi && !p.bounced && <span style={{ fontSize: 12, flexShrink: 0 }}>{hi}</span>}
                </div>
                <div style={{ fontSize: 11, color: t.text2 }}>{p.company || "—"}</div>
                {pTags.length > 0 && <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginTop: 4 }}>{pTags.slice(0, 3).map((tg) => <span key={tg.id} style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, background: `${tg.color}20`, color: tg.color, fontWeight: 600 }}>{tg.name}</span>)}</div>}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                  <span style={{ fontSize: 10, color: t.text2 }}>{fmtDate(p.added_at)}</span>
                  {step && <span style={{ fontSize: 9, color: t.accentText, background: t.accentSoft, padding: "1px 5px", borderRadius: 4 }}>Étape {p.current_step}</span>}
                </div>
              </div>
            ); })}
            {items.length === 0 && <div style={{ padding: 20, textAlign: "center", color: t.text2, fontSize: 12, opacity: isOver ? 1 : 0.5 }}>{isOver ? "Déposer ici" : "Vide"}</div>}
          </div>
        </div>
      ); })}
    </div>
  );
}

/* ═══ LIST ═══ */
function ListView({ prospects, fmtDate, onSelect, onCtx, t, seqSteps }) {
  return (<div style={{ background: t.surface, borderRadius: 12, border: `1px solid ${t.border}`, overflow: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}><thead><tr style={{ borderBottom: `1px solid ${t.border}` }}>{["Nom", "Email", "Entreprise", "Statut", "Étape", "Ajouté", "Envoyé"].map((h) => <th key={h} style={{ padding: "12px 14px", textAlign: "left", fontSize: 11, color: t.text2, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>)}</tr></thead><tbody>{prospects.map((p) => (<tr key={p.id} onClick={() => onSelect(p.id)} onContextMenu={(e) => onCtx(e, p)} style={{ borderBottom: `1px solid ${t.border}`, cursor: "pointer" }} onMouseEnter={(e) => (e.currentTarget.style.background = t.cardHover)} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}><td style={{ padding: "11px 14px", fontWeight: 500, fontSize: 13 }}>{p.name || "—"}</td><td style={{ padding: "11px 14px", fontSize: 12, color: t.text2 }}>{p.email}</td><td style={{ padding: "11px 14px", fontSize: 12, color: t.text2 }}>{p.company || "—"}</td><td style={{ padding: "11px 14px" }}><span style={{ padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: `${SM[p.status]?.color}18`, color: SM[p.status]?.color }}>{SM[p.status]?.icon} {SM[p.status]?.label}</span></td><td style={{ padding: "11px 14px", fontSize: 11, color: t.text2 }}>{p.sequence_id ? `${p.current_step}/${seqSteps.filter((s) => s.sequence_id === p.sequence_id).length}` : "—"}</td><td style={{ padding: "11px 14px", fontSize: 11, color: t.text2 }}>{fmtDate(p.added_at)}</td><td style={{ padding: "11px 14px", fontSize: 11, color: t.text2 }}>{fmtDate(p.sent_at)}</td></tr>))}</tbody></table></div>);
}

/* ═══ ANALYTICS ═══ */
function AnalyticsView({ prospects, blacklist, t }) {
  const [dailyStats, setDailyStats] = useState([]); const [weeklyStats, setWeeklyStats] = useState([]); const [activity, setActivity] = useState([]); const [period, setPeriod] = useState("daily");
  useEffect(() => {
    (async () => {
      const [dR, wR, aR] = await Promise.all([Promise.resolve([]), Promise.resolve([]), api.getActivity(), { ascending: false }).limit(50)]);
      if (dR.data) setDailyStats(dR.data.map((d) => ({ ...d, label: new Date(d.day).toLocaleDateString("fr-CH", { day: "2-digit", month: "short" }) })));
      if (wR.data) setWeeklyStats(wR.data.map((w) => ({ ...w, label: `Sem. ${new Date(w.week_start).toLocaleDateString("fr-CH", { day: "2-digit", month: "short" })}` })));
      if (aR.data) setActivity(aR.data);
    })();
  }, [prospects]);

  const kpis = useMemo(() => {
    const tot = prospects.filter((p) => p.status !== "queue").length; const op = prospects.filter((p) => p.opened_at).length; const rp = prospects.filter((p) => p.replied_at).length;
    const ac = prospects.filter((p) => p.status === "accepted").length; const rf = prospects.filter((p) => p.status === "refused").length; const ng = prospects.filter((p) => p.status === "negotiation").length; const qt = prospects.filter((p) => p.status === "queue").length;
    const rt = prospects.filter((p) => p.sent_at && p.replied_at).map((p) => (new Date(p.replied_at) - new Date(p.sent_at)) / 3600000);
    const avg = rt.length ? (rt.reduce((a, b) => a + b, 0) / rt.length).toFixed(1) : "—";
    return { total: tot, opened: op, replied: rp, accepted: ac, refused: rf, negotiation: ng, queue: qt, blacklisted: blacklist.length, openRate: tot ? ((op / tot) * 100).toFixed(1) : "0", replyRate: tot ? ((rp / tot) * 100).toFixed(1) : "0", conversionRate: tot ? ((ac / tot) * 100).toFixed(1) : "0", avgReplyTime: avg };
  }, [prospects, blacklist]);

  const pieData = useMemo(() => { const c = {}; prospects.forEach((p) => { c[p.status] = (c[p.status] || 0) + 1; }); return Object.entries(c).map(([k, v]) => ({ name: k, value: v, color: SC[k] || "#888" })); }, [prospects]);
  const funnelData = useMemo(() => ["sent", "waiting", "received", "negotiation", "accepted"].map((s) => ({ stage: SM[s]?.label, count: prospects.filter((p) => p.status === s).length, color: SC[s] })), [prospects]);
  const chartData = period === "daily" ? dailyStats.slice(-14) : weeklyStats;
  const fmtTime = (d) => { if (!d) return ""; const df = (Date.now() - new Date(d).getTime()) / 1000; if (df < 60) return "à l'instant"; if (df < 3600) return `il y a ${Math.floor(df / 60)} min`; if (df < 86400) return `il y a ${Math.floor(df / 3600)}h`; return new Date(d).toLocaleDateString("fr-CH", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); };
  const evLbl = { sent: "📤 Envoyé", opened: "👁 Ouvert", received: "📩 Répondu", accepted: "✅ Accepté", refused: "❌ Refusé", waiting: "⏱ En attente", negotiation: "🤝 Négociation" };
  const CTip = ({ active, payload, label }) => { if (!active || !payload?.length) return null; return (<div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 8, padding: "10px 14px", fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}><div style={{ fontWeight: 600, marginBottom: 6, color: t.text1 }}>{label}</div>{payload.map((p) => (<div key={p.dataKey} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: p.color }} /><span style={{ color: t.text2 }}>{p.dataKey}:</span><span style={{ fontWeight: 600, color: t.text1 }}>{p.value}</span></div>))}</div>); };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))", gap: 12 }}>
        {[{ l: "Emails envoyés", v: kpis.total, c: "#0ea5e9", s: `${kpis.queue} en file` }, { l: "Taux d'ouverture", v: `${kpis.openRate}%`, c: "#f59e0b", s: `${kpis.opened} ouverts` }, { l: "Taux de réponse", v: `${kpis.replyRate}%`, c: "#10b981", s: `${kpis.replied} réponses` }, { l: "Taux de conversion", v: `${kpis.conversionRate}%`, c: "#8b5cf6", s: `${kpis.accepted} clients` }, { l: "En négociation", v: kpis.negotiation, c: "#8b5cf6", s: "en cours" }, { l: "Refused", v: kpis.refused, c: "#ef4444", s: "" }, { l: "Temps moy. réponse", v: kpis.avgReplyTime === "—" ? "—" : `${kpis.avgReplyTime}h`, c: "#0ea5e9", s: "" }].map((c) => (
          <div key={c.l} style={{ padding: "18px 16px", background: t.surface, borderRadius: 12, border: `1px solid ${t.border}` }}><div style={{ fontSize: 11, color: t.text2, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>{c.l}</div><div style={{ fontSize: 26, fontWeight: 700, color: c.c, marginBottom: 2 }}>{c.v}</div>{c.s && <div style={{ fontSize: 11, color: t.text2 }}>{c.s}</div>}</div>
        ))}
      </div>

      {/* Time chart */}
      <div style={{ padding: 24, background: t.surface, borderRadius: 12, border: `1px solid ${t.border}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Activité</div>
          <div style={{ display: "flex", gap: 6 }}>{[["daily", "Jour"], ["weekly", "Semaine"]].map(([k, l]) => (<button key={k} onClick={() => setPeriod(k)} style={{ padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: "pointer", border: `1px solid ${period === k ? t.accent : t.border}`, background: period === k ? t.accentSoft : "transparent", color: period === k ? t.accentText : t.text2 }}>{l}</button>))}</div>
        </div>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={chartData}>
              <defs><linearGradient id="gS" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3} /><stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} /></linearGradient><linearGradient id="gO" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} /><stop offset="95%" stopColor="#f59e0b" stopOpacity={0} /></linearGradient><linearGradient id="gR" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.3} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke={t.border} /><XAxis dataKey="label" tick={{ fill: t.text2, fontSize: 10 }} axisLine={{ stroke: t.border }} tickLine={false} /><YAxis tick={{ fill: t.text2, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} /><Tooltip content={<CTip />} />
              <Area type="monotone" dataKey="sent" stroke="#0ea5e9" fill="url(#gS)" strokeWidth={2} /><Area type="monotone" dataKey="opened" stroke="#f59e0b" fill="url(#gO)" strokeWidth={2} /><Area type="monotone" dataKey="replied" stroke="#10b981" fill="url(#gR)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        ) : <div style={{ height: 240, display: "flex", alignItems: "center", justifyContent: "center", color: t.text2, fontSize: 13 }}>Les stats apparaîtront après les premiers envois.</div>}
        <div style={{ display: "flex", justifyContent: "center", gap: 20, marginTop: 10 }}>{[["Sent", "#0ea5e9"], ["Ouverts", "#f59e0b"], ["Réponses", "#10b981"]].map(([l, c]) => (<div key={l} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: t.text2 }}><span style={{ width: 10, height: 10, borderRadius: "50%", background: c }} />{l}</div>))}</div>
      </div>

      {/* Funnel + Pie */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ padding: 24, background: t.surface, borderRadius: 12, border: `1px solid ${t.border}` }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 20 }}>Funnel</div>
          {funnelData.map((d, i) => { const mx = Math.max(...funnelData.map((f) => f.count), 1); return (<div key={d.stage} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}><div style={{ width: 90, fontSize: 12, color: t.text2, flexShrink: 0 }}>{d.stage}</div><div style={{ flex: 1, height: 32, background: t.surface2, borderRadius: 6, overflow: "hidden", position: "relative" }}><div style={{ width: `${(d.count / mx) * 100}%`, height: "100%", background: `${d.color}40`, borderRadius: 6, minWidth: d.count > 0 ? 30 : 0 }} /><span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 13, fontWeight: 700, color: d.color }}>{d.count}</span></div>{i > 0 && funnelData[i - 1].count > 0 && <div style={{ fontSize: 11, color: t.text2, width: 40, textAlign: "right" }}>{((d.count / funnelData[i - 1].count) * 100).toFixed(0)}%</div>}</div>); })}
        </div>
        <div style={{ padding: 24, background: t.surface, borderRadius: 12, border: `1px solid ${t.border}` }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 20 }}>Répartition</div>
          {pieData.length > 0 ? (<div style={{ display: "flex", alignItems: "center", gap: 16 }}><ResponsiveContainer width="50%" height={180}><PieChart><Pie data={pieData} dataKey="value" cx="50%" cy="50%" outerRadius={72} innerRadius={38} strokeWidth={0}>{pieData.map((d, i) => <Cell key={i} fill={d.color} />)}</Pie></PieChart></ResponsiveContainer><div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{pieData.map((d) => (<div key={d.name} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}><span style={{ width: 10, height: 10, borderRadius: "50%", background: d.color, flexShrink: 0 }} /><span style={{ color: t.text2 }}>{d.name}</span><span style={{ fontWeight: 600, color: t.text1, marginLeft: "auto" }}>{d.value}</span></div>))}</div></div>) : <div style={{ height: 180, display: "flex", alignItems: "center", justifyContent: "center", color: t.text2 }}>Aucun prospect</div>}
        </div>
      </div>

      {/* Activity feed */}
      <div style={{ padding: 24, background: t.surface, borderRadius: 12, border: `1px solid ${t.border}` }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Activité récente</div>
        {activity.length > 0 ? (<div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 280, overflowY: "auto" }}>{activity.slice(0, 25).map((a) => (<div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderRadius: 8, fontSize: 13 }} onMouseEnter={(e) => (e.currentTarget.style.background = t.surface2)} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}><span style={{ fontSize: 13, width: 22 }}>{(evLbl[a.event_type] || "•").split(" ")[0]}</span><span style={{ color: t.text1 }}>{(evLbl[a.event_type] || a.event_type).split(" ").slice(1).join(" ")}</span>{a.prospect_email && <span style={{ fontSize: 12, color: t.text2 }}> — {a.prospect_email}</span>}<span style={{ fontSize: 11, color: t.text2, marginLeft: "auto", flexShrink: 0 }}>{fmtTime(a.created_at)}</span></div>))}</div>) : <div style={{ padding: 20, textAlign: "center", color: t.text2, fontSize: 13 }}>L'activité apparaîtra après les premiers envois.</div>}
      </div>
    </div>
  );
}

/* ═══ SEQUENCES ═══ */
function SequencesView({ sequences, steps, saveStep, addStep, deleteStep, toggleSequence, t, inp, btnP }) {
  const [editId, setEditId] = useState(null);
  const [editData, setEditData] = useState({});

  const startEdit = (step) => { setEditId(step.id); setEditData({ delay_days: step.delay_days, subject: step.subject, body: step.body }); };
  const cancelEdit = () => { setEditId(null); setEditData({}); };
  const doSave = () => { saveStep(editId, editData); setEditId(null); };

  return (
    <div>
      <div style={{ padding: "16px 20px", background: t.accentSoft, borderRadius: 12, border: `1px solid ${t.border}`, marginBottom: 20, fontSize: 13, color: t.text1, lineHeight: 1.7 }}>
        <strong>↻ Séquences de relance</strong> — Quand un prospect ne répond pas au premier email (configurable dans Template), le système envoie automatiquement les relances ci-dessous selon le délai configuré.
        <br /><span style={{ fontSize: 12, color: t.text2 }}>Variables : <code style={{ color: t.accentText }}>{"{nom}"}</code> <code style={{ color: t.accentText }}>{"{entreprise}"}</code> <code style={{ color: t.accentText }}>{"{email}"}</code></span>
      </div>

      {sequences.map((seq) => {
        const allSteps = steps.filter((s) => s.sequence_id === seq.id).sort((a, b) => a.step_order - b.step_order);
        const followupSteps = allSteps.filter((s) => s.step_order > 1);
        return (
          <div key={seq.id} style={{ background: t.surface, borderRadius: 12, border: `1px solid ${t.border}`, marginBottom: 16, overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${t.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div><span style={{ fontWeight: 700, fontSize: 15 }}>{seq.name}</span><span style={{ fontSize: 12, color: seq.is_active ? "#22c55e" : t.text2, marginLeft: 10 }}>{seq.is_active ? "● Active" : "○ Inactive"}</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div onClick={() => toggleSequence(seq.id, !seq.is_active)} style={{ width: 40, height: 22, borderRadius: 11, background: seq.is_active ? "#22c55e" : t.border, cursor: "pointer", position: "relative", transition: "background .2s" }}><div style={{ width: 16, height: 16, borderRadius: 8, background: "#fff", position: "absolute", top: 3, left: seq.is_active ? 21 : 3, transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,0.18)" }} /></div>
                <span style={{ fontSize: 12, color: t.text2 }}>{followupSteps.length} relance{followupSteps.length > 1 ? "s" : ""}</span>
              </div>
            </div>

            {/* Info about first email */}
            <div style={{ padding: "12px 20px", borderBottom: `1px solid ${t.border}`, background: t.surface2, display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: t.text2 }}>
              <span style={{ fontSize: 14 }}>✉</span> Le premier email est configurable dans <strong style={{ color: t.accentText, cursor: "pointer" }}>Template</strong>
            </div>

            {followupSteps.map((step, i) => (
              <div key={step.id} style={{ padding: "16px 20px", borderBottom: `1px solid ${t.border}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: editId === step.id ? 14 : 0 }}>
                  {/* Step number badge */}
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: t.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, color: t.accentText, flexShrink: 0 }}>{i + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{step.subject || "(Sans sujet)"}</div>
                    <div style={{ fontSize: 12, color: t.text2 }}>Relance après {step.delay_days} jour{step.delay_days > 1 ? "s" : ""} sans réponse</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    {editId === step.id ? (
                      <><button onClick={doSave} style={{ padding: "5px 12px", borderRadius: 6, border: "none", background: "#22c55e", color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Sauver</button><button onClick={cancelEdit} style={{ padding: "5px 12px", borderRadius: 6, border: `1px solid ${t.border}`, background: "transparent", color: t.text2, fontSize: 11, cursor: "pointer" }}>Annuler</button></>
                    ) : (
                      <><button onClick={() => startEdit(step)} style={{ padding: "5px 12px", borderRadius: 6, border: `1px solid ${t.border}`, background: "transparent", color: t.text2, fontSize: 11, cursor: "pointer" }}>Modifier</button><button onClick={() => deleteStep(step.id)} style={{ padding: "5px 12px", borderRadius: 6, border: `1px solid ${t.border}`, background: "transparent", color: "#ef4444", fontSize: 11, cursor: "pointer" }}>✕</button></>
                    )}
                  </div>
                </div>

                {editId === step.id && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10, paddingLeft: 44 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}><label style={{ fontSize: 12, color: t.text2, flexShrink: 0 }}>Délai (jours) :</label><input type="number" min="1" value={editData.delay_days} onChange={(e) => setEditData({ ...editData, delay_days: parseInt(e.target.value) || 1 })} style={{ ...inp, width: 80 }} /></div>
                    <input placeholder="Sujet" value={editData.subject} onChange={(e) => setEditData({ ...editData, subject: e.target.value })} style={inp} />
                    <textarea rows={5} value={editData.body} onChange={(e) => setEditData({ ...editData, body: e.target.value })} style={{ ...inp, resize: "vertical", lineHeight: 1.6 }} />
                  </div>
                )}
              </div>
            ))}

            <div style={{ padding: "12px 20px" }}>
              <button onClick={() => addStep(seq.id)} style={{ padding: "8px 16px", borderRadius: 8, border: `1px dashed ${t.border}`, background: "transparent", color: t.text2, fontSize: 12, cursor: "pointer", width: "100%" }}>+ Ajouter une étape de relance</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ═══ CAMPAIGNS ═══ */
function CampaignsView({ campaigns, sequences, prospects, addCampaign, updateCampaign, deleteCampaign, t, inp, btnP }) {
  const [newName, setNewName] = useState("");
  const [newSeq, setNewSeq] = useState("");

  const doAdd = () => {
    if (!newName.trim()) return;
    addCampaign(newName.trim(), newSeq ? parseInt(newSeq) : null);
    setNewName(""); setNewSeq("");
  };

  return (
    <div>
      <div style={{ padding: "16px 20px", background: t.accentSoft, borderRadius: 12, border: `1px solid ${t.border}`, marginBottom: 20, fontSize: 13, color: t.text1, lineHeight: 1.7 }}>
        <strong>▤ Campagnes</strong> — Groupez vos prospects par campagne pour suivre les performances de chaque audience séparément. Chaque campagne peut utiliser une séquence d'emails différente.
      </div>

      {/* Add campaign */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        <input placeholder="Nom de la campagne" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doAdd()} style={{ ...inp, flex: "1 1 200px", maxWidth: 300 }} />
        <select value={newSeq} onChange={(e) => setNewSeq(e.target.value)} style={{ ...inp, flex: "0 0 200px", fontSize: 12 }}>
          <option value="">— Choisir une séquence —</option>
          {sequences.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button onClick={doAdd} style={{ ...btnP, marginTop: 0 }}>+ Créer</button>
      </div>

      {/* Campaign list */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
        {campaigns.map((c) => {
          const campProspects = prospects.filter((p) => p.campaign_id === c.id);
          const sent = campProspects.filter((p) => p.status !== "queue").length;
          const opened = campProspects.filter((p) => p.opened_at).length;
          const replied = campProspects.filter((p) => p.replied_at).length;
          const accepted = campProspects.filter((p) => p.status === "accepted").length;
          const seq = sequences.find((s) => s.id === c.sequence_id);
          return (
            <div key={c.id} style={{ padding: 20, background: t.surface, borderRadius: 12, border: `1px solid ${t.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{c.name}</div>
                  {seq && <div style={{ fontSize: 11, color: t.text2, marginTop: 2 }}>↻ {seq.name}</div>}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <span style={{ fontSize: 11, color: c.is_active ? "#22c55e" : t.text2, fontWeight: 600 }}>{c.is_active ? "● Active" : "○ Inactive"}</span>
                  <button onClick={() => updateCampaign(c.id, { is_active: !c.is_active })} style={{ padding: "3px 8px", borderRadius: 4, border: `1px solid ${t.border}`, background: "transparent", color: t.text2, fontSize: 10, cursor: "pointer" }}>{c.is_active ? "Pause" : "Activer"}</button>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
                {[["Prospects", campProspects.length, "#6366f1"], ["Ouverts", opened, "#f59e0b"], ["Réponses", replied, "#10b981"], ["Clients", accepted, "#22c55e"]].map(([l, v, color]) => (
                  <div key={l} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color }}>{v}</div>
                    <div style={{ fontSize: 10, color: t.text2 }}>{l}</div>
                  </div>
                ))}
              </div>
              {sent > 0 && (
                <div style={{ marginTop: 12, display: "flex", gap: 12, fontSize: 11, color: t.text2 }}>
                  <span>Ouverture: <strong style={{ color: t.text1 }}>{sent ? ((opened / sent) * 100).toFixed(0) : 0}%</strong></span>
                  <span>Réponse: <strong style={{ color: t.text1 }}>{sent ? ((replied / sent) * 100).toFixed(0) : 0}%</strong></span>
                  <span>Conversion: <strong style={{ color: t.text1 }}>{sent ? ((accepted / sent) * 100).toFixed(0) : 0}%</strong></span>
                </div>
              )}
              <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
                <button onClick={() => { if (confirm("Supprimer cette campagne ?")) deleteCampaign(c.id); }} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${t.border}`, background: "transparent", color: t.text2, fontSize: 11, cursor: "pointer" }}>Supprimer</button>
              </div>
            </div>
          );
        })}
        {campaigns.length === 0 && <div style={{ padding: 32, textAlign: "center", color: t.text2, fontSize: 13 }}>Aucune campagne. Créez-en une ci-dessus.</div>}
      </div>
    </div>
  );
}

/* ═══ NOTES ═══ */
function NotesView({ notes, setNotes, t, inp }) {
  const saveTimerRef = useRef(null);
  const [activeNote, setActiveNote] = useState(notes[0]?.id || null);
  const [newTitle, setNewTitle] = useState("");

  const note = notes.find((n) => n.id === activeNote);

  const updateNote = (id, field, value) => {
    // Update locally immediately
    setNotes((prev) => prev.map((n) => n.id === id ? { ...n, [field]: value } : n));
    // Debounce save to Supabase
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      await api.updateNote(id, { [field]: value });
    }, 800);
  };

  const addNote = async () => {
    const title = newTitle.trim() || `Note du ${new Date().toLocaleDateString("fr-CH")}`;
    const { data } = await api.addNote({ title, content: "" });
    if (data) { setNotes((prev) => [data, ...prev]); setActiveNote(data.id); setNewTitle(""); }
  };

  const deleteNote = async (id) => {
    await api.deleteNote(id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
    if (activeNote === id) setActiveNote(notes.find((n) => n.id !== id)?.id || null);
  };

  return (
    <div style={{ display: "flex", gap: 16, height: "calc(100vh - 140px)" }}>
      {/* Notes list */}
      <div style={{ width: 220, flexShrink: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", gap: 6 }}>
          <input placeholder="Nouvelle note..." value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addNote()} style={{ ...inp, fontSize: 12 }} />
          <button onClick={addNote} style={{ padding: "8px 12px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", fontWeight: 600, fontSize: 12, cursor: "pointer", flexShrink: 0 }}>+</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
          {notes.map((n) => (
            <div key={n.id} onClick={() => setActiveNote(n.id)} style={{
              padding: "10px 12px", borderRadius: 8, cursor: "pointer",
              background: activeNote === n.id ? t.accentSoft : "transparent",
              border: `1px solid ${activeNote === n.id ? t.accent : "transparent"}`,
              transition: "all .15s",
            }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: activeNote === n.id ? t.accentText : t.text1, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.title || "Sans titre"}</div>
              <div style={{ fontSize: 10, color: t.text2 }}>{n.updated_at ? new Date(n.updated_at).toLocaleDateString("fr-CH", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}</div>
            </div>
          ))}
          {notes.length === 0 && <div style={{ padding: 20, textAlign: "center", color: t.text2, fontSize: 12 }}>Aucune note. Crée-en une ci-dessus.</div>}
        </div>
      </div>

      {/* Editor */}
      {note ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", background: t.surface, borderRadius: 12, border: `1px solid ${t.border}`, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${t.border}`, display: "flex", alignItems: "center", gap: 10 }}>
            <input value={note.title} onChange={(e) => updateNote(note.id, "title", e.target.value)} style={{ ...inp, fontWeight: 700, fontSize: 16, border: "none", background: "transparent", padding: "4px 0" }} placeholder="Titre de la note" />
            <button onClick={() => { if (confirm("Supprimer cette note ?")) deleteNote(note.id); }} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${t.border}`, background: "transparent", color: t.text2, fontSize: 11, cursor: "pointer", flexShrink: 0 }}>🗑</button>
          </div>
          <textarea
            value={note.content}
            onChange={(e) => updateNote(note.id, "content", e.target.value)}
            placeholder="Écris tes notes ici... (sauvegarde automatique)"
            style={{
              flex: 1, padding: "16px 20px", border: "none", background: "transparent",
              color: t.text1, fontSize: 14, lineHeight: 1.7, resize: "none", outline: "none",
              fontFamily: "'DM Sans', sans-serif",
            }}
          />
          <div style={{ padding: "8px 16px", borderTop: `1px solid ${t.border}`, fontSize: 11, color: t.text2, display: "flex", justifyContent: "space-between" }}>
            <span>💾 Sauvegarde auto</span>
            <span>{(note.content || "").length} caractères</span>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: t.text2, fontSize: 14 }}>Sélectionne ou crée une note</div>
      )}
    </div>
  );
}

/* ═══ BLACKLIST ═══ */
function BlacklistView({ list, search, setSearch, addEmail, setAddEmail, onAdd, onRemove, t, inp, isMobile }) {
  return (<div><div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}><div style={{ position: "relative", flex: "1 1 200px", maxWidth: 300 }}><input placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...inp, paddingLeft: 34, fontSize: 12 }} /><span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: t.text2, fontSize: 13 }}>⌕</span></div><input placeholder="Ajouter un email..." value={addEmail} onChange={(e) => setAddEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onAdd(addEmail)} style={{ ...inp, flex: "1 1 200px", maxWidth: 260, fontSize: 12 }} /><button onClick={() => onAdd(addEmail)} style={{ padding: "10px 16px", borderRadius: 8, border: "none", background: "#ef4444", color: "#fff", fontWeight: 600, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>+ Blacklister</button></div><div style={{ padding: "14px 16px", background: t.dangerBg, border: `1px solid ${t.dangerBorder}`, borderRadius: 10, marginBottom: 20, fontSize: 13, color: t.text2 }}>⊘ <strong style={{ color: t.text1 }}>{list.length} email{list.length > 1 ? "s" : ""}</strong> — ne recevront plus de mails.</div><div style={{ background: t.surface, borderRadius: 12, border: `1px solid ${t.border}`, overflow: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: isMobile ? 500 : 0 }}><thead><tr style={{ borderBottom: `1px solid ${t.border}` }}>{["Email", "Raison", "Source", "Date", ""].map((h) => <th key={h} style={{ padding: "12px 14px", textAlign: "left", fontSize: 11, color: t.text2, fontWeight: 600, textTransform: "uppercase" }}>{h}</th>)}</tr></thead><tbody>{list.map((b) => <tr key={b.id} style={{ borderBottom: `1px solid ${t.border}` }} onMouseEnter={(e) => (e.currentTarget.style.background = t.cardHover)} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}><td style={{ padding: "11px 14px", fontWeight: 500, fontSize: 13 }}>{b.email}</td><td style={{ padding: "11px 14px" }}><span style={{ padding: "2px 8px", borderRadius: 5, fontSize: 11, fontWeight: 600, background: b.reason === "unsubscribe" ? "rgba(239,68,68,0.12)" : "rgba(245,158,11,0.12)", color: b.reason === "unsubscribe" ? "#ef4444" : "#f59e0b" }}>{b.reason === "unsubscribe" ? "Désabonné" : "Manuel"}</span></td><td style={{ padding: "11px 14px", fontSize: 11, color: t.text2 }}>{b.source === "unsubscribe_link" ? "Lien email" : "Manuel"}</td><td style={{ padding: "11px 14px", fontSize: 11, color: t.text2 }}>{new Date(b.added_at).toLocaleDateString("fr-CH", { day: "2-digit", month: "short", year: "numeric" })}</td><td style={{ padding: "11px 14px", textAlign: "right" }}><button onClick={() => onRemove(b.id)} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${t.border}`, background: "transparent", color: t.text2, fontSize: 11, cursor: "pointer" }}>Retirer</button></td></tr>)}{list.length === 0 && <tr><td colSpan={5} style={{ padding: 32, textAlign: "center", color: t.text2 }}>Aucun email blacklisté</td></tr>}</tbody></table></div></div>);
}

/* ═══ DETAIL PANEL ═══ */
function DetailPanel({ prospect, onClose, onUpdate, updStatus, fmtDate, tpl, t, seqSteps, tags, getProspectTags, assignTag, removeTag, heatIcon }) {
  if (!prospect) return null; const s = SM[prospect.status];
  const preview = tpl.replace("{nom}", prospect.name || "prospect").replace("{entreprise}", prospect.company || "votre entreprise").replace("{email}", prospect.email);
  const pSteps = seqSteps.filter((ss) => ss.sequence_id === prospect.sequence_id).sort((a, b) => a.step_order - b.step_order);
  const pTags = getProspectTags(prospect.id);
  const availTags = tags.filter((tg) => !pTags.some((pt) => pt.id === tg.id));
  const heat = prospect.heat_score || 0;
  const hi = heatIcon(heat);
  return (<div style={{ width: "100%", height: "100vh", background: t.surface, borderLeft: `1px solid ${t.border}`, display: "flex", flexDirection: "column", overflowY: "auto" }}>
    <div style={{ padding: "16px 20px", borderBottom: `1px solid ${t.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ fontWeight: 700, fontSize: 15 }}>Détails</span><span onClick={onClose} style={{ cursor: "pointer", color: t.text2, fontSize: 18, lineHeight: 1 }}>✕</span></div>
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}><div style={{ width: 44, height: 44, borderRadius: 10, background: `${s.color}20`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{s.icon}</div><div style={{ minWidth: 0, flex: 1 }}><div style={{ fontWeight: 600, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{prospect.name || prospect.email}</div><div style={{ fontSize: 12, color: t.text2 }}>{prospect.company || "—"}</div></div>{hi && <span style={{ fontSize: 20 }}>{hi}</span>}</div>
      <div style={{ padding: "8px 12px", borderRadius: 8, background: `${s.color}12`, color: s.color, fontSize: 12, fontWeight: 600, textAlign: "center" }}>{s.icon} {s.label}</div>

      {/* Heat score bar */}
      {heat > 0 && <div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: t.text2, marginBottom: 4 }}><span>Score de chaleur</span><span style={{ fontWeight: 600, color: heat >= 70 ? "#ef4444" : heat >= 40 ? "#f59e0b" : t.text2 }}>{heat}/100</span></div>
        <div style={{ height: 6, borderRadius: 3, background: t.surface2, overflow: "hidden" }}><div style={{ width: `${heat}%`, height: "100%", borderRadius: 3, background: heat >= 70 ? "#ef4444" : heat >= 40 ? "#f59e0b" : "#6366f1", transition: "width .4s" }} /></div>
        {prospect.open_count > 1 && <div style={{ fontSize: 10, color: t.text2, marginTop: 3 }}>Ouvert {prospect.open_count} fois</div>}
      </div>}

      {/* Tags */}
      <div>
        <div style={{ fontSize: 11, color: t.text2, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Tags</div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
          {pTags.map((tg) => (
            <span key={tg.id} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, background: `${tg.color}20`, color: tg.color, fontWeight: 600, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }} onClick={() => removeTag(prospect.id, tg.id)}>
              {tg.name} <span style={{ fontSize: 10, opacity: 0.7 }}>✕</span>
            </span>
          ))}
          {pTags.length === 0 && <span style={{ fontSize: 12, color: t.text2 }}>Aucun tag</span>}
        </div>
        {availTags.length > 0 && (
          <select onChange={(e) => { if (e.target.value) { assignTag(prospect.id, parseInt(e.target.value)); e.target.value = ""; } }} defaultValue="" style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: `1px solid ${t.border}`, background: t.inputBg, color: t.text2, fontSize: 11, outline: "none" }}>
            <option value="">+ Ajouter un tag</option>
            {availTags.map((tg) => <option key={tg.id} value={tg.id}>{tg.name}</option>)}
          </select>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>{[["Email", prospect.email], ["Ajouté", fmtDate(prospect.added_at)], ["Envoyé", fmtDate(prospect.sent_at)], ["Ouvert", fmtDate(prospect.opened_at)], ["Répondu", fmtDate(prospect.replied_at)]].map(([k, v]) => <div key={k} style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: t.text2 }}>{k}</span><span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{v}</span></div>)}</div>

      {pSteps.length > 0 && (<div><div style={{ fontSize: 11, color: t.text2, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>Progression séquence</div><div style={{ display: "flex", gap: 4 }}>{pSteps.map((step, i) => (<div key={step.id} style={{ flex: 1, height: 6, borderRadius: 3, background: i < prospect.current_step ? t.accent : t.surface2 }} />))}</div><div style={{ fontSize: 11, color: t.text2, marginTop: 4 }}>Étape {prospect.current_step} / {pSteps.length}{prospect.sequence_completed ? " — Terminée" : ""}</div></div>)}

      {prospect.bounced && <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", fontSize: 12, color: "#ef4444" }}>⚠ <strong>Email invalide (bounce)</strong> — {prospect.bounce_reason || "L'adresse n'existe pas ou a été rejetée par le serveur."}</div>}

      <div><label style={{ fontSize: 11, color: t.text2, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Statut</label><select value={prospect.status} onChange={(e) => updStatus(prospect.id, e.target.value)} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.inputBg, color: t.text1, fontSize: 12, outline: "none" }}>{STATUSES.map((st) => <option key={st.key} value={st.key}>{st.icon} {st.label}</option>)}</select></div>
      <div><label style={{ fontSize: 11, color: t.text2, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Notes</label><textarea value={prospect.notes || ""} onChange={(e) => onUpdate(prospect.id, { notes: e.target.value })} rows={3} placeholder="Note..." style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.inputBg, color: t.text1, fontSize: 12, outline: "none", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }} /></div>
      <div><div style={{ fontSize: 11, color: t.text2, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Aperçu email</div><div style={{ padding: 14, borderRadius: 8, background: t.surface2, border: `1px solid ${t.border}`, fontSize: 12, color: t.text2, whiteSpace: "pre-wrap", lineHeight: 1.5, maxHeight: 200, overflowY: "auto" }}>{preview}</div><div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${t.border}`, fontSize: 11, color: t.text2, textAlign: "center" }}><span style={{ textDecoration: "underline" }}>Je ne souhaite plus être contacté</span></div></div>
    </div>
  </div>);
}
