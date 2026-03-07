import { useEffect, useRef, useState } from 'react'
import { fetchDevices, generateSitePlan, getSession, createSession } from './api'
import type { Device, SitePlanData } from './types/api'
import DeviceCatalog from './components/DeviceCatalog'
import SiteCanvas from './components/SiteCanvas'
import MetricsPanel from './components/MetricsPanel'
import ResumeModal from './components/ResumeModal'
import './App.css'

export default function App() {
  const [devices, setDevices] = useState<Device[]>([])
  const [quantities, setQuantities] = useState<Record<number, number>>({})
  const [sitePlan, setSitePlan] = useState<SitePlanData | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [planError, setPlanError] = useState<string | null>(null)
  const [showResume, setShowResume] = useState(false)
  const [siteName, setSiteName] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    fetchDevices().then(res => {
      if (res.success && res.data) setDevices(res.data.devices)
    })
  }, [])

  const handleQuantityChange = (id: number, qty: number) => {
    const next = { ...quantities, [id]: qty }
    if (qty === 0) delete next[id]
    setQuantities(next)

    clearTimeout(debounceRef.current)

    const configured = Object.entries(next)
      .filter(([, q]) => q > 0)
      .map(([id, quantity]) => ({ id: Number(id), quantity }))

    if (configured.length === 0) {
      setSitePlan(null)
      setPlanError(null)
      return
    }

    debounceRef.current = setTimeout(async () => {
      setIsGenerating(true)
      setPlanError(null)
      const res = await generateSitePlan(configured)
      setIsGenerating(false)
      if (res.success && res.data) {
        setSitePlan(res.data)
      } else {
        setPlanError(res.error?.message ?? 'Failed to generate layout.')
        setSitePlan(null)
      }
    }, 400)
  }

  const handleSave = async () => {
    if (!siteName.trim()) {
      setSaveError('Enter a site name in the layout toolbar first.')
      return
    }
    setIsSaving(true)
    setSaveError(null)
    const configured = Object.entries(quantities)
      .filter(([, q]) => q > 0)
      .map(([id, quantity]) => ({ id: Number(id), quantity }))
    const res = await createSession(siteName.trim(), configured)
    setIsSaving(false)
    if (!res.success) {
      setSaveError(res.error?.details?.[0] ?? res.error?.message ?? 'Failed to save.')
    }
  }

  const handleResume = async (sessionId: string) => {
    const res = await getSession(sessionId)
    if (res.success && res.data) {
      const { name, requestedDevices, metrics, layout, safetyAssumptions, warnings } = res.data
      setSitePlan({ requestedDevices, metrics, layout, safetyAssumptions, warnings })
      setSiteName(name)
      setPlanError(null)
      setSaveError(null)

      const qty: Record<number, number> = {}
      for (const d of res.data.requestedDevices) qty[d.id] = d.quantity
      setQuantities(qty)

      setShowResume(false)
    }
    return res
  }

  const hasSelection = Object.values(quantities).some(q => q > 0)

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-white overflow-hidden">
      {/* Header */}
      <header className="shrink-0 px-6 py-3 border-b border-gray-800 flex items-center justify-between bg-gray-950/90 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 opacity-80">
            {[4, 3, 2, 1].map((h, i) => (
              <div key={i} className="w-2 bg-blue-500 rounded-sm" style={{ height: `${h * 5}px` }} />
            ))}
          </div>
          <h1 className="text-sm font-bold text-white tracking-tight">Tesla Energy Site Planner</h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowResume(true)}
            className="px-3 py-1.5 text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg transition-colors"
          >
            Saved Sessions
          </button>
          <button
            onClick={handleSave}
            disabled={!hasSelection || isSaving}
            className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded-lg transition-colors"
          >
            {isSaving ? 'Saving…' : 'Save Session'}
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        <DeviceCatalog
          devices={devices}
          quantities={quantities}
          onChange={handleQuantityChange}
        />

        <main className="flex-1 flex flex-col overflow-hidden">
          <SiteCanvas
            sitePlan={sitePlan}
            isLoading={isGenerating}
            error={planError}
            onRemove={id => handleQuantityChange(id, Math.max(0, (quantities[id] ?? 0) - 1))}
            siteName={siteName}
            onSiteNameChange={name => { setSiteName(name); setSaveError(null) }}
            nameError={saveError}
          />
          {sitePlan && <MetricsPanel metrics={sitePlan.metrics} />}
        </main>
      </div>

      {showResume && (
        <ResumeModal
          onResume={handleResume}
          onClose={() => setShowResume(false)}
        />
      )}
    </div>
  )
}
