import { useState } from 'react'
import { AuthenticatedTemplate, UnauthenticatedTemplate, useMsal, MsalAuthenticationTemplate } from '@azure/msal-react'
import { InteractionType } from '@azure/msal-browser'
import { loginRequest } from './authConfig'
import Chat from './pages/Chat'
import Admin from './pages/Admin'
import './App.css'

function App() {
  const [page, setPage] = useState('chat')
  const { instance, accounts } = useMsal()

  const handleLogin = () => {
    instance.loginRedirect(loginRequest).catch(e => console.error(e))
  }

  const handleLogout = () => {
    instance.logoutRedirect({
      postLogoutRedirectUri: window.location.origin
    }).catch(e => console.error(e))
  }

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

        <AuthenticatedTemplate>
          <div className="nav-user">
            <span>{accounts[0]?.name}</span>
            <button onClick={handleLogout} className="btn-logout">Logout</button>
          </div>
        </AuthenticatedTemplate>
      </nav>

      <main className="main-content">
        {page === 'chat' && <Chat />}

        {page === 'admin' && (
          <>
            <AuthenticatedTemplate>
              <Admin />
            </AuthenticatedTemplate>
            <UnauthenticatedTemplate>
              <div className="auth-placeholder">
                <h2>Admin Access Required</h2>
                <p>Please sign in with your corporate account to manage the knowledge base.</p>
                <button className="btn-login" onClick={handleLogin}>
                  Sign in with Microsoft
                </button>
              </div>
            </UnauthenticatedTemplate>
          </>
        )}
      </main>
    </div>
  )
}

export default App
