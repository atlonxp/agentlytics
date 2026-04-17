import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Download, Share2, BarChart3, DollarSign, Clock, Cpu, Braces, User, Sun, Moon, FolderOpen } from 'lucide-react'
import { fetchShareImage, fetchProjects } from '../lib/api'

const TOGGLE_ITEMS = [
  { key: 'showEditors', label: 'Editors', icon: BarChart3 },
  { key: 'showCosts', label: 'Costs', icon: DollarSign },
  { key: 'showHours', label: 'Peak Hours', icon: Clock },
  { key: 'showModels', label: 'Top Models', icon: Cpu },
  { key: 'showTokens', label: 'Token Footer', icon: Braces },
]

export default function ShareModal({ open, onClose }) {
  const [opts, setOpts] = useState({
    showEditors: true,
    showCosts: true,
    showHours: true,
    showModels: true,
    showTokens: true,
    username: '',
    theme: 'dark',
  })
  const [svg, setSvg] = useState('')
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [projects, setProjects] = useState([])
  const debounceRef = useRef(null)
  const backdropRef = useRef(null)

  const loadPreview = useCallback(async (currentOpts) => {
    setLoading(true)
    try {
      const result = await fetchShareImage(currentOpts)
      if (result && !result.startsWith('{')) setSvg(result)
    } catch (e) {
      console.error('Preview failed:', e)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!open) return
    loadPreview(opts)
    fetchProjects().then(p => setProjects(p || [])).catch(() => {})
  }, [open])

  const updateOpt = (key, value) => {
    const next = { ...opts, [key]: value }
    setOpts(next)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => loadPreview(next), 300)
  }

  const handleDownloadPng = async () => {
    if (!svg) return
    setDownloading(true)
    try {
      const scale = 2
      const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
      const url = URL.createObjectURL(svgBlob)
      const img = new Image()
      img.width = 1200 * scale
      img.height = 675 * scale
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
        img.src = url
      })
      const canvas = document.createElement('canvas')
      canvas.width = 1200 * scale
      canvas.height = 675 * scale
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, 1200 * scale, 675 * scale)
      URL.revokeObjectURL(url)
      canvas.toBlob((blob) => {
        if (!blob) return
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = 'agentlytics.png'
        a.click()
        setTimeout(() => URL.revokeObjectURL(a.href), 1000)
      }, 'image/png')
    } catch (e) {
      console.error('PNG conversion failed:', e)
      const blob = new Blob([svg], { type: 'image/svg+xml' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'agentlytics.svg'
      a.click()
      URL.revokeObjectURL(a.href)
    }
    setDownloading(false)
  }

  const handleDownloadSvg = () => {
    if (!svg) return
    const blob = new Blob([svg], { type: 'image/svg+xml' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'agentlytics.svg'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const handleShareTwitter = async () => {
    await handleDownloadPng()
    const text = encodeURIComponent("Here's my agentic coding stats using agentlytics.io\n\nrun `npx agentlytics` to get yours ✨\n\ngithub.com/f/agentlytics")
    window.open(`https://x.com/intent/post?text=${text}`, '_blank')
  }

  if (!open) return null

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}
      onClick={(e) => e.target === backdropRef.current && onClose()}
    >
      <div
        className="w-full relative flex flex-col"
        style={{
          maxWidth: 960,
          maxHeight: '90vh',
          background: 'var(--c-bg)',
          border: '1px solid var(--c-border)',
          borderRadius: 12,
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--c-border)' }}>
          <div className="flex items-center gap-2">
            <Share2 size={14} style={{ color: 'var(--c-accent)' }} />
            <span className="text-[13px] font-semibold" style={{ color: 'var(--c-white)' }}>Share Stats</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:opacity-70 transition" style={{ color: 'var(--c-text2)' }}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-5" style={{ minHeight: 0 }}>
          <div className="flex gap-5" style={{ flexDirection: 'row' }}>

            {/* Sidebar: toggles */}
            <div className="flex-shrink-0" style={{ width: 200 }}>
              <div className="text-[11px] font-medium mb-3" style={{ color: 'var(--c-text2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Customize
              </div>

              <div className="mb-4">
                <div className="text-[11px] font-medium mb-2" style={{ color: 'var(--c-text2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Project
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md" style={{ border: '1px solid var(--c-border)', background: 'var(--c-bg)' }}>
                  <FolderOpen size={11} style={{ color: 'var(--c-text3)' }} />
                  <select
                    value={opts.folder || ''}
                    onChange={(e) => updateOpt('folder', e.target.value || undefined)}
                    className="bg-transparent outline-none text-[12px] w-full cursor-pointer"
                    style={{ color: 'var(--c-text)', appearance: 'none' }}
                  >
                    <option value="">All Projects</option>
                    {projects.map(p => (
                      <option key={p.folder} value={p.folder}>
                        {p.name} ({p.totalSessions})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                {TOGGLE_ITEMS.map(({ key, label, icon: Icon }) => {
                  const active = opts[key]
                  return (
                    <button
                      key={key}
                      onClick={() => updateOpt(key, !active)}
                      className="flex items-center gap-2 w-full px-2.5 py-2 rounded-md text-[12px] transition"
                      style={{
                        background: active ? 'var(--c-accent-bg, rgba(99,102,241,0.1))' : 'transparent',
                        border: `1px solid ${active ? 'var(--c-accent, #6366f1)' : 'var(--c-border)'}`,
                        color: active ? 'var(--c-accent, #818cf8)' : 'var(--c-text2)',
                        opacity: active ? 1 : 0.6,
                      }}
                    >
                      <Icon size={12} />
                      {label}
                    </button>
                  )
                })}
              </div>

              <div className="mt-4">
                <div className="text-[11px] font-medium mb-2" style={{ color: 'var(--c-text2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Theme
                </div>
                <div className="flex gap-1.5">
                  {[{ key: 'dark', icon: Moon, label: 'Dark' }, { key: 'light', icon: Sun, label: 'Light' }].map(({ key, icon: Icon, label }) => {
                    const active = opts.theme === key
                    return (
                      <button
                        key={key}
                        onClick={() => updateOpt('theme', key)}
                        className="flex items-center gap-1.5 flex-1 justify-center px-2 py-1.5 rounded-md text-[11px] transition"
                        style={{
                          background: active ? 'var(--c-accent-bg, rgba(99,102,241,0.1))' : 'transparent',
                          border: `1px solid ${active ? 'var(--c-accent, #6366f1)' : 'var(--c-border)'}`,
                          color: active ? 'var(--c-accent, #818cf8)' : 'var(--c-text2)',
                          opacity: active ? 1 : 0.6,
                        }}
                      >
                        <Icon size={11} />
                        {label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="mt-4">
                <div className="text-[11px] font-medium mb-2" style={{ color: 'var(--c-text2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Username
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md" style={{ border: '1px solid var(--c-border)', background: 'var(--c-bg)' }}>
                  <User size={11} style={{ color: 'var(--c-text3)' }} />
                  <input
                    type="text"
                    placeholder="optional"
                    value={opts.username}
                    onChange={(e) => updateOpt('username', e.target.value)}
                    className="bg-transparent outline-none text-[12px] w-full"
                    style={{ color: 'var(--c-text)' }}
                  />
                </div>
              </div>
            </div>

            {/* Preview */}
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-medium mb-3" style={{ color: 'var(--c-text2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Preview
              </div>
              <div
                className="rounded-lg overflow-hidden relative"
                style={{
                  border: '1px solid var(--c-border)',
                  background: '#09090f',
                  minHeight: 200,
                }}
              >
                {loading && (
                  <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)', zIndex: 2 }}>
                    <span className="text-[12px]" style={{ color: 'var(--c-text2)' }}>Generating...</span>
                  </div>
                )}
                {svg && (
                  <div
                    className="w-full [&>svg]:w-full [&>svg]:h-auto [&>svg]:block"
                    dangerouslySetInnerHTML={{ __html: svg }}
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer: actions */}
        <div className="flex items-center justify-between px-5 py-3" style={{ borderTop: '1px solid var(--c-border)' }}>
          <span className="text-[11px]" style={{ color: 'var(--c-text3)' }}>
            Tip: Toggle sections to customize your share card
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadSvg}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] rounded-md transition hover:opacity-80"
              style={{ border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
            >
              <Download size={12} />
              SVG
            </button>
            <button
              onClick={handleDownloadPng}
              disabled={downloading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] rounded-md transition hover:opacity-80"
              style={{ border: '1px solid var(--c-border)', color: 'var(--c-text)', opacity: downloading ? 0.5 : 1 }}
            >
              <Download size={12} />
              {downloading ? 'Converting...' : 'PNG'}
            </button>
            <button
              onClick={handleShareTwitter}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] rounded-md transition hover:opacity-80"
              style={{ background: '#6366f1', color: '#fff' }}
            >
              <Share2 size={12} />
              Share on X
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
