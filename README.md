<div align="center">

# 🤖 FAQ Chatbot

**A self-learning FAQ assistant powered by Google Gemini AI.**  
Ask questions in natural language. When the bot doesn't know — a human answers once, and the bot learns forever.

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)](https://vitejs.dev)
[![SQLite](https://img.shields.io/badge/SQLite-embedded-003B57?logo=sqlite&logoColor=white)](https://sqlite.org)
[![Gemini](https://img.shields.io/badge/Google_Gemini-AI-4285F4?logo=google&logoColor=white)](https://ai.google.dev)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com)
[![Kubernetes](https://img.shields.io/badge/Kubernetes-k3s-326CE5?logo=kubernetes&logoColor=white)](https://k3s.io)

</div>

---

## ✨ What It Does

| Feature | Description |
|---|---|
| 💬 **Natural Language Chat** | Users ask questions in plain English — no rigid keyword matching |
| 🧠 **Semantic Search** | Finds answers even when the wording is completely different |
| 📚 **Self-Learning KB** | Every human-answered question is permanently remembered |
| ⏳ **Pending Queue** | Unknown questions are queued for admin review |
| 🛠 **Admin Panel** | Manage Q&A entries, answer pending questions, edit/delete KB entries |
| 🎨 **Beautiful UI** | Dark glassmorphism design with typing animations |

---

## 🖼️ Screenshots

### Chat View
> Users chat naturally. Answers show similarity scores and source references.

```
┌────────────────────────────────────────────────────────┐
│ 🤖  FAQ Chatbot                          💬 Chat │ 🛠 Admin │
├────────────────────────────────────────────────────────┤
│                                                        │
│   🤖 Hi! I'm your FAQ assistant. Ask me anything!     │
│                                                        │
│                   I forgot my password, what do I do?  │
│                                                             👤│
│                                                        │
│   🤖 To reset your password, go to Settings →         │
│      Security → Reset Password. You will receive       │
│      an email with a reset link.                       │
│      📚 Answered from KB: #1 (94% match)              │
│                                                        │
│  ┌──────────────────────────────────┐  [➤ Send]      │
│  │  Ask a question...               │                 │
│  └──────────────────────────────────┘                 │
└────────────────────────────────────────────────────────┘
```

### Admin Panel — Pending Questions
> Review unanswered questions and type an answer. It's immediately added to the KB.

### Admin Panel — Knowledge Base
> Add, edit, or delete Q&A entries directly.

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** v18 or higher → [Download](https://nodejs.org)
- **Google AI Studio API key** → [Get one free](https://aistudio.google.com/apikey)

### 1. Install Backend

```bash
cd faq-chatbot
npm install
```

### 2. Configure Environment

```bash
# Copy the example env file
copy .env.example .env   # Windows
cp .env.example .env     # macOS / Linux
```

Open `.env` and set your API key:

```env
GOOGLE_API_KEY=AIza...your_key_here
```

### 3. Start the Backend Server

```bash
node index.js
```

> ✅ You should see: `FAQ Chatbot server running on http://localhost:4000`

### 4. Install & Start the Frontend

Open a **second terminal**:

```bash
cd faq-chatbot/client
npm install
npm run dev -- --port 4173
```

> ✅ Open **http://localhost:4173** in your browser.

---

## 🐳 Docker & Kubernetes Deployment (Rancher Desktop)

The app ships with production-ready Docker images and Kubernetes manifests.

### Prerequisites

- **[Rancher Desktop](https://rancherdesktop.io/)** (or any local K8s cluster with Docker)
- Docker and `kubectl` available on PATH

### 1. Build Docker Images

```powershell
# Build backend image
docker build -t faq-chatbot-server:latest .

# Build frontend image (multi-stage: Node builds React → nginx serves)
docker build -t faq-chatbot-client:latest ./client
```

### 2. Create the Namespace & Secret

```powershell
# Create namespace
kubectl create namespace faq-chatbot

# Inject your API key as a K8s Secret (never committed to git)
kubectl create secret generic faq-secrets `
  --from-literal=GOOGLE_API_KEY="YOUR_API_KEY_HERE" `
  --namespace faq-chatbot
```

### 3. Apply All Manifests

```powershell
kubectl apply -f k8s/configmap.yaml `
              -f k8s/pvc.yaml `
              -f k8s/backend.yaml `
              -f k8s/frontend.yaml
```

### 4. Verify Pods are Running

```powershell
kubectl get pods -n faq-chatbot
# NAME                          READY   STATUS    RESTARTS   AGE
# faq-client-655fb5df4f-blxmw   1/1     Running   0          30s
# faq-server-74b57c579d-qw4ds   1/1     Running   0          30s

kubectl get svc -n faq-chatbot
# NAME             TYPE        CLUSTER-IP     PORT(S)        AGE
# faq-server-svc   ClusterIP   10.43.207.111  4000/TCP       30s
# faq-client-svc   NodePort    10.43.54.125   80:30080/TCP   30s
```

> ✅ Open **http://localhost:30080** in your browser.

### K8s Architecture

```
Namespace: faq-chatbot
│
├── Secret: faq-secrets          ← GOOGLE_API_KEY (never in git)
├── ConfigMap: faq-config        ← MODEL_NAME, THRESHOLD, DB_PATH
├── PVC: faq-db-pvc (500Mi)      ← SQLite persisted on local-path volume
│
├── Deployment: faq-server       ← Express backend (port 4000)
│   └── Service: faq-server-svc  ← ClusterIP (internal only)
│
└── Deployment: faq-client       ← nginx serving React (port 80)
    └── Service: faq-client-svc  ← NodePort → localhost:30080
```

### Redeploying After Code Changes

```powershell
# Rebuild both images
docker build -t faq-chatbot-server:latest .
docker build -t faq-chatbot-client:latest ./client

# Rolling restart (zero-downtime)
kubectl rollout restart deployment -n faq-chatbot

# Watch pods replace
kubectl get pods -n faq-chatbot -w
```

### Useful kubectl Commands

```powershell
# View backend logs
kubectl logs -n faq-chatbot deployment/faq-server -f

# View frontend (nginx) logs
kubectl logs -n faq-chatbot deployment/faq-client -f

# Describe a pod (useful for debugging ImagePullBackOff etc.)
kubectl describe pod -n faq-chatbot -l app=faq-server

# Delete everything and start fresh
kubectl delete namespace faq-chatbot
```

---

## 🗂️ Project Structure

```
faq-chatbot/
│
├── index.js            ← Express API server (port 4000)
├── db.js               ← SQLite setup + cosine similarity
├── Dockerfile          ← Backend container image
├── faq.db              ← Auto-created database (gitignored)
├── .env                ← Your secrets (gitignored)
├── .env.example        ← Template for new developers
├── ARCHITECTURE.md     ← Deep-dive: architecture, API, enhancement guides
├── README.md           ← This file
│
├── k8s/                ← Kubernetes manifests
│   ├── namespace.yaml  ← Namespace: faq-chatbot
│   ├── secret.yaml     ← Template only — apply real secret via kubectl
│   ├── configmap.yaml  ← Non-sensitive config
│   ├── pvc.yaml        ← 500Mi PersistentVolumeClaim for SQLite
│   ├── backend.yaml    ← Server Deployment + ClusterIP Service
│   └── frontend.yaml   ← Client Deployment + NodePort Service (:30080)
│
└── client/             ← React + Vite frontend
    ├── Dockerfile       ← Multi-stage: Node build → nginx serve
    ├── nginx.conf       ← SPA routing + /api/ proxy to backend
    └── src/
        ├── App.jsx         ← Root component + navigation
        ├── App.css         ← All styling
        └── pages/
            ├── Chat.jsx    ← User chat interface
            └── Admin.jsx   ← Admin panel
```

---

## 🧠 How the Learning Works

```
User asks unknown question
        │
        ▼
Bot can't answer → saves to Pending Queue
        │
        ▼
Admin sees it in the Admin Panel → types an answer
        │
        ▼
Answer is embedded as a vector → saved to Knowledge Base
        │
        ▼
Next user asks the same (or similar) question
        │
        ▼
Bot finds it via semantic search → answers automatically ✅
```

---

## 📡 API Reference

The backend runs at `http://localhost:4000`.

### Chat

```http
POST /api/chat
Content-Type: application/json

{ "question": "How do I reset my password?", "sessionId": "user-123" }
```

**Response — Answered:**
```json
{
  "answered": true,
  "answer": "Go to Settings → Security → Reset Password...",
  "sources": [{ "id": 1, "question": "How do I reset my password?", "score": "0.94" }]
}
```

**Response — Unknown question:**
```json
{
  "answered": false,
  "pendingId": 7,
  "answer": "I don't have an answer for that yet. Your question has been forwarded to our team!"
}
```

### Knowledge Base CRUD

```http
GET    /api/kb              → List all entries
POST   /api/kb              → Add entry { question, answer }
PUT    /api/kb/:id          → Update answer { answer }
DELETE /api/kb/:id          → Delete entry
```

### Admin — Pending Queue

```http
GET  /api/pending           → List unanswered questions
POST /api/pending/:id/answer   → Answer { answer } → saves to KB
POST /api/pending/:id/dismiss  → Dismiss question
```

---

## ⚙️ Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `GOOGLE_API_KEY` | ✅ Yes | — | Your [Google AI Studio](https://aistudio.google.com/apikey) key |
| `MODEL_NAME` | No | `gemini-2.5-flash` | Gemini model for answer generation |
| `SIMILARITY_THRESHOLD` | No | `0.75` | How closely a question must match to get an answer (0–1) |
| `PORT` | No | `4000` | Backend server port |

### Tuning the Threshold

| Value | Behaviour |
|---|---|
| `0.90` | Very strict — only near-identical questions match |
| `0.75` | **Recommended** — good balance |
| `0.60` | Lenient — catches more variations |

---

## 🌱 Seeding the Knowledge Base

You can pre-populate the knowledge base without going through the UI.

**Using PowerShell:**
```powershell
Invoke-RestMethod `
  -Uri "http://localhost:4000/api/kb" `
  -Method Post `
  -Body '{"question":"What are your office hours?","answer":"Monday to Friday, 9AM – 6PM IST."}' `
  -ContentType "application/json"
```

**Using curl (macOS/Linux):**
```bash
curl -X POST http://localhost:4000/api/kb \
  -H "Content-Type: application/json" \
  -d '{"question":"What are your office hours?","answer":"Monday to Friday, 9AM – 6PM IST."}'
```

Or just use the **Admin → Knowledge Base → Add New Entry** form in the UI.

---

## 🔐 Securing the Admin Panel

By default, the admin panel is open to anyone. For production, see the **[ARCHITECTURE.md](./ARCHITECTURE.md)** for:

- **§9.1** — Microsoft Entra ID (Azure AD) authentication — full step-by-step guide
- **§11** — Rate limiting, token validation, and other security hardening

---

## 📈 Scaling for Production

| Need | Solution |
|---|---|
| Run locally with K8s | Rancher Desktop — see [Docker & K8s section](#-docker--kubernetes-deployment-rancher-desktop) above |
| More users | Add rate limiting (see ARCHITECTURE.md §11) |
| Large knowledge base (10k+ entries) | Migrate to PostgreSQL + pgvector (see ARCHITECTURE.md §9.2) |
| Multiple teams/departments | Add multi-tenancy support (see ARCHITECTURE.md §9.3) |
| Alert on new questions | Add email notifications (see ARCHITECTURE.md §9.4) |
| Update K8s config | Edit `k8s/configmap.yaml` and `kubectl apply -f k8s/` |

---

## 🗺️ Roadmap

- [x] Docker containerisation (backend + frontend)
- [x] Kubernetes manifests for Rancher Desktop / k3s
- [ ] Microsoft Entra ID authentication
- [ ] Email / Teams notifications for unanswered questions
- [ ] PostgreSQL + pgvector for production scale
- [ ] Analytics dashboard (top questions, unanswered rate, response scores)
- [ ] Export knowledge base to CSV/JSON
- [ ] Multi-language support
- [ ] Slack / Teams bot integration

---

## 📖 Further Reading

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — Full technical architecture, API docs, database schema, and enhancement implementation guides

---

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/my-enhancement`
3. Commit your changes: `git commit -m 'feat: add my enhancement'`
4. Push to the branch: `git push origin feature/my-enhancement`
5. Open a Pull Request

---

<div align="center">

Built with ❤️ using **Google Gemini AI**, **Node.js**, and **React**

</div>
