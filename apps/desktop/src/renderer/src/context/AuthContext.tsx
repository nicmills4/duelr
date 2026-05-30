import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import api from '../lib/api'

export interface AuthUser {
  id: string
  riotId: string
  region: string
  accountType: 'guest' | 'full'
  isPremium?: boolean
  emailVerified?: boolean
}

interface AuthContextValue {
  user: AuthUser | null
  isLoading: boolean
  loginGuest: (riotId: string, region: string) => Promise<boolean | string>
  loginFull: (email: string, password: string) => Promise<boolean | string>
  logout: () => Promise<void>
  /** Re-fetch /api/me and update the stored user with latest isPremium/emailVerified. */
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const USER_STORAGE_KEY = 'duelr:user'

function loadStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as AuthUser
  } catch {
    return null
  }
}

function saveUser(user: AuthUser | null) {
  if (user) {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user))
  } else {
    localStorage.removeItem(USER_STORAGE_KEY)
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // On mount: check if there's a stored user and if the session cookie is still valid
  useEffect(() => {
    async function checkSession() {
      const stored = loadStoredUser()
      if (!stored) { setIsLoading(false); return }

      // Try to refresh the full profile (isPremium, emailVerified may have changed).
      const { data, ok, status } = await api.get<AuthUser>('/api/me')
      if (ok && data?.id) {
        const refreshed: AuthUser = { ...stored, ...data }
        setUser(refreshed)
        saveUser(refreshed)
      } else if (status === 401) {
        // Session expired — log out
        saveUser(null)
      } else {
        // /api/me unavailable (404, 500, network error) — trust the stored session
        // and fall back to rank endpoint to verify the cookie is still valid.
        const { status: rankStatus } = await api.get('/api/me/rank')
        if (rankStatus === 401) {
          saveUser(null)
        } else {
          setUser(stored)
        }
      }
      setIsLoading(false)
    }
    checkSession()
  }, [])

  async function loginGuest(riotId: string, region: string): Promise<boolean | string> {
    const { data, ok } = await api.post<{ user?: AuthUser; userId?: string; riotId?: string; error?: string }>
      ('/api/auth/login', { riotId, region })
    if (!ok) return (data as { error?: string })?.error ?? 'Login failed'

    const u: AuthUser = {
      id: data.userId ?? data.user?.id ?? '',
      riotId: data.riotId ?? data.user?.riotId ?? riotId,
      region,
      accountType: 'guest',
    }
    setUser(u)
    saveUser(u)
    return true
  }

  async function loginFull(email: string, password: string): Promise<boolean | string> {
    const { data, ok } = await api.post<{ user?: AuthUser; userId?: string; riotId?: string; error?: string }>
      ('/api/auth/login-email', { email, password })
    if (!ok) return (data as { error?: string })?.error ?? 'Login failed'

    const u: AuthUser = {
      id: data.userId ?? data.user?.id ?? '',
      riotId: data.riotId ?? data.user?.riotId ?? '',
      region: data.user?.region ?? 'na1',
      accountType: 'full',
      isPremium:     data.user?.isPremium,
      emailVerified: data.user?.emailVerified,
    }
    setUser(u)
    saveUser(u)
    return true
  }

  async function logout(): Promise<void> {
    await api.post('/api/auth/logout')
    setUser(null)
    saveUser(null)
    // Signal the login page not to auto-login this session even if saved creds exist.
    // sessionStorage is cleared when the app closes, so auto-login resumes on next launch.
    sessionStorage.setItem('duelr:explicit-logout', '1')
  }

  async function refreshProfile(): Promise<void> {
    const { data, ok } = await api.get<AuthUser>('/api/me')
    if (ok && data?.id) {
      setUser((prev) => {
        const refreshed = prev ? { ...prev, ...data } : data
        saveUser(refreshed)
        return refreshed
      })
    }
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, loginGuest, loginFull, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
