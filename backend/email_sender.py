"""
ProspectFlow — Email Sender (SMTP)
Sends emails with pixel tracking and unsubscribe link.
"""
import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
from database import (
    get_smtp_config, get_template, get_queue_prospects,
    update_prospect, log_email, is_blacklisted
)

# Base URL for tracking pixel and unsubscribe — set this to your backend URL
BASE_URL = "http://localhost:8000"


def build_email_html(prospect: dict, template_body: str, template_subject: str) -> tuple[str, str]:
    """
    Build personalized HTML email with tracking pixel and unsubscribe link.
    Returns (subject, html_body).
    """
    name = prospect.get("name", "")
    company = prospect.get("company", "")
    email = prospect.get("email", "")
    tracking_id = prospect.get("tracking_id", "")
    unsub_token = prospect.get("unsubscribe_token", "")

    # Replace variables in template
    subject = template_subject.replace("{nom}", name).replace("{entreprise}", company).replace("{email}", email)
    body_text = template_body.replace("{nom}", name).replace("{entreprise}", company).replace("{email}", email)

    # Convert plain text to HTML paragraphs
    body_html = "".join(f"<p style='margin:0 0 12px 0;line-height:1.6;color:#333;'>{line}</p>" if line.strip() else "<br/>"
                        for line in body_text.split("\n"))

    tracking_pixel = f'<img src="{BASE_URL}/track/open/{tracking_id}" width="1" height="1" style="display:none;" alt="" />'
    unsubscribe_url = f"{BASE_URL}/unsubscribe/{unsub_token}"

    html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 15px; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    {body_html}
    <div style="margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; text-align: center;">
        <a href="{unsubscribe_url}" style="color: #9ca3af; text-decoration: underline;">
            Je ne souhaite plus être contacté
        </a>
    </div>
    {tracking_pixel}
</body>
</html>"""

    return subject, html


def send_single_email(prospect: dict) -> tuple[bool, str]:
    """
    Send an email to a single prospect.
    Returns (success: bool, error_message: str).
    """
    # Check blacklist before sending
    if is_blacklisted(prospect["email"]):
        update_prospect(prospect["id"], status="refused", notes=prospect.get("notes", "") + "\n[Blacklisté — envoi annulé]")
        return False, "Email is blacklisted"

    smtp_config = get_smtp_config()
    template = get_template()

    if not smtp_config.get("host") or not smtp_config.get("email"):
        return False, "SMTP not configured"

    subject, html_body = build_email_html(prospect, template.get("body", ""), template.get("subject", ""))

    try:
        msg = MIMEMultipart("alternative")
        msg["From"] = f"{smtp_config.get('sender_name', '')} <{smtp_config['email']}>"
        msg["To"] = prospect["email"]
        msg["Subject"] = subject
        msg["List-Unsubscribe"] = f"<{BASE_URL}/unsubscribe/{prospect['unsubscribe_token']}>"

        msg.attach(MIMEText(html_body, "html", "utf-8"))

        context = ssl.create_default_context()
        port = int(smtp_config.get("port", 587))

        if port == 465:
            # SSL
            with smtplib.SMTP_SSL(smtp_config["host"], port, context=context, timeout=30) as server:
                server.login(smtp_config["email"], smtp_config["password"])
                server.send_message(msg)
        else:
            # STARTTLS
            with smtplib.SMTP(smtp_config["host"], port, timeout=30) as server:
                server.ehlo()
                if smtp_config.get("use_tls", True):
                    server.starttls(context=context)
                    server.ehlo()
                server.login(smtp_config["email"], smtp_config["password"])
                server.send_message(msg)

        # Update prospect
        now = datetime.utcnow().isoformat()
        update_prospect(prospect["id"], status="sent", sent_at=now)
        log_email(prospect["id"], "outbound", subject, html_body)

        return True, ""

    except smtplib.SMTPAuthenticationError:
        return False, "Erreur d'authentification SMTP. Vérifiez email/mot de passe."
    except smtplib.SMTPException as e:
        return False, f"Erreur SMTP: {str(e)}"
    except Exception as e:
        return False, f"Erreur inattendue: {str(e)}"


def send_next_in_queue() -> tuple[bool, str, dict | None]:
    """
    Send the next email in the queue.
    Returns (success, message, prospect_or_None).
    """
    queue = get_queue_prospects()
    if not queue:
        return False, "File d'attente vide", None

    prospect = queue[0]

    # Double-check blacklist
    if is_blacklisted(prospect["email"]):
        update_prospect(prospect["id"], status="refused")
        # Try next one
        return send_next_in_queue()

    success, error = send_single_email(prospect)
    if success:
        return True, f"Email envoyé à {prospect['name'] or prospect['email']}", prospect
    else:
        return False, error, prospect


def send_all_queue() -> tuple[int, int, list[str]]:
    """
    Send all emails in queue (instant mode).
    Returns (sent_count, failed_count, errors).
    """
    queue = get_queue_prospects()
    sent = 0
    failed = 0
    errors = []

    for prospect in queue:
        if is_blacklisted(prospect["email"]):
            update_prospect(prospect["id"], status="refused")
            continue

        success, error = send_single_email(prospect)
        if success:
            sent += 1
        else:
            failed += 1
            errors.append(f"{prospect['email']}: {error}")

    return sent, failed, errors
