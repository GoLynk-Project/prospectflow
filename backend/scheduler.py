"""
ProspectFlow — Scheduler
Background tasks: auto-send, reply checking, auto-status rules.
"""
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from datetime import datetime, timedelta
from database import (
    get_send_config, get_all_prospects, update_prospect,
    get_queue_prospects
)
from email_sender import send_next_in_queue
from email_reader import check_replies

scheduler = BackgroundScheduler()
_send_job_id = "auto_send"


def auto_send_job():
    """Send next email in queue if sending is active."""
    config = get_send_config()
    if not config.get("sending"):
        return

    queue = get_queue_prospects()
    if not queue:
        return

    success, msg, prospect = send_next_in_queue()
    if success:
        print(f"[AutoSend] ✓ Envoyé à {prospect['name'] or prospect['email']}")
    else:
        print(f"[AutoSend] ✗ {msg}")


def check_replies_job():
    """Check IMAP for new replies."""
    try:
        replies = check_replies()
        for r in replies:
            print(f"[IMAP] Réponse détectée de {r['from']}: {r['subject']}")
    except Exception as e:
        print(f"[IMAP Error] {e}")


def auto_status_rules_job():
    """
    Apply automatic status rules:
    - Opened but no reply after 2h → 'waiting'
    - Sent, no reply after 10 days → 'refused' (auto)
    """
    prospects = get_all_prospects()
    now = datetime.utcnow()

    for p in prospects:
        # Rule 1: Sent + opened but no reply after 2 hours → waiting
        if p["status"] == "sent" and p.get("opened_at") and not p.get("replied_at"):
            opened = datetime.fromisoformat(p["opened_at"])
            if now - opened > timedelta(hours=2):
                update_prospect(p["id"], status="waiting")
                print(f"[AutoRule] {p['email']} → En attente (ouvert sans réponse > 2h)")

        # Rule 2: Sent/waiting, no reply after 10 days → refused
        if p["status"] in ("sent", "waiting") and p.get("sent_at") and not p.get("replied_at"):
            sent = datetime.fromisoformat(p["sent_at"])
            if now - sent > timedelta(days=10):
                update_prospect(
                    p["id"],
                    status="refused",
                    notes=(p.get("notes", "") + "\n[Refus automatique — 10 jours sans réponse]").strip()
                )
                print(f"[AutoRule] {p['email']} → Refusé (10 jours sans réponse)")


def update_send_schedule(frequency_seconds: int):
    """Update the auto-send job interval."""
    if scheduler.get_job(_send_job_id):
        scheduler.remove_job(_send_job_id)

    if frequency_seconds > 0:
        scheduler.add_job(
            auto_send_job,
            trigger=IntervalTrigger(seconds=frequency_seconds),
            id=_send_job_id,
            replace_existing=True,
            max_instances=1
        )
        print(f"[Scheduler] Auto-send every {frequency_seconds}s")
    else:
        print("[Scheduler] Auto-send disabled (instant mode — use API endpoint)")


def start_scheduler():
    """Start background scheduler with all jobs."""
    config = get_send_config()

    # Auto-send job (if frequency > 0)
    freq = config.get("frequency_seconds", 1200)
    if freq > 0 and config.get("sending"):
        scheduler.add_job(
            auto_send_job,
            trigger=IntervalTrigger(seconds=freq),
            id=_send_job_id,
            replace_existing=True,
            max_instances=1
        )

    # Check replies every 2 minutes
    scheduler.add_job(
        check_replies_job,
        trigger=IntervalTrigger(minutes=2),
        id="check_replies",
        replace_existing=True,
        max_instances=1
    )

    # Auto-status rules every 5 minutes
    scheduler.add_job(
        auto_status_rules_job,
        trigger=IntervalTrigger(minutes=5),
        id="auto_status_rules",
        replace_existing=True,
        max_instances=1
    )

    scheduler.start()
    print("[Scheduler] Démarré — auto-send, IMAP check, status rules actifs")


def stop_scheduler():
    """Stop all background jobs."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
