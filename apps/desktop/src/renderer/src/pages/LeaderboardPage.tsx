import { useEffect, useState } from 'react'
import { Trophy, TrendingUp, TrendingDown, Minus, Loader2, RefreshCw } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import api from '../lib/api'

interface LeaderboardEntry {
  userId:     string
  riotId:     string
  region:     string
  wins:       number
  losses:     number
  winRate:    number
  totalGames: number
}

const MEDALS = ['🥇', '🥈', '🥉']

function WinRateIcon({ rate }: { rate: number }) {
  if (rate >= 0.55) return <TrendingUp  className="w-4 h-4 text-emerald-400" />
  if (rate <= 0.45) return <TrendingDown className="w-4 h-4 text-red-400" />
  return <Minus className="w-4 h-4 text-gray-500" />
}

export default function LeaderboardPage() {
  const { user } = useAuth()
  const [entries, setEntries]   = useState<LeaderboardEntry[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [lastFetch, setLastFetch] = useState<Date | null>(null)

  async function load() {
    setLoading(true)
    setError('')
    const { data, ok } = await api.get<{ leaderboard: LeaderboardEntry[] }>('/api/leaderboard')
    if (ok && data?.leaderboard) {
      setEntries(data.leaderboard)
      setLastFetch(new Date())
    } else {
      setError('Could not load leaderboard.')
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Trophy className="w-6 h-6 text-gold-400" />
          <div>
            <h1 className="text-xl font-bold text-white">Leaderboard</h1>
            <p className="text-xs text-gray-500">
              Ranked by confirmed 1v1 wins · minimum 3 reported games
            </p>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-200 px-2.5 py-1.5 rounded-lg hover:bg-white/5 transition-colors disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          {lastFetch && !loading && (
            <span>Updated {lastFetch.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          )}
        </button>
      </div>

      {/* Body */}
      {loading && entries.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-gold-400 animate-spin" />
        </div>
      ) : error ? (
        <div className="card text-center py-10 text-red-400 text-sm">{error}</div>
      ) : entries.length === 0 ? (
        <div className="card text-center py-12 space-y-2">
          <Trophy className="w-10 h-10 text-gray-700 mx-auto" />
          <p className="text-gray-400 font-medium">No confirmed results yet</p>
          <p className="text-sm text-gray-600">
            After a match, both players report the outcome to appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry, i) => {
            const isMe = user?.id === entry.userId
            return (
              <div
                key={entry.userId}
                className={`card flex items-center gap-4 py-3 transition-colors ${
                  isMe ? 'ring-1 ring-gold-400/40 bg-gold-400/5' : ''
                }`}
              >
                {/* Rank */}
                <div className="w-8 text-center flex-shrink-0">
                  {i < 3 ? (
                    <span className="text-lg leading-none">{MEDALS[i]}</span>
                  ) : (
                    <span className="text-sm font-bold text-gray-600">{i + 1}</span>
                  )}
                </div>

                {/* Identity */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-white truncate">
                    {entry.riotId}
                    {isMe && (
                      <span className="ml-2 text-xs text-gold-400 font-normal">you</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-600 uppercase tracking-wide">{entry.region}</p>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-5 text-sm flex-shrink-0">
                  <div className="text-center hidden sm:block">
                    <p className="font-bold text-white tabular-nums">{entry.wins}</p>
                    <p className="text-xs text-gray-600">Wins</p>
                  </div>
                  <div className="text-center hidden sm:block">
                    <p className="font-bold text-gray-400 tabular-nums">{entry.losses}</p>
                    <p className="text-xs text-gray-600">Losses</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <WinRateIcon rate={entry.winRate} />
                    <span className={`font-bold tabular-nums ${
                      entry.winRate >= 0.55 ? 'text-emerald-400'
                      : entry.winRate <= 0.45 ? 'text-red-400'
                      : 'text-gray-300'
                    }`}>
                      {Math.round(entry.winRate * 100)}%
                    </span>
                  </div>
                  <div className="text-center hidden md:block">
                    <p className="font-medium text-gray-400 tabular-nums">{entry.totalGames}</p>
                    <p className="text-xs text-gray-600">Games</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <p className="mt-6 text-xs text-gray-700 text-center">
        Results are self-reported and confirmed when both players agree.
        Disputed outcomes are excluded.
      </p>
    </div>
  )
}
