import { useState, useEffect } from 'react'
import { Settings as SettingsIcon, EyeOff, Eye, FolderOpen, Search } from 'lucide-react'
import { fetchConfig, updateConfig, fetchAllProjects } from '../lib/api'
import { editorLabel, formatNumber, formatDate } from '../lib/constants'
import EditorIcon from '../components/EditorIcon'
import SectionTitle from '../components/SectionTitle'

export default function Settings() {
  const [config, setConfig] = useState(null)
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    Promise.all([fetchConfig(), fetchAllProjects()]).then(([cfg, projs]) => {
      setConfig(cfg)
      setProjects(projs)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading || !config) {
    return <div className="text-sm py-12 text-center" style={{ color: 'var(--c-text2)' }}>loading settings...</div>
  }

  const hiddenProjects = config.hiddenProjects || []

  const toggleProject = async (folder) => {
    setSaving(true)
    const isHidden = hiddenProjects.includes(folder)
    const updated = isHidden
      ? hiddenProjects.filter(f => f !== folder)
      : [...hiddenProjects, folder]
    const newConfig = await updateConfig({ hiddenProjects: updated })
    setConfig(newConfig)
    setSaving(false)
  }

  const filtered = projects.filter(p => {
    if (!search) return true
    const q = search.toLowerCase()
    return p.folder.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)
  })

  const sorted = [...filtered].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="fade-in space-y-4">
      <div className="flex items-center gap-1.5 text-[13px] font-bold" style={{ color: 'var(--c-white)' }}>
        <SettingsIcon size={14} style={{ color: '#6366f1' }} />
        Settings
      </div>

      <div className="card overflow-hidden">
        <div className="px-3 py-2 flex items-center justify-between" style={{ borderBottom: '1px solid var(--c-border)' }}>
          <SectionTitle>
            <FolderOpen size={11} className="inline mr-1" />
            projects ({projects.length})
          </SectionTitle>
          <div className="flex items-center gap-2">
            {hiddenProjects.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5" style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.15)' }}>
                {hiddenProjects.length} hidden
              </span>
            )}
            <div className="relative">
              <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2" style={{ color: 'var(--c-text3)' }} />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Filter projects..."
                className="pl-6 pr-2 py-1 text-[11px] outline-none w-[180px]"
                style={{ background: 'var(--c-bg3)', color: 'var(--c-text)', border: '1px solid var(--c-border)' }}
              />
            </div>
          </div>
        </div>
        <div className="text-[11px] px-3 py-1.5" style={{ color: 'var(--c-text3)', borderBottom: '1px solid var(--c-border)', background: 'var(--c-bg3)' }}>
          Hidden projects are excluded from all dashboard stats, sessions, costs, and analytics.
        </div>

        {sorted.map(p => (
          <ProjectRow key={p.folder} project={p} hidden={hiddenProjects.includes(p.folder)} onToggle={toggleProject} saving={saving} />
        ))}

        {sorted.length === 0 && (
          <div className="text-center py-6 text-[12px]" style={{ color: 'var(--c-text3)' }}>no projects match filter</div>
        )}
      </div>
    </div>
  )
}

function ProjectRow({ project: p, hidden, onToggle, saving }) {
  const editors = Object.entries(p.editors || {}).sort((a, b) => b[1] - a[1])

  return (
    <div
      className="flex items-center gap-3 px-3 py-2 transition"
      style={{
        borderBottom: '1px solid var(--c-border)',
        opacity: hidden ? 0.5 : 1,
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--c-bg3)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <button
        onClick={() => onToggle(p.folder)}
        disabled={saving}
        className="shrink-0 p-1 rounded transition hover:bg-[var(--c-bg)]"
        style={{ color: hidden ? '#ef4444' : 'var(--c-text3)', border: '1px solid var(--c-border)' }}
        title={hidden ? 'Show this project' : 'Hide this project'}
      >
        {hidden ? <EyeOff size={12} /> : <Eye size={12} />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-medium truncate" style={{ color: hidden ? 'var(--c-text3)' : 'var(--c-white)' }}>
          {p.name}
        </div>
        <div className="text-[10px] truncate" style={{ color: 'var(--c-text3)' }} title={p.folder}>
          {p.folder}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {editors.slice(0, 3).map(([src, count]) => (
          <span key={src} className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--c-text3)' }}>
            <EditorIcon source={src} size={10} />
            {count}
          </span>
        ))}
      </div>
      <div className="text-[11px] font-mono shrink-0" style={{ color: 'var(--c-text2)' }}>
        {formatNumber(p.totalSessions)}
      </div>
      <div className="text-[10px] shrink-0 w-[80px] text-right" style={{ color: 'var(--c-text3)' }}>
        {formatDate(p.lastSeen)}
      </div>
    </div>
  )
}
