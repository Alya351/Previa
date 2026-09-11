import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import Login from './pages/login.jsx'
import Admin from './pages/admin.jsx'
import Camera from './pages/camera.jsx'
import Resume from './pages/resume.tsx'

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
  return connecte ? children : <Navigate to="/login" replace />
}

function App() {
  return (
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
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

export default App
