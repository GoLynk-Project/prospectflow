"""
ProspectFlow — Database module (SQLite)
Tables: prospects, emails, blacklist, smtp_config, email_template, stats
"""
import sqlite3
import os
from datetime import datetime
from contextlib import contextmanager

DB_PATH = os.path.join(os.path.dirname(__file__), "prospectflow.db")


@contextmanager
def get_db():
    """Context manager for database connections."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    """Create all tables if they don't exist."""
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS prospects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT DEFAULT '',
                email TEXT NOT NULL,
                company TEXT DEFAULT '',
                status TEXT DEFAULT 'queue',
                added_at TEXT DEFAULT (datetime('now')),
                sent_at TEXT,
                opened_at TEXT,
                replied_at TEXT,
                notes TEXT DEFAULT '',
                tracking_id TEXT UNIQUE,
                unsubscribe_token TEXT UNIQUE
            );

            CREATE TABLE IF NOT EXISTS emails (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                prospect_id INTEGER REFERENCES prospects(id) ON DELETE CASCADE,
                direction TEXT NOT NULL DEFAULT 'outbound',
                subject TEXT DEFAULT '',
                body TEXT DEFAULT '',
                sent_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS blacklist (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                reason TEXT DEFAULT 'unsubscribe',
                added_at TEXT DEFAULT (datetime('now')),
                source TEXT DEFAULT 'unsubscribe_link'
            );

            CREATE TABLE IF NOT EXISTS smtp_config (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                host TEXT DEFAULT '',
                port INTEGER DEFAULT 587,
                email TEXT DEFAULT '',
                password TEXT DEFAULT '',
                sender_name TEXT DEFAULT '',
                use_tls INTEGER DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS email_template (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                subject TEXT DEFAULT 'Découvrez notre solution',
                body TEXT DEFAULT 'Bonjour {nom},

Je me permets de vous contacter car {entreprise} pourrait bénéficier de notre solution.

Seriez-vous disponible pour un échange de 15 minutes cette semaine ?

Cordialement'
            );

            CREATE TABLE IF NOT EXISTS send_config (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                sending INTEGER DEFAULT 0,
                frequency_seconds INTEGER DEFAULT 1200
            );

            CREATE INDEX IF NOT EXISTS idx_prospects_status ON prospects(status);
            CREATE INDEX IF NOT EXISTS idx_prospects_email ON prospects(email);
            CREATE INDEX IF NOT EXISTS idx_blacklist_email ON blacklist(email);
            CREATE INDEX IF NOT EXISTS idx_prospects_tracking ON prospects(tracking_id);
            CREATE INDEX IF NOT EXISTS idx_prospects_unsub ON prospects(unsubscribe_token);
        """)

        # Insert default rows if empty
        row = conn.execute("SELECT COUNT(*) as c FROM smtp_config").fetchone()
        if row["c"] == 0:
            conn.execute("INSERT INTO smtp_config (id) VALUES (1)")
        row = conn.execute("SELECT COUNT(*) as c FROM email_template").fetchone()
        if row["c"] == 0:
            conn.execute("INSERT INTO email_template (id) VALUES (1)")
        row = conn.execute("SELECT COUNT(*) as c FROM send_config").fetchone()
        if row["c"] == 0:
            conn.execute("INSERT INTO send_config (id) VALUES (1)")


# ─── Prospect CRUD ───

def get_all_prospects():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM prospects ORDER BY added_at DESC").fetchall()
        return [dict(r) for r in rows]


def get_prospect(prospect_id: int):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM prospects WHERE id = ?", (prospect_id,)).fetchone()
        return dict(row) if row else None


def add_prospect(name: str, email: str, company: str):
    """Add a prospect. Returns (prospect_dict, error_string_or_None)."""
    import uuid
    email = email.strip().lower()

    # Check blacklist
    if is_blacklisted(email):
        return None, f"L'email {email} est dans la blacklist et ne peut pas être ajouté."

    # Check duplicate
    with get_db() as conn:
        existing = conn.execute("SELECT id FROM prospects WHERE email = ?", (email,)).fetchone()
        if existing:
            return None, f"L'email {email} existe déjà dans les prospects."

        tracking_id = str(uuid.uuid4())
        unsub_token = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO prospects (name, email, company, tracking_id, unsubscribe_token) VALUES (?, ?, ?, ?, ?)",
            (name.strip(), email, company.strip(), tracking_id, unsub_token)
        )
        prospect = conn.execute("SELECT * FROM prospects WHERE email = ?", (email,)).fetchone()
        return dict(prospect), None


def update_prospect(prospect_id: int, **kwargs):
    allowed = {"name", "email", "company", "status", "sent_at", "opened_at", "replied_at", "notes"}
    fields = {k: v for k, v in kwargs.items() if k in allowed}
    if not fields:
        return
    sets = ", ".join(f"{k} = ?" for k in fields)
    vals = list(fields.values()) + [prospect_id]
    with get_db() as conn:
        conn.execute(f"UPDATE prospects SET {sets} WHERE id = ?", vals)


def delete_prospect(prospect_id: int):
    with get_db() as conn:
        conn.execute("DELETE FROM prospects WHERE id = ?", (prospect_id,))


def get_queue_prospects():
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM prospects WHERE status = 'queue' ORDER BY added_at ASC"
        ).fetchall()
        return [dict(r) for r in rows]


# ─── Blacklist ───

def is_blacklisted(email: str) -> bool:
    email = email.strip().lower()
    with get_db() as conn:
        row = conn.execute("SELECT id FROM blacklist WHERE email = ?", (email,)).fetchone()
        return row is not None


def add_to_blacklist(email: str, reason: str = "unsubscribe", source: str = "unsubscribe_link"):
    email = email.strip().lower()
    with get_db() as conn:
        existing = conn.execute("SELECT id FROM blacklist WHERE email = ?", (email,)).fetchone()
        if not existing:
            conn.execute(
                "INSERT INTO blacklist (email, reason, source) VALUES (?, ?, ?)",
                (email, reason, source)
            )
        # Also update prospect status to refused if exists
        conn.execute(
            "UPDATE prospects SET status = 'refused', notes = notes || '\n[Désabonné]' WHERE email = ? AND status NOT IN ('refused', 'accepted')",
            (email,)
        )


def remove_from_blacklist(email: str):
    email = email.strip().lower()
    with get_db() as conn:
        conn.execute("DELETE FROM blacklist WHERE email = ?", (email,))


def get_blacklist():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM blacklist ORDER BY added_at DESC").fetchall()
        return [dict(r) for r in rows]


# ─── SMTP Config ───

def get_smtp_config():
    with get_db() as conn:
        row = conn.execute("SELECT * FROM smtp_config WHERE id = 1").fetchone()
        return dict(row) if row else {}


def update_smtp_config(**kwargs):
    allowed = {"host", "port", "email", "password", "sender_name", "use_tls"}
    fields = {k: v for k, v in kwargs.items() if k in allowed}
    if not fields:
        return
    sets = ", ".join(f"{k} = ?" for k in fields)
    vals = list(fields.values())
    with get_db() as conn:
        conn.execute(f"UPDATE smtp_config SET {sets} WHERE id = 1", vals)


# ─── Email Template ───

def get_template():
    with get_db() as conn:
        row = conn.execute("SELECT * FROM email_template WHERE id = 1").fetchone()
        return dict(row) if row else {}


def update_template(subject: str, body: str):
    with get_db() as conn:
        conn.execute("UPDATE email_template SET subject = ?, body = ? WHERE id = 1", (subject, body))


# ─── Send Config ───

def get_send_config():
    with get_db() as conn:
        row = conn.execute("SELECT * FROM send_config WHERE id = 1").fetchone()
        return dict(row) if row else {}


def update_send_config(sending: bool = None, frequency_seconds: int = None):
    with get_db() as conn:
        if sending is not None:
            conn.execute("UPDATE send_config SET sending = ? WHERE id = 1", (1 if sending else 0,))
        if frequency_seconds is not None:
            conn.execute("UPDATE send_config SET frequency_seconds = ? WHERE id = 1", (frequency_seconds,))


# ─── Emails Log ───

def log_email(prospect_id: int, direction: str, subject: str, body: str):
    with get_db() as conn:
        conn.execute(
            "INSERT INTO emails (prospect_id, direction, subject, body) VALUES (?, ?, ?, ?)",
            (prospect_id, direction, subject, body)
        )


def get_prospect_emails(prospect_id: int):
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM emails WHERE prospect_id = ? ORDER BY sent_at DESC",
            (prospect_id,)
        ).fetchall()
        return [dict(r) for r in rows]


# ─── Stats / KPI ───

def get_kpis():
    with get_db() as conn:
        total = conn.execute("SELECT COUNT(*) as c FROM prospects WHERE status != 'queue'").fetchone()["c"]
        opened = conn.execute("SELECT COUNT(*) as c FROM prospects WHERE opened_at IS NOT NULL").fetchone()["c"]
        replied = conn.execute("SELECT COUNT(*) as c FROM prospects WHERE replied_at IS NOT NULL").fetchone()["c"]
        accepted = conn.execute("SELECT COUNT(*) as c FROM prospects WHERE status = 'accepted'").fetchone()["c"]
        refused = conn.execute("SELECT COUNT(*) as c FROM prospects WHERE status = 'refused'").fetchone()["c"]
        negotiation = conn.execute("SELECT COUNT(*) as c FROM prospects WHERE status = 'negotiation'").fetchone()["c"]
        queue = conn.execute("SELECT COUNT(*) as c FROM prospects WHERE status = 'queue'").fetchone()["c"]
        blacklisted = conn.execute("SELECT COUNT(*) as c FROM blacklist").fetchone()["c"]

        return {
            "total": total,
            "opened": opened,
            "replied": replied,
            "accepted": accepted,
            "refused": refused,
            "negotiation": negotiation,
            "queue": queue,
            "blacklisted": blacklisted,
            "open_rate": round((opened / total * 100), 1) if total else 0,
            "reply_rate": round((replied / total * 100), 1) if total else 0,
            "conversion_rate": round((accepted / total * 100), 1) if total else 0,
        }


# ─── Unsubscribe by token ───

def unsubscribe_by_token(token: str) -> str | None:
    """Find prospect by unsubscribe token, blacklist them. Returns email or None."""
    with get_db() as conn:
        row = conn.execute("SELECT email FROM prospects WHERE unsubscribe_token = ?", (token,)).fetchone()
        if row:
            email = row["email"]
            add_to_blacklist(email, reason="unsubscribe", source="unsubscribe_link")
            return email
    return None


# ─── Track open by tracking_id ───

def track_open(tracking_id: str):
    """Mark prospect as opened via pixel tracking."""
    with get_db() as conn:
        conn.execute(
            "UPDATE prospects SET opened_at = datetime('now') WHERE tracking_id = ? AND opened_at IS NULL",
            (tracking_id,)
        )
