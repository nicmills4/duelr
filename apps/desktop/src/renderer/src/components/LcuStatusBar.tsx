import { useLcu } from '../hooks/useLcu'

export default function LcuStatusBar() {
  const { connected, summonerName, rankLabel, phase } = useLcu()

  const phaseLabel: Record<string, string> = {
    None: '',
    Lobby: 'In Lobby',
    Matchmaking: 'In Queue',
    ChampSelect: 'Champ Select',
    InProgress: 'In Game',
    EndOfGame: 'End of Game',
    PreEndOfGame: 'Game Over',
    WaitingForStats: 'Loading…',
  }

  const phaseStr = phase && phaseLabel[phase]

  if (!connected) {
    return (
      <div className="no-drag flex items-center gap-2 px-4 py-0.5 bg-dark-800/60 border-t border-white/5">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-600 flex-shrink-0" />
        <span className="text-xs text-gray-600">League not running</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 px-4 py-0.5 bg-dark-800/60 border-t border-white/5">
      <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0 animate-pulse" />
      <span className="text-xs text-emerald-400 font-medium">League connected</span>
      {summonerName && (
        <>
          <span className="text-gray-600 text-xs">·</span>
          <span className="text-xs text-gray-300">{summonerName}</span>
        </>
      )}
      {rankLabel && (
        <>
          <span className="text-gray-600 text-xs">·</span>
          <span className="text-xs text-gold-400">{rankLabel}</span>
        </>
      )}
      {phaseStr && (
        <>
          <span className="text-gray-600 text-xs">·</span>
          <span className="text-xs text-blue-400">{phaseStr}</span>
        </>
      )}
    </div>
  )
}
