import { useState, useEffect, useRef, useCallback } from 'react'
import { Routes, Route, NavLink } from 'react-router-dom'
import { Activity, BarChart3, GitCompare, MessageSquare, FolderOpen, Sun, Moon, RefreshCw, AlertTriangle, Github, Terminal, Database } from 'lucide-react'
import { fetchOverview, refetchAgents } from './lib/api'
import { useTheme } from './lib/theme'
import Dashboard from './pages/Dashboard'
import Sessions from './pages/Sessions'
import DeepAnalysis from './pages/DeepAnalysis'
import Compare from './pages/Compare'
import ChatDetail from './pages/ChatDetail'
import Projects from './pages/Projects'
import ProjectDetail from './pages/ProjectDetail'
import SqlViewer from './pages/SqlViewer'

export default function App() {
  const [overview, setOverview] = useState(null)
  const [refetchState, setRefetchState] = useState(null) // null | { scanned, total }
  const [live, setLive] = useState(false)
  const liveRef = useRef(null)
  const { dark, toggle } = useTheme()

  const refreshOverview = useCallback(() => {
    fetchOverview().then(setOverview)
  }, [])

  useEffect(() => {
    refreshOverview()
  }, [])

  // Live mode: refetch overview every 60s
  useEffect(() => {
    if (live) {
      liveRef.current = setInterval(() => {
        refreshOverview()
      }, 60000)
    } else {
      if (liveRef.current) clearInterval(liveRef.current)
      liveRef.current = null
    }
    return () => { if (liveRef.current) clearInterval(liveRef.current) }
  }, [live, refreshOverview])

  const handleRefetch = async () => {
    setRefetchState({ scanned: 0, total: 0 })
    try {
      await refetchAgents((p) => setRefetchState({ scanned: p.scanned, total: p.total }))
      const data = await fetchOverview()
      setOverview(data)
    } catch (e) { console.error(e) }
    setRefetchState(null)
  }

  const nav = [
    { to: '/', icon: Activity, label: 'Dashboard' },
    { to: '/projects', icon: FolderOpen, label: 'Projects' },
    { to: '/sessions', icon: MessageSquare, label: 'Sessions' },
    { to: '/analysis', icon: BarChart3, label: 'Analysis' },
    { to: '/compare', icon: GitCompare, label: 'Compare' },
    { to: '/sql', icon: Database, label: 'SQL' },
  ]

  return (
    <div className="min-h-screen">
      <header className="border-b px-4 py-1.5 flex items-center gap-3 sticky top-0 z-50 backdrop-blur-xl" style={{ borderColor: 'var(--c-border)', background: 'var(--c-header)' }}>
        <span className="text-xs font-bold tracking-tight" style={{ color: 'var(--c-white)' }}>npx agentlytics</span>
        <nav className="flex gap-0.5 ml-2">
          {nav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded transition ${
                  isActive ? 'bg-[var(--c-card)] text-[var(--c-white)]' : 'text-[var(--c-text2)] hover:text-[var(--c-white)]'
                }`
              }
            >
              <Icon size={12} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={() => setLive(!live)}
            className="flex items-center gap-1.5 px-2 py-0.5 text-[10px] transition"
            style={{
              color: live ? '#22c55e' : 'var(--c-text3)',
              border: live ? '1px solid rgba(34,197,94,0.3)' : '1px solid var(--c-border)',
              background: live ? 'rgba(34,197,94,0.08)' : 'transparent',
            }}
            title={live ? 'Disable live refresh' : 'Enable live refresh (every 60s)'}
          >
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full ${live ? 'pulse-dot' : ''}`}
              style={{ background: live ? '#22c55e' : 'var(--c-text3)' }}
            />
            Live
          </button>
          <button
            onClick={handleRefetch}
            disabled={!!refetchState}
            className="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded transition hover:bg-[var(--c-card)]"
            style={{ color: 'var(--c-text2)', border: '1px solid var(--c-border)' }}
            title="Clear cache and rescan all editors"
          >
            <RefreshCw size={10} className={refetchState ? 'animate-spin' : ''} />
            {refetchState
              ? `Refetching (${refetchState.scanned}/${refetchState.total})...`
              : 'Refetch'}
          </button>
          <span className="text-[10px]" style={{ color: 'var(--c-text2)' }}>
            {overview ? `${overview.totalChats} sessions` : '...'}
          </span>
          <button
            onClick={toggle}
            className="p-1 rounded transition hover:bg-[var(--c-card)]"
            style={{ color: 'var(--c-text2)' }}
            title={dark ? 'Light mode' : 'Dark mode'}
          >
            {dark ? <Sun size={13} /> : <Moon size={13} />}
          </button>
        </div>
      </header>

      {refetchState && (
        <div className="flex items-center gap-2 px-4 py-1.5 text-[11px]" style={{ background: 'rgba(234,179,8,0.08)', borderBottom: '1px solid rgba(234,179,8,0.15)', color: '#ca8a04' }}>
          <AlertTriangle size={12} />
          <span>Windsurf, Windsurf Next, and Antigravity require their app to be running during refetch — otherwise their sessions won't be detected.</span>
        </div>
      )}

      <main className="p-4 max-w-[1400px] mx-auto">
        <Routes>
          <Route path="/" element={<Dashboard overview={overview} />} />
          <Route path="/projects" element={<Projects overview={overview} />} />
          <Route path="/projects/detail" element={<ProjectDetail />} />
          <Route path="/sessions" element={<Sessions overview={overview} />} />
          {/* ChatDetail is now a sidebar in Sessions */}
          <Route path="/analysis" element={<DeepAnalysis overview={overview} />} />
          <Route path="/compare" element={<Compare overview={overview} />} />
          <Route path="/sql" element={<SqlViewer />} />
        </Routes>
      </main>

      <footer className="border-t mt-8 px-4 py-3 flex items-center justify-between text-[10px]" style={{ borderColor: 'var(--c-border)', color: 'var(--c-text3)' }}>
        <div className="flex items-center gap-3">
          <a href="https://github.com/f/agentlytics" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-[var(--c-text)] transition">
            <Github size={11} />
            <span>GitHub</span>
          </a>
          <span className="flex items-center gap-1">
            <Terminal size={11} />
            <code style={{ fontFamily: 'JetBrains Mono, monospace' }}>npx agentlytics</code>
          </span>
        </div>
        <span>
          built by <a href="https://github.com/f" target="_blank" rel="noopener noreferrer" className="hover:text-[var(--c-text)] transition" style={{ color: 'var(--c-text2)' }}>fkadev</a>
        </span>
      </footer>
    </div>
  )
}
