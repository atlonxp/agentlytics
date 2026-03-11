import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plug, Server, Wrench, Terminal, Globe, FolderOpen, Search, ChevronDown, ChevronRight, Hash, Layers, ArrowUpRight, Ban, BarChart3 } from 'lucide-react'
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement } from 'chart.js'
import { Doughnut, Bar } from 'react-chartjs-2'
import { fetchMCPs } from '../lib/api'
import { editorColor, editorLabel, formatNumber } from '../lib/constants'
import EditorIcon from '../components/EditorIcon'
import AnimatedLoader from '../components/AnimatedLoader'
import SectionTitle from '../components/SectionTitle'
import KpiCard from '../components/KpiCard'
import PageHeader from '../components/PageHeader'
import { useTheme } from '../lib/theme'

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement)

const MONO = 'JetBrains Mono, monospace'
const CHART_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#3b82f6', '#a855f7', '#14b8a6', '#f43f5e', '#84cc16', '#06b6d4', '#e879f9', '#fb923c']

function ServerCard({ server, matchedTools }) {
  const [open, setOpen] = useState(false)
  const matched = matchedTools || []
  const totalCalls = matched.reduce((s, t) => s + t.count, 0)
  const queriedTools = server.tools || []
  const hasContent = queriedTools.length > 0 || matched.length > 0

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => hasContent && setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[var(--c-bg3)] transition"
      >
        <div className="flex items-center justify-center w-6 h-6" style={{ background: `${editorColor(server.editor)}15` }}>
          <Server size={11} style={{ color: editorColor(server.editor) }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] font-semibold truncate" style={{ color: 'var(--c-white)' }}>{server.name}</span>
            <span className="text-[10px] px-1 py-px" style={{
              background: server.scope === 'global' ? 'rgba(99,102,241,0.12)' : 'rgba(34,197,94,0.12)',
              color: server.scope === 'global' ? '#818cf8' : '#22c55e',
            }}>{server.scope}</span>
            <span className="text-[10px] px-1 py-px" style={{
              background: server.transport === 'stdio' ? 'rgba(234,179,8,0.12)' : 'rgba(59,130,246,0.12)',
              color: server.transport === 'stdio' ? '#eab308' : '#3b82f6',
            }}>{server.transport}</span>
            {server.disabled && <span className="text-[10px] px-1 py-px" style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>disabled</span>}
          </div>
          <div className="flex items-center gap-2 mt-px">
            <span className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--c-text3)' }}>
              <EditorIcon source={server.editor} size={10} />
              {server.editorLabel}
            </span>
            {server.command && (
              <span className="text-[10px] truncate" style={{ color: 'var(--c-text3)', fontFamily: MONO }}>
                {server.command} {(server.args || []).slice(0, 2).join(' ')}
              </span>
            )}
            {server.url && (
              <span className="flex items-center gap-1 text-[10px] truncate" style={{ color: 'var(--c-text3)' }}>
                <Globe size={9} />{server.url}
              </span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          {totalCalls > 0 && <div className="text-[12px] font-semibold" style={{ color: 'var(--c-white)' }}>{formatNumber(totalCalls)}</div>}
          <div className="text-[10px]" style={{ color: 'var(--c-text3)' }}>
            {queriedTools.length > 0 ? `${queriedTools.length} tools` : 'offline'}
            {matched.length > 0 ? ` · ${matched.length} matched` : ''}
          </div>
        </div>
        {hasContent ? (open ? <ChevronDown size={12} style={{ color: 'var(--c-text3)' }} /> : <ChevronRight size={12} style={{ color: 'var(--c-text3)' }} />) : <div className="w-3" />}
      </button>
      {open && hasContent && (
        <div className="px-3 pb-2 pt-1" style={{ borderTop: '1px solid var(--c-border)' }}>
          {queriedTools.length > 0 && (
            <div className="mb-1.5">
              <div className="text-[10px] font-medium mb-0.5" style={{ color: 'var(--c-text3)' }}>
                <Wrench size={9} className="inline mr-0.5" />Available ({queriedTools.length})
              </div>
              <div className="flex flex-wrap gap-0.5">
                {queriedTools.map(t => (
                  <span key={t} className="text-[10px] px-1 py-px" style={{ background: 'var(--c-bg3)', color: 'var(--c-text3)', fontFamily: MONO }}>{t}</span>
                ))}
              </div>
            </div>
          )}
          {matched.length > 0 && (
            <div>
              <div className="text-[10px] font-medium mb-0.5" style={{ color: 'var(--c-text3)' }}>
                <Hash size={9} className="inline mr-0.5" />Matched Calls
              </div>
              <div className="space-y-0.5">
                {matched.map(t => (
                  <div key={t.name} className="flex items-center justify-between py-0.5 px-1.5" style={{ background: 'var(--c-bg3)' }}>
                    <span className="text-[10px] truncate" style={{ fontFamily: MONO, color: 'var(--c-text)' }}>{t.name}</span>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="text-[10px]" style={{ color: 'var(--c-text3)' }}>{t.sessionCount}s</span>
                      <span className="text-[11px] font-semibold" style={{ color: 'var(--c-white)' }}>{formatNumber(t.count)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function MCPs() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('servers') // servers | tools | sessions
  const [toolProjectFilter, setToolProjectFilter] = useState('')
  const [toolServerFilter, setToolServerFilter] = useState('')
  const { dark } = useTheme()
  const txtColor = dark ? '#a0a0a0' : '#444'
  const txtDim = dark ? '#555' : '#999'
  const gridColor = dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.06)'
  const legendColor = dark ? '#9ca3af' : '#555'

  useEffect(() => {
    fetchMCPs().then(d => { setData(d); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const filteredServers = useMemo(() => {
    if (!data) return []
    const q = search.toLowerCase()
    return data.servers.filter(s =>
      !q || s.name.toLowerCase().includes(q) || s.editor.toLowerCase().includes(q) || (s.command || '').toLowerCase().includes(q)
    )
  }, [data, search])

  // Resolve tool name → matched server name
  const toolServerMap = useMemo(() => {
    if (!data) return {}
    const map = {}
    for (const [serverName, tools] of Object.entries(data.matchedTools || {})) {
      for (const t of tools) map[t.name] = serverName
    }
    return map
  }, [data])

  // Unique projects and servers for filter dropdowns
  const toolFilterOptions = useMemo(() => {
    if (!data) return { projects: [], servers: [] }
    const projectSet = new Set()
    const serverSet = new Set()
    for (const t of data.toolCalls) {
      for (const f of (t.folders || [])) projectSet.add(f)
      const sn = toolServerMap[t.name]
      if (sn) serverSet.add(sn); else serverSet.add('__builtin__')
    }
    return {
      projects: [...projectSet].sort((a, b) => a.split('/').pop().localeCompare(b.split('/').pop())),
      servers: [...serverSet].filter(s => s !== '__builtin__').sort(),
      hasBuiltIn: serverSet.has('__builtin__'),
    }
  }, [data, toolServerMap])

  const filteredTools = useMemo(() => {
    if (!data) return []
    const q = search.toLowerCase()
    return data.toolCalls.filter(t => {
      if (q && !t.name.toLowerCase().includes(q)) return false
      if (toolProjectFilter && !(t.folders || []).includes(toolProjectFilter)) return false
      if (toolServerFilter === '__builtin__' && toolServerMap[t.name]) return false
      if (toolServerFilter && toolServerFilter !== '__builtin__' && toolServerMap[t.name] !== toolServerFilter) return false
      return true
    })
  }, [data, search, toolProjectFilter, toolServerFilter, toolServerMap])

  const filteredSessions = useMemo(() => {
    if (!data) return []
    const q = search.toLowerCase()
    return data.topSessions.filter(s =>
      !q || (s.name || '').toLowerCase().includes(q) || s.source.toLowerCase().includes(q) || (s.folder || '').toLowerCase().includes(q)
    )
  }, [data, search])

  // Group servers by editor
  const serversByEditor = useMemo(() => {
    const groups = {}
    for (const s of filteredServers) {
      if (!groups[s.editor]) groups[s.editor] = []
      groups[s.editor].push(s)
    }
    return groups
  }, [filteredServers])

  // ── Chart data computations ──

  // Most used MCP servers — stacked by editor
  const mostUsedServersChart = useMemo(() => {
    if (!data) return null
    // Group calls by server name + editor
    const serverCalls = {} // { serverName: { editor: count, ... } }
    for (const s of data.servers) {
      const matched = data.matchedTools[s.name] || []
      const calls = matched.reduce((sum, t) => sum + t.count, 0)
      if (calls === 0) continue
      if (!serverCalls[s.name]) serverCalls[s.name] = {}
      serverCalls[s.name][s.editor] = (serverCalls[s.name][s.editor] || 0) + calls
    }
    // Sort by total calls descending
    const sorted = Object.entries(serverCalls)
      .map(([name, byEditor]) => ({ name, byEditor, total: Object.values(byEditor).reduce((s, v) => s + v, 0) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
    if (sorted.length === 0) return null
    // Collect all editors that appear
    const allEditors = [...new Set(sorted.flatMap(s => Object.keys(s.byEditor)))]
    return {
      labels: sorted.map(s => s.name),
      datasets: allEditors.map(ed => ({
        label: editorLabel(ed),
        data: sorted.map(s => s.byEditor[ed] || 0),
        backgroundColor: editorColor(ed) + 'CC',
        borderRadius: 2,
      })),
    }
  }, [data])

  // Never used MCP servers (no matched tool calls)
  const neverUsedServers = useMemo(() => {
    if (!data) return []
    return data.servers.filter(s => {
      const matched = data.matchedTools[s.name] || []
      return matched.length === 0
    })
  }, [data])

  // Most used MCP tools (only those matched to a server)
  const mostUsedMcpTools = useMemo(() => {
    if (!data) return []
    const allMatched = []
    for (const [serverName, tools] of Object.entries(data.matchedTools)) {
      for (const t of tools) allMatched.push({ ...t, server: serverName })
    }
    return allMatched.sort((a, b) => b.count - a.count).slice(0, 12)
  }, [data])

  // Never used MCP tools (queried from server but no matching calls)
  const neverUsedMcpTools = useMemo(() => {
    if (!data) return []
    const matchedToolNames = new Set()
    for (const tools of Object.values(data.matchedTools)) {
      for (const t of tools) matchedToolNames.add(t.name)
    }
    const unused = []
    for (const s of data.servers) {
      const sTools = s.tools || []
      if (sTools.length === 0) continue
      for (const toolName of sTools) {
        if (!matchedToolNames.has(toolName)) {
          unused.push({ name: toolName, server: s.name, editor: s.editor })
        }
      }
    }
    return unused
  }, [data])

  // Servers by editor (for doughnut)
  const serversByEditorChart = useMemo(() => {
    if (!data) return null
    const counts = {}
    for (const s of data.servers) {
      const lbl = editorLabel(s.editor)
      counts[lbl] = (counts[lbl] || 0) + 1
    }
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1])
    if (entries.length === 0) return null
    return {
      labels: entries.map(e => e[0]),
      colors: entries.map(e => {
        const srv = data.servers.find(s => editorLabel(s.editor) === e[0])
        return srv ? editorColor(srv.editor) : '#666'
      }),
      values: entries.map(e => e[1]),
    }
  }, [data])

  // Servers by transport (for doughnut)
  const serversByTransport = useMemo(() => {
    if (!data) return null
    const counts = {}
    for (const s of data.servers) counts[s.transport] = (counts[s.transport] || 0) + 1
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1])
    if (entries.length === 0) return null
    const tColors = { stdio: '#eab308', http: '#3b82f6', sse: '#a855f7' }
    return {
      labels: entries.map(e => e[0]),
      colors: entries.map(e => tColors[e[0]] || '#666'),
      values: entries.map(e => e[1]),
    }
  }, [data])

  if (loading) return <AnimatedLoader label="Loading MCP data..." />

  if (!data) return (
    <div className="text-center py-20 text-[13px]" style={{ color: 'var(--c-text3)' }}>
      Failed to load MCP data
    </div>
  )

  const { summary, matchedTools } = data
  const tabs = [
    { id: 'servers', label: 'Servers', count: data.servers.length },
    { id: 'tools', label: 'Tools', count: data.toolCalls.length },
    { id: 'sessions', label: 'Sessions', count: data.topSessions.length },
  ]

  return (
    <div className="fade-in space-y-3">
      <PageHeader icon={Plug} title="MCPs" />

      {/* KPIs */}
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))' }}>
        <KpiCard label="servers" value={summary.totalServers} sub={`${summary.editorsWithServers.length} editors`} />
        <KpiCard label="unique tools" value={formatNumber(summary.uniqueTools)} />
        <KpiCard label="tool calls" value={formatNumber(summary.totalToolCalls)} />
        <KpiCard label="sessions" value={formatNumber(summary.sessionsWithTools)} />
        <KpiCard label="matched" value={Object.values(matchedTools).reduce((s, arr) => s + arr.length, 0)} sub={`${Object.keys(matchedTools).length} servers`} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
        {/* Most Used MCP Servers — stacked horizontal bar by editor */}
        <div className="card p-3">
          <SectionTitle>most used servers <span style={{ color: 'var(--c-text3)' }}>(by editor)</span></SectionTitle>
          {mostUsedServersChart ? (
            <div style={{ height: Math.max(mostUsedServersChart.labels.length * 22 + 10, 80) }}>
              <Bar
                data={mostUsedServersChart}
                options={{
                  indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                  scales: {
                    x: { stacked: true, grid: { color: gridColor }, ticks: { color: txtDim, font: { size: 9, family: MONO } } },
                    y: { stacked: true, grid: { display: false }, ticks: { color: txtColor, font: { size: 9, family: MONO } } },
                  },
                  plugins: {
                    legend: { position: 'top', labels: { color: legendColor, font: { size: 9, family: MONO }, usePointStyle: true, pointStyle: 'circle', padding: 6 } },
                    tooltip: { mode: 'index', bodyFont: { family: MONO, size: 10 }, titleFont: { family: MONO, size: 10 } },
                  },
                }}
              />
            </div>
          ) : <div className="text-[11px] text-center py-6" style={{ color: 'var(--c-text3)' }}>No MCP server usage</div>}
        </div>

        {/* Most Used MCP Tools — horizontal bar */}
        <div className="card p-3">
          <SectionTitle>most used tools</SectionTitle>
          {mostUsedMcpTools.length > 0 ? (
            <div style={{ height: Math.max(mostUsedMcpTools.length * 22 + 10, 80) }}>
              <Bar
                data={{
                  labels: mostUsedMcpTools.map(t => t.name),
                  datasets: [{
                    data: mostUsedMcpTools.map(t => t.count),
                    backgroundColor: CHART_COLORS.slice(0, mostUsedMcpTools.length),
                    borderRadius: 2,
                  }],
                }}
                options={{
                  indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                  scales: {
                    x: { grid: { color: gridColor }, ticks: { color: txtDim, font: { size: 9, family: MONO } } },
                    y: { grid: { display: false }, ticks: { color: txtColor, font: { size: 9, family: MONO } } },
                  },
                  plugins: { legend: { display: false }, tooltip: {
                    bodyFont: { family: MONO, size: 10 }, titleFont: { family: MONO, size: 10 },
                    callbacks: { afterLabel: (ctx) => `Server: ${mostUsedMcpTools[ctx.dataIndex]?.server || '?'}` },
                  }},
                }}
              />
            </div>
          ) : <div className="text-[11px] text-center py-6" style={{ color: 'var(--c-text3)' }}>No MCP tool usage</div>}
        </div>

        {/* Doughnuts: by editor + by transport */}
        <div className="space-y-2">
          <div className="card p-3">
            <SectionTitle>servers by editor</SectionTitle>
            {serversByEditorChart ? (
              <div style={{ height: 110 }}>
                <Doughnut
                  data={{ labels: serversByEditorChart.labels, datasets: [{ data: serversByEditorChart.values, backgroundColor: serversByEditorChart.colors, borderWidth: 0 }] }}
                  options={{ responsive: true, maintainAspectRatio: false, cutout: '55%', plugins: {
                    legend: { position: 'right', labels: { color: legendColor, font: { size: 9, family: MONO }, usePointStyle: true, pointStyle: 'circle', padding: 6 } },
                    tooltip: { bodyFont: { family: MONO, size: 10 }, titleFont: { family: MONO, size: 10 } },
                  }}}
                />
              </div>
            ) : <div className="text-[11px] text-center py-4" style={{ color: 'var(--c-text3)' }}>no data</div>}
          </div>
          <div className="card p-3">
            <SectionTitle>servers by transport</SectionTitle>
            {serversByTransport ? (
              <div style={{ height: 90 }}>
                <Doughnut
                  data={{ labels: serversByTransport.labels, datasets: [{ data: serversByTransport.values, backgroundColor: serversByTransport.colors, borderWidth: 0 }] }}
                  options={{ responsive: true, maintainAspectRatio: false, cutout: '55%', plugins: {
                    legend: { position: 'right', labels: { color: legendColor, font: { size: 9, family: MONO }, usePointStyle: true, pointStyle: 'circle', padding: 6 } },
                    tooltip: { bodyFont: { family: MONO, size: 10 }, titleFont: { family: MONO, size: 10 } },
                  }}}
                />
              </div>
            ) : <div className="text-[11px] text-center py-4" style={{ color: 'var(--c-text3)' }}>no data</div>}
          </div>
        </div>
      </div>

      {/* Never Used Servers + Never Used Tools */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
        <div className="card p-3">
          <SectionTitle>never used servers <span style={{ color: 'var(--c-text3)' }}>({neverUsedServers.length})</span></SectionTitle>
          {neverUsedServers.length > 0 ? (
            <div className="space-y-0.5 max-h-[160px] overflow-y-auto scrollbar-thin">
              {neverUsedServers.map((s, i) => (
                <div key={`${s.name}-${s.editor}-${i}`} className="flex items-center gap-1.5 py-0.5 px-1.5" style={{ background: 'var(--c-bg3)' }}>
                  <Ban size={9} style={{ color: '#ef4444', opacity: 0.5 }} />
                  <span className="text-[10px] font-medium truncate" style={{ color: 'var(--c-text)' }}>{s.name}</span>
                  <span className="flex items-center gap-1 ml-auto shrink-0">
                    <EditorIcon source={s.editor} size={10} />
                    <span className="text-[10px]" style={{ color: 'var(--c-text3)' }}>{s.editorLabel}</span>
                  </span>
                  {s.disabled && <span className="text-[9px] px-0.5" style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>off</span>}
                </div>
              ))}
            </div>
          ) : <div className="text-[11px] text-center py-4" style={{ color: 'var(--c-text3)' }}>All servers have been used</div>}
        </div>
        <div className="card p-3">
          <SectionTitle>never used tools <span style={{ color: 'var(--c-text3)' }}>({neverUsedMcpTools.length})</span></SectionTitle>
          {neverUsedMcpTools.length > 0 ? (
            <div className="space-y-0.5 max-h-[160px] overflow-y-auto scrollbar-thin">
              {neverUsedMcpTools.map((t, i) => (
                <div key={`${t.name}-${t.server}-${i}`} className="flex items-center gap-1.5 py-0.5 px-1.5" style={{ background: 'var(--c-bg3)' }}>
                  <Ban size={9} style={{ color: '#f59e0b', opacity: 0.5 }} />
                  <span className="text-[10px] truncate" style={{ fontFamily: MONO, color: 'var(--c-text)' }}>{t.name}</span>
                  <span className="ml-auto shrink-0 text-[10px] px-1 py-px" style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8' }}>{t.server}</span>
                </div>
              ))}
            </div>
          ) : <div className="text-[11px] text-center py-4" style={{ color: 'var(--c-text3)' }}>All queried tools have been used</div>}
        </div>
      </div>

      {/* Per-Project MCP Configs */}
      {data.projectMcps && data.projectMcps.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--c-border)' }}>
            <SectionTitle>MCP servers by project <span style={{ color: 'var(--c-text3)' }}>({data.projectMcps.length})</span></SectionTitle>
          </div>
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider" style={{ borderBottom: '1px solid var(--c-border)', color: 'var(--c-text3)' }}>
                <th className="text-left px-3 py-2 font-medium">project</th>
                <th className="text-left px-3 py-2 font-medium">config</th>
                <th className="text-left px-3 py-2 font-medium">servers</th>
                <th className="text-right px-3 py-2 font-medium">mcp calls</th>
              </tr>
            </thead>
            <tbody>
              {data.projectMcps.map(p =>
                p.configs.map((c, ci) => (
                  <tr
                    key={`${p.folder}-${c.file}`}
                    className="transition"
                    style={{ borderBottom: '1px solid var(--c-border)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--c-bg3)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    {ci === 0 ? (
                      <td className="px-3 py-2" rowSpan={p.configs.length}>
                        <span
                          className="flex items-center gap-1.5 cursor-pointer hover:underline"
                          style={{ color: 'var(--c-accent)' }}
                          onClick={() => navigate(`/projects/detail?folder=${encodeURIComponent(p.folder)}`)}
                        >
                          <FolderOpen size={11} />
                          <span className="font-medium truncate max-w-[200px]">{p.name}</span>
                        </span>
                      </td>
                    ) : null}
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-1.5">
                        <EditorIcon source={c.editor} size={12} />
                        <span style={{ color: 'var(--c-text2)' }}>{c.file}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {c.serverNames.map(sn => (
                          <span key={sn} className="text-[11px] px-1.5 py-px" style={{
                            background: matchedTools[sn] ? 'rgba(99,102,241,0.12)' : 'var(--c-bg3)',
                            color: matchedTools[sn] ? '#818cf8' : 'var(--c-text2)',
                          }}>
                            <Plug size={8} className="inline mr-0.5" />{sn}
                            {matchedTools[sn] && <span className="ml-1 opacity-60">{matchedTools[sn].reduce((s, t) => s + t.count, 0)}</span>}
                          </span>
                        ))}
                      </div>
                    </td>
                    {ci === 0 ? (
                      <td className="px-3 py-2 text-right" rowSpan={p.configs.length}>
                        {p.mcpToolCalls > 0 ? (
                          <span className="font-semibold" style={{ color: 'var(--c-white)' }}>{formatNumber(p.mcpToolCalls)}</span>
                        ) : (
                          <span style={{ color: 'var(--c-text3)' }}>—</span>
                        )}
                      </td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tabs + Search */}
      <div className="flex items-center gap-3">
        <div className="flex gap-0.5">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="px-2.5 py-1 text-[12px] transition"
              style={{
                background: tab === t.id ? 'var(--c-card)' : 'transparent',
                color: tab === t.id ? 'var(--c-white)' : 'var(--c-text3)',
                border: tab === t.id ? '1px solid var(--c-border)' : '1px solid transparent',
              }}
            >
              {t.label} <span className="opacity-40 ml-0.5">{t.count}</span>
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {tab === 'tools' && (
          <>
            <select
              value={toolProjectFilter}
              onChange={e => setToolProjectFilter(e.target.value)}
              className="px-2 py-1 text-[12px] outline-none"
              style={{ background: 'var(--c-bg3)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
            >
              <option value="">All Projects</option>
              {toolFilterOptions.projects.map(f => (
                <option key={f} value={f}>{f.split('/').pop()}</option>
              ))}
            </select>
            <select
              value={toolServerFilter}
              onChange={e => setToolServerFilter(e.target.value)}
              className="px-2 py-1 text-[12px] outline-none"
              style={{ background: 'var(--c-bg3)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
            >
              <option value="">All Servers</option>
              {toolFilterOptions.hasBuiltIn && <option value="__builtin__">built-in</option>}
              {toolFilterOptions.servers.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </>
        )}
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--c-text3)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            className="pl-7 pr-3 py-1 text-[12px] outline-none w-[180px]"
            style={{ background: 'var(--c-bg3)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
          />
        </div>
      </div>

      {/* Servers Tab */}
      {tab === 'servers' && (
        <div>
          {filteredServers.length === 0 ? (
            <div className="text-center py-12 text-[12px]" style={{ color: 'var(--c-text3)' }}>
              <Server size={24} className="mx-auto mb-2 opacity-30" />
              <div>No MCP servers detected</div>
              <div className="text-[10px] mt-0.5 opacity-60">Configure MCP servers in your editors</div>
            </div>
          ) : (
            Object.entries(serversByEditor).map(([editor, servers]) => (
              <div key={editor} className="mb-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <EditorIcon source={editor} size={13} />
                  <span className="text-[12px] font-semibold" style={{ color: 'var(--c-white)' }}>{editorLabel(editor)}</span>
                  <span className="text-[11px]" style={{ color: 'var(--c-text3)' }}>({servers.length})</span>
                </div>
                <div className="space-y-1">
                  {servers.map(s => (
                    <ServerCard key={`${s.name}-${s.editor}-${s.scope}`} server={s} matchedTools={matchedTools[s.name]} />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tools Tab */}
      {tab === 'tools' && (
        <div className="card overflow-hidden">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider" style={{ borderBottom: '1px solid var(--c-border)', color: 'var(--c-text3)' }}>
                <th className="text-left px-3 py-2 font-medium">tool</th>
                <th className="text-right px-3 py-2 font-medium">calls</th>
                <th className="text-right px-3 py-2 font-medium">sessions</th>
                <th className="text-left px-3 py-2 font-medium">editors</th>
                <th className="text-left px-3 py-2 font-medium">server</th>
              </tr>
            </thead>
            <tbody>
              {filteredTools.slice(0, 100).map((t, i) => {
                const sn = toolServerMap[t.name]
                return (
                  <tr
                    key={t.name}
                    className="transition"
                    style={{ borderBottom: '1px solid var(--c-border)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--c-bg3)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td className="px-3 py-2">
                      <span style={{ fontFamily: MONO, color: 'var(--c-white)' }}>{t.name}</span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className="font-semibold" style={{ color: 'var(--c-white)' }}>{formatNumber(t.count)}</span>
                    </td>
                    <td className="px-3 py-2 text-right" style={{ color: 'var(--c-text2)' }}>{t.sessionCount}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        {t.editors.map(e => (
                          <span key={e} className="inline-flex items-center gap-0.5">
                            <EditorIcon source={e} size={12} />
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {sn ? (
                        <span className="text-[11px] px-1.5 py-px" style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8' }}>
                          <Plug size={9} className="inline mr-0.5" />{sn}
                        </span>
                      ) : (
                        <span className="text-[11px]" style={{ color: 'var(--c-text2)' }}>built-in</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filteredTools.length > 100 && (
            <div className="px-3 py-1 text-[10px] text-center" style={{ color: 'var(--c-text3)', background: 'var(--c-card)' }}>
              Showing 100 of {filteredTools.length}
            </div>
          )}
        </div>
      )}

      {/* Sessions Tab */}
      {tab === 'sessions' && (
        <div className="card overflow-hidden">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider" style={{ borderBottom: '1px solid var(--c-border)', color: 'var(--c-text3)' }}>
                <th className="text-left px-3 py-2 font-medium">session</th>
                <th className="text-left px-3 py-2 font-medium">editor</th>
                <th className="text-left px-3 py-2 font-medium">project</th>
                <th className="text-right px-3 py-2 font-medium">calls</th>
                <th className="text-left px-3 py-2 font-medium">top tools</th>
              </tr>
            </thead>
            <tbody>
              {filteredSessions.map((s, i) => {
                const topTools = Object.entries(s.tools).sort((a, b) => b[1] - a[1]).slice(0, 3)
                return (
                  <tr
                    key={s.composerId}
                    className="transition"
                    style={{ borderBottom: '1px solid var(--c-border)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--c-bg3)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td className="px-3 py-2 max-w-[220px] font-medium">
                      <span className="truncate block" style={{ color: 'var(--c-white)' }}>
                        {s.name || <span style={{ color: 'var(--c-text3)', fontStyle: 'italic' }}>Untitled</span>}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-1">
                        <EditorIcon source={s.source} size={12} />
                        <span style={{ color: 'var(--c-text2)' }}>{editorLabel(s.source)}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2 truncate max-w-[160px]" title={s.folder}>
                      {s.folder ? (
                        <span
                          className="cursor-pointer hover:underline"
                          style={{ color: 'var(--c-accent)' }}
                          onClick={e => { e.stopPropagation(); navigate(`/projects/detail?folder=${encodeURIComponent(s.folder)}`) }}
                        >{s.folder.split(/[/\\]/).pop()}</span>
                      ) : <span style={{ color: 'var(--c-text3)' }}>—</span>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className="font-semibold" style={{ color: 'var(--c-white)' }}>{formatNumber(s.totalToolCalls)}</span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-0.5 flex-wrap">
                        {topTools.map(([name, count]) => (
                          <span key={name} className="text-[10px] px-1 py-px" style={{ background: 'var(--c-bg3)', color: 'var(--c-text2)', fontFamily: MONO }}>
                            {name} <span style={{ opacity: 0.5 }}>×{count}</span>
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {data.topSessions.length === 0 && (
            <div className="text-center py-8 text-[11px]" style={{ color: 'var(--c-text3)' }}>No sessions with tool calls</div>
          )}
        </div>
      )}
    </div>
  )
}
