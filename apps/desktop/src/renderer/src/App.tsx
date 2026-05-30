import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import NavBar from './components/NavBar'
import LoginPage from './pages/LoginPage'
import LobbyPage from './pages/LobbyPage'
import PartnersPage from './pages/PartnersPage'
import CoachingPage from './pages/CoachingPage'
import LeaderboardPage from './pages/LeaderboardPage'
import SettingsPage from './pages/SettingsPage'
import { Loader2 } from 'lucide-react'

function AppRoutes() {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-dark-900">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-gold-400 animate-spin" />
          <p className="text-sm text-gray-500">Loading Duelr…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-dark-900">
      <NavBar />
      <main className="flex-1 overflow-auto">
        <Routes>
          <Route path="/" element={<Navigate to={user ? '/lobby' : '/login'} replace />} />
          <Route path="/login" element={user ? <Navigate to="/lobby" replace /> : <LoginPage />} />
          <Route path="/lobby" element={<LobbyPage />} />
          <Route path="/partners" element={<PartnersPage />} />
          <Route path="/coaching" element={<CoachingPage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
