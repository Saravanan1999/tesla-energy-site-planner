import { useEffect, useRef, useState } from 'react'
import { fetchDevices, generateSitePlan, getSession, createSession, updateSession, listSessions } from './api'
import type { Device, OptimalLayouts, OptimizationObjective, OptimizationSuggestion, SessionData, SitePlanData } from './types/api'

// Best single-device mix for a given objective and target energy
function computeBestMix(
  batteries: Device[],
  targetEnergyMWh: number,
  objective: 'min_area' | 'min_cost' | 'max_density'
): { id: number; quantity: number } | null {
  if (!batteries.length || targetEnergyMWh <= 0) return null
  const best = [...batteries].sort((a, b) => {
    if (objective === 'min_cost') return (a.cost / a.energyMWh) - (b.cost / b.energyMWh)
    return (b.energyMWh / (b.widthFt * b.heightFt)) - (a.energyMWh / (a.widthFt * a.heightFt))
  })[0]
  return { id: best.id, quantity: Math.max(1, Math.round(targetEnergyMWh / best.energyMWh)) }
}

import DeviceCatalog from './components/DeviceCatalog'
import SiteCanvas from './components/SiteCanvas'
import MetricsPanel from './components/MetricsPanel'
import OptimizationPanel from './components/OptimizationPanel'
import ResumeModal from './components/ResumeModal'
import './App.css'

export default function App() {
  const [devices, setDevices] = useState<Device[]>([])
  const [quantities, setQuantities] = useState<Record<number, number>>(() => {
    try { return JSON.parse(localStorage.getItem('draft_quantities') ?? '{}') } catch { return {} }
  })
  const [sitePlan, setSitePlan] = useState<SitePlanData | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [planError, setPlanError] = useState<string | null>(null)
  const [showResume, setShowResume] = useState(false)
  const [siteName, setSiteName] = useState(() => localStorage.getItem('draft_siteName') ?? '')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [savedToast, setSavedToast] = useState<'in' | 'out' | null>(null)
  const [toastLabel, setToastLabel] = useState<string | null>(null)
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(() => localStorage.getItem('draft_sessionId'))
  const [objective, setObjective] = useState<OptimizationObjective>(() => {
    const stored = localStorage.getItem('draft_objective') as OptimizationObjective
    return (stored && stored !== 'user_plan') ? stored : 'min_area'
  })
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const objectiveRef = useRef<OptimizationObjective>(objective)
  const manualSnapshotRef = useRef<Record<number, number> | null>(null)
  const [dataLoaded, setDataLoaded] = useState(false)
  const [animDone, setAnimDone] = useState(false)
  const [splashFading, setSplashFading] = useState(false)
  const [splashGone, setSplashGone] = useState(false)
  const [loadingSplash, setLoadingSplash] = useState(false)
  const [loadingSplashFading, setLoadingSplashFading] = useState(false)
  const [appliedSnapshots, setAppliedSnapshots] = useState<{ quantities: Record<number, number>; label: string; type: 'apply' | 'manual' }[]>([])
  const [sessionNames, setSessionNames] = useState<SessionData[]>([])
  const [optimalLayouts, setOptimalLayouts] = useState<OptimalLayouts>({})

  useEffect(() => {
    localStorage.setItem('draft_quantities', JSON.stringify(quantities))
  }, [quantities])

  useEffect(() => {
    localStorage.setItem('draft_siteName', siteName)
  }, [siteName])

  useEffect(() => {
    if (currentSessionId) localStorage.setItem('draft_sessionId', currentSessionId)
    else localStorage.removeItem('draft_sessionId')
  }, [currentSessionId])

  useEffect(() => {
    localStorage.setItem('draft_objective', objective)
    objectiveRef.current = objective
  }, [objective])

  // Bar animation completes after 5 bars × 220ms stagger + 600ms each ≈ 1.5s
  useEffect(() => {
    const t = setTimeout(() => setAnimDone(true), 1500)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (dataLoaded && animDone) {
      setSplashFading(true)
      setTimeout(() => setSplashGone(true), 380)
    }
  }, [dataLoaded, animDone])

  // Compute truly optimal layouts for all 3 objectives by calling the API.
  // This gives accurate global metrics (real site area incl. aisles + transformer zone,
  // real total cost incl. transformers) instead of estimated equipment footprint.
  useEffect(() => {
    if (!sitePlan || !devices.length) return
    const batteries = devices.filter(d => d.category === 'battery')
    const targetEnergy = sitePlan.metrics.totalEnergyMWh
    if (!batteries.length || targetEnergy <= 0) return

    const deviceMap = new Map(devices.map(d => [d.id, d]));
    (['min_area', 'min_cost', 'max_density'] as const).forEach(obj => {
      const best = computeBestMix(batteries, targetEnergy, obj)
      if (!best) return

      const alreadyOptimal =
        sitePlan.requestedDevices.length === 1 &&
        sitePlan.requestedDevices[0].id === best.id &&
        sitePlan.requestedDevices[0].quantity === best.quantity

      if (alreadyOptimal) {
        setOptimalLayouts(prev => ({ ...prev, [obj]: null }))
        return
      }

      generateSitePlan([best], obj).then(res => {
        if (res.success && res.data) {
          const om = res.data.metrics
          const cm = sitePlan.metrics
          // Only show as a suggestion if it actually improves on the objective
          const isBetter =
            obj === 'min_area'    ? om.boundingAreaSqFt < cm.boundingAreaSqFt :
            obj === 'min_cost'    ? om.totalCost < cm.totalCost :
            /* max_density */       (om.totalEnergyMWh / om.boundingAreaSqFt) > (cm.totalEnergyMWh / cm.boundingAreaSqFt)
          if (!isBetter) { setOptimalLayouts(prev => ({ ...prev, [obj]: null })); return }
          const d = deviceMap.get(best.id)
          const label = d ? `${best.quantity}× ${d.name}` : `${best.quantity}×`
          setOptimalLayouts(prev => ({ ...prev, [obj]: { label, plan: res.data! } }))
        }
      })
    })
  }, [sitePlan]) // eslint-disable-line react-hooks/exhaustive-deps

  const refreshSessionNames = () =>
    listSessions().then(r => { if (r.success && r.data) setSessionNames(r.data.sessions) })

  useEffect(() => {
    refreshSessionNames()
    fetchDevices().then(res => {
      if (res.success && res.data) {
        setDevices(res.data.devices)
        const configured = Object.entries(quantities)
          .filter(([, q]) => q > 0)
          .map(([id, quantity]) => ({ id: Number(id), quantity }))
        if (configured.length > 0) {
          setIsGenerating(true)
          const initObjective = objectiveRef.current === 'user_plan' ? 'min_area' : objectiveRef.current
          generateSitePlan(configured, initObjective).then(planRes => {
            setIsGenerating(false)
            if (planRes.success && planRes.data) setSitePlan(planRes.data)
            else setPlanError(planRes.error?.message ?? 'Failed to restore layout.')
            setDataLoaded(true)
          })
        } else {
          setDataLoaded(true)
        }
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleQuantityChange = (id: number, qty: number) => {
    // Capture pre-edit state on first change in this edit session (debounce collapses rapid changes)
    if (manualSnapshotRef.current === null) {
      manualSnapshotRef.current = { ...quantities }
    }
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
      const planObjective = objectiveRef.current === 'user_plan' ? 'min_area' : objectiveRef.current
      const res = await generateSitePlan(configured, planObjective)
      setIsGenerating(false)
      if (res.success && res.data) {
        setSitePlan(res.data)
        // Push the pre-edit snapshot now that the plan is confirmed
        if (manualSnapshotRef.current !== null) {
          const snap = manualSnapshotRef.current
          setAppliedSnapshots(prev => [...prev, { quantities: snap, label: '', type: 'manual' as const }])
          manualSnapshotRef.current = null
        }
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
    const saveObjective = objective === 'user_plan' ? 'min_area' : objective
    const res = currentSessionId
      ? await updateSession(currentSessionId, siteName.trim(), configured, saveObjective)
      : await createSession(siteName.trim(), configured, saveObjective)
    setIsSaving(false)
    if (!res.success) {
      setSaveError(res.error?.details?.[0] ?? res.error?.message ?? 'Failed to save.')
    } else {
      if (res.data?.sessionId) setCurrentSessionId(res.data.sessionId)
      refreshSessionNames()
      setToastLabel(null)
      setSavedToast('in')
      setTimeout(() => setSavedToast('out'), 1600)
      setTimeout(() => { setSavedToast(null); setToastLabel(null) }, 1950)
    }
  }

  const handleResume = async (sessionId: string) => {
    setLoadingSplash(true)
    setLoadingSplashFading(false)
    const res = await getSession(sessionId)
    if (res.success && res.data) {
      const { name, requestedDevices, metrics, layout, safetyAssumptions, warnings, objective: sessionObjective, suggestion } = res.data
      setSitePlan({ requestedDevices, metrics, layout, safetyAssumptions, warnings, objective: sessionObjective, suggestion })
      setSiteName(name)
      setCurrentSessionId(res.data.sessionId)
      setPlanError(null)
      setSaveError(null)
      if (sessionObjective) {
        setObjective(sessionObjective)
        objectiveRef.current = sessionObjective
      }

      const qty: Record<number, number> = {}
      for (const d of res.data.requestedDevices) qty[d.id] = d.quantity
      setQuantities(qty)
      setAppliedSnapshots([])
      setShowResume(false)
    }
    setTimeout(() => setLoadingSplashFading(true), 800)
    setTimeout(() => setLoadingSplash(false), 1200)
    return res
  }

  const handleObjectiveChange = async (obj: OptimizationObjective) => {
    setObjective(obj)
    objectiveRef.current = obj
    if (obj === 'user_plan') return // no layout regen for legacy stored value
    const configured = Object.entries(quantities)
      .filter(([, q]) => q > 0)
      .map(([id, quantity]) => ({ id: Number(id), quantity }))
    if (configured.length === 0) return
    setIsGenerating(true)
    setPlanError(null)
    const res = await generateSitePlan(configured, obj)
    setIsGenerating(false)
    if (res.success && res.data) setSitePlan(res.data)
    else { setPlanError(res.error?.message ?? 'Failed to generate layout.'); setSitePlan(null) }
  }

  const handleApplySuggestion = async (suggestion: OptimizationSuggestion) => {
    // Flush any pending manual-edit snapshot first
    if (manualSnapshotRef.current) {
      const snap = manualSnapshotRef.current
      setAppliedSnapshots(prev => [...prev, { quantities: snap, label: '', type: 'manual' as const }])
      manualSnapshotRef.current = null
    }
    // Push current state onto undo stack so user can step back
    setAppliedSnapshots(prev => [...prev, { quantities: { ...quantities }, label: `${suggestion.toQty}× ${suggestion.toLabel}`, type: 'apply' as const }])
    // Full replacement: algorithm computed the optimal mix, override everything
    const next = suggestion.newQuantities
      ? { ...suggestion.newQuantities }
      : (() => {
          const n = { ...quantities }
          const newSrcQty = (n[suggestion.fromDeviceId] ?? 0) - suggestion.fromQty
          if (newSrcQty <= 0) delete n[suggestion.fromDeviceId]
          else n[suggestion.fromDeviceId] = newSrcQty
          n[suggestion.toDeviceId] = (n[suggestion.toDeviceId] ?? 0) + suggestion.toQty
          return n
        })()
    setQuantities(next)
    clearTimeout(debounceRef.current)
    const configured = Object.entries(next)
      .filter(([, q]) => q > 0)
      .map(([id, quantity]) => ({ id: Number(id), quantity }))
    if (configured.length === 0) { setSitePlan(null); return }
    setIsGenerating(true)
    setPlanError(null)
    const applyObjective = objectiveRef.current === 'user_plan' ? 'min_area' : objectiveRef.current
    const res = await generateSitePlan(configured, applyObjective)
    setIsGenerating(false)
    if (res.success && res.data) setSitePlan(res.data)
    else { setPlanError(res.error?.message ?? 'Failed to generate layout.'); setSitePlan(null) }
  }

  const handleRevert = async () => {
    if (appliedSnapshots.length === 0) return
    const snap = appliedSnapshots[appliedSnapshots.length - 1]
    setAppliedSnapshots(prev => prev.slice(0, -1))
    manualSnapshotRef.current = null // cancel any in-progress manual edit
    setQuantities(snap.quantities)
    clearTimeout(debounceRef.current)
    const configured = Object.entries(snap.quantities)
      .filter(([, q]) => (q as number) > 0)
      .map(([id, quantity]) => ({ id: Number(id), quantity: quantity as number }))
    if (configured.length === 0) { setSitePlan(null); return }
    setIsGenerating(true)
    setPlanError(null)
    const revertObjective = objectiveRef.current === 'user_plan' ? 'min_area' : objectiveRef.current
    const res = await generateSitePlan(configured, revertObjective)
    setIsGenerating(false)
    if (res.success && res.data) setSitePlan(res.data)
    else { setPlanError(res.error?.message ?? 'Failed to restore layout.'); setSitePlan(null) }
  }

  const handleSaveAs = async (newName: string): Promise<boolean> => {
    const configured = Object.entries(quantities)
      .filter(([, q]) => q > 0)
      .map(([id, quantity]) => ({ id: Number(id), quantity }))
    const saveObjective = objective === 'user_plan' ? 'min_area' : objective
    const res = await createSession(newName, configured, saveObjective)
    if (res.success) {
      refreshSessionNames()
      setToastLabel(newName)
      setSavedToast('in')
      setTimeout(() => setSavedToast('out'), 1600)
      setTimeout(() => { setSavedToast(null); setToastLabel(null) }, 1950)
    }
    return res.success
  }

  const hasSelection = Object.values(quantities).some(q => q > 0)

  const siteNameConflict = siteName.trim() && sessionNames.some(
    s => s.name.toLowerCase() === siteName.trim().toLowerCase() && s.sessionId !== currentSessionId
  ) ? 'Name already taken — choose a different name to save.' : null

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-white overflow-hidden">
      {/* Splash screen */}
      {!splashGone && (
        <div className={`fixed inset-0 z-[100] bg-gray-950 flex flex-col items-center justify-center gap-5 ${splashFading ? 'splash-exit' : ''}`}>
          <div className="flex items-center gap-3">
            {[75, 60, 45, 30, 15].map((h, i) => (
              <div
                key={i}
                className="w-5 bg-blue-500 rounded splash-bar"
                style={{ height: `${h}px`, animationDelay: `${i * 220}ms` }}
              />
            ))}
          </div>
          <p className="text-xs text-gray-500 tracking-[0.2em] uppercase">Tesla Energy Site Planner</p>
        </div>
      )}
      {/* Session load splash */}
      {loadingSplash && (
        <div className={`fixed inset-0 z-[100] bg-gray-950 flex flex-col items-center justify-center gap-5 ${loadingSplashFading ? 'splash-exit' : ''}`}>
          <div className="flex items-center gap-3">
            {[75, 60, 45, 30, 15].map((h, i) => (
              <div
                key={i}
                className="w-5 bg-blue-500 rounded splash-bar"
                style={{ height: `${h}px`, animationDelay: `${i * 220}ms` }}
              />
            ))}
          </div>
          <p className="text-xs text-gray-500 tracking-[0.2em] uppercase">Tesla Energy Site Planner</p>
        </div>
      )}
      {/* Save success toast */}
      {savedToast && (
        <div className={`fixed top-16 left-1/2 -translate-x-1/2 z-50 pointer-events-none ${savedToast === 'in' ? 'animate-toast-in' : 'animate-toast-out'}`}>
          <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-gray-900 border border-green-600/50 shadow-xl shadow-green-950/40">
            {/* Animated battery */}
            <div className="flex items-center">
              <div className="relative w-11 h-[22px] rounded-[4px] border-2 border-green-500 overflow-hidden bg-gray-900">
                {/* Fill — starts at 0, charges to full */}
                <div className="animate-battery-charge absolute top-[3px] bottom-[3px] left-[3px] bg-green-500 rounded-[2px]" style={{ width: 0 }} />
                {/* Lightning bolt pulses during charge, sits still when full */}
                <svg className="animate-bolt-pulse absolute inset-0 m-auto w-3 h-3.5 text-white drop-shadow-md" viewBox="0 0 10 14" fill="currentColor">
                  <path d="M6.5 0L1 8h4L3.5 14 9 6H5z" />
                </svg>
              </div>
              {/* Terminal nub */}
              <div className="w-[5px] h-[10px] bg-green-500 rounded-r-sm" />
            </div>
            <div>
              <p className="text-sm font-semibold text-green-400 leading-tight">Session Saved</p>
              <p className="text-[11px] text-green-600 leading-tight">{toastLabel ?? siteName}</p>
            </div>
          </div>
        </div>
      )}
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
            disabled={!hasSelection || isSaving || !!siteNameConflict}
            title={siteNameConflict ?? undefined}
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
            nameWarning={siteNameConflict}
          />
          {sitePlan && <MetricsPanel metrics={sitePlan.metrics} safetyAssumptions={sitePlan.safetyAssumptions} />}
          {sitePlan && (
            <OptimizationPanel
              sitePlan={sitePlan}
              objective={objective}
              onObjectiveChange={handleObjectiveChange}
              onApply={handleApplySuggestion}
              appliedSnapshots={appliedSnapshots}
              onRevert={handleRevert}
              onSaveAs={handleSaveAs}
              currentSiteName={siteName}
              sessionNames={sessionNames}
              optimalLayouts={optimalLayouts}
            />
          )}
        </main>
      </div>

      {showResume && (
        <ResumeModal
          onResume={handleResume}
          onDelete={id => { if (id === currentSessionId) setCurrentSessionId(null) }}
          onClose={() => setShowResume(false)}
        />
      )}
    </div>
  )
}
