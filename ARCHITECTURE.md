# FAQ Chatbot — Architecture & Developer Guide

> A self-learning FAQ chatbot powered by semantic search (Gemini Embeddings) and RAG-based answer generation (Gemini LLM), with a React frontend and a Node.js/Express backend.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture Diagram](#2-architecture-diagram)
3. [Project Structure](#3-project-structure)
4. [Data Flow](#4-data-flow)
5. [API Reference](#5-api-reference)
6. [Database Schema](#6-database-schema)
7. [Local Setup](#7-local-setup)
8. [Environment Variables](#8-environment-variables)
9. [Enhancement Guides](#9-enhancement-guides)
   - [9.1 Adding Microsoft Entra ID (Azure AD) Authentication](#91-adding-microsoft-entra-id-azure-ad-authentication)
   - [9.2 Switching to PostgreSQL with pgvector](#92-switching-to-postgresql-with-pgvector)
   - [9.3 Adding Multi-Tenancy Support](#93-adding-multi-tenancy-support)
   - [9.4 Adding Email Notifications for Pending Questions](#94-adding-email-notifications-for-pending-questions)
   - [9.5 Improving Answer Quality with Re-ranking](#95-improving-answer-quality-with-re-ranking)
   - [9.6 Containerising with Docker](#96-containerising-with-docker)
10. [Kubernetes Deployment (Rancher Desktop)](#10-kubernetes-deployment-rancher-desktop)
    - [SQLite Persistence — Where Is the Database?](#sqlite-persistence--where-is-the-database)
    - [HTTPS & Virtual Domain (faq.local)](#https--virtual-domain-faqlocal)
11. [Tuning the Similarity Threshold](#11-tuning-the-similarity-threshold)
12. [Security Considerations](#12-security-considerations)
13. [Roadmap Ideas](#13-roadmap-ideas)

---

## 1. System Overview

| Layer | Technology | Role |
|---|---|---|
| **Frontend** | React + Vite | Chat UI & Admin Panel |
| **Backend** | Node.js + Express | REST API, orchestration |
| **Database** | SQLite (`better-sqlite3`) | Persistent storage for KB & pending questions |
| **Embeddings** | Gemini `gemini-embedding-001` | Converts text → vectors for semantic search |
| **LLM** | Gemini `gemini-2.5-flash` (configurable) | Generates natural-language answers from context |
| **Similarity** | Cosine Similarity (pure JS) | Finds nearest KB entries for a given query |

### Key Concepts

- **Knowledge Base (KB):** A curated store of question–answer pairs, each enriched with a high-dimensional embedding vector (768 floats).
- **Semantic Search:** Unlike keyword search, semantic search finds questions that *mean* the same thing, even with different wording.
- **RAG (Retrieval-Augmented Generation):** The LLM never answers from memory alone. It is always grounded to top-K matching KB entries, which dramatically reduces hallucination.
- **Pending Queue:** Unknown questions are queued for human review. When an admin answers one, the answer is embedded and added to the KB — the bot learns permanently.

---

## 2. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        React Frontend                        │
│   ┌──────────────────┐          ┌────────────────────────┐  │
│   │    Chat UI        │          │     Admin Panel         │  │
│   │  (Chat.jsx)       │          │     (Admin.jsx)         │  │
│   └────────┬─────────┘          └──────────┬─────────────┘  │
└────────────┼────────────────────────────────┼────────────────┘
             │ POST /api/chat                 │ CRUD /api/kb
             │                               │ GET/POST /api/pending
             ▼                               ▼
┌─────────────────────────────────────────────────────────────┐
│                     Express API (port 4000)                   │
│                          index.js                            │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Chat Handler                                         │   │
│  │  1. Embed user question  ──→  Gemini Embedding API   │   │
│  │  2. Search KB via cosine similarity                   │   │
│  │  3a. Match found  ──→  LLM generates grounded answer │   │
│  │  3b. No match     ──→  Save to Pending Queue         │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Admin Handler                                        │   │
│  │  - Answer pending Q → embed + save to KB             │   │
│  │  - CRUD operations on KB entries                      │   │
│  └──────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────┘
                             │
             ┌───────────────┴────────────────┐
             ▼                                ▼
    ┌──────────────────┐          ┌─────────────────────────┐
    │   SQLite (faq.db) │          │  Google Generative AI   │
    │                  │          │  - gemini-embedding-001  │
    │  knowledge_base  │          │  - gemini-2.5-flash      │
    │  pending_questions│          └─────────────────────────┘
    └──────────────────┘
```

---

## 3. Project Structure

```
faq-chatbot/
│
├── index.js                  # Express server — all API routes
├── db.js                     # SQLite setup, CRUD helpers, cosine similarity
├── Dockerfile                # Backend container image (Node 20 Alpine)
├── faq.db                    # Auto-created SQLite database (gitignored)
├── .env                      # Environment variables (gitignored)
├── .env.example              # Template for new developers
├── package.json
├── ARCHITECTURE.md           # This file
│
├── k8s/                      # Kubernetes manifests
│   ├── namespace.yaml        # Namespace: faq-chatbot
│   ├── secret.yaml           # Template — real secret injected via kubectl
│   ├── configmap.yaml        # Non-sensitive env config
│   ├── pvc.yaml              # 500Mi PVC (local-path) for SQLite
│   ├── backend.yaml          # Server Deployment + ClusterIP Service
│   ├── frontend.yaml         # Client Deployment + NodePort Service (:30080)
│   └── ingress.yaml          # Ingress routing for https://faq.local
│
└── client/                   # React + Vite frontend
    ├── index.html
    ├── Dockerfile             # Multi-stage: Node builds React → nginx serves
    ├── nginx.conf             # SPA routing + /api/ proxy to backend
    ├── vite.config.js         # Vite + dev proxy to localhost:4000
    ├── package.json
    └── src/
        ├── main.jsx          # App entry point
        ├── App.jsx           # Root component, navigation
        ├── App.css           # All styles (dark theme, glassmorphism)
        ├── index.css         # Minimal reset
        └── pages/
            ├── Chat.jsx      # End-user chat interface
            └── Admin.jsx     # Admin panel (pending + KB management)
```

---

## 4. Data Flow

### Chat (User Asks a Question)

```
User Input
    │
    ▼
POST /api/chat { question, sessionId }
    │
    ▼
getEmbedding(question)         ← Gemini Embedding API (768-dim vector)
    │
    ▼
findTopMatches(embedding, topN=3, threshold=0.75)
    │    cosine_similarity(queryVec, storedVec) for each KB entry
    │    returns entries sorted by similarity DESC, above threshold
    │
    ├── Matches found?
    │       YES → generateAnswer(question, matches)  ← LLM (RAG)
    │                │
    │                └── Response: { answered: true, answer, sources }
    │
    └── No matches
            │
            ├── addPendingQuestion(question, sessionId)
            └── Response: { answered: false, answer: "I'll check with our team..." }
```

### Admin Answers a Pending Question (System Learns)

```
Admin selects unanswered question, types answer
    │
    ▼
POST /api/pending/:id/answer { answer }
    │
    ▼
getEmbedding(question)         ← Embed the original question
    │
    ▼
addKBEntry(question, answer, embedding, source='admin_from_pending')
    │
    ▼
updatePendingStatus(id, 'answered')
    │
    ▼
Knowledge Base permanently updated ✅
Next similar question from any user → answered automatically
```

---

## 5. API Reference

### Chat

| Method | Endpoint | Body | Description |
|---|---|---|---|
| `POST` | `/api/chat` | `{ question, sessionId }` | Ask a question. Returns answer or queues for review. |

### Knowledge Base

| Method | Endpoint | Body | Description |
|---|---|---|---|
| `GET` | `/api/kb` | — | List all KB entries |
| `POST` | `/api/kb` | `{ question, answer }` | Add new entry (auto-embeds) |
| `PUT` | `/api/kb/:id` | `{ answer }` | Update answer text |
| `DELETE` | `/api/kb/:id` | — | Remove an entry |

### Pending Questions

| Method | Endpoint | Body | Description |
|---|---|---|---|
| `GET` | `/api/pending` | — | List pending (unanswered) questions |
| `GET` | `/api/pending/all` | — | List all questions (any status) |
| `POST` | `/api/pending/:id/answer` | `{ answer }` | Answer a question → saves to KB |
| `POST` | `/api/pending/:id/dismiss` | — | Dismiss a question |

---

## 6. Database Schema

```sql
-- Stores all known Q&A pairs with their vector embeddings
CREATE TABLE knowledge_base (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  question   TEXT NOT NULL,
  answer     TEXT NOT NULL,
  embedding  TEXT,                   -- JSON array: float[] (768 dims)
  source     TEXT DEFAULT 'admin',   -- 'admin' | 'admin_from_pending'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Stores questions that the bot couldn't answer
CREATE TABLE pending_questions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  question   TEXT NOT NULL,
  session_id TEXT,
  status     TEXT DEFAULT 'pending', -- 'pending' | 'answered' | 'dismissed'
  asked_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 7. Local Setup

### Prerequisites

- Node.js **v18+**
- npm **v8+**
- A **Google AI Studio API Key** with access to Gemini models ([Get one here](https://aistudio.google.com/apikey))

### Steps

```bash
# 1. Clone / navigate to the project
cd d:/2026/ai-corner/prism/faq-chatbot

# 2. Install backend dependencies
npm install

# 3. Create your .env file
copy .env.example .env
# Then edit .env and set GOOGLE_API_KEY=<your key>

# 4. Start the backend server (port 4000)
node index.js

# 5. In a new terminal — install & start the frontend
cd client
npm install
npm run dev -- --port 4173
```

Open **http://localhost:4173** in your browser.

---

## 8. Environment Variables

Create a `.env` file in the project root:

```env
# Required
GOOGLE_API_KEY=AIza...              # Your Google AI Studio API key

# Optional (defaults shown)
MODEL_NAME=gemini-2.5-flash         # LLM for answer generation
SIMILARITY_THRESHOLD=0.75           # 0.0–1.0 — lower = more lenient matching
PORT=4000                           # Backend server port
DB_PATH=/data/faq.db                # Overridden in K8s to use PVC mount point
```

---

## 9. Enhancement Guides

### 9.1 Adding Microsoft Entra ID (Azure AD) Authentication

Protect the **Admin Panel** so only authorised users (your organisation's employees) can access it.

#### Step 1 — Register an App in Azure Portal

1. Go to [portal.azure.com](https://portal.azure.com) → **Microsoft Entra ID** → **App registrations** → **New registration**
2. Set **Redirect URI** to `http://localhost:4173` (SPA type)
3. Note down:
   - `Application (client) ID`
   - `Directory (tenant) ID`

#### Step 2 — Install Frontend Auth Library

```bash
cd client
npm install @azure/msal-browser @azure/msal-react
```

#### Step 3 — Add MSAL Configuration

Create `client/src/authConfig.js`:

```js
export const msalConfig = {
  auth: {
    clientId: '<YOUR_CLIENT_ID>',
    authority: 'https://login.microsoftonline.com/<YOUR_TENANT_ID>',
    redirectUri: 'http://localhost:4173',
  },
  cache: { cacheLocation: 'sessionStorage' },
}

export const loginRequest = {
  scopes: ['User.Read'],
}
```

#### Step 4 — Wrap App with MsalProvider

Update `client/src/main.jsx`:

```jsx
import { MsalProvider } from '@azure/msal-react'
import { PublicClientApplication } from '@azure/msal-browser'
import { msalConfig } from './authConfig'
import App from './App'

const msalInstance = new PublicClientApplication(msalConfig)

ReactDOM.createRoot(document.getElementById('root')).render(
  <MsalProvider instance={msalInstance}>
    <App />
  </MsalProvider>
)
```

---

### 9.2 Switching to PostgreSQL with pgvector

For production deployments with large knowledge bases, replace SQLite + JSON embeddings with **PostgreSQL + pgvector** for native vector similarity search (much faster at scale).

#### Step 1 — Install PostgreSQL + pgvector

```bash
# macOS (Homebrew)
brew install postgresql pgvector

# Ubuntu / Debian
sudo apt install postgresql
sudo apt install postgresql-16-pgvector
```

#### Step 2 — Enable pgvector Extension

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

#### Step 3 — Updated Schema

```sql
CREATE TABLE knowledge_base (
  id         SERIAL PRIMARY KEY,
  question   TEXT NOT NULL,
  answer     TEXT NOT NULL,
  embedding  VECTOR(768),           -- native pgvector type
  source     TEXT DEFAULT 'admin',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create an IVFFlat index for fast approximate nearest-neighbor search
CREATE INDEX ON knowledge_base USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

---

### 9.6 Containerising with Docker

The project ships with production Dockerfiles for both services.

#### Backend — `Dockerfile`

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY index.js db.js ./
# DB_PATH env var points to PVC mount in K8s; defaults to ./faq.db locally
ENV DB_PATH=/data/faq.db
EXPOSE 4000
CMD ["node", "index.js"]
```

#### Frontend — `client/Dockerfile` (multi-stage)

```dockerfile
# Stage 1: Build React app
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Serve via nginx
FROM nginx:1.27-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

#### `client/nginx.conf`

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    # Proxy all /api/* calls to the backend K8s service
    location /api/ {
        proxy_pass http://faq-server-svc:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_read_timeout 60s;
    }

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

---

## 10. Kubernetes Deployment (Rancher Desktop)

The `k8s/` directory contains all manifests for deploying to a local Kubernetes cluster (tested on **Rancher Desktop / k3s v1.25**).

### K8s Architecture

```
Namespace: faq-chatbot
│
├── Secret: faq-secrets           ← GOOGLE_API_KEY (injected at apply time, never in git)
├── ConfigMap: faq-config         ← MODEL_NAME, SIMILARITY_THRESHOLD, PORT, DB_PATH
├── PVC: faq-db-pvc (500Mi)       ← SQLite data persisted via local-path provisioner
│
├── Deployment: faq-server        ← 1 replica, Node.js Express
│   ├── mounts PVC at /data
│   └── Service: faq-server-svc (ClusterIP :4000) — internal only
│
└── Deployment: faq-client        ← 1 replica, nginx
    └── Service: faq-client-svc (NodePort 80:30080) → http://localhost:30080
```

### Resource Files

| File | Description |
|---|---|
| `k8s/namespace.yaml` | Creates the `faq-chatbot` namespace |
| `k8s/secret.yaml` | **Template only** — real secret is injected via `kubectl create secret` |
| `k8s/configmap.yaml` | All non-sensitive config (`MODEL_NAME`, `DB_PATH`, etc.) |
| `k8s/pvc.yaml` | `500Mi` PVC using `local-path` storage class (Rancher Desktop default) |
| `k8s/backend.yaml` | Server Deployment + ClusterIP Service |
| `k8s/frontend.yaml` | Client Deployment + NodePort Service on port `30080` |
| `k8s/ingress.yaml` | Ingress routing for `https://faq.local` |

### SQLite Persistence — Where Is the Database?

The SQLite database runs **inside the `faq-server` pod** but is stored on a **PersistentVolume outside the container**, so it survives pod restarts and rolling deployments.

#### Storage Architecture

```
┌─────────────────────────────────────────────────┐
│           Pod: faq-server                        │
│                                                  │
│  Node.js (db.js)                                 │
│      │  reads/writes via better-sqlite3          │
│      ▼                                           │
│  /data/faq.db  ◄─── volumeMount (PVC)           │
│                                                  │
└───────────────────────┬──────────────────────────┘
                        │ PersistentVolumeClaim
                        │ faq-db-pvc (500Mi)
                        ▼
┌─────────────────────────────────────────────────┐
│    PersistentVolume  (local-path provisioner)    │
│                                                  │
│  Physical host path (Rancher Desktop Linux VM):  │
│  /var/lib/rancher/k3s/storage/pvc-<uuid>/       │
└─────────────────────────────────────────────────┘
```

#### Data Survival Matrix

| Event | Data Survives? |
|---|---|
| Pod restart / crash | ✅ Yes — PVC reattaches automatically |
| `kubectl rollout restart deployment` | ✅ Yes — rolling update, same PVC |
| `kubectl delete pod <name>` | ✅ Yes — replacement pod mounts same PVC |
| Node reboot | ✅ Yes — volume is on the host filesystem |
| `kubectl delete namespace faq-chatbot` | ❌ **No** — `ReclaimPolicy: Delete` removes the PV |
| Rancher Desktop uninstalled / VM wiped | ❌ No — host storage is gone |

### imagePullPolicy Note

Both deployments use `imagePullPolicy: IfNotPresent` which allows using locally built images or pulling from GHCR as needed.

### HTTPS & Virtual Domain (faq.local)

Instead of using `http://localhost:30080` (NodePort), we use an **Ingress** to provide a production-like HTTPS experience with a custom hostname.

#### 1. Generate local certificates (Self-Signed)
We use the OpenSSL provided by Git for Windows:
```powershell
# Run this once on your machine to generate certs
& "C:\Program Files\Git\usr\bin\openssl.exe" req -x509 -nodes -days 365 -newkey rsa:2048 `
  -keyout tls.key -out tls.crt -subj "/CN=faq.local"
```

#### 2. Create the TLS Secret
Inject the certificates into the cluster:
```powershell
kubectl create secret tls faq-tls-secret --key tls.key --cert tls.crt -n faq-chatbot
```

#### 3. Ingress Configuration
The `k8s/ingress.yaml` defines the routing:
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: faq-ingress
  namespace: faq-chatbot
  annotations:
    traefik.ingress.kubernetes.io/router.entrypoints: websecure
    traefik.ingress.kubernetes.io/router.tls: "true"
spec:
  ingressClassName: traefik
  tls:
    - hosts: ["faq.local"]
      secretName: faq-tls-secret
  rules:
    - host: faq.local
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: faq-client-svc
                port:
                  number: 80
```

#### 4. Local DNS Setup (Windows Hosts File)
To make your browser recognize `faq.local`, add an entry to your hosts file:
1. Open Notepad as **Administrator**.
2. Open `C:\Windows\System32\drivers\etc\hosts`.
3. Add this line at the bottom:
   ```text
   127.0.0.1  faq.local
   ```

> ✅ Open **[https://faq.local](https://faq.local)** in your browser.  
> *Note: Since the cert is self-signed, you will see a security warning. Click "Advanced" -> "Proceed to faq.local (unsafe)".*

---

## 11. Tuning the Similarity Threshold

The `SIMILARITY_THRESHOLD` (default: `0.75`) is the most important tuning parameter.

| Threshold | Behaviour |
|---|---|
| `0.90+` | Very strict — only near-identical questions match. Fewer false positives, more pending questions. |
| `0.75` | **Default** — good balance for general use. |
| `0.60` | More lenient — catches more variants, but may return loosely related answers. |
| `< 0.50` | Too broad — almost anything matches, poor answer quality. |

---

## 12. Security Considerations

| Risk | Mitigation |
|---|---|
| Admin panel exposed publicly | Add Entra ID auth (§9.1) or IP allowlist via reverse proxy |
| LLM prompt injection | System prompt instructs model to only use KB context; review answers for sensitive questions |
| API key leakage | Store `GOOGLE_API_KEY` in K8s Secret, never in git or ConfigMap |
| Unlimited pending questions | Add rate limiting: `npm install express-rate-limit` |
| SQLite not suited for high concurrency | Migrate to PostgreSQL for multi-user/multi-server deployments (§9.2) |

---

## 13. Roadmap Ideas

| Feature | Complexity | Impact |
|---|---|---|
| ✅ Docker containerisation | Done | — |
| ✅ Kubernetes (Rancher Desktop / k3s) | Done | — |
| ✅ Automated CI/CD (GitHub Actions) | Done | — |
| ✅ HTTPS & Custom Domain Support | Done | — |
| ✅ Microsoft Entra ID auth for admin | Done | — |
| Email notifications for pending questions | Low | 🟡 Medium |
| Confusion/Unanswered analytics dashboard | Medium | 🟡 Medium |
| Switch to pgvector + PostgreSQL | High | 🔴 High (Scale) |

---

*Last updated: 2026-02-22*
