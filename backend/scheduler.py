from apscheduler.schedulers.background import BackgroundScheduler
from datetime import datetime
import pytz

scheduler = BackgroundScheduler()

def get_smtp_config():
    """Read SMTP config from config.json or env"""
    import json, os
    path = os.path.join(os.path.dirname(__file__), "config.json")
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f).get("smtp", {})
    return {}

def check_schedule(config):
    """Check if current time is within send hours"""
    if not config.get("use_schedule", True):
        return True
    tz = pytz.timezone(config.get("timezone", "Europe/Zurich"))
    now = datetime.now(tz)
    if now.weekday() >= 5:  # Saturday=5, Sunday=6
        return False
    hour = now.hour
    h1, h2 = config.get("send_hour_start", 9), config.get("send_hour_end_morning", 12)
    h3, h4 = config.get("send_hour_start_afternoon", 14), config.get("send_hour_end", 17)
    return (h1 <= hour < h2) or (h3 <= hour < h4)

def auto_send():
    from database import get_db, log_activity, update_heat_score
    from email_sender import send_email, replace_vars, build_html

    conn = get_db()
    config = dict(conn.execute("SELECT * FROM send_config WHERE id=1").fetchone())

    if not config.get("sending"):
        conn.close()
        return

    if not check_schedule(config):
        conn.close()
        return

    # Check frequency
    if config.get("last_sent_at") and config.get("frequency_seconds", 0) > 0:
        from datetime import datetime, timedelta
        last = datetime.fromisoformat(config["last_sent_at"])
        if (datetime.utcnow() - last).total_seconds() < config["frequency_seconds"]:
            conn.close()
            return

    smtp = get_smtp_config()
    if not smtp.get("host") or not smtp.get("email"):
        conn.close()
        return

    base_url = f"http://localhost:8000"
    batch_size = config.get("batch_size", 1) or 1
    sent_count = 0

    for _ in range(batch_size):
        # Try followup first
        followup = conn.execute("""
            SELECT p.*, ss.id as step_id, ss.subject as step_subject, ss.body as step_body, ss.step_order as next_step
            FROM prospects p
            JOIN sequence_steps ss ON ss.sequence_id = p.sequence_id AND ss.step_order = p.current_step + 1
            WHERE p.status IN ('sent','waiting') AND p.replied_at IS NULL
              AND p.sequence_completed = 0 AND p.sequence_id IS NOT NULL
              AND p.last_step_sent_at IS NOT NULL
              AND datetime(p.last_step_sent_at, '+' || ss.delay_days || ' days') < datetime('now')
            LIMIT 1
        """).fetchone()

        if followup:
            p = dict(followup)
            bl = conn.execute("SELECT id FROM blacklist WHERE email=?", (p["email"].lower(),)).fetchone()
            if bl:
                conn.execute("UPDATE prospects SET status='refused', sequence_completed=1 WHERE id=?", (p["id"],))
                conn.commit()
                continue

            subject = replace_vars(p["step_subject"], p)
            html = build_html(replace_vars(p["step_body"], p), p, base_url)
            ok, err, bounce = send_email(smtp, p["email"], subject, html, f"{base_url}/unsubscribe/{p['unsubscribe_token']}")

            if ok:
                has_next = conn.execute("SELECT id FROM sequence_steps WHERE sequence_id=? AND step_order>?", (p["sequence_id"], p["next_step"])).fetchone()
                conn.execute("UPDATE prospects SET current_step=?, last_step_sent_at=datetime('now'), sequence_completed=? WHERE id=?",
                    (p["next_step"], 0 if has_next else 1, p["id"]))
                conn.execute("INSERT INTO emails_log (prospect_id,direction,subject,body) VALUES (?,?,?,?)", (p["id"],"outbound",subject,html))
                log_activity("sent", p["id"], p["email"])
                sent_count += 1
            elif bounce:
                conn.execute("UPDATE prospects SET bounced=1, bounce_reason=?, status='refused', sequence_completed=1 WHERE id=?", (err, p["id"]))
            conn.commit()
            continue

        # No followup — send next in queue
        prospect = conn.execute("SELECT * FROM prospects WHERE status='queue' ORDER BY added_at ASC LIMIT 1").fetchone()
        if not prospect:
            break

        p = dict(prospect)
        bl = conn.execute("SELECT id FROM blacklist WHERE email=?", (p["email"].lower(),)).fetchone()
        if bl:
            conn.execute("UPDATE prospects SET status='refused' WHERE id=?", (p["id"],))
            conn.commit()
            continue

        # ALWAYS use template for first contact
        tpl = dict(conn.execute("SELECT * FROM email_template WHERE id=1").fetchone())
        subject = replace_vars(tpl.get("subject","Hello"), p)
        body_text = replace_vars(tpl.get("body",""), p)
        html = build_html(body_text, p, base_url)
        ok, err, bounce = send_email(smtp, p["email"], subject, html, f"{base_url}/unsubscribe/{p['unsubscribe_token']}")

        if ok:
            conn.execute("UPDATE prospects SET status='sent', sent_at=datetime('now'), last_step_sent_at=datetime('now'), current_step=1 WHERE id=?", (p["id"],))
            conn.execute("INSERT INTO emails_log (prospect_id,direction,subject,body) VALUES (?,?,?,?)", (p["id"],"outbound",subject,html))
            log_activity("sent", p["id"], p["email"])
            sent_count += 1
        elif bounce:
            conn.execute("UPDATE prospects SET bounced=1, bounce_reason=?, status='refused' WHERE id=?", (err, p["id"]))
        conn.commit()

    # Update last_sent_at
    if sent_count > 0:
        conn.execute("UPDATE send_config SET last_sent_at=datetime('now') WHERE id=1")
        conn.commit()
    conn.close()

def auto_status_rules():
    """Auto-update statuses based on rules"""
    from database import get_db, log_activity
    conn = get_db()
    # Opened > 2h without reply → waiting
    conn.execute("""UPDATE prospects SET status='waiting'
        WHERE status='sent' AND opened_at IS NOT NULL AND replied_at IS NULL
        AND datetime(opened_at, '+2 hours') < datetime('now')""")
    # Sent > 10 days without reply → refused
    conn.execute("""UPDATE prospects SET status='refused'
        WHERE status IN ('sent','waiting') AND replied_at IS NULL
        AND datetime(sent_at, '+10 days') < datetime('now')""")
    conn.commit()
    conn.close()

def start_scheduler():
    scheduler.add_job(auto_send, 'interval', seconds=60, id='auto_send', replace_existing=True)
    scheduler.add_job(auto_status_rules, 'interval', minutes=5, id='auto_rules', replace_existing=True)
    scheduler.start()
