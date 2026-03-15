# ◆ ProspectFlow

> **Open-source email outreach software — 100% local, free, no cloud dependency.**

*This software was originally generated with the assistance of artificial intelligence.*
*Created by [GoLynk Société Simple](https://golynk.ch) — Valais, Switzerland.*

---

ProspectFlow automates cold email outreach with multi-step follow-up sequences, tracks opens and replies, manages your conversion pipeline with a Kanban board, and provides real-time analytics — all running locally on your machine.

## ✨ Features

- **Pipeline** — Kanban board with 7 columns, drag & drop, heat score indicators
- **Multi-step sequences** — automatic follow-ups (e.g. Day+3, Day+7) if no reply
- **Campaigns** — group prospects by campaign with per-campaign analytics
- **Tags & heat score** — label prospects, auto-calculated engagement score (🔥🟠🟡)
- **Send scheduling** — restrict sending to business hours (e.g. 9-12h, 14-17h, weekdays only)
- **Bounce detection** — automatically detects invalid emails (SMTP 550-554 codes)
- **Open tracking** — invisible pixel tracking in each email
- **Blacklist & unsubscribe** — unsubscribe link in every email, automatic blacklisting
- **CSV import/export** — import prospects from CSV files, export results
- **Email preview** — see exactly what the prospect will receive before sending
- **Test mode** — send yourself a test email before launching a campaign
- **Analytics dashboard** — KPIs, time charts (daily/weekly), conversion funnel, pie chart, activity feed
- **Notes** — built-in notepad with auto-save
- **Notifications** — bell icon with real-time open/reply alerts
- **Dark/Light theme** — responsive interface (desktop, tablet, mobile)
- **Keyboard shortcuts** — Ctrl+K search, Escape to close, right-click context menu
- **Export/Import** — backup and restore your data as JSON

## 📦 Installation

### Prerequisites

- **Python 3.11+** → [python.org](https://www.python.org/downloads/)
- **Node.js 18+** → [nodejs.org](https://nodejs.org/)

### 1. Clone the project

```bash
git clone https://github.com/GoLynk-Project/prospectflow.git
cd prospectflow
```

### 2. Start the backend

```bash
cd backend
pip install -r requirements.txt
python main.py
```

> Backend runs on `http://localhost:8000`
> API docs: `http://localhost:8000/docs`

### 3. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

> Frontend runs on `http://localhost:5173`

### 4. Configure SMTP

1. Open `http://localhost:5173`
2. Click **⚙ SMTP Config** in the sidebar
3. Enter your SMTP details:

| Field | Gmail | Hostinger | Other |
|-------|-------|-----------|-------|
| Host | `smtp.gmail.com` | `smtp.hostinger.com` | Check provider |
| Port | `587` | `465` | `587` or `465` |
| Email | you@gmail.com | you@domain.com | your email |
| Password | App Password* | email password | your password |
| Sender Name | Your Name | Your Name | Your Name |

**\*Gmail**: Enable 2FA → [Create App Password](https://myaccount.google.com/apppasswords)

SMTP config is saved in `backend/config.json` (gitignored).

## 🏗 Architecture

```
prospectflow/
├── backend/
│   ├── main.py              # FastAPI — all routes, tracking, unsubscribe page
│   ├── database.py          # SQLite — all tables, heat score, activity logging
│   ├── email_sender.py      # SMTP sending with bounce detection
│   ├── scheduler.py         # APScheduler — auto-send, auto-status rules
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # Complete React interface (900+ lines)
│   │   ├── api.js           # API wrapper for backend communication
│   │   └── main.jsx
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── LICENSE
├── .gitignore
└── README.md
```

## 📡 API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| **Prospects** | | |
| `GET` | `/api/prospects` | List all prospects |
| `POST` | `/api/prospects` | Add prospect |
| `POST` | `/api/prospects/bulk` | Bulk import |
| `PATCH` | `/api/prospects/:id` | Update prospect |
| `DELETE` | `/api/prospects/:id` | Delete |
| **Email** | | |
| `GET/PUT` | `/api/template` | Email template |
| `GET/PUT` | `/api/send-config` | Send configuration |
| `GET/PUT` | `/api/smtp` | SMTP configuration |
| `POST` | `/api/send-test` | Send test email |
| **Sequences** | | |
| `GET` | `/api/sequences` | List sequences |
| `GET/POST/PATCH/DELETE` | `/api/sequence-steps` | Manage steps |
| **Campaigns** | | |
| `GET/POST/PATCH/DELETE` | `/api/campaigns` | Manage campaigns |
| **Tags** | | |
| `GET/POST/DELETE` | `/api/tags` | Manage tags |
| `GET/POST/DELETE` | `/api/prospect-tags` | Assign/remove tags |
| **Other** | | |
| `GET/POST/DELETE` | `/api/blacklist` | Blacklist management |
| `GET/POST/PATCH/DELETE` | `/api/notes` | Notes |
| `GET` | `/api/activity` | Activity log |
| `GET` | `/api/kpis` | Statistics |
| `GET` | `/track/open/:id` | Pixel tracking |
| `GET` | `/unsubscribe/:token` | Unsubscribe page |

## 🔒 Legal Compliance

- **GDPR / nLPD**: unsubscribe link in every email
- **Blacklist**: unsubscriptions are permanent
- **Local data**: everything stays on your machine

## 🤝 Contributing

Contributions are welcome! Fork the project, create a branch, and submit a Pull Request.

## 📄 License

Custom open-source license with mandatory attribution. See [LICENSE](./LICENSE).

**In short:** you can use, modify, distribute and sell this software, provided you:
1. Credit **GoLynk Société Simple** (https://golynk.ch)
2. Disclose that the software was **originally generated with AI assistance**

---

**Built with ProspectFlow, created by [GoLynk Société Simple](https://golynk.ch)**
