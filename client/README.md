# FAQ Chatbot — Frontend

React + Vite frontend for the self-learning FAQ chatbot.

## Development

```bash
npm install
npm run dev -- --port 4173
```

Open **http://localhost:4173**

## Pages

| Page | Path | Description |
|---|---|---|
| Chat | `/` (default) | End-user chat interface |
| Admin | Click "🛠 Admin" in nav | Manage pending questions and knowledge base |

## Configuration

The frontend calls the backend at `http://localhost:4000`.  
If you change the backend port, update the `API` constant in:

- `src/pages/Chat.jsx`
- `src/pages/Admin.jsx`

## Build for Production

```bash
npm run build     # Output goes to dist/
npm run preview   # Preview the production build locally
```

## Tech Stack

- **React 19** — UI framework
- **Vite 7** — Build tool and dev server
- **Axios** — HTTP client

For full project docs, see the [root README](../README.md) and [ARCHITECTURE.md](../ARCHITECTURE.md).
