import sqlite3, uuid, os
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "prospectflow.db")

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn

def init_db():
    conn = get_db()
    c = conn.cursor()
    c.executescript("""
    CREATE TABLE IF NOT EXISTS prospects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT DEFAULT '',
        email TEXT NOT NULL,
        company TEXT DEFAULT '',
        status TEXT DEFAULT 'queue',
        notes TEXT DEFAULT '',
        added_at TEXT DEFAULT (datetime('now')),
        sent_at TEXT,
        opened_at TEXT,
        replied_at TEXT,
        tracking_id TEXT DEFAULT (hex(randomblob(16))),
        unsubscribe_token TEXT DEFAULT (hex(randomblob(16))),
        sequence_id INTEGER,
        current_step INTEGER DEFAULT 1,
        last_step_sent_at TEXT,
        sequence_completed INTEGER DEFAULT 0,
        campaign_id INTEGER,
        heat_score INTEGER DEFAULT 0,
        open_count INTEGER DEFAULT 0,
        bounced INTEGER DEFAULT 0,
        bounce_reason TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS blacklist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        reason TEXT DEFAULT 'manual',
        source TEXT DEFAULT 'manual',
        added_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS email_template (
        id INTEGER PRIMARY KEY,
        subject TEXT DEFAULT '',
        body TEXT DEFAULT ''
    );
    INSERT OR IGNORE INTO email_template (id, subject, body) VALUES (1,
        '{company} — Discover our solution',
        'Hi {name},\n\nI''m reaching out because {company} could benefit from our business management solution.\n\nWould you be available for a 15-minute call this week?\n\nBest regards');

    CREATE TABLE IF NOT EXISTS send_config (
        id INTEGER PRIMARY KEY,
        sending INTEGER DEFAULT 0,
        frequency_seconds INTEGER DEFAULT 1200,
        batch_size INTEGER DEFAULT 1,
        last_sent_at TEXT,
        use_schedule INTEGER DEFAULT 1,
        send_hour_start INTEGER DEFAULT 9,
        send_hour_end_morning INTEGER DEFAULT 12,
        send_hour_start_afternoon INTEGER DEFAULT 14,
        send_hour_end INTEGER DEFAULT 17,
        timezone TEXT DEFAULT 'Europe/Zurich',
        test_email TEXT DEFAULT ''
    );
    INSERT OR IGNORE INTO send_config (id) VALUES (1);

    CREATE TABLE IF NOT EXISTS sequences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT DEFAULT 'Default Sequence',
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now'))
    );
    INSERT OR IGNORE INTO sequences (id, name) VALUES (1, 'Default Sequence');

    CREATE TABLE IF NOT EXISTS sequence_steps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sequence_id INTEGER REFERENCES sequences(id) ON DELETE CASCADE,
        step_order INTEGER DEFAULT 1,
        delay_days INTEGER DEFAULT 0,
        subject TEXT DEFAULT '',
        body TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS campaigns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT DEFAULT 'Campaign',
        description TEXT DEFAULT '',
        sequence_id INTEGER REFERENCES sequences(id),
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        color TEXT DEFAULT '#6366f1',
        created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS prospect_tags (
        prospect_id INTEGER REFERENCES prospects(id) ON DELETE CASCADE,
        tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
        PRIMARY KEY (prospect_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS activity_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        prospect_id INTEGER,
        prospect_email TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT DEFAULT '',
        content TEXT DEFAULT '',
        updated_at TEXT DEFAULT (datetime('now')),
        created_at TEXT DEFAULT (datetime('now'))
    );
    INSERT OR IGNORE INTO notes (id, title) VALUES (1, 'General Notes');

    CREATE TABLE IF NOT EXISTS emails_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        prospect_id INTEGER,
        direction TEXT DEFAULT 'outbound',
        subject TEXT DEFAULT '',
        body TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now'))
    );
    """)

    # Default sequence steps
    c.execute("SELECT COUNT(*) FROM sequence_steps WHERE sequence_id=1")
    if c.fetchone()[0] == 0:
        c.execute("INSERT INTO sequence_steps (sequence_id,step_order,delay_days,subject,body) VALUES (1,1,0,'{company} — Discover our solution','Hi {name},\n\nI''m reaching out because {company} could benefit from our solution.\n\nBest regards')")
        c.execute("INSERT INTO sequence_steps (sequence_id,step_order,delay_days,subject,body) VALUES (1,2,3,'Follow-up — {company}','Hi {name},\n\nI wanted to follow up on my previous email.\n\nHave you had a chance to consider our solution?\n\nBest regards')")
        c.execute("INSERT INTO sequence_steps (sequence_id,step_order,delay_days,subject,body) VALUES (1,3,7,'Last follow-up — {company}','Hi {name},\n\nThis is my final message on this topic. If our solution doesn''t fit your needs right now, I completely understand.\n\nFeel free to reach out if things change.\n\nBest regards')")

    # Default tags
    for name, color in [("VIP","#f59e0b"),("Follow-up","#8b5cf6"),("Priority","#ef4444"),("Interested","#22c55e"),("Cold","#6b7280")]:
        c.execute("INSERT OR IGNORE INTO tags (name,color) VALUES (?,?)", (name, color))

    conn.commit()
    conn.close()

def log_activity(event_type, prospect_id=None, email=""):
    conn = get_db()
    conn.execute("INSERT INTO activity_log (event_type, prospect_id, prospect_email) VALUES (?,?,?)", (event_type, prospect_id, email))
    conn.commit()
    conn.close()

def update_heat_score(prospect_id):
    conn = get_db()
    p = conn.execute("SELECT * FROM prospects WHERE id=?", (prospect_id,)).fetchone()
    if not p: conn.close(); return
    score = 0
    if p["opened_at"]: score += 20
    score += min(50, max(0, (p["open_count"] or 0) - 1) * 10)
    if p["replied_at"]: score += 30
    if p["status"] == "negotiation": score += 20
    score = min(100, score)
    conn.execute("UPDATE prospects SET heat_score=? WHERE id=?", (score, prospect_id))
    conn.commit()
    conn.close()
