import { Swords, LogIn } from 'lucide-react'
import type { LobbyPlayer, Champion } from '../lib/lobby-types'

interface Props {
  player: LobbyPlayer
  isGuest: boolean
  isSelf: boolean
  isBusy: boolean
  champions: Champion[]
  onChallenge: (player: LobbyPlayer) => void
}

const BRACKET_LABELS: Record<string, string> = {
  low: 'Low Elo', mid: 'Mid Elo', high: 'High Elo', elite: 'Elite', apex: 'Apex',
}

export default function PlayerCard({
  player, isGuest, isSelf, isBusy, champions, onChallenge,
}: Props) {
  const accepts = player.acceptsType ?? 'any'
  const acceptsLabel =
    accepts === 'melee' ? 'Melee only' :
    accepts === 'ranged' ? 'Ranged only' : 'Any opponent'

  const vsChamps = (player.vsChampions ?? []).slice(0, 5)

  return (
    <div className={`card flex items-center gap-4 transition-all ${isSelf ? 'ring-1 ring-gold-400/30' : ''}`}>
      {/* Champion portrait */}
      <div className="flex-shrink-0">
        <div className="w-12 h-12 rounded-full ring-2 ring-dark-600 overflow-hidden">
          <img
            src={player.champImage}
            alt={player.champName}
            width={48}
            height={48}
            className="scale-110 object-cover w-full h-full"
          />
        </div>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="font-semibold text-white truncate">{player.riotId}</span>
          {isSelf && (
            <span className="text-[10px] text-gold-400 font-semibold uppercase tracking-wide">You</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap mt-0.5">
          <span className="text-xs text-gray-400">{player.champName}</span>
          <span className="text-gray-700 text-xs">·</span>
          <span className="text-xs text-gray-400">
            {BRACKET_LABELS[player.eloBracket] ?? player.eloBracket}
          </span>
          <span className="text-gray-700 text-xs">·</span>
          <span className="text-xs text-gray-400">{acceptsLabel}</span>
        </div>

        {/* Preferred matchups */}
        {vsChamps.length > 0 && (
          <div className="mt-1.5 space-y-0.5">
            <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide">
              Preferred Matchups
            </p>
            <div className="flex items-center gap-1 flex-wrap">
              {vsChamps.map((champId) => {
                const champ = champions.find((c) => c.id === champId)
                if (!champ) return null
                return (
                  <div
                    key={champId}
                    className="w-6 h-6 rounded-full ring-1 ring-dark-600 overflow-hidden"
                    title={champ.name}
                  >
                    <img
                      src={champ.imageUrl}
                      alt={champ.name}
                      width={24}
                      height={24}
                      className="scale-110 object-cover w-full h-full"
                    />
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Action */}
      {!isSelf && (
        <div className="flex-shrink-0">
          {isGuest ? (
            <a href="/login" className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5">
              <LogIn className="w-3.5 h-3.5" />
              Log in
            </a>
          ) : (
            <button
              onClick={() => onChallenge(player)}
              disabled={isBusy}
              className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-40"
            >
              <Swords className="w-3.5 h-3.5" />
              Challenge
            </button>
          )}
        </div>
      )}
    </div>
  )
}
