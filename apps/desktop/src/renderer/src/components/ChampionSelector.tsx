import { useState, useEffect, useRef } from 'react'
import { Search, X } from 'lucide-react'
import type { Champion } from '../lib/lobby-types'

interface Props {
  label?: string
  value: string          // DDragon ID or ''
  onChange: (id: string) => void
  champions: Champion[]
  placeholder?: string
  disabled?: boolean
}

export default function ChampionSelector({
  label, value, onChange, champions, placeholder = 'Select champion…', disabled,
}: Props) {
  const [query, setQuery]   = useState('')
  const [open, setOpen]     = useState(false)
  const ref                 = useRef<HTMLDivElement>(null)

  const selected = champions.find((c) => c.id === value)

  const filtered = query
    ? champions.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
    : champions

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  function clear(e: React.MouseEvent) {
    e.stopPropagation()
    onChange('')
    setQuery('')
  }

  return (
    <div ref={ref} className="relative">
      {label && <label className="label">{label}</label>}

      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(!open)}
        className="input flex items-center gap-3 text-left cursor-pointer"
      >
        {selected ? (
          <>
            <div className="w-8 h-8 rounded-full ring-1 ring-gold-400 overflow-hidden flex-shrink-0">
              <img
                src={selected.imageUrl}
                alt={selected.name}
                width={32}
                height={32}
                className="scale-110 object-cover w-full h-full"
              />
            </div>
            <span className="font-medium">{selected.name}</span>
            {!disabled && (
              <X className="ml-auto w-4 h-4 text-gray-500 hover:text-gray-300" onClick={clear} />
            )}
          </>
        ) : (
          <span className="text-gray-500">{placeholder}</span>
        )}
      </button>

      {open && (
        <div className="absolute z-50 w-full mt-1 bg-dark-700 border border-dark-600 rounded-xl shadow-2xl overflow-hidden">
          <div className="p-2 border-b border-dark-600">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                autoFocus
                type="text"
                placeholder="Search…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full bg-dark-800 border border-dark-600 rounded-lg pl-9 pr-3 py-2 text-sm
                           text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-gold-400"
              />
            </div>
          </div>

          <ul className="max-h-60 overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="px-4 py-3 text-sm text-gray-500 text-center">No results</li>
            ) : (
              filtered.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-dark-600 transition-colors text-left"
                    onClick={() => { onChange(c.id); setOpen(false); setQuery('') }}
                  >
                    <img
                      src={c.imageUrl}
                      alt={c.name}
                      width={28}
                      height={28}
                      className="rounded-full w-7 h-7 object-cover flex-shrink-0"
                    />
                    <span className="text-sm font-medium">{c.name}</span>
                    <span className="ml-auto text-xs text-gray-600">
                      {c.isRanged ? 'Ranged' : 'Melee'}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
