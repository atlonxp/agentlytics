import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { DollarSign, TrendingUp, Cpu, FolderOpen, AlertTriangle } from 'lucide-react'
import { Chart as ChartJS, ArcElement, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend, Filler } from 'chart.js'
import { Line, Doughnut, Bar } from 'react-chartjs-2'
import { fetchCostAnalytics, fetchOverview } from '../lib/api'
import { editorColor, editorLabel, formatNumber, formatCost, formatDate, dateRangeToApiParams } from '../lib/constants'
import { useTheme } from '../lib/theme'
import KpiCard from '../components/KpiCard'
import EditorIcon from '../components/EditorIcon'
import AnimatedLoader from '../components/AnimatedLoader'
import SectionTitle from '../components/SectionTitle'
import DateRangePicker from '../components/DateRangePicker'
import ChatSidebar from '../components/ChatSidebar'
import PageHeader from '../components/PageHeader'

ChartJS.register(ArcElement, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend, Filler)

const MONO = 'JetBrains Mono, monospace'
const MODEL_COLORS = ['#6366f1', '#a78bfa', '#818cf8', '#c084fc', '#e879f9', '#f472b6', '#fb7185', '#f87171', '#fbbf24', '#34d399', '#2dd4bf', '#38bdf8', '#60a5fa', '#a3e635']

export default function CostAnalysis({ overview }) {
  const { dark } = useTheme()
  const navigate = useNavigate()
  const txtDim = dark ? '#555' : '#999'
  const legendColor = dark ? '#777' : '#555'
  const gridColor = dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.06)'

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editor, setEditor] = useState('')
  const [apiDateRange, setApiDateRange] = useState(null)
  const [selectedChatId, setSelectedChatId] = useState(null)

  const editors = overview?.editors || []

  useEffect(() => {
    setLoading(true)
    fetchCostAnalytics({ editor, ...dateRangeToApiParams(apiDateRange) }).then(d => {
      setData(d)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [editor, apiDateRange])

  if (!data) {
    return <AnimatedLoader label="Loading cost data..." />
  }

  const { totalCost, byModel, byEditor, byProject, monthly, topSessions, summary, unknownModels } = data

  // Charts
  const modelChartData = byModel.length > 0 ? {
    labels: byModel.slice(0, 10).map(m => m.model),
    datasets: [{
      data: byModel.slice(0, 10).map(m => Math.round(m.cost * 100) / 100),
      backgroundColor: MODEL_COLORS,
      borderWidth: 0,
    }],
  } : null

  const editorChartData = byEditor.length > 0 ? {
    labels: byEditor.map(e => editorLabel(e.editor)),
    datasets: [{
      data: byEditor.map(e => Math.round(e.cost * 100) / 100),
      backgroundColor: byEditor.map(e => editorColor(e.editor)),
      borderWidth: 0,
    }],
  } : null

  const monthlyChartData = monthly.length > 1 ? {
    labels: monthly.map(m => m.month),
    datasets: [{
      label: 'Cost ($)',
      data: monthly.map(m => m.cost),
      borderColor: '#6366f1',
      backgroundColor: 'rgba(99,102,241,0.1)',
      borderWidth: 2,
      tension: 0.3,
      pointRadius: 3,
      pointHoverRadius: 5,
      fill: true,
    }],
  } : null

  const projectChartData = byProject.length > 0 ? {
    labels: byProject.slice(0, 10).map(p => p.name),
    datasets: [{
      data: byProject.slice(0, 10).map(p => Math.round(p.cost * 100) / 100),
      backgroundColor: '#818cf8',
      borderRadius: 3,
    }],
  } : null

  const doughnutOpts = {
    responsive: true, maintainAspectRatio: false, cutout: '55%',
    plugins: {
      legend: { position: 'right', labels: { color: legendColor, font: { size: 9, family: MONO }, usePointStyle: true, pointStyle: 'circle', padding: 6 } },
      tooltip: {
        bodyFont: { family: MONO, size: 10 }, titleFont: { family: MONO, size: 10 },
        callbacks: { label: ctx => ` ${ctx.label}: $${ctx.raw.toFixed(2)}` },
      },
    },
  }

  return (
    <div className="fade-in space-y-3">
      {/* Filters */}
      <PageHeader icon={DollarSign} title="Cost Analysis">
        <select
          value={editor}
          onChange={e => setEditor(e.target.value)}
          className="px-2 py-1 text-[12px] outline-none"
          style={{ background: 'var(--c-bg3)', color: 'var(--c-text)', border: '1px solid var(--c-border)' }}
        >
          <option value="">All Editors</option>
          {editors.map(e => (
            <option key={e.id} value={e.id}>{editorLabel(e.id)} ({e.count})</option>
          ))}
        </select>
        <div className="ml-auto"><DateRangePicker value={apiDateRange} onChange={setApiDateRange} /></div>
      </PageHeader>

      {/* KPIs */}
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))' }}>
        <KpiCard label="total cost" value={formatCost(totalCost)} sub="all models" />
        <KpiCard label="avg / session" value={formatCost(summary.avgPerSession)} sub={`${formatNumber(summary.totalSessions)} sessions`} />
        <KpiCard label="avg / day" value={formatCost(summary.avgPerDay)} sub={`${summary.totalDays} days`} />
        <KpiCard label="models" value={byModel.length} sub={unknownModels.length > 0 ? `${unknownModels.length} unknown` : 'all priced'} />
        <KpiCard label="top model" value={byModel[0]?.model || '—'} sub={byModel[0] ? formatCost(byModel[0].cost) : ''} />
        <KpiCard label="top editor" value={byEditor[0] ? editorLabel(byEditor[0].editor) : '—'} sub={byEditor[0] ? formatCost(byEditor[0].cost) : ''} />
      </div>

      {/* Charts row 1: Model + Editor doughnuts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="card p-3 lg:col-span-2">
          <SectionTitle>cost by model</SectionTitle>
          {modelChartData ? (
            <div style={{ height: 220 }}>
              <Bar
                data={{
                  labels: byModel.slice(0, 12).map(m => m.model),
                  datasets: [{
                    data: byModel.slice(0, 12).map(m => Math.round(m.cost * 100) / 100),
                    backgroundColor: MODEL_COLORS,
                    borderRadius: 3,
                  }],
                }}
                options={{
                  responsive: true, maintainAspectRatio: false, indexAxis: 'y',
                  scales: {
                    x: { grid: { color: gridColor }, ticks: { color: txtDim, font: { size: 9, family: MONO }, callback: v => '$' + v } },
                    y: { grid: { display: false }, ticks: { color: legendColor, font: { size: 9, family: MONO } } },
                  },
                  plugins: {
                    legend: { display: false },
                    tooltip: {
                      bodyFont: { family: MONO, size: 10 }, titleFont: { family: MONO, size: 10 },
                      callbacks: { label: ctx => ` $${ctx.raw.toFixed(2)}` },
                    },
                  },
                }}
              />
            </div>
          ) : <div className="text-[11px] py-8 text-center" style={{ color: 'var(--c-text3)' }}>no cost data</div>}
        </div>
        <div className="card p-3">
          <SectionTitle>cost by editor</SectionTitle>
          {editorChartData ? (
            <div style={{ height: 220 }}>
              <Doughnut data={editorChartData} options={doughnutOpts} />
            </div>
          ) : <div className="text-[11px] py-8 text-center" style={{ color: 'var(--c-text3)' }}>no cost data</div>}
        </div>
      </div>

      {/* Monthly trend */}
      {monthlyChartData && (
        <div className="card p-3">
          <SectionTitle>monthly cost trend</SectionTitle>
          <div style={{ height: 180 }}>
            <Line
              data={monthlyChartData}
              options={{
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                  x: { grid: { display: false }, ticks: { color: txtDim, font: { size: 9, family: MONO }, maxRotation: 0, maxTicksLimit: 12 } },
                  y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: txtDim, font: { size: 9, family: MONO }, callback: v => '$' + v } },
                },
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    bodyFont: { family: MONO, size: 10 }, titleFont: { family: MONO, size: 10 },
                    callbacks: { label: ctx => ` $${ctx.raw.toFixed(2)} (${monthly[ctx.dataIndex]?.sessions || 0} sessions)` },
                  },
                },
              }}
            />
          </div>
        </div>
      )}

      {/* Charts row 2: Projects */}
      {projectChartData && (
        <div className="card p-3">
          <SectionTitle>cost by project (top 10)</SectionTitle>
          <div style={{ height: 220 }}>
            <Bar
              data={projectChartData}
              options={{
                responsive: true, maintainAspectRatio: false, indexAxis: 'y',
                scales: {
                  x: { grid: { color: gridColor }, ticks: { color: txtDim, font: { size: 9, family: MONO }, callback: v => '$' + v } },
                  y: { grid: { display: false }, ticks: { color: legendColor, font: { size: 9, family: MONO } } },
                },
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    bodyFont: { family: MONO, size: 10 }, titleFont: { family: MONO, size: 10 },
                    callbacks: { label: ctx => ` $${ctx.raw.toFixed(2)}` },
                  },
                },
              }}
            />
          </div>
        </div>
      )}

      {/* Model breakdown table */}
      <div className="card overflow-hidden">
        <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--c-border)' }}>
          <SectionTitle>model breakdown</SectionTitle>
        </div>
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider" style={{ borderBottom: '1px solid var(--c-border)', color: 'var(--c-text3)' }}>
              <th className="text-left py-2 px-3 font-medium">model</th>
              <th className="text-right py-2 px-3 font-medium">input tokens</th>
              <th className="text-right py-2 px-3 font-medium">output tokens</th>
              <th className="text-right py-2 px-3 font-medium">cache read</th>
              <th className="text-right py-2 px-3 font-medium">cache write</th>
              <th className="text-right py-2 px-3 font-medium">cost</th>
              <th className="text-right py-2 px-3 font-medium">% of total</th>
            </tr>
          </thead>
          <tbody>
            {byModel.map((m, i) => (
              <tr key={m.model} style={{ borderBottom: '1px solid var(--c-border)' }}>
                <td className="py-2 px-3 font-mono font-medium" style={{ color: 'var(--c-white)' }}>
                  <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: MODEL_COLORS[i % MODEL_COLORS.length] }} />
                  {m.model}
                </td>
                <td className="py-2 px-3 text-right font-mono" style={{ color: 'var(--c-text2)' }}>{formatNumber(m.inputTokens)}</td>
                <td className="py-2 px-3 text-right font-mono" style={{ color: 'var(--c-text2)' }}>{formatNumber(m.outputTokens)}</td>
                <td className="py-2 px-3 text-right font-mono" style={{ color: 'var(--c-text3)' }}>{m.cacheRead > 0 ? formatNumber(m.cacheRead) : '—'}</td>
                <td className="py-2 px-3 text-right font-mono" style={{ color: 'var(--c-text3)' }}>{m.cacheWrite > 0 ? formatNumber(m.cacheWrite) : '—'}</td>
                <td className="py-2 px-3 text-right font-mono font-medium" style={{ color: 'var(--c-white)' }}>{formatCost(m.cost)}</td>
                <td className="py-2 px-3 text-right font-mono" style={{ color: 'var(--c-text3)' }}>
                  {totalCost > 0 ? ((m.cost / totalCost) * 100).toFixed(1) + '%' : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {byModel.length === 0 && (
          <div className="text-center py-8 text-sm" style={{ color: 'var(--c-text3)' }}>no model cost data</div>
        )}
      </div>

      {/* Top expensive sessions */}
      {topSessions.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--c-border)' }}>
            <SectionTitle>most expensive sessions</SectionTitle>
          </div>
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider" style={{ borderBottom: '1px solid var(--c-border)', color: 'var(--c-text3)' }}>
                <th className="text-left py-2 px-3 font-medium">editor</th>
                <th className="text-left py-2 px-3 font-medium">name</th>
                <th className="text-left py-2 px-3 font-medium">project</th>
                <th className="text-left py-2 px-3 font-medium">model</th>
                <th className="text-right py-2 px-3 font-medium">msgs</th>
                <th className="text-right py-2 px-3 font-medium">cost</th>
                <th className="text-left py-2 px-3 font-medium">date</th>
              </tr>
            </thead>
            <tbody>
              {topSessions.slice(0, 30).map(s => (
                <tr
                  key={s.id}
                  className="cursor-pointer transition"
                  style={{ borderBottom: '1px solid var(--c-border)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--c-bg3)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  onClick={() => setSelectedChatId(s.id)}
                >
                  <td className="py-2 px-3">
                    <span className="inline-flex items-center gap-1.5">
                      <EditorIcon source={s.source} size={12} />
                      <span style={{ color: 'var(--c-text2)' }}>{editorLabel(s.source)}</span>
                    </span>
                  </td>
                  <td className="py-2 px-3 font-medium truncate max-w-[200px]" style={{ color: 'var(--c-white)' }}>
                    {s.name || <span style={{ color: 'var(--c-text3)' }}>Untitled</span>}
                  </td>
                  <td className="py-2 px-3 truncate max-w-[140px]" style={{ color: 'var(--c-text2)' }} title={s.folder}>
                    {s.folder ? (
                      <span
                        className="cursor-pointer hover:underline"
                        style={{ color: 'var(--c-accent)' }}
                        onClick={e => { e.stopPropagation(); navigate(`/projects/detail?folder=${encodeURIComponent(s.folder)}`) }}
                      >{s.folder.split('/').pop()}</span>
                    ) : ''}
                  </td>
                  <td className="py-2 px-3 font-mono truncate max-w-[140px]" style={{ color: 'var(--c-text2)' }} title={s.model}>{s.model}</td>
                  <td className="py-2 px-3 text-right" style={{ color: 'var(--c-text3)' }}>{s.messages}</td>
                  <td className="py-2 px-3 text-right font-mono font-medium" style={{ color: 'var(--c-white)' }}>{formatCost(s.cost)}</td>
                  <td className="py-2 px-3 whitespace-nowrap" style={{ color: 'var(--c-text3)' }}>{formatDate(s.lastUpdatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Unknown models */}
      {unknownModels.length > 0 && (
        <div className="card p-3">
          <SectionTitle>
            <AlertTriangle size={11} className="inline mr-1" style={{ color: '#f59e0b' }} />
            unpriced models ({unknownModels.length})
          </SectionTitle>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {unknownModels.map(m => (
              <span key={m} className="text-[11px] px-2 py-0.5 font-mono" style={{ background: 'rgba(245,158,11,0.08)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)' }}>
                {m}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Chat sidebar */}
      <ChatSidebar chatId={selectedChatId} onClose={() => setSelectedChatId(null)} />
    </div>
  )
}
