"""
ProspectFlow — Email Reader (IMAP)
Checks inbox for replies from prospects and updates statuses.
"""
import imaplib
import email
from email.header import decode_header
from datetime import datetime
from database import get_smtp_config, get_all_prospects, update_prospect, log_email


# Common IMAP servers mapped from SMTP hosts
IMAP_MAP = {
    "smtp.gmail.com": "imap.gmail.com",
    "smtp.office365.com": "outlook.office365.com",
    "smtp.mail.yahoo.com": "imap.mail.yahoo.com",
    "mail.infomaniak.com": "mail.infomaniak.com",
    "smtp.infomaniak.ch": "mail.infomaniak.ch",
}


def get_imap_host(smtp_host: str) -> str:
    """Derive IMAP host from SMTP host."""
    if smtp_host in IMAP_MAP:
        return IMAP_MAP[smtp_host]
    # Generic: replace smtp with imap
    return smtp_host.replace("smtp.", "imap.")


def decode_subject(msg) -> str:
    """Decode email subject safely."""
    raw = msg.get("Subject", "")
    if not raw:
        return ""
    parts = decode_header(raw)
    decoded = []
    for part, charset in parts:
        if isinstance(part, bytes):
            decoded.append(part.decode(charset or "utf-8", errors="replace"))
        else:
            decoded.append(part)
    return " ".join(decoded)


def get_sender_email(msg) -> str:
    """Extract sender email address."""
    from_header = msg.get("From", "")
    if "<" in from_header and ">" in from_header:
        return from_header.split("<")[1].split(">")[0].strip().lower()
    return from_header.strip().lower()


def check_replies() -> list[dict]:
    """
    Connect via IMAP, check for new replies from known prospects.
    Returns list of {"prospect_id": int, "from": str, "subject": str}.
    """
    smtp_config = get_smtp_config()
    if not smtp_config.get("host") or not smtp_config.get("email"):
        return []

    imap_host = get_imap_host(smtp_config["host"])
    prospects = get_all_prospects()

    # Build lookup: email -> prospect
    prospect_map = {}
    for p in prospects:
        if p["status"] in ("sent", "waiting") and not p.get("replied_at"):
            prospect_map[p["email"].lower()] = p

    if not prospect_map:
        return []

    found_replies = []

    try:
        # Connect IMAP
        mail = imaplib.IMAP4_SSL(imap_host, 993, timeout=30)
        mail.login(smtp_config["email"], smtp_config["password"])
        mail.select("INBOX")

        # Search for recent unread emails
        status, messages = mail.search(None, "UNSEEN")
        if status != "OK":
            mail.logout()
            return []

        msg_ids = messages[0].split()

        for msg_id in msg_ids[-50:]:  # Check last 50 unread
            status, data = mail.fetch(msg_id, "(RFC822)")
            if status != "OK":
                continue

            msg = email.message_from_bytes(data[0][1])
            sender = get_sender_email(msg)
            subject = decode_subject(msg)

            if sender in prospect_map:
                prospect = prospect_map[sender]
                now = datetime.utcnow().isoformat()

                # Update prospect status
                update_prospect(
                    prospect["id"],
                    status="received",
                    replied_at=now
                )

                # Extract body for logging
                body = ""
                if msg.is_multipart():
                    for part in msg.walk():
                        if part.get_content_type() == "text/plain":
                            payload = part.get_payload(decode=True)
                            if payload:
                                body = payload.decode("utf-8", errors="replace")
                            break
                else:
                    payload = msg.get_payload(decode=True)
                    if payload:
                        body = payload.decode("utf-8", errors="replace")

                log_email(prospect["id"], "inbound", subject, body[:2000])

                found_replies.append({
                    "prospect_id": prospect["id"],
                    "from": sender,
                    "subject": subject
                })

                # Remove from map to avoid double-processing
                del prospect_map[sender]

        mail.logout()

    except imaplib.IMAP4.error as e:
        print(f"[IMAP Error] {e}")
    except Exception as e:
        print(f"[IMAP Error] {e}")

    return found_replies
