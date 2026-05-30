import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import LcuStatusBar from './LcuStatusBar'
import { LogOut, Loader2, Swords, Minus, Square, X } from 'lucide-react'
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
    <header className="drag-region bg-dark-700 border-b border-white/5 shadow-lg shadow-black/40 sticky top-0 z-40">
      {/* Main nav row */}
      <div className="flex items-center justify-between px-4 h-11">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 no-drag group">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-gold-400/10 group-hover:bg-gold-400/20 transition-colors">
            <Swords className="w-4 h-4 text-gold-400" />
          </div>
          <span className="font-bold text-white tracking-wide text-sm">
            Duel<span className="text-gold-400">r</span>
          </span>
        </Link>

        {/* Nav links */}
        <nav className="flex items-center gap-0.5 no-drag">
          <NavLink to="/lobby" current={location.pathname === '/lobby'}>Lobby</NavLink>
          <NavLink to="/partners" current={location.pathname === '/partners'}>Practice Partners</NavLink>
          <NavLink to="/coaching" current={location.pathname === '/coaching'}>Coaching</NavLink>
          <NavLink to="/leaderboard" current={location.pathname === '/leaderboard'}>Leaderboard</NavLink>
        </nav>

        {/* User section + window controls */}
        <div className="flex items-center no-drag">
          {/* User info & logout */}
          <div className="flex items-center gap-2 pr-3">
            {user ? (
              <>
                <span className="text-xs text-gray-500 hidden sm:block max-w-[120px] truncate">
                  {user.riotId}
                </span>
                <div className="w-px h-4 bg-white/10" />
                <button
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-200 px-2 py-1 rounded-md hover:bg-white/5 transition-colors disabled:opacity-50"
                  title="Log out"
                >
                  {loggingOut
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <LogOut className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">Log out</span>
                </button>
              </>
            ) : null}
          </div>

          {/* Window controls */}
          <div className="flex items-stretch h-11 border-l border-white/5">
            <button
              onClick={() => window.duelr.window.minimize()}
              className="w-11 flex items-center justify-center text-gray-500 hover:text-gray-200 hover:bg-white/5 transition-colors"
              title="Minimize"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => window.duelr.window.maximize()}
              className="w-11 flex items-center justify-center text-gray-500 hover:text-gray-200 hover:bg-white/5 transition-colors"
              title="Maximize"
            >
              <Square className="w-3 h-3" />
            </button>
            <button
              onClick={() => window.duelr.window.close()}
              className="w-11 flex items-center justify-center text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              title="Close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
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
      className={`relative px-3 py-1.5 text-sm font-medium transition-colors rounded-md ${
        current
          ? 'text-gold-400'
          : 'text-gray-500 hover:text-gray-200 hover:bg-white/5'
      }`}
    >
      {children}
      {current && (
        <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-gold-400" />
      )}
    </Link>
  )
}
