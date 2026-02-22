import { useState } from 'react'
import { AuthenticatedTemplate, UnauthenticatedTemplate, useMsal, MsalAuthenticationTemplate } from '@azure/msal-react'
import { InteractionType } from '@azure/msal-browser'
import { loginRequest } from './authConfig'
import Chat from './pages/Chat'
import Admin from './pages/Admin'
import './App.css'

function App() {
  const [page, setPage] = useState(() => localStorage.getItem('faq_app_page') || 'chat')
  const { instance, accounts } = useMsal()

  const setPageWithPersist = (newPage) => {
    setPage(newPage)
    localStorage.setItem('faq_app_page', newPage)
  }

  const handleLogin = () => {
    // Ensure we remember to come back to the admin page
    localStorage.setItem('faq_app_page', 'admin')
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
        <div className="container nav-container">
          <div className="nav-brand">
            <span className="nav-icon">🤖</span>
            <span>FAQ Chatbot</span>
          </div>
          <div className="nav-tabs">
            <button
              className={`nav-tab ${page === 'chat' ? 'active' : ''}`}
              onClick={() => setPageWithPersist('chat')}
            >
              💬 Chat
            </button>
            <button
              className={`nav-tab ${page === 'admin' ? 'active' : ''}`}
              onClick={() => setPageWithPersist('admin')}
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
        </div>
      </nav>

      <main className="main-content">
        <div className="container main-container">
          {page === 'chat' && <Chat />}

          {page === 'admin' && (
            <MsalAuthenticationTemplate
              interactionType={InteractionType.Redirect}
              authenticationRequest={loginRequest}
              errorComponent={({ error }) => <p>Error: {error.errorMessage}</p>}
              loadingComponent={() => <div className="empty-state"><span className="spinner" /> Authenticating...</div>}
            >
              <Admin />
            </MsalAuthenticationTemplate>
          )}
        </div>
      </main>
    </div>
  )
}

export default App
