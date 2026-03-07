import { useState, useEffect, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Search } from 'lucide-react'
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement } from 'chart.js'
import { Doughnut, Bar } from 'react-chartjs-2'
import { fetchProjects, fetchChats } from '../lib/api'
import { editorColor, editorLabel, formatNumber, formatDate } from '../lib/constants'
import { useTheme } from '../lib/theme'
import KpiCard from '../components/KpiCard'
import EditorDot from '../components/EditorDot'
import ChatSidebar from '../components/ChatSidebar'

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement)

const MONO = 'JetBrains Mono, monospace'
const MODEL_COLORS = ['#6366f1', '#a78bfa', '#818cf8', '#c084fc', '#e879f9', '#f472b6', '#fb7185', '#f87171', '#fbbf24', '#34d399']

export default function ProjectDetail() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const folder = searchParams.get('folder')
  const { dark } = useTheme()
  const txtColor = dark ? '#888' : '#555'
  const txtDim = dark ? '#555' : '#999'
  const gridColor = dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.06)'

  const [project, setProject] = useState(null)
  const [chats, setChats] = useState([])
  const [loading, setLoading] = useState(true)
  const [chatSearch, setChatSearch] = useState('')
  const [selectedChatId, setSelectedChatId] = useState(null)

  useEffect(() => {
    if (!folder) return
    setLoading(true)
    Promise.all([
      fetchProjects(),
      fetchChats({ folder, limit: 1000 }),
    ]).then(([projects, chatData]) => {
      const match = projects.find(p => p.folder === folder)
      setProject(match || null)
      setChats(chatData.chats || [])
      setLoading(false)
    })
  }, [folder])

  const filteredChats = useMemo(() => {
    if (!chatSearch) return chats
    const q = chatSearch.toLowerCase()
    return chats.filter(c =>
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.topModel && c.topModel.toLowerCase().includes(q)) ||
      (c.source && c.source.toLowerCase().includes(q))
    )
  }, [chats, chatSearch])

  if (!folder) return <div className="text-sm py-12 text-center" style={{ color: 'var(--c-text3)' }}>no project specified</div>
  if (loading) return <div className="text-sm py-12 text-center" style={{ color: 'var(--c-text2)' }}>loading project...</div>
  if (!project) return <div className="text-sm py-12 text-center" style={{ color: 'var(--c-text3)' }}>project not found</div>

  const editorEntries = Object.entries(project.editors).sort((a, b) => b[1] - a[1])
  const maxEditorCount = editorEntries.length > 0 ? editorEntries[0][1] : 1

  return (
    <div className="fade-in space-y-5">
      {/* Back + title */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/projects')}
          className="flex items-center gap-1.5 text-xs transition"
          style={{ color: 'var(--c-text2)' }}
        >
          <ArrowLeft size={14} /> Projects
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold truncate" style={{ color: 'var(--c-white)' }}>{project.name}</h1>
          <div className="text-[10px] truncate" style={{ color: 'var(--c-text3)' }}>{project.folder}</div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <KpiCard label="sessions" value={project.totalSessions} />
        <KpiCard label="messages" value={formatNumber(project.totalMessages)} />
        <KpiCard label="tool calls" value={formatNumber(project.totalToolCalls)} />
        <KpiCard label="input tokens" value={formatNumber(project.totalInputTokens)} />
        <KpiCard label="output tokens" value={formatNumber(project.totalOutputTokens)} />
        <KpiCard label="active since" value={formatDate(project.firstSeen)} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Editors */}
        <div className="card p-4">
          <h3 className="text-[10px] uppercase tracking-wider mb-3" style={{ color: 'var(--c-text2)' }}>editors</h3>
          <div className="space-y-2">
            {editorEntries.map(([e, c]) => (
              <div key={e} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: editorColor(e) }} />
                <span className="text-xs flex-1 truncate" style={{ color: 'var(--c-text2)' }}>{editorLabel(e)}</span>
                <div className="w-20 h-3 overflow-hidden" style={{ background: 'var(--c-code-bg)' }}>
                  <div className="h-full" style={{ width: `${(c / maxEditorCount * 100).toFixed(0)}%`, background: editorColor(e) + '60' }} />
                </div>
                <span className="text-[10px] w-6 text-right" style={{ color: 'var(--c-text3)' }}>{c}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Models chart */}
        <div className="card p-4">
          <h3 className="text-[10px] uppercase tracking-wider mb-3" style={{ color: 'var(--c-text2)' }}>models</h3>
          {project.topModels.length > 0 ? (
            <div style={{ height: 180 }}>
              <Doughnut
                data={{
                  labels: project.topModels.map(m => m.name),
                  datasets: [{ data: project.topModels.map(m => m.count), backgroundColor: MODEL_COLORS, borderWidth: 0 }],
                }}
                options={{
                  responsive: true, maintainAspectRatio: false, cutout: '55%',
                  plugins: {
                    legend: { position: 'right', labels: { color: txtColor, font: { size: 8, family: MONO }, usePointStyle: true, pointStyle: 'circle', padding: 6 } },
                    tooltip: { bodyFont: { family: MONO, size: 10 }, titleFont: { family: MONO, size: 10 } },
                  },
                }}
              />
            </div>
          ) : <div className="text-[10px] py-8 text-center" style={{ color: 'var(--c-text3)' }}>no model data</div>}
        </div>

        {/* Top tools */}
        <div className="card p-4">
          <h3 className="text-[10px] uppercase tracking-wider mb-3" style={{ color: 'var(--c-text2)' }}>top tools</h3>
          {project.topTools.length > 0 ? (
            <div style={{ height: 180 }}>
              <Bar
                data={{
                  labels: project.topTools.map(t => t.name),
                  datasets: [{
                    data: project.topTools.map(t => t.count),
                    backgroundColor: 'rgba(99,102,241,0.4)',
                    borderRadius: 2,
                  }],
                }}
                options={{
                  responsive: true, maintainAspectRatio: false, indexAxis: 'y',
                  scales: {
                    x: { grid: { color: gridColor }, ticks: { color: txtDim, font: { size: 8, family: MONO } } },
                    y: { grid: { display: false }, ticks: { color: txtColor, font: { size: 8, family: MONO } } },
                  },
                  plugins: { legend: { display: false }, tooltip: { bodyFont: { family: MONO, size: 10 }, titleFont: { family: MONO, size: 10 } } },
                }}
              />
            </div>
          ) : <div className="text-[10px] py-8 text-center" style={{ color: 'var(--c-text3)' }}>no tool data</div>}
        </div>
      </div>

      {/* Token breakdown */}
      {(project.totalCacheRead > 0 || project.totalCacheWrite > 0) && (
        <div className="flex gap-4 text-[10px]" style={{ color: 'var(--c-text3)' }}>
          <span>cache read: {formatNumber(project.totalCacheRead)}</span>
          <span>cache write: {formatNumber(project.totalCacheWrite)}</span>
        </div>
      )}

      {/* Sessions list */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <h3 className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--c-text2)' }}>sessions ({chats.length})</h3>
          <div className="relative max-w-xs flex-1">
            <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--c-text3)' }} />
            <input
              type="text"
              placeholder="filter sessions..."
              value={chatSearch}
              onChange={e => setChatSearch(e.target.value)}
              className="w-full pl-7 pr-3 py-1 text-[11px] outline-none"
              style={{ background: 'var(--c-bg3)', color: 'var(--c-text)', border: '1px solid var(--c-border)' }}
            />
          </div>
        </div>

        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider" style={{ borderBottom: '1px solid var(--c-border)', color: 'var(--c-text3)' }}>
                <th className="text-left py-2.5 px-4 font-medium">editor</th>
                <th className="text-left py-2.5 px-4 font-medium">name</th>
                <th className="text-left py-2.5 px-4 font-medium">mode</th>
                <th className="text-left py-2.5 px-4 font-medium">model</th>
                <th className="text-left py-2.5 px-4 font-medium">updated</th>
              </tr>
            </thead>
            <tbody>
              {filteredChats.map(c => (
                <tr
                  key={c.id}
                  className="cursor-pointer transition"
                  style={{ borderBottom: '1px solid var(--c-border)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--c-bg3)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  onClick={() => setSelectedChatId(c.id)}
                >
                  <td className="py-2.5 px-4">
                    <EditorDot source={c.source} showLabel size={7} />
                  </td>
                  <td className="py-2.5 px-4 font-medium truncate max-w-[300px]" style={{ color: 'var(--c-white)' }}>
                    {c.name || <span style={{ color: 'var(--c-text3)' }}>(untitled)</span>}
                    {c.encrypted && <span className="ml-2 text-[10px] text-yellow-500/60">locked</span>}
                  </td>
                  <td className="py-2.5 px-4">
                    <span className="text-xs" style={{ color: 'var(--c-text2)' }}>{c.mode}</span>
                  </td>
                  <td className="py-2.5 px-4 text-xs truncate max-w-[180px] font-mono" style={{ color: 'var(--c-text2)' }} title={c.topModel || ''}>
                    {c.topModel || ''}
                  </td>
                  <td className="py-2.5 px-4 text-xs whitespace-nowrap" style={{ color: 'var(--c-text2)' }}>
                    {formatDate(c.lastUpdatedAt || c.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredChats.length === 0 && (
            <div className="text-center py-8 text-sm" style={{ color: 'var(--c-text3)' }}>no sessions found</div>
          )}
        </div>
      </div>

      {/* Chat sidebar */}
      <ChatSidebar chatId={selectedChatId} onClose={() => setSelectedChatId(null)} />
    </div>
  )
}
