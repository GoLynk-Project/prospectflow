"""
ProspectFlow — Main API (FastAPI)
Run with: uvicorn main:app --reload --port 8000
"""
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel
from contextlib import asynccontextmanager

from database import (
    init_db,
    get_all_prospects, get_prospect, add_prospect, update_prospect, delete_prospect,
    get_queue_prospects,
    get_blacklist, add_to_blacklist, remove_from_blacklist, is_blacklisted,
    get_smtp_config, update_smtp_config,
    get_template, update_template,
    get_send_config, update_send_config,
    get_kpis, get_prospect_emails,
    track_open, unsubscribe_by_token,
)
from email_sender import send_next_in_queue, send_single_email, send_all_queue, BASE_URL
from email_reader import check_replies
from scheduler import start_scheduler, stop_scheduler, update_send_schedule


# ─── Lifespan ───

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    start_scheduler()
    print("🚀 ProspectFlow backend démarré sur http://localhost:8000")
    yield
    stop_scheduler()


app = FastAPI(title="ProspectFlow", version="1.0.0", lifespan=lifespan)

# CORS — allow frontend (Vite default port)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Pydantic Models ───

class ProspectCreate(BaseModel):
    name: str = ""
    email: str
    company: str = ""

class ProspectUpdate(BaseModel):
    name: str | None = None
    email: str | None = None
    company: str | None = None
    status: str | None = None
    notes: str | None = None

class BulkProspects(BaseModel):
    prospects: list[ProspectCreate]

class SmtpConfig(BaseModel):
    host: str = ""
    port: int = 587
    email: str = ""
    password: str = ""
    sender_name: str = ""
    use_tls: bool = True

class TemplateUpdate(BaseModel):
    subject: str
    body: str

class SendConfigUpdate(BaseModel):
    sending: bool | None = None
    frequency_seconds: int | None = None

class BlacklistAdd(BaseModel):
    email: str
    reason: str = "manual"


# ═══════════════════════════════════════════
#               API ROUTES
# ═══════════════════════════════════════════

# ─── Prospects ───

@app.get("/api/prospects")
def list_prospects():
    return get_all_prospects()


@app.get("/api/prospects/{prospect_id}")
def get_one_prospect(prospect_id: int):
    p = get_prospect(prospect_id)
    if not p:
        raise HTTPException(404, "Prospect non trouvé")
    return p


@app.post("/api/prospects")
def create_prospect(data: ProspectCreate):
    prospect, error = add_prospect(data.name, data.email, data.company)
    if error:
        raise HTTPException(400, error)
    return prospect


@app.post("/api/prospects/bulk")
def create_bulk_prospects(data: BulkProspects):
    added = []
    errors = []
    for p in data.prospects:
        prospect, error = add_prospect(p.name, p.email, p.company)
        if error:
            errors.append({"email": p.email, "error": error})
        else:
            added.append(prospect)
    return {"added": len(added), "errors": errors, "prospects": added}


@app.patch("/api/prospects/{prospect_id}")
def patch_prospect(prospect_id: int, data: ProspectUpdate):
    fields = {k: v for k, v in data.dict().items() if v is not None}
    if not fields:
        raise HTTPException(400, "Aucun champ à mettre à jour")
    update_prospect(prospect_id, **fields)
    return get_prospect(prospect_id)


@app.delete("/api/prospects/{prospect_id}")
def remove_prospect(prospect_id: int):
    delete_prospect(prospect_id)
    return {"ok": True}


@app.get("/api/prospects/{prospect_id}/emails")
def prospect_emails(prospect_id: int):
    return get_prospect_emails(prospect_id)


# ─── Sending ───

@app.post("/api/send/next")
def send_next():
    """Send next email in queue (manual trigger)."""
    success, msg, prospect = send_next_in_queue()
    return {"success": success, "message": msg, "prospect": prospect}


@app.post("/api/send/one/{prospect_id}")
def send_one(prospect_id: int):
    """Manually send to a specific prospect."""
    prospect = get_prospect(prospect_id)
    if not prospect:
        raise HTTPException(404, "Prospect non trouvé")
    if prospect["status"] != "queue":
        raise HTTPException(400, "Ce prospect n'est pas dans la file d'attente")
    success, error = send_single_email(prospect)
    if not success:
        raise HTTPException(500, error)
    return {"success": True, "prospect": get_prospect(prospect_id)}


@app.post("/api/send/all")
def send_all():
    """Send all emails in queue instantly."""
    sent, failed, errors = send_all_queue()
    return {"sent": sent, "failed": failed, "errors": errors}


# ─── Send Config ───

@app.get("/api/config/send")
def get_send_cfg():
    return get_send_config()


@app.patch("/api/config/send")
def patch_send_cfg(data: SendConfigUpdate):
    if data.sending is not None:
        update_send_config(sending=data.sending)
    if data.frequency_seconds is not None:
        update_send_config(frequency_seconds=data.frequency_seconds)
        update_send_schedule(data.frequency_seconds)
    return get_send_config()


# ─── SMTP Config ───

@app.get("/api/config/smtp")
def get_smtp():
    config = get_smtp_config()
    # Never return password in plain text
    config["password"] = "••••••••" if config.get("password") else ""
    return config


@app.put("/api/config/smtp")
def set_smtp(data: SmtpConfig):
    update_smtp_config(
        host=data.host, port=data.port, email=data.email,
        password=data.password, sender_name=data.sender_name,
        use_tls=data.use_tls
    )
    return {"ok": True}


@app.post("/api/config/smtp/test")
def test_smtp():
    """Test SMTP connection."""
    import smtplib, ssl
    config = get_smtp_config()
    if not config.get("host"):
        raise HTTPException(400, "SMTP non configuré")
    try:
        context = ssl.create_default_context()
        port = int(config.get("port", 587))
        if port == 465:
            server = smtplib.SMTP_SSL(config["host"], port, context=context, timeout=10)
        else:
            server = smtplib.SMTP(config["host"], port, timeout=10)
            server.starttls(context=context)
        server.login(config["email"], config["password"])
        server.quit()
        return {"ok": True, "message": "Connexion SMTP réussie !"}
    except Exception as e:
        raise HTTPException(400, f"Erreur: {str(e)}")


# ─── Template ───

@app.get("/api/config/template")
def get_tpl():
    return get_template()


@app.put("/api/config/template")
def set_tpl(data: TemplateUpdate):
    update_template(data.subject, data.body)
    return {"ok": True}


# ─── Blacklist ───

@app.get("/api/blacklist")
def list_blacklist():
    return get_blacklist()


@app.post("/api/blacklist")
def add_blacklist(data: BlacklistAdd):
    add_to_blacklist(data.email, reason=data.reason, source="manual")
    return {"ok": True, "email": data.email}


@app.delete("/api/blacklist/{email}")
def remove_blacklist(email: str):
    remove_from_blacklist(email)
    return {"ok": True}


@app.get("/api/blacklist/check/{email}")
def check_blacklist(email: str):
    return {"blacklisted": is_blacklisted(email)}


# ─── KPI ───

@app.get("/api/kpis")
def kpis():
    return get_kpis()


# ─── IMAP check (manual trigger) ───

@app.post("/api/check-replies")
def manual_check_replies():
    replies = check_replies()
    return {"found": len(replies), "replies": replies}


# ═══════════════════════════════════════════
#        TRACKING & UNSUBSCRIBE (PUBLIC)
# ═══════════════════════════════════════════

@app.get("/track/open/{tracking_id}")
def tracking_pixel(tracking_id: str):
    """
    Serves a 1x1 transparent pixel and records the open.
    Called by email clients when loading images.
    """
    track_open(tracking_id)

    # 1x1 transparent GIF
    pixel = b'\x47\x49\x46\x38\x39\x61\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00\x21\xf9\x04\x00\x00\x00\x00\x00\x2c\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02\x44\x01\x00\x3b'
    return Response(
        content=pixel,
        media_type="image/gif",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
        }
    )


@app.get("/unsubscribe/{token}", response_class=HTMLResponse)
def unsubscribe_page(token: str):
    """
    Unsubscribe page — when a prospect clicks "Ne plus être contacté".
    Adds them to the blacklist and shows confirmation.
    """
    email_addr = unsubscribe_by_token(token)

    if email_addr:
        html = f"""<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Désabonnement confirmé</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex; align-items: center; justify-content: center;
            min-height: 100vh; background: #f8fafc; color: #1e293b;
        }}
        .card {{
            background: white; border-radius: 16px; padding: 48px;
            max-width: 480px; text-align: center;
            box-shadow: 0 4px 24px rgba(0,0,0,0.06);
        }}
        .icon {{ font-size: 48px; margin-bottom: 16px; }}
        h1 {{ font-size: 22px; margin-bottom: 12px; font-weight: 600; }}
        p {{ color: #64748b; line-height: 1.6; font-size: 15px; }}
        .email {{ font-weight: 600; color: #6366f1; }}
    </style>
</head>
<body>
    <div class="card">
        <div class="icon">✓</div>
        <h1>Désabonnement confirmé</h1>
        <p>L'adresse <span class="email">{email_addr}</span> a été retirée de notre liste de contacts.</p>
        <p style="margin-top: 12px;">Vous ne recevrez plus de messages de notre part.</p>
    </div>
</body>
</html>"""
    else:
        html = """<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Lien invalide</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex; align-items: center; justify-content: center;
            min-height: 100vh; background: #f8fafc; color: #1e293b;
        }
        .card {
            background: white; border-radius: 16px; padding: 48px;
            max-width: 480px; text-align: center;
            box-shadow: 0 4px 24px rgba(0,0,0,0.06);
        }
    </style>
</head>
<body>
    <div class="card">
        <p>Ce lien de désabonnement n'est pas valide ou a déjà été utilisé.</p>
    </div>
</body>
</html>"""

    return HTMLResponse(content=html)


# ─── Root ───

@app.get("/")
def root():
    return {
        "name": "ProspectFlow API",
        "version": "1.0.0",
        "docs": "http://localhost:8000/docs",
    }
