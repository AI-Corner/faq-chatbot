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
10. [Tuning the Similarity Threshold](#10-tuning-the-similarity-threshold)
11. [Security Considerations](#11-security-considerations)
12. [Roadmap Ideas](#12-roadmap-ideas)

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
├── faq.db                    # Auto-created SQLite database (gitignored)
├── .env                      # Environment variables (gitignored)
├── .env.example              # Template for new developers
├── package.json
├── ARCHITECTURE.md           # This file
│
└── client/                   # React + Vite frontend
    ├── index.html
    ├── vite.config.js
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

> **Note on embeddings storage:** Embeddings are stored as JSON text in SQLite for simplicity. For production with 10,000+ entries, migrate to PostgreSQL with `pgvector` for native vector indexing (see §9.2).

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

### Seed Initial Knowledge Base

You can pre-populate the KB using the API:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:4000/api/kb" `
  -Method Post `
  -Body '{"question":"What are your support hours?","answer":"Our support team is available Monday to Friday, 9am–6pm IST."}' `
  -ContentType "application/json"
```

Or use the **Admin → Knowledge Base → Add New Entry** form in the UI.

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

#### Step 5 — Protect the Admin Tab

In `App.jsx`, wrap the Admin route:

```jsx
import { AuthenticatedTemplate, UnauthenticatedTemplate, useMsal } from '@azure/msal-react'
import { loginRequest } from './authConfig'

// In your App component:
const { instance } = useMsal()
const handleLogin = () => instance.loginPopup(loginRequest)

// Replace Admin tab content:
{page === 'admin' && (
  <>
    <AuthenticatedTemplate>
      <Admin />
    </AuthenticatedTemplate>
    <UnauthenticatedTemplate>
      <div style={{padding:'2rem', textAlign:'center'}}>
        <p>Admin access requires sign-in.</p>
        <button onClick={handleLogin}>Sign in with Microsoft</button>
      </div>
    </UnauthenticatedTemplate>
  </>
)}
```

#### Step 6 — Validate Token on Backend (Optional but Recommended)

Install:
```bash
npm install jwks-rsa jsonwebtoken
```

Create `middleware/auth.js`:

```js
const jwt = require('jsonwebtoken')
const jwksClient = require('jwks-rsa')

const client = jwksClient({
  jwksUri: `https://login.microsoftonline.com/<TENANT_ID>/discovery/v2.0/keys`
})

function getKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    callback(err, key?.getPublicKey())
  })
}

module.exports = function requireAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ error: 'Unauthorised' })

  jwt.verify(token, getKey, {
    audience: '<CLIENT_ID>',
    issuer: `https://login.microsoftonline.com/<TENANT_ID>/v2.0`,
  }, (err, decoded) => {
    if (err) return res.status(401).json({ error: 'Invalid token' })
    req.user = decoded
    next()
  })
}
```

Apply to admin routes in `index.js`:

```js
const requireAuth = require('./middleware/auth')

app.get('/api/kb',          requireAuth, ...)
app.post('/api/kb',         requireAuth, ...)
app.get('/api/pending',     requireAuth, ...)
// etc.
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

#### Step 4 — Install Node.js pg Driver

```bash
npm install pg
npm uninstall better-sqlite3
```

#### Step 5 — Update `db.js` similarity query

```js
const { Pool } = require('pg')
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function findTopMatches(queryEmbedding, topN = 3, threshold = 0.75) {
  const vecString = `[${queryEmbedding.join(',')}]`
  const result = await pool.query(`
    SELECT id, question, answer, 1 - (embedding <=> $1::vector) AS score
    FROM knowledge_base
    WHERE 1 - (embedding <=> $1::vector) >= $2
    ORDER BY score DESC
    LIMIT $3
  `, [vecString, threshold, topN])
  return result.rows
}
```

---

### 9.3 Adding Multi-Tenancy Support

Support multiple teams/departments with isolated knowledge bases.

#### Schema Change

```sql
ALTER TABLE knowledge_base     ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE pending_questions  ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';
```

#### API Change

Pass `tenantId` in all requests and filter queries:

```js
// In /api/chat handler
const { question, sessionId, tenantId = 'default' } = req.body

// In db.js findTopMatches
WHERE tenant_id = ? AND ...
```

#### Frontend Change

Store `tenantId` in environment or user session (extracted from Entra ID token's `tid` or a custom claim).

---

### 9.4 Adding Email Notifications for Pending Questions

Notify admins when a user question cannot be answered automatically.

#### Install Nodemailer

```bash
npm install nodemailer
```

#### Add to `.env`

```env
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=noreply@yourcompany.com
SMTP_PASS=your-app-password
ADMIN_EMAIL=team@yourcompany.com
```

#### Create `mailer.js`

```js
const nodemailer = require('nodemailer')

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
})

async function notifyAdminNewQuestion(question) {
  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to: process.env.ADMIN_EMAIL,
    subject: '❓ New unanswered FAQ question',
    html: `
      <h3>A user asked a question your FAQ bot couldn't answer:</h3>
      <blockquote style="border-left:3px solid #6366f1;padding-left:1rem;">
        ${question}
      </blockquote>
      <p><a href="http://localhost:4173/?page=admin">Open Admin Panel →</a></p>
    `,
  })
}

module.exports = { notifyAdminNewQuestion }
```

#### Hook into `/api/chat` in `index.js`

```js
const { notifyAdminNewQuestion } = require('./mailer')

// In the "no match" branch:
const pendingId = db.addPendingQuestion(question, sessionId)
await notifyAdminNewQuestion(question) // ← add this line
```

---

### 9.5 Improving Answer Quality with Re-ranking

After retrieving top-K matches by cosine similarity, add a **cross-encoder re-ranking** step to pick the most relevant context.

**Option A — Use Gemini itself as a judge:**

```js
async function rerankWithLLM(question, candidates) {
  const model = genAI.getGenerativeModel({ model: MODEL_NAME })
  const prompt = `Given the user question: "${question}"
  
  Rank the following KB entries from most to least relevant (return only IDs in JSON array):
  ${candidates.map(c => `ID ${c.id}: ${c.question}`).join('\n')}
  
  Response format: [id1, id2, ...]`
  
  const result = await model.generateContent(prompt)
  const order = JSON.parse(result.response.text())
  return order.map(id => candidates.find(c => c.id === id)).filter(Boolean)
}
```

**Option B — Use a Cohere Rerank API** (higher quality, external dependency):

```bash
npm install cohere-ai
```

---

### 9.6 Containerising with Docker

#### `Dockerfile` (backend)

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 4000
CMD ["node", "index.js"]
```

#### `client/Dockerfile`

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
```

#### `docker-compose.yml`

```yaml
version: '3.9'
services:
  server:
    build: .
    ports:
      - "4000:4000"
    environment:
      - GOOGLE_API_KEY=${GOOGLE_API_KEY}
      - SIMILARITY_THRESHOLD=0.75
    volumes:
      - ./faq.db:/app/faq.db   # persist DB

  client:
    build: ./client
    ports:
      - "80:80"
    depends_on:
      - server
```

```bash
docker compose up --build
```

---

## 10. Tuning the Similarity Threshold

The `SIMILARITY_THRESHOLD` (default: `0.75`) is the most important tuning parameter.

| Threshold | Behaviour |
|---|---|
| `0.90+` | Very strict — only near-identical questions match. Fewer false positives, more pending questions. |
| `0.75` | **Default** — good balance for general use. |
| `0.60` | More lenient — catches more variants, but may return loosely related answers. |
| `< 0.50` | Too broad — almost anything matches, poor answer quality. |

**Tip:** Check the `sources` field in the chat response (shown in the UI) to see similarity scores and calibrate accordingly.

---

## 11. Security Considerations

| Risk | Mitigation |
|---|---|
| Admin panel exposed publicly | Add Entra ID auth (§9.1) or IP allowlist via reverse proxy |
| LLM prompt injection | System prompt instructs model to only use KB context; review answers for sensitive questions |
| API key leakage | Store `GOOGLE_API_KEY` in `.env`, add `.env` to `.gitignore` |
| Unlimited pending questions | Add rate limiting: `npm install express-rate-limit` |
| SQLite not suited for high concurrency | Migrate to PostgreSQL for multi-user/multi-server deployments (§9.2) |

### Rate Limiting Example

```js
const rateLimit = require('express-rate-limit')

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 20,              // 20 requests per IP per minute
  message: { error: 'Too many requests, please slow down.' }
})

app.post('/api/chat', chatLimiter, async (req, res) => { ... })
```

---

## 12. Roadmap Ideas

| Feature | Complexity | Impact |
|---|---|---|
| Microsoft Entra ID auth for admin | Medium | 🔴 High (Security) |
| Email notifications for pending questions | Low | 🟡 Medium |
| Confidence score shown to user | Low | 🟡 Medium |
| Question clustering (auto-group similar pending questions) | Medium | 🟡 Medium |
| Export KB to JSON/CSV | Low | 🟢 Low |
| Multi-language support | Medium | 🟡 Medium |
| Switch to pgvector + PostgreSQL | High | 🔴 High (Scale) |
| Analytics dashboard (top questions, unanswered rate) | Medium | 🟡 Medium |
| Webhook integration (Teams / Slack) | Medium | 🟡 Medium |
| Fine-tuned embedding model on domain data | High | 🔴 High (Quality) |

---

*Last updated: 2026-02-22*
