import { useState } from 'react'
import {
  Swords, Loader2, UserPlus, Crown, LogOut, CheckCircle,
  Copy, Check, ExternalLink, Shield, AlertTriangle,
} from 'lucide-react'
import { useLcu } from '../hooks/useLcu'
import ChampionSelector from './ChampionSelector'
import api from '../lib/api'
import { ELO_BRACKETS, type EloBracket } from '../lib/constants'
import type { Champion, LobbyGroup, GroupSlot, SlotKey } from '../lib/lobby-types'
import { ALL_SLOTS, SLOT_ROLE, userSlotIn, groupIsFull } from '../lib/lobby-types'

// Result of a group filling up — drives the "Group Ready" takeover screen.
export interface GroupReady {
  team1:            GroupSlot[]
  team2:            GroupSlot[]
  voiceChannelUrl?: string
  readyGroupId?:    string
  hostUserId?:      string
  joinUrl?:         string
}

const bracketLabelFor = (v: string) =>
  ELO_BRACKETS.find((b) => b.value === v)?.label ?? v

// ── Create group form ───────────────────────────────────────────────────────────

export function GroupCreateForm({
  champions, creating, error, onCreate,
}: {
  champions: Champion[]
  creating:  boolean
  error:     string
  onCreate:  (slotKey: SlotKey, champId: string, elo: EloBracket) => void
}) {
  const [slot, setSlot] = useState<SlotKey>('team1_adc')
  const [champ, setChamp] = useState('')
  const [elo, setElo] = useState<EloBracket>('mid')

  return (
    <>
      <div>
        <h2 className="text-lg font-bold text-white">Create a 2v2 Group</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Pick your role and champion. Three slots will be open for others to join.
        </p>
      </div>

      <div>
        <span className="label">My slot</span>
        <div className="grid grid-cols-2 gap-2">
          {(['team1_adc', 'team1_support', 'team2_adc', 'team2_support'] as SlotKey[]).map((k) => {
            const role  = SLOT_ROLE[k]
            const team  = k.startsWith('team1') ? 'Team 1' : 'Team 2'
            const label = `${team} · ${role === 'adc' ? 'ADC' : 'Support'}`
            return (
              <button key={k} type="button" onClick={() => setSlot(k)}
                className={`rounded-lg border p-2.5 text-left text-sm transition-all ${
                  slot === k
                    ? 'border-gold-400 bg-gold-400/10 text-gold-400'
                    : 'border-dark-600 text-gray-400 hover:border-gray-500'
                }`}>
                <span className="font-medium">{label}</span>
              </button>
            )
          })}
        </div>
      </div>

      <ChampionSelector label="My champion" value={champ} onChange={setChamp} champions={champions} />

      <div>
        <span className="label">Elo bracket</span>
        <div className="grid grid-cols-3 gap-2">
          {ELO_BRACKETS.map((b) => (
            <button key={b.value} type="button" onClick={() => setElo(b.value)}
              className={`rounded-lg border p-2.5 text-left transition-all ${
                elo === b.value
                  ? 'border-gold-400 bg-gold-400/10 text-gold-400'
                  : 'border-dark-600 text-gray-300 hover:border-gray-500'
              }`}>
              <div className="font-semibold text-sm">{b.label}</div>
              <div className="text-xs opacity-60">{b.description}</div>
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button onClick={() => onCreate(slot, champ, elo)} disabled={!champ || creating}
        className="btn-primary w-full flex items-center justify-center gap-2">
        {creating
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</>
          : <><Shield className="w-4 h-4" /> Create Group</>}
      </button>
    </>
  )
}

// ── Slot cell ─────────────────────────────────────────────────────────────────

function SlotCell({
  slot, role, isMe, canJoin, joining, onJoin,
}: {
  slot:    GroupSlot | null
  role:    'adc' | 'support'
  isMe:    boolean
  canJoin: boolean
  joining: boolean
  onJoin:  () => void
}) {
  const roleLabel = role === 'adc' ? 'ADC' : 'Support'
  const roleColor = role === 'adc' ? 'text-blue-400' : 'text-emerald-400'
  const roleBg    = role === 'adc' ? 'bg-blue-400/10 border-blue-400/20' : 'bg-emerald-400/10 border-emerald-400/20'

  if (slot) {
    return (
      <div className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border ${isMe ? 'border-gold-400/40 bg-gold-400/5' : 'border-dark-600 bg-dark-700/50'}`}>
        <div className="w-9 h-9 rounded-full ring-1 ring-dark-500 overflow-hidden">
          <img src={slot.champImage} alt={slot.champName} width={36} height={36} className="scale-110 object-cover w-full h-full" />
        </div>
        <p className="text-[10px] font-semibold text-white truncate max-w-[72px] text-center leading-tight">
          {slot.riotId.split('#')[0]}
        </p>
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${roleColor} bg-dark-700`}>
          {roleLabel}
          {isMe && ' · You'}
          {slot.isHost && !isMe && ' · Host'}
        </span>
      </div>
    )
  }

  return (
    <div className={`flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-xl border border-dashed ${roleBg} min-h-[92px]`}>
      <span className={`text-[10px] font-semibold ${roleColor}`}>{roleLabel}</span>
      {canJoin ? (
        <button onClick={onJoin} disabled={joining}
          className="flex items-center gap-1 text-[10px] text-gray-300 hover:text-white border border-dark-500 hover:border-gray-400 bg-dark-700 hover:bg-dark-600 rounded-lg px-2 py-1 transition-all disabled:opacity-50">
          {joining ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <UserPlus className="w-2.5 h-2.5" />}
          Join
        </button>
      ) : (
        <span className="text-[10px] text-gray-700">Open</span>
      )}
    </div>
  )
}

// ── Group card (an open joinable group) ─────────────────────────────────────────

export function GroupCard({
  group, userId, champions, canJoin, joiningSlot, onJoinSlot,
}: {
  group:       LobbyGroup
  userId:      string | null
  champions:   Champion[]
  canJoin:     boolean
  joiningSlot: SlotKey | null
  onJoinSlot:  (slotKey: SlotKey, champId: string) => void
}) {
  const mySlot = userSlotIn(group, userId ?? '')
  const isFull = groupIsFull(group)
  const [champPick,  setChampPick]  = useState<Partial<Record<SlotKey, string>>>({})
  const [pickingFor, setPickingFor] = useState<SlotKey | null>(null)

  const slotPairs: [SlotKey, SlotKey][] = [['team1_adc', 'team2_adc'], ['team1_support', 'team2_support']]

  function handleSlotClick(key: SlotKey) {
    if (!canJoin || mySlot) return
    setPickingFor(key)
  }

  function confirmJoin(key: SlotKey) {
    const champ = champPick[key]
    if (!champ) return
    onJoinSlot(key, champ)
    setPickingFor(null)
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Swords className="w-4 h-4 text-gold-400" />
          <span className="text-sm font-semibold text-white">2v2 Bot Lane</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
            isFull ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-dark-700 text-gray-500 border-dark-600'
          }`}>
            {isFull ? 'Full' : `${ALL_SLOTS.filter((k) => group[k]).length}/4`}
          </span>
        </div>
        <span className="text-xs text-gray-500">{bracketLabelFor(group.eloBracket)}</span>
      </div>

      <div className="space-y-1.5">
        <div className="grid grid-cols-2 gap-1.5 text-center">
          <p className="text-[9px] text-gray-600 uppercase tracking-wide font-semibold">Team 1</p>
          <p className="text-[9px] text-gray-600 uppercase tracking-wide font-semibold">Team 2</p>
        </div>
        {slotPairs.map(([left, right]) => (
          <div key={left} className="grid grid-cols-2 gap-1.5">
            {([left, right] as SlotKey[]).map((key) => (
              <SlotCell
                key={key}
                slot={group[key]}
                role={SLOT_ROLE[key]}
                isMe={group[key]?.userId === userId}
                canJoin={canJoin && !mySlot && !group[key]}
                joining={joiningSlot === key}
                onJoin={() => handleSlotClick(key)}
              />
            ))}
          </div>
        ))}
      </div>

      {pickingFor && (
        <div className="border border-dark-600 rounded-xl bg-dark-700/60 p-3 space-y-2">
          <p className="text-xs text-gray-400 font-medium">
            Pick your champion for{' '}
            <span className="text-white">{SLOT_ROLE[pickingFor] === 'adc' ? 'ADC' : 'Support'}</span>
          </p>
          <ChampionSelector
            label=""
            value={champPick[pickingFor] ?? ''}
            onChange={(v) => setChampPick((p) => ({ ...p, [pickingFor]: v }))}
            champions={champions}
          />
          <div className="flex gap-2">
            <button
              onClick={() => confirmJoin(pickingFor)}
              disabled={!champPick[pickingFor] || joiningSlot === pickingFor}
              className="btn-primary flex-1 text-xs py-2 flex items-center justify-center gap-1.5"
            >
              {joiningSlot === pickingFor
                ? <><Loader2 className="w-3 h-3 animate-spin" /> Joining…</>
                : <><UserPlus className="w-3 h-3" /> Join Slot</>}
            </button>
            <button onClick={() => setPickingFor(null)} className="btn-secondary px-3 py-2 text-xs">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── My group panel (status while waiting for it to fill) ────────────────────────

export function MyGroupPanel({
  group, userId, onLeave, leaving,
}: { group: LobbyGroup; userId: string; onLeave: () => void; leaving: boolean }) {
  const filled = ALL_SLOTS.filter((k) => group[k]).length
  const mySlot = userSlotIn(group, userId)
  const imHost = mySlot ? group[mySlot]?.isHost : false

  return (
    <div className="card space-y-3 ring-1 ring-gold-400/20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="relative flex-shrink-0">
            <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3 z-10">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
            </span>
            <Swords className="w-8 h-8 text-gold-400" />
          </div>
          <div>
            <p className="font-semibold text-white text-sm">
              Your 2v2 Group
              {imHost && <Crown className="inline w-3 h-3 text-gold-400 ml-1" />}
            </p>
            <p className="text-xs text-gray-400">{bracketLabelFor(group.eloBracket)} · {filled}/4 players</p>
          </div>
        </div>
        <button onClick={onLeave} disabled={leaving}
          className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 rounded-lg px-3 py-2 transition-colors">
          {leaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <LogOut className="w-3 h-3" />}
          {imHost ? 'Disband' : 'Leave'}
        </button>
      </div>
      {filled < 4 && (
        <p className="text-xs text-gray-500">
          Waiting for {4 - filled} more player{4 - filled !== 1 ? 's' : ''} to join…
        </p>
      )}
    </div>
  )
}

// ── Group ready takeover screen (with host-generated invite link) ───────────────

export function GroupReadyScreen({
  ready, userId, onJoinUrl, onDone,
}: {
  ready:     GroupReady
  userId:    string | null
  onJoinUrl: (url: string) => void
  onDone:    () => void
}) {
  const lcu = useLcu()
  const isHost = !!ready.hostUserId && ready.hostUserId === userId

  const [creating, setCreating] = useState(false)
  const [error, setError]       = useState('')
  const [copied, setCopied]     = useState(false)

  async function handleCreateLobby() {
    if (!ready.readyGroupId) return
    setCreating(true)
    setError('')
    const result = await window.duelr.lcu.createLobby()
    if (!result.created) {
      setError(result.error ?? 'Not in a custom game lobby. Create one in League first, then click here.')
    } else if (result.joinUrl) {
      onJoinUrl(result.joinUrl)
      navigator.clipboard.writeText(result.joinUrl).catch(() => {})
      api.post('/api/lobby/group/lobby-url', { readyGroupId: ready.readyGroupId, joinUrl: result.joinUrl }).catch(() => {})
    } else {
      setError('Custom game created in League! Join URL unavailable — invite your team from inside League.')
    }
    setCreating(false)
  }

  return (
    <div className="card max-w-lg mx-auto space-y-5">
      <div className="flex items-center justify-center gap-2 text-emerald-400">
        <CheckCircle className="w-6 h-6" />
        <h2 className="text-xl font-bold">Group Ready!</h2>
      </div>
      <p className="text-sm text-gray-400 text-center">All 4 players are in. Create a custom game!</p>

      {([['Team 1', ready.team1], ['Team 2', ready.team2]] as [string, GroupSlot[]][]).map(([label, team]) => (
        <div key={label} className="bg-dark-700 border border-dark-600 rounded-xl p-4 space-y-3">
          <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">{label}</p>
          {team.map((s) => (
            <div key={s.userId} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full ring-1 ring-dark-500 overflow-hidden flex-shrink-0">
                <img src={s.champImage} alt={s.champName} width={32} height={32} className="scale-110 object-cover w-full h-full" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-white truncate">{s.riotId}</p>
                  <button
                    onClick={() => { navigator.clipboard.writeText(s.riotId); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                    className="text-gray-500 hover:text-gray-300 flex-shrink-0" title="Copy Riot ID"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-xs text-gray-400">{s.champName} · {s.role.toUpperCase()}</p>
              </div>
            </div>
          ))}
        </div>
      ))}

      {/* ── Custom game invite link — the host generates it; everyone else receives it ── */}
      {ready.joinUrl ? (
        <div className="bg-dark-700 border border-emerald-800/40 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wide">
            {isHost ? 'Custom Game Join Link — sent to your group automatically' : 'Custom Game Join Link'}
          </p>
          <div className="flex items-center gap-2 bg-dark-800 border border-dark-600 rounded-lg px-3 py-2">
            <span className="text-xs text-gray-300 flex-1 truncate font-mono">{ready.joinUrl}</span>
            <button
              onClick={() => { navigator.clipboard.writeText(ready.joinUrl!); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
              className="text-gold-400 hover:text-gold-300 flex-shrink-0" title="Copy join link"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          {!isHost && (
            <button onClick={() => window.duelr.shell.openExternal(ready.joinUrl!)}
              className="btn-primary w-full flex items-center justify-center gap-2 text-sm">
              <ExternalLink className="w-4 h-4" /> Join Custom Game
            </button>
          )}
        </div>
      ) : isHost ? (
        <div className="space-y-3">
          <div className="bg-dark-700 border border-gold-400/30 rounded-lg p-3 space-y-2">
            <p className="text-xs font-semibold text-gold-400 uppercase tracking-wide">You&apos;re the host</p>
            <ol className="space-y-1.5">
              <li className="flex items-start gap-2 text-xs text-gray-300">
                <span className="text-gold-400 font-bold shrink-0">1.</span>
                <span>In League, click <span className="font-semibold text-gray-100">Play → Custom Game</span></span>
              </li>
              <li className="flex items-start gap-2 text-xs text-gray-300">
                <span className="text-gold-400 font-bold shrink-0">2.</span>
                <span>Click <span className="font-semibold text-gray-100">Create</span> and set up a Summoner's Rift lobby</span>
              </li>
              <li className="flex items-start gap-2 text-xs text-gray-300">
                <span className="text-gold-400 font-bold shrink-0">3.</span>
                <span>Click the button below — your group receives the link automatically</span>
              </li>
            </ol>
          </div>
          {lcu.connected ? (
            <button onClick={handleCreateLobby} disabled={creating}
              className="btn-primary w-full text-sm flex items-center justify-center gap-2">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Swords className="w-4 h-4" />}
              {creating ? 'Fetching join link…' : 'Get Custom Game Join Link'}
            </button>
          ) : (
            <div className="bg-dark-700 border border-gold-400/30 rounded-lg p-3 space-y-1">
              <p className="text-xs font-semibold text-gold-400 uppercase tracking-wide">League client not detected</p>
              <p className="text-xs text-gray-300">Start League, create a <span className="font-semibold text-gray-100">Custom Game</span> lobby, then return here to generate the link.</p>
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-400 bg-red-950/20 border border-red-900/30 rounded-lg px-3 py-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-gold-400/10 border border-gold-400/40 rounded-lg p-3 flex items-center gap-3 animate-pulse-slow">
          <Loader2 className="w-6 h-6 text-gold-400 animate-spin flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gold-400">Waiting for the host…</p>
            <p className="text-xs text-gray-400 mt-0.5">The host is creating the custom game — the join link will appear here automatically.</p>
          </div>
        </div>
      )}

      {ready.voiceChannelUrl && (
        <button onClick={() => window.duelr.discord.joinVoice(ready.voiceChannelUrl!)}
          className="btn-secondary w-full flex items-center justify-center gap-2 text-sm">
          <ExternalLink className="w-4 h-4" /> Join Discord Voice
        </button>
      )}
      <button onClick={onDone} className="btn-secondary w-full">
        Back to Lobby
      </button>
    </div>
  )
}
