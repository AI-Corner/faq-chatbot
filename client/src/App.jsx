import { useState } from 'react'
import Chat from './pages/Chat'
import Admin from './pages/Admin'
import './App.css'

function App() {
  const [page, setPage] = useState('chat')

  return (
    <div className="app-container">
      <nav className="nav">
        <div className="nav-brand">
          <span className="nav-icon">🤖</span>
          <span>FAQ Chatbot</span>
        </div>
        <div className="nav-tabs">
          <button
            className={`nav-tab ${page === 'chat' ? 'active' : ''}`}
            onClick={() => setPage('chat')}
          >
            💬 Chat
          </button>
          <button
            className={`nav-tab ${page === 'admin' ? 'active' : ''}`}
            onClick={() => setPage('admin')}
          >
            🛠 Admin
          </button>
        </div>
      </nav>
      <main className="main-content">
        {page === 'chat' ? <Chat /> : <Admin />}
      </main>
    </div>
  )
}

export default App
