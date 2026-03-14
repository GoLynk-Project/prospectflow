# ◆ ProspectFlow

> **Logiciel open-source de prospection email — 100% local, gratuit, sans dépendance cloud.**

*Ce logiciel a été initialement généré avec l'assistance de l'intelligence artificielle.*  
*Créé par [GoLynk Société Simple](https://golynk.ch) — Valais, Suisse.*

---

ProspectFlow automatise l'envoi d'emails de prospection, détecte les ouvertures et réponses, gère le pipeline de conversion et respecte les lois suisses (nLPD) et européennes (RGPD) — le tout depuis votre machine.

## ✨ Fonctionnalités

- **Envoi automatique** — file d'attente avec fréquence configurable (instantané → 1x/jour)
- **Détection des réponses** — scan IMAP automatique toutes les 2 minutes
- **Pixel tracking** — détection des ouvertures d'email
- **Blacklist & désabonnement** — lien "Ne plus être contacté" + module blacklist complet
- **KPI** — taux d'ouverture, réponse, conversion
- **Règles automatiques** — ouvert sans réponse > 2h → en attente, 10 jours → refusé
- **Thème clair/sombre** — interface React responsive (desktop, tablette, mobile)
- **Raccourcis** — Ctrl+K recherche, Escape ferme, clic droit contextuel

## 📸 Aperçu

| Pipeline (dark) | KPI | Blacklist |
|---|---|---|
| Vue Kanban avec 7 colonnes | Statistiques en temps réel | Gestion des désabonnements |

## 📦 Installation

### Prérequis

- **Python 3.11+** → [python.org](https://www.python.org/downloads/)
- **Node.js 18+** → [nodejs.org](https://nodejs.org/)
- **Git** → [git-scm.com](https://git-scm.com/)

### 1. Cloner le projet

```bash
git clone https://github.com/VOTRE_USERNAME/prospectflow.git
cd prospectflow
```

### 2. Installer et lancer le backend

```bash
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

> Le backend démarre sur `http://localhost:8000`  
> Documentation API interactive : `http://localhost:8000/docs`

### 3. Installer et lancer le frontend

```bash
cd frontend
npm install
npm run dev
```

> Le frontend démarre sur `http://localhost:5173`

### 4. Configurer votre email

1. Ouvrez `http://localhost:5173`
2. Cliquez sur **⚙ Config SMTP** dans la sidebar
3. Renseignez votre serveur SMTP :

| Champ | Gmail | Infomaniak |
|-------|-------|------------|
| Serveur | `smtp.gmail.com` | `mail.infomaniak.com` |
| Port | `587` | `587` |
| Email | votre@gmail.com | votre@domain.ch |
| Mot de passe | App Password* | votre mot de passe |

**\*Gmail** : Allez dans [Paramètres Google](https://myaccount.google.com/apppasswords) → Activez la vérification en 2 étapes → Créez un "Mot de passe d'application".

### 5. C'est prêt !

- Ajoutez des prospects (un par un ou import en masse)
- Personnalisez le template email
- Activez l'envoi avec le switch dans la barre du haut
- Surveillez vos KPI

## 🏗 Architecture

```
prospectflow/
├── backend/
│   ├── main.py              # API FastAPI — routes, tracking pixel, page désabonnement
│   ├── database.py          # SQLite — prospects, blacklist, config, CRUD complet
│   ├── email_sender.py      # Envoi SMTP — pixel tracking + lien désabonnement
│   ├── email_reader.py      # Lecture IMAP — détection automatique des réponses
│   ├── scheduler.py         # APScheduler — envoi auto, vérif IMAP, règles statut
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   └── App.jsx          # Interface React complète
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── LICENSE
├── .gitignore
└── README.md
```

## 📡 API

| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/api/prospects` | Liste les prospects |
| `POST` | `/api/prospects` | Ajouter (vérifie blacklist + doublons) |
| `POST` | `/api/prospects/bulk` | Import en masse |
| `PATCH` | `/api/prospects/:id` | Modifier |
| `DELETE` | `/api/prospects/:id` | Supprimer |
| `POST` | `/api/send/next` | Envoyer le prochain |
| `POST` | `/api/send/one/:id` | Envoyer manuellement |
| `POST` | `/api/send/all` | Envoyer toute la file |
| `GET/POST/DELETE` | `/api/blacklist` | CRUD blacklist |
| `GET` | `/api/kpis` | Statistiques |
| `GET` | `/track/open/:id` | Pixel tracking (automatique) |
| `GET` | `/unsubscribe/:token` | Page de désabonnement |

## 🔒 Conformité légale

- **nLPD (Suisse)** / **RGPD (UE)** : lien de désabonnement dans chaque email
- **Blacklist** : les désabonnements sont définitifs — impossible d'envoyer aux adresses blacklistées
- **Données locales** : tout reste sur votre machine, rien dans le cloud

## 🤝 Contribuer

Les contributions sont les bienvenues ! Forkez le projet, créez une branche, et envoyez une Pull Request.

## 📄 Licence

Licence personnalisée — open source avec attribution obligatoire.  
Voir [LICENSE](./LICENSE) pour les détails complets.

**En résumé :** vous pouvez utiliser, modifier, distribuer et vendre ce logiciel, à condition de :
1. Créditer **GoLynk Société Simple** (https://golynk.ch)
2. Mentionner que le logiciel a été **généré avec l'assistance de l'IA**

---

**Built with ProspectFlow, created by [GoLynk Société Simple](https://golynk.ch)**  
*This software was originally generated with the assistance of AI.*
