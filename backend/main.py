from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, RedirectResponse, Response
from pydantic import BaseModel
from typing import Optional, List
import json, os

from database import get_db, init_db, log_activity, update_heat_score
from email_sender import send_email, replace_vars, build_html
from scheduler import start_scheduler, get_smtp_config

app = FastAPI(title="ProspectFlow API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config.json")

def load_config():
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH) as f: return json.load(f)
    return {"smtp": {}}

def save_config(data):
    with open(CONFIG_PATH, "w") as f: json.dump(data, f, indent=2)

@app.on_event("startup")
def startup():
    init_db()
    start_scheduler()

# ═══ PROSPECTS ═══
class ProspectIn(BaseModel):
    name: str = ""; email: str; company: str = ""
    sequence_id: Optional[int] = None; campaign_id: Optional[int] = None

@app.get("/api/prospects")
def get_prospects():
    conn = get_db()
    rows = conn.execute("SELECT * FROM prospects ORDER BY added_at DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/api/prospects")
def add_prospect(p: ProspectIn):
    conn = get_db()
    bl = conn.execute("SELECT id FROM blacklist WHERE email=?", (p.email.lower(),)).fetchone()
    if bl: conn.close(); return {"error": "blacklisted"}
    dup = conn.execute("SELECT id FROM prospects WHERE email=?", (p.email.lower(),)).fetchone()
    if dup: conn.close(); return {"error": "duplicate"}
    seq_id = p.sequence_id
    if not seq_id:
        seq = conn.execute("SELECT id FROM sequences WHERE is_active=1 LIMIT 1").fetchone()
        seq_id = seq["id"] if seq else None
    conn.execute("INSERT INTO prospects (name,email,company,sequence_id,campaign_id) VALUES (?,?,?,?,?)",
        (p.name.strip(), p.email.strip().lower(), p.company.strip(), seq_id, p.campaign_id))
    conn.commit(); conn.close()
    return {"ok": True}

@app.post("/api/prospects/bulk")
def add_bulk(prospects: List[ProspectIn]):
    conn = get_db()
    added = 0
    seq = conn.execute("SELECT id FROM sequences WHERE is_active=1 LIMIT 1").fetchone()
    seq_id = seq["id"] if seq else None
    for p in prospects:
        em = p.email.strip().lower()
        bl = conn.execute("SELECT id FROM blacklist WHERE email=?", (em,)).fetchone()
        dup = conn.execute("SELECT id FROM prospects WHERE email=?", (em,)).fetchone()
        if bl or dup: continue
        conn.execute("INSERT INTO prospects (name,email,company,sequence_id,campaign_id) VALUES (?,?,?,?,?)",
            (p.name.strip(), em, p.company.strip(), p.sequence_id or seq_id, p.campaign_id))
        added += 1
    conn.commit(); conn.close()
    return {"ok": True, "added": added}

@app.patch("/api/prospects/{pid}")
async def update_prospect(pid: int, req: Request):
    data = await req.json()
    conn = get_db()
    old = dict(conn.execute("SELECT * FROM prospects WHERE id=?", (pid,)).fetchone())
    sets = ", ".join(f"{k}=?" for k in data.keys())
    conn.execute(f"UPDATE prospects SET {sets} WHERE id=?", (*data.values(), pid))
    conn.commit()
    if "status" in data and data["status"] != old["status"]:
        log_activity(data["status"], pid, old["email"])
    if "opened_at" in data or "open_count" in data:
        update_heat_score(pid)
    conn.close()
    return {"ok": True}

@app.delete("/api/prospects/{pid}")
def delete_prospect(pid: int):
    conn = get_db(); conn.execute("DELETE FROM prospects WHERE id=?", (pid,)); conn.commit(); conn.close()
    return {"ok": True}

# ═══ BLACKLIST ═══
@app.get("/api/blacklist")
def get_blacklist():
    conn = get_db(); rows = conn.execute("SELECT * FROM blacklist ORDER BY added_at DESC").fetchall(); conn.close()
    return [dict(r) for r in rows]

@app.post("/api/blacklist")
async def add_blacklist(req: Request):
    data = await req.json()
    conn = get_db()
    conn.execute("INSERT OR IGNORE INTO blacklist (email,reason,source) VALUES (?,?,?)",
        (data["email"].strip().lower(), data.get("reason","manual"), data.get("source","manual")))
    conn.commit(); conn.close()
    return {"ok": True}

@app.delete("/api/blacklist/{bid}")
def remove_blacklist(bid: int):
    conn = get_db(); conn.execute("DELETE FROM blacklist WHERE id=?", (bid,)); conn.commit(); conn.close()
    return {"ok": True}

# ═══ TEMPLATE ═══
@app.get("/api/template")
def get_template():
    conn = get_db(); r = conn.execute("SELECT * FROM email_template WHERE id=1").fetchone(); conn.close()
    return dict(r) if r else {}

@app.put("/api/template")
async def update_template(req: Request):
    data = await req.json()
    conn = get_db(); conn.execute("UPDATE email_template SET subject=?, body=? WHERE id=1", (data.get("subject",""), data.get("body",""))); conn.commit(); conn.close()
    return {"ok": True}

# ═══ SEND CONFIG ═══
@app.get("/api/send-config")
def get_send_config():
    conn = get_db(); r = conn.execute("SELECT * FROM send_config WHERE id=1").fetchone(); conn.close()
    return dict(r) if r else {}

@app.put("/api/send-config")
async def update_send_config(req: Request):
    data = await req.json()
    conn = get_db()
    sets = ", ".join(f"{k}=?" for k in data.keys())
    conn.execute(f"UPDATE send_config SET {sets} WHERE id=1", tuple(data.values()))
    conn.commit(); conn.close()
    return {"ok": True}

# ═══ SMTP CONFIG ═══
@app.get("/api/smtp")
def get_smtp():
    cfg = load_config().get("smtp", {})
    return {**cfg, "password": "***" if cfg.get("password") else ""}

@app.put("/api/smtp")
async def update_smtp(req: Request):
    data = await req.json()
    cfg = load_config()
    cfg["smtp"] = data
    save_config(cfg)
    return {"ok": True}

# ═══ SEQUENCES ═══
@app.get("/api/sequences")
def get_sequences():
    conn = get_db(); rows = conn.execute("SELECT * FROM sequences ORDER BY id").fetchall(); conn.close()
    return [dict(r) for r in rows]

@app.patch("/api/sequences/{sid}")
async def update_sequence(sid: int, req: Request):
    data = await req.json()
    conn = get_db()
    sets = ", ".join(f"{k}=?" for k in data.keys())
    conn.execute(f"UPDATE sequences SET {sets} WHERE id=?", (*data.values(), sid))
    conn.commit(); conn.close()
    return {"ok": True}

@app.get("/api/sequence-steps")
def get_steps():
    conn = get_db(); rows = conn.execute("SELECT * FROM sequence_steps ORDER BY step_order").fetchall(); conn.close()
    return [dict(r) for r in rows]

@app.post("/api/sequence-steps")
async def add_step(req: Request):
    data = await req.json()
    conn = get_db()
    conn.execute("INSERT INTO sequence_steps (sequence_id,step_order,delay_days,subject,body) VALUES (?,?,?,?,?)",
        (data["sequence_id"], data.get("step_order",1), data.get("delay_days",3), data.get("subject",""), data.get("body","")))
    conn.commit(); conn.close()
    return {"ok": True}

@app.patch("/api/sequence-steps/{step_id}")
async def update_step(step_id: int, req: Request):
    data = await req.json()
    conn = get_db()
    sets = ", ".join(f"{k}=?" for k in data.keys())
    conn.execute(f"UPDATE sequence_steps SET {sets} WHERE id=?", (*data.values(), step_id))
    conn.commit(); conn.close()
    return {"ok": True}

@app.delete("/api/sequence-steps/{step_id}")
def delete_step(step_id: int):
    conn = get_db(); conn.execute("DELETE FROM sequence_steps WHERE id=?", (step_id,)); conn.commit(); conn.close()
    return {"ok": True}

# ═══ CAMPAIGNS ═══
@app.get("/api/campaigns")
def get_campaigns():
    conn = get_db(); rows = conn.execute("SELECT * FROM campaigns ORDER BY id").fetchall(); conn.close()
    return [dict(r) for r in rows]

@app.post("/api/campaigns")
async def add_campaign(req: Request):
    data = await req.json()
    conn = get_db()
    conn.execute("INSERT INTO campaigns (name,sequence_id) VALUES (?,?)", (data.get("name","Campaign"), data.get("sequence_id")))
    conn.commit(); conn.close()
    return {"ok": True}

@app.patch("/api/campaigns/{cid}")
async def update_campaign(cid: int, req: Request):
    data = await req.json()
    conn = get_db()
    sets = ", ".join(f"{k}=?" for k in data.keys())
    conn.execute(f"UPDATE campaigns SET {sets} WHERE id=?", (*data.values(), cid))
    conn.commit(); conn.close()
    return {"ok": True}

@app.delete("/api/campaigns/{cid}")
def delete_campaign(cid: int):
    conn = get_db(); conn.execute("DELETE FROM campaigns WHERE id=?", (cid,)); conn.commit(); conn.close()
    return {"ok": True}

# ═══ TAGS ═══
@app.get("/api/tags")
def get_tags():
    conn = get_db(); rows = conn.execute("SELECT * FROM tags ORDER BY name").fetchall(); conn.close()
    return [dict(r) for r in rows]

@app.post("/api/tags")
async def add_tag(req: Request):
    data = await req.json()
    conn = get_db()
    conn.execute("INSERT OR IGNORE INTO tags (name,color) VALUES (?,?)", (data["name"], data.get("color","#6366f1")))
    conn.commit(); conn.close()
    return {"ok": True}

@app.delete("/api/tags/{tid}")
def delete_tag(tid: int):
    conn = get_db(); conn.execute("DELETE FROM tags WHERE id=?", (tid,)); conn.commit(); conn.close()
    return {"ok": True}

@app.get("/api/prospect-tags")
def get_prospect_tags():
    conn = get_db(); rows = conn.execute("SELECT * FROM prospect_tags").fetchall(); conn.close()
    return [dict(r) for r in rows]

@app.post("/api/prospect-tags")
async def assign_tag(req: Request):
    data = await req.json()
    conn = get_db()
    conn.execute("INSERT OR IGNORE INTO prospect_tags (prospect_id,tag_id) VALUES (?,?)", (data["prospect_id"], data["tag_id"]))
    conn.commit(); conn.close()
    return {"ok": True}

@app.delete("/api/prospect-tags/{prospect_id}/{tag_id}")
def remove_tag(prospect_id: int, tag_id: int):
    conn = get_db(); conn.execute("DELETE FROM prospect_tags WHERE prospect_id=? AND tag_id=?", (prospect_id, tag_id)); conn.commit(); conn.close()
    return {"ok": True}

# ═══ NOTES ═══
@app.get("/api/notes")
def get_notes():
    conn = get_db(); rows = conn.execute("SELECT * FROM notes ORDER BY updated_at DESC").fetchall(); conn.close()
    return [dict(r) for r in rows]

@app.post("/api/notes")
async def add_note(req: Request):
    data = await req.json()
    conn = get_db()
    c = conn.execute("INSERT INTO notes (title,content) VALUES (?,?)", (data.get("title",""), data.get("content","")))
    nid = c.lastrowid; conn.commit()
    row = conn.execute("SELECT * FROM notes WHERE id=?", (nid,)).fetchone(); conn.close()
    return dict(row)

@app.patch("/api/notes/{nid}")
async def update_note(nid: int, req: Request):
    data = await req.json()
    conn = get_db()
    sets = ", ".join(f"{k}=?" for k in data.keys())
    conn.execute(f"UPDATE notes SET {sets}, updated_at=datetime('now') WHERE id=?", (*data.values(), nid))
    conn.commit(); conn.close()
    return {"ok": True}

@app.delete("/api/notes/{nid}")
def delete_note(nid: int):
    conn = get_db(); conn.execute("DELETE FROM notes WHERE id=?", (nid,)); conn.commit(); conn.close()
    return {"ok": True}

# ═══ ACTIVITY LOG ═══
@app.get("/api/activity")
def get_activity():
    conn = get_db(); rows = conn.execute("SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 50").fetchall(); conn.close()
    return [dict(r) for r in rows]

# ═══ KPIs ═══
@app.get("/api/kpis")
def get_kpis():
    conn = get_db()
    p = conn.execute("SELECT * FROM prospects").fetchall()
    conn.close()
    prospects = [dict(r) for r in p]
    tot = len([x for x in prospects if x["status"] != "queue"])
    op = len([x for x in prospects if x["opened_at"]])
    rp = len([x for x in prospects if x["replied_at"]])
    ac = len([x for x in prospects if x["status"] == "accepted"])
    return {"total": tot, "opened": op, "replied": rp, "accepted": ac,
        "open_rate": round(op/tot*100,1) if tot else 0, "reply_rate": round(rp/tot*100,1) if tot else 0,
        "conversion_rate": round(ac/tot*100,1) if tot else 0}

# ═══ TRACKING & UNSUBSCRIBE ═══
PIXEL = bytes([0x47,0x49,0x46,0x38,0x39,0x61,0x01,0x00,0x01,0x00,0x80,0x00,0x00,0xff,0xff,0xff,0x00,0x00,0x00,0x21,0xf9,0x04,0x00,0x00,0x00,0x00,0x00,0x2c,0x00,0x00,0x00,0x00,0x01,0x00,0x01,0x00,0x00,0x02,0x02,0x44,0x01,0x00,0x3b])

@app.get("/track/open/{tracking_id}")
def track_open(tracking_id: str):
    conn = get_db()
    p = conn.execute("SELECT id, opened_at, open_count FROM prospects WHERE tracking_id=?", (tracking_id,)).fetchone()
    if p:
        updates = {"open_count": (p["open_count"] or 0) + 1}
        if not p["opened_at"]:
            updates["opened_at"] = "datetime('now')"
            conn.execute("UPDATE prospects SET open_count=?, opened_at=datetime('now') WHERE id=?", (updates["open_count"], p["id"]))
        else:
            conn.execute("UPDATE prospects SET open_count=? WHERE id=?", (updates["open_count"], p["id"]))
        conn.commit()
        update_heat_score(p["id"])
        log_activity("opened", p["id"], "")
    conn.close()
    return Response(content=PIXEL, media_type="image/gif", headers={"Cache-Control": "no-store"})

@app.get("/unsubscribe/{token}")
def unsubscribe(token: str):
    conn = get_db()
    p = conn.execute("SELECT id, email FROM prospects WHERE unsubscribe_token=?", (token,)).fetchone()
    if not p:
        conn.close()
        return HTMLResponse("""<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Invalid link</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f0f2f5}.card{background:#fff;border-radius:20px;padding:48px 40px;max-width:480px;width:90%;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.08)}.icon{width:64px;height:64px;border-radius:50%;background:#fef2f2;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:28px;color:#ef4444}h1{font-size:22px;font-weight:700;margin-bottom:14px}p{color:#6b7280;line-height:1.7;font-size:15px}</style>
</head><body><div class="card"><div class="icon">&#10007;</div><h1>Invalid link</h1><p>This unsubscribe link is not valid or has already been used.</p></div></body></html>""")

    email = p["email"]
    conn.execute("INSERT OR IGNORE INTO blacklist (email,reason,source) VALUES (?,?,?)", (email.lower(), "unsubscribe", "unsubscribe_link"))
    conn.execute("UPDATE prospects SET status='refused', notes='[Unsubscribed via email link]' WHERE id=?", (p["id"],))
    conn.commit(); conn.close()
    return HTMLResponse(f"""<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribed</title>
<style>*{{margin:0;padding:0;box-sizing:border-box}}body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f0f2f5}}.card{{background:#fff;border-radius:20px;padding:48px 40px;max-width:480px;width:90%;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.08)}}.icon{{width:64px;height:64px;border-radius:50%;background:#ecfdf5;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:28px;color:#22c55e}}h1{{font-size:22px;font-weight:700;margin-bottom:14px}}p{{color:#6b7280;line-height:1.7;font-size:15px;margin-bottom:8px}}.em{{font-weight:600;color:#6366f1}}.ft{{margin-top:32px;padding-top:20px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af}}</style>
</head><body><div class="card"><div class="icon">&#10003;</div><h1>Unsubscribed</h1><p>Your request has been processed.</p><p><span class="em">{email}</span> has been removed from our contact list.</p><p><strong>You will no longer receive emails from us.</strong></p><div class="ft">If you receive an email after this request, it was likely sent before your unsubscription.</div></div></body></html>""")

# ═══ TEST EMAIL ═══
@app.post("/api/send-test")
async def send_test(req: Request):
    data = await req.json()
    test_email = data.get("test_email","")
    if not test_email: return {"ok": False, "error": "No test email"}
    smtp = get_smtp_config()
    if not smtp.get("host"): return {"ok": False, "error": "SMTP not configured"}
    conn = get_db()
    tpl = dict(conn.execute("SELECT * FROM email_template WHERE id=1").fetchone())
    conn.close()
    fake = {"name":"Test Prospect","company":"Test Company","email":test_email,"tracking_id":"test","unsubscribe_token":"test"}
    subject = "[TEST] " + replace_vars(tpl.get("subject","Test"), fake)
    html = build_html(replace_vars(tpl.get("body",""), fake), fake, "http://localhost:8000")
    ok, err, _ = send_email(smtp, test_email, subject, html)
    return {"ok": ok, "error": err}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
