import React, { Component } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import Login from './pages/login.jsx'
import Admin from './pages/admin.jsx'
import Camera from './pages/camera.jsx'
import Resume from './pages/resume.tsx'
import Reboot from './pages/reboot.jsx'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('Previa ErrorBoundary caught:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#091124',
            color: '#ffffff',
            fontFamily: "'Inter', sans-serif",
            padding: '24px',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: '60px',
              height: '60px',
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1.5px solid rgba(239, 68, 68, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '16px',
            }}
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#ef4444"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 700, margin: '0 0 8px 0', color: '#ffffff' }}>
            Une interruption temporaire d'affichage est survenue
          </h2>
          <p style={{ fontSize: '0.88rem', color: '#94a3b8', maxWidth: '420px', lineHeight: 1.5, margin: '0 0 20px 0' }}>
            L'application Previa a rencontré une anomalie d'affichage. Vos flux caméras et données restent protégés.
          </p>
          <button
            onClick={() => {
              window.location.reload()
            }}
            style={{
              padding: '12px 24px',
              borderRadius: '12px',
              background: '#0284c7',
              color: '#ffffff',
              border: 'none',
              fontSize: '0.9rem',
              fontWeight: 700,
              cursor: 'pointer',
              minHeight: '44px',
              boxShadow: '0 4px 14px rgba(2, 132, 199, 0.35)',
            }}
          >
            Recharger l'application
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// Login (pages/login.jsx) attend un simple callback `onLoginSuccess` —
// ce petit wrapper le connecte à la navigation react-router réelle
// (Login pose déjà les bonnes clés sessionStorage lui-même, voir son
// handleSubmit).
function LoginPage() {
  const navigate = useNavigate()
  return <Login onLoginSuccess={() => navigate('/admin', { replace: true })} />
}

// Interface reprise de /home/rakine/osc/web (composants dans
// pages/components/, tout le reste fusionné dans pages/admin.jsx et
// pages/login.jsx — voir leurs docstrings) — remplace l'ancienne
// interface "verre" (admin.jsx, defaultAdmin.jsx, login.jsx,
// inscriptionAdmin.jsx d'origine, entièrement supprimés, pas juste
// laissés non routés). /admin ET /default-admin pointent vers le MÊME
// composant : la distinction super-admin/admin normal vit à l'intérieur
// (onglet "Organisation", voir Admin() dans pages/admin.jsx), pas dans
// des routes séparées — /default-admin reste une adresse valide pour ne
// pas casser les redirections existantes.

// Garde minimale : lit le marqueur de session posé par login.jsx après
// une connexion réussie (voir sa docstring — pas une vraie session
// serveur, juste assez pour qu'un lien direct sans être passé par le
// login redirige là-bas).
function RequireAuth({ children }) {
  const connecte = sessionStorage.getItem('previa_connecte') === 'oui'
  const token = sessionStorage.getItem('previa_token')
  if (!connecte || !token) {
    sessionStorage.clear()
    return <Navigate to="/login" replace />
  }
  return children
}

function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/admin"
          element={
            <RequireAuth>
              <Admin />
            </RequireAuth>
          }
        />
        <Route
          path="/default-admin"
          element={
            <RequireAuth>
              <Admin />
            </RequireAuth>
          }
        />
        {/* Pas de garde ici, comme l'ancien frontend/web/cam/ — pensée
            pour tourner sur l'appareil physique qui filme, pas forcément
            un poste admin connecté. */}
        <Route path="/camera" element={<Camera />} />
        {/* Pas de garde non plus : point d'entrée de navigation générale,
            utile aussi pour rejoindre /login sans le connaître par cœur. */}
        <Route path="/resume" element={<Resume />} />
        {/* Pas de garde -- VOLONTAIRE : voir la docstring de pages/reboot.jsx,
            pensée pour le cas où justement plus personne ne peut se
            connecter. */}
        <Route path="/reboot" element={<Reboot />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </ErrorBoundary>
  )
}

export default App
