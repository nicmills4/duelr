import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import LcuStatusBar from './LcuStatusBar'
import { LogOut, Loader2, Swords } from 'lucide-react'
import { useState } from 'react'

export default function NavBar() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [loggingOut, setLoggingOut] = useState(false)

  async function handleLogout() {
    setLoggingOut(true)
    await logout()
    setLoggingOut(false)
    navigate('/login')
  }

  return (
    <header className="bg-dark-800 border-b border-dark-600 sticky top-0 z-40">
      {/* Main nav row */}
      <div className="flex items-center justify-between px-4 h-12">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 no-drag">
          <Swords className="w-5 h-5 text-gold-400" />
          <span className="font-bold text-white tracking-wide">
            Duel<span className="text-gold-400">r</span>
          </span>
        </Link>

        {/* Nav links */}
        <nav className="flex items-center gap-1 no-drag">
          <NavLink to="/lobby" current={location.pathname === '/lobby'}>Lobby</NavLink>
          <NavLink to="/partners" current={location.pathname === '/partners'}>Practice Partners</NavLink>
          <NavLink to="/coaching" current={location.pathname === '/coaching'}>Coaching</NavLink>
        </nav>

        {/* User section */}
        <div className="flex items-center gap-3 no-drag">
          {user ? (
            <>
              <span className="text-xs text-gray-400 hidden sm:block">
                {user.riotId}
              </span>
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className="btn-ghost flex items-center gap-1.5 text-sm"
                title="Log out"
              >
                {loggingOut
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <LogOut className="w-4 h-4" />}
                <span className="hidden sm:inline">Log out</span>
              </button>
            </>
          ) : (
            <Link to="/login" className="btn-secondary text-sm px-4 py-1.5">
              Log in
            </Link>
          )}
        </div>
      </div>

      {/* LCU status strip */}
      <LcuStatusBar />
    </header>
  )
}

function NavLink({
  to, current, children,
}: { to: string; current: boolean; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
        current
          ? 'bg-dark-700 text-gold-400'
          : 'text-gray-400 hover:text-gray-100 hover:bg-dark-700'
      }`}
    >
      {children}
    </Link>
  )
}
