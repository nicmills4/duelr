import { useState } from 'react'
import { useLcu } from '../hooks/useLcu'

/**
 * The live Solo/Duo ranked crest from the League client (LCU), shown beside the
 * lobby header. Art comes from Community Dragon (version-less) and is hidden if
 * it 404s or the player is unranked / the client isn't connected.
 *
 * Sizing note: the `emblem-{tier}.png` is a wide 2560×1440 image whose crest
 * fills only ~31% of the height amid transparent padding, so at a normal size
 * it renders tiny. We render it oversized inside a fixed `overflow-hidden` box
 * so the crest itself fills the box and the padding is cropped away.
 */

const rankEmblemUrl = (tier: string) =>
  `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-emblem/emblem-${tier.toLowerCase()}.png`

const titleCase = (s: string) =>
  s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s

// Visible crest height (px); the emblem is scaled up by 1/0.31 to fill it.
const CREST_H = 72
const CREST_FILL = 0.31

export function RankCrest() {
  const { connected, rank } = useLcu()
  const [failed, setFailed] = useState(false)
  if (!connected || !rank || failed) return null

  const label = `${titleCase(rank.tier)} ${rank.division}`.trim()
  const games = rank.wins + rank.losses
  const winRate = games > 0 ? Math.round((rank.wins / games) * 100) : 0
  const wrColor =
    games === 0 ? 'text-gray-500' : winRate >= 50 ? 'text-emerald-400' : 'text-red-400'

  return (
    <div className="flex items-center gap-3" title={`${label} · ${rank.lp} LP`}>
      {/* Crest — zoom-cropped to fill the box (the emblem art is mostly transparent padding) */}
      <span
        className="relative inline-block shrink-0 overflow-hidden"
        style={{ height: CREST_H, width: Math.round(CREST_H * 1.5) }}
      >
        <img
          src={rankEmblemUrl(rank.tier)}
          alt={label}
          style={{ height: Math.round(CREST_H / CREST_FILL) }}
          className="absolute left-1/2 top-1/2 w-auto max-w-none -translate-x-1/2 -translate-y-1/2"
          onError={() => setFailed(true)}
        />
      </span>

      {/* Rank label + record */}
      <div className="leading-tight">
        <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
          Ranked Solo / Duo
        </p>
        <p className="text-sm font-semibold text-white">
          {label} <span className="font-normal text-gray-400">· {rank.lp} LP</span>
        </p>
        <p className="text-xs text-gray-400">
          {rank.wins}W {rank.losses}L
          <span className="text-gray-600"> · </span>
          <span className={wrColor}>{winRate}% WR</span>
        </p>
      </div>
    </div>
  )
}
