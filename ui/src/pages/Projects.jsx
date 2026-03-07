import { useState, useEffect } from 'react'
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement } from 'chart.js'
import { Doughnut, Bar } from 'react-chartjs-2'
import { Search, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { fetchProjects } from '../lib/api'
import { editorColor, editorLabel, formatNumber, formatDate, dateRangeToApiParams } from '../lib/constants'
import { useTheme } from '../lib/theme'
import KpiCard from '../components/KpiCard'
import DateRangePicker from '../components/DateRangePicker'

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement)

const MONO = 'JetBrains Mono, monospace'
const MODEL_COLORS = ['#6366f1', '#a78bfa', '#818cf8', '#c084fc', '#e879f9', '#f472b6', '#fb7185', '#f87171', '#fbbf24', '#34d399']

export default function Projects({ overview }) {
  const { dark } = useTheme()
  const txtColor = dark ? '#888' : '#555'
  const txtDim = dark ? '#555' : '#999'
  const gridColor = dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.06)'
  const [projects, setProjects] = useState(null)
  const [search, setSearch] = useState('')
  const [editorFilter, setEditorFilter] = useState('')
  const [dateRange, setDateRange] = useState(null)
  const navigate = useNavigate()
  const editors = overview?.editors || []

  useEffect(() => {
    fetchProjects(dateRangeToApiParams(dateRange)).then(setProjects)
  }, [dateRange])

  if (!projects) return <div className="text-sm py-12 text-center" style={{ color: 'var(--c-text2)' }}>loading projects...</div>

  const filtered = projects.filter(p => {
    if (editorFilter && !p.editors[editorFilter]) return false
    if (search && !p.folder.toLowerCase().includes(search.toLowerCase()) && !p.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const totalSessions = projects.reduce((s, p) => s + p.totalSessions, 0)
  const totalMessages = projects.reduce((s, p) => s + p.totalMessages, 0)
  const totalTokens = projects.reduce((s, p) => s + p.totalInputTokens + p.totalOutputTokens, 0)
  const totalTools = projects.reduce((s, p) => s + p.totalToolCalls, 0)

  // Aggregate model usage across all projects
  const globalModels = {}
  const globalEditors = {}
  for (const p of projects) {
    for (const m of p.topModels) globalModels[m.name] = (globalModels[m.name] || 0) + m.count
    for (const [e, c] of Object.entries(p.editors)) globalEditors[e] = (globalEditors[e] || 0) + c
  }
  const topGlobalModels = Object.entries(globalModels).sort((a, b) => b[1] - a[1]).slice(0, 10)
  const topGlobalEditors = Object.entries(globalEditors).sort((a, b) => b[1] - a[1])

  return (
    <div className="fade-in space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="projects" value={projects.length} />
        <KpiCard label="total sessions" value={formatNumber(totalSessions)} />
        <KpiCard label="total messages" value={formatNumber(totalMessages)} />
        <KpiCard label="total tokens" value={formatNumber(totalTokens)} />
      </div>

      {/* Global model & editor breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <h3 className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--c-text2)' }}>models across projects</h3>
          <div style={{ height: 240 }}>
            {topGlobalModels.length > 0 ? (
              <Doughnut
                data={{
                  labels: topGlobalModels.map(m => m[0]),
                  datasets: [{ data: topGlobalModels.map(m => m[1]), backgroundColor: MODEL_COLORS, borderWidth: 0 }],
                }}
                options={{
                  responsive: true, maintainAspectRatio: false, cutout: '55%',
                  plugins: {
                    legend: { position: 'right', labels: { color: txtColor, font: { size: 9, family: MONO }, usePointStyle: true, pointStyle: 'circle', padding: 8 } },
                    tooltip: { bodyFont: { family: MONO, size: 11 }, titleFont: { family: MONO, size: 11 } },
                  },
                }}
              />
            ) : <div className="text-xs text-center py-12" style={{ color: 'var(--c-text3)' }}>no model data</div>}
          </div>
        </div>
        <div className="card p-5">
          <h3 className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--c-text2)' }}>editors across projects</h3>
          <div style={{ height: 240 }}>
            <Bar
              data={{
                labels: topGlobalEditors.map(e => editorLabel(e[0])),
                datasets: [{
                  data: topGlobalEditors.map(e => e[1]),
                  backgroundColor: topGlobalEditors.map(e => editorColor(e[0])),
                  borderRadius: 4,
                }],
              }}
              options={{
                responsive: true, maintainAspectRatio: false,
                scales: {
                  x: { grid: { display: false }, ticks: { color: txtColor, font: { size: 9, family: MONO } } },
                  y: { grid: { color: gridColor }, ticks: { color: txtDim, font: { size: 9, family: MONO } } },
                },
                plugins: { legend: { display: false }, tooltip: { bodyFont: { family: MONO, size: 11 }, titleFont: { family: MONO, size: 11 } } },
              }}
            />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
          <select
            value={editorFilter}
            onChange={e => setEditorFilter(e.target.value)}
            className="px-2 py-1 text-[11px] outline-none"
            style={{ background: 'var(--c-bg3)', color: 'var(--c-text)', border: '1px solid var(--c-border)' }}
          >
            <option value="">All Editors</option>
            {editors.map(e => (
              <option key={e.id} value={e.id}>{editorLabel(e.id)}</option>
            ))}
          </select>
          <div className="relative max-w-sm flex-1">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--c-text3)' }} />
            <input
              type="text"
              placeholder="search projects..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1 text-[11px] outline-none"
              style={{ background: 'var(--c-bg3)', color: 'var(--c-text)', border: '1px solid var(--c-border)' }}
            />
          </div>
        <div className="ml-auto"><DateRangePicker value={dateRange} onChange={setDateRange} /></div>
      </div>

      {/* Project list */}
      <div className="space-y-2">
        {filtered.map(p => {
          const editorEntries = Object.entries(p.editors).sort((a, b) => b[1] - a[1])

          return (
            <div
              key={p.folder}
              className="card px-4 py-3 flex items-center gap-3 cursor-pointer transition"
              onClick={() => navigate(`/projects/detail?folder=${encodeURIComponent(p.folder)}`)}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate" style={{ color: 'var(--c-white)' }}>{p.name}</div>
                <div className="text-[10px] truncate" style={{ color: 'var(--c-text3)' }}>{p.folder}</div>
              </div>
              <div className="flex items-center gap-4 text-[10px] flex-shrink-0" style={{ color: 'var(--c-text2)' }}>
                <div className="flex items-center gap-1.5">
                  {editorEntries.slice(0, 4).map(([e]) => (
                    <span key={e} className="w-2 h-2 rounded-full" style={{ background: editorColor(e) }} title={editorLabel(e)} />
                  ))}
                </div>
                <span>{p.totalSessions} sessions</span>
                <span>{formatNumber(p.totalMessages)} msgs</span>
                {p.totalToolCalls > 0 && <span>{formatNumber(p.totalToolCalls)} tools</span>}
                {(p.totalInputTokens + p.totalOutputTokens) > 0 && <span>{formatNumber(p.totalInputTokens + p.totalOutputTokens)} tokens</span>}
                <span>{formatDate(p.lastSeen)}</span>
                <ChevronRight size={14} />
              </div>
            </div>
          )
        })}
      </div>

      {filtered.length === 0 && <div className="text-center py-12 text-sm" style={{ color: 'var(--c-text3)' }}>no projects found</div>}
    </div>
  )
}
