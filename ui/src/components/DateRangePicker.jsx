import { Calendar, X } from 'lucide-react'
import { useTheme } from '../lib/theme'

const PRESETS = [
  { label: '7d',  days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: '1y',  days: 365 },
]

// Local-date formatter (YYYY-MM-DD in user's timezone). Avoids the UTC drift
// that toISOString() introduces — e.g. when it's 04:00 in Bangkok the UTC
// date is still "yesterday", so "1y to today" silently lost today's data.
const fmtLocal = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// value: { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' } | null
// onChange: called with same shape, or null to clear
export default function DateRangePicker({ value, onChange }) {
  const { dark } = useTheme()
  const today = fmtLocal(new Date())
  const active = !!value

  function applyPreset(days) {
    const to = new Date()
    const from = new Date(to.getTime() - days * 86400000)
    onChange({ from: fmtLocal(from), to: fmtLocal(to) })
  }

  function setFrom(from) {
    onChange({ from, to: value?.to || today })
  }

  function setTo(to) {
    onChange({ from: value?.from || today, to })
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Calendar size={12} style={{ color: active ? 'var(--c-accent)' : 'var(--c-text3)', flexShrink: 0 }} />

      {/* Preset buttons */}
      {PRESETS.map(p => {
        const isActive = active && (() => {
          const diff = Math.round((Date.now() - new Date(value.from).getTime()) / 86400000)
          return diff >= p.days - 1 && diff <= p.days + 1
        })()
        return (
          <button
            key={p.label}
            onClick={() => applyPreset(p.days)}
            className="px-2 py-0.5 text-[11px] transition"
            style={{
              border: isActive ? '1px solid var(--c-accent)' : '1px solid var(--c-border)',
              color: isActive ? 'var(--c-accent)' : 'var(--c-text2)',
              background: isActive ? 'rgba(99,102,241,0.1)' : 'transparent',
            }}
          >
            {p.label}
          </button>
        )
      })}

      {/* Custom date inputs */}
      <input
        type="date"
        value={value?.from || ''}
        max={value?.to || today}
        onChange={e => setFrom(e.target.value)}
        className="px-1.5 py-0.5 text-[11px] outline-none cursor-pointer"
        style={{
          background: 'var(--c-bg3)',
          color: 'var(--c-text)',
          border: '1px solid var(--c-border)',
          colorScheme: dark ? 'dark' : 'light',
        }}
      />
      <span className="text-[11px]" style={{ color: 'var(--c-text3)' }}>—</span>
      <input
        type="date"
        value={value?.to || ''}
        min={value?.from || ''}
        max={today}
        onChange={e => setTo(e.target.value)}
        className="px-1.5 py-0.5 text-[11px] outline-none cursor-pointer"
        style={{
          background: 'var(--c-bg3)',
          color: 'var(--c-text)',
          border: '1px solid var(--c-border)',
          colorScheme: dark ? 'dark' : 'light',
        }}
      />

      {/* Clear button */}
      {active && (
        <button
          onClick={() => onChange(null)}
          className="flex items-center gap-0.5 px-2 py-0.5 text-[11px] transition"
          style={{ border: '1px solid var(--c-accent)', color: 'var(--c-accent)' }}
        >
          <X size={9} /> clear
        </button>
      )}
    </div>
  )
}

