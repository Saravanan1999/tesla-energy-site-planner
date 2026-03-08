import { useEffect, useRef, useState } from 'react'
import { fetchDevices, generateSitePlan, optimizeSitePlan, optimizeMaxPower, planForEnergy, getSession, createSession, updateSession, listSessions } from './api'
import type { Device, OptimalLayouts, OptimizationObjective, OptimizationSuggestion, SessionData, SitePlanData } from './types/api'

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
  const [constraintMode, setConstraintMode] = useState<'power' | 'area'>('power')
  const [targetAreaSqFt, setTargetAreaSqFt] = useState<number | null>(null)
  const [optimalMaxPower, setOptimalMaxPower] = useState<SitePlanData | null | undefined>(undefined)
  const [pendingTargetPlan, setPendingTargetPlan] = useState<{
    plan: SitePlanData
    quantities: Record<number, number>
    requestedMWh: number
  } | null>(null)
  const [isDirty, setIsDirty] = useState(() => localStorage.getItem('draft_isDirty') === 'true')
  const [confirmNew, setConfirmNew] = useState(false)

  useEffect(() => {
    localStorage.setItem('draft_quantities', JSON.stringify(quantities))
  }, [quantities])

  useEffect(() => {
    localStorage.setItem('draft_isDirty', String(isDirty))
  }, [isDirty])

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

  // Cmd+S / Ctrl+S to save
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }) // no deps — always uses latest handleSave

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

  // Ask the backend for the globally optimal plan for each objective.
  // The backend generates real layouts (with transformer costs) and only returns a
  // suggestion if it genuinely improves on the current plan's metrics.
  // Results are a pure function of the current total MWh — deterministic for a given energy target.
  useEffect(() => {
    if (!sitePlan || !devices.length) return
    let cancelled = false
    setOptimalLayouts({}) // clear stale results from any prior sitePlan
    const deviceMap = new Map(devices.map(d => [d.id, d]))
    const configured = sitePlan.requestedDevices.map(d => ({ id: d.id, quantity: d.quantity }));
    (['min_area', 'min_cost'] as const).forEach(obj => {
      optimizeSitePlan(configured, obj).then(res => {
        if (cancelled) return
        if (!res.success) return
        if (!res.data) {
          // Backend returns null when no valid candidates exist or current plan is already optimal
          setOptimalLayouts(prev => ({ ...prev, [obj]: null }))
          return
        }
        const plan = res.data
        const label = plan.requestedDevices
          .map(d => { const dev = deviceMap.get(d.id); return dev ? `${d.quantity}× ${dev.name}` : `${d.quantity}×` })
          .join(' + ')
        setOptimalLayouts(prev => ({ ...prev, [obj]: { label, plan } }))
      })
    })
    return () => { cancelled = true }
  }, [sitePlan]) // eslint-disable-line react-hooks/exhaustive-deps

  // When in fixed-area mode, find the max-power plan for the given target area.
  useEffect(() => {
    if (constraintMode !== 'area') return
    const area = targetAreaSqFt ?? sitePlan?.metrics.boundingAreaSqFt
    if (!area) return
    let cancelled = false
    setOptimalMaxPower(undefined) // loading
    optimizeMaxPower(area).then(res => {
      if (cancelled) return
      setOptimalMaxPower(res.success && res.data ? res.data : null)
    })
    return () => { cancelled = true }
  }, [constraintMode, targetAreaSqFt, sitePlan?.metrics.boundingAreaSqFt]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleConstraintModeChange = (mode: 'power' | 'area') => {
    setConstraintMode(mode)
    if (mode === 'area') {
      // Default target area = current plan's area
      setTargetAreaSqFt(sitePlan?.metrics.boundingAreaSqFt ?? null)
    } else {
      setTargetAreaSqFt(null)
      setOptimalMaxPower(undefined)
    }
  }

  const handleTargetAreaChange = (areaSqFt: number) => {
    setTargetAreaSqFt(areaSqFt)
  }

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
          const initObjective = objectiveRef.current === 'user_plan' ? 'min_area' : objectiveRef.current
          generateSitePlan(configured, initObjective).then(planRes => {
            if (planRes.success && planRes.data) setSitePlan(planRes.data)
            else { console.error('[app] init generateSitePlan failed', planRes.error); setPlanError(planRes.error?.message ?? 'Failed to restore layout.') }
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
      setPlanError(null)
      const planObjective = objectiveRef.current === 'user_plan' ? 'min_area' : objectiveRef.current
      const res = await generateSitePlan(configured, planObjective)
      if (res.success && res.data) {
        setSitePlan(res.data)
        setIsDirty(true)
        // Push the pre-edit snapshot now that the plan is confirmed
        if (manualSnapshotRef.current !== null) {
          const snap = manualSnapshotRef.current
          setAppliedSnapshots(prev => [...prev, { quantities: snap, label: '', type: 'manual' as const }])
          manualSnapshotRef.current = null
        }
      } else {
        console.error('[app] generateSitePlan failed', res.error)
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
      ? await updateSession(currentSessionId, siteName.trim(), configured, saveObjective, sitePlan ?? undefined)
      : await createSession(siteName.trim(), configured, saveObjective, sitePlan ?? undefined)
    setIsSaving(false)
    if (!res.success) {
      console.error('[app] save session failed', res.error)
      setSaveError(res.error?.details?.[0] ?? res.error?.message ?? 'Failed to save.')
    } else {
      if (res.data?.sessionId) setCurrentSessionId(res.data.sessionId)
      setIsDirty(false)
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
    if (!res.success) console.error('[app] getSession failed', { sessionId }, res.error)
    if (res.success && res.data) {
      const { name, requestedDevices, metrics, layout, safetyAssumptions, warnings, objective: sessionObjective } = res.data
      setSitePlan({ requestedDevices, metrics, layout, safetyAssumptions, warnings, objective: sessionObjective })
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
      setIsDirty(false)
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
    setPlanError(null)
    const res = await generateSitePlan(configured, obj)
    if (res.success && res.data) setSitePlan(res.data)
    else { console.error('[app] objective change generateSitePlan failed', res.error); setPlanError(res.error?.message ?? 'Failed to generate layout.'); setSitePlan(null) }
  }

  const handleApplySuggestion = async (suggestion: OptimizationSuggestion) => {
    // Flush any pending manual-edit snapshot first
    if (manualSnapshotRef.current) {
      const snap = manualSnapshotRef.current
      setAppliedSnapshots(prev => [...prev, { quantities: snap, label: '', type: 'manual' as const }])
      manualSnapshotRef.current = null
    }
    // Push current state onto undo stack so user can step back
    setAppliedSnapshots(prev => [...prev, { quantities: { ...quantities }, label: suggestion.toLabel, type: 'apply' as const }])
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
    setPlanError(null)
    const applyObjective = objectiveRef.current === 'user_plan' ? 'min_area' : objectiveRef.current
    const res = await generateSitePlan(configured, applyObjective)
    if (res.success && res.data) { setSitePlan(res.data); setIsDirty(true) }
    else { console.error('[app] apply suggestion generateSitePlan failed', res.error); setPlanError(res.error?.message ?? 'Failed to generate layout.'); setSitePlan(null) }
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
    setPlanError(null)
    const revertObjective = objectiveRef.current === 'user_plan' ? 'min_area' : objectiveRef.current
    const res = await generateSitePlan(configured, revertObjective)
    if (res.success && res.data) { setSitePlan(res.data); setIsDirty(true) }
    else { console.error('[app] revert generateSitePlan failed', res.error); setPlanError(res.error?.message ?? 'Failed to restore layout.'); setSitePlan(null) }
  }

  const handleTargetMWhChange = async (targetMWh: number) => {
    if (targetMWh <= 0) return

    setPlanError(null)
    clearTimeout(debounceRef.current)
    manualSnapshotRef.current = null
    setOptimalLayouts({}) // show in-panel loading text while computing

    const planObjective = objectiveRef.current === 'user_plan' ? 'min_area' : objectiveRef.current

    // Ask the backend to find the best device combination that achieves targetMWh.
    // This searches the full catalog (single-type and two-type mixes) so it can
    // find cross-type solutions that proportional scaling would miss (e.g. 7 MWh
    // via 1× Megapack XL + 1× Megapack 2 instead of 7× PowerPack).
    const res = await planForEnergy(targetMWh, planObjective)

    if (res.success && res.data) {
      const achievedMWh = res.data.metrics.totalEnergyMWh
      // Derive the new quantities from the plan's requestedDevices.
      const next: Record<number, number> = Object.fromEntries(
        res.data.requestedDevices.map(d => [d.id, d.quantity])
      )
      if (Math.abs(achievedMWh - targetMWh) > 0.1) {
        // Nearest achievable differs — ask for consent before applying.
        setPendingTargetPlan({ plan: res.data, quantities: next, requestedMWh: targetMWh })
      } else {
        setQuantities(next)
        setSitePlan(res.data)
        setAppliedSnapshots([])
      }
    } else {
      console.error('[app] planForEnergy failed', { targetMWh }, res.error)
      setPlanError(res.error?.message ?? 'Failed to generate layout.')
    }
  }

  const handleConfirmTargetPlan = () => {
    if (!pendingTargetPlan) return
    setQuantities(pendingTargetPlan.quantities)
    setSitePlan(pendingTargetPlan.plan)
    setAppliedSnapshots([])
    setPendingTargetPlan(null)
  }

  const handleCancelTargetPlan = () => {
    setPendingTargetPlan(null)
  }

  const resetSession = () => {
    clearTimeout(debounceRef.current)
    manualSnapshotRef.current = null
    setQuantities({})
    setSitePlan(null)
    setSiteName('')
    setCurrentSessionId(null)
    setAppliedSnapshots([])
    setOptimalLayouts({})
    setPlanError(null)
    setSaveError(null)
    setIsDirty(false)
    setPendingTargetPlan(null)
  }

  const handleNewSession = async (saveFirst: boolean) => {
    setConfirmNew(false)
    if (saveFirst) await handleSave()
    setLoadingSplash(true)
    setLoadingSplashFading(false)
    resetSession()
    setTimeout(() => setLoadingSplashFading(true), 600)
    setTimeout(() => setLoadingSplash(false), 1000)
  }

  const handleSaveAs = async (newName: string): Promise<boolean> => {
    const configured = Object.entries(quantities)
      .filter(([, q]) => q > 0)
      .map(([id, quantity]) => ({ id: Number(id), quantity }))
    const saveObjective = objective === 'user_plan' ? 'min_area' : objective
    const res = await createSession(newName, configured, saveObjective, sitePlan ?? undefined)
    if (!res.success) console.error('[app] saveAs createSession failed', { name: newName }, res.error)
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
    <div className="min-h-screen md:h-screen flex flex-col bg-gray-950 text-white overflow-auto md:overflow-hidden">
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
      <header className="shrink-0 sticky top-0 z-10 px-4 md:px-6 py-2 md:py-3 border-b border-gray-800 flex flex-wrap items-center justify-between gap-y-2 bg-gray-950/90 backdrop-blur-sm">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <div className="flex items-center gap-1 opacity-80 shrink-0">
            {[4, 3, 2, 1].map((h, i) => (
              <div key={i} className="w-2 bg-blue-500 rounded-sm" style={{ height: `${h * 5}px` }} />
            ))}
          </div>
          <h1 className="text-xs md:text-sm font-bold text-white tracking-tight shrink-0">Tesla Energy Site Planner</h1>
          {siteName && (
            <span className="text-xs text-gray-500 truncate min-w-0">
              {siteName}{isDirty && <span className="text-amber-400 ml-0.5">*</span>}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 md:gap-2">
          <button
            onClick={() => { if (isDirty && hasSelection) setConfirmNew(true); else { setLoadingSplash(true); setLoadingSplashFading(false); resetSession(); setTimeout(() => setLoadingSplashFading(true), 600); setTimeout(() => setLoadingSplash(false), 1000) } }}
            className="px-2 py-1 md:px-3 md:py-1.5 text-[10px] md:text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg transition-colors"
          >
            New
          </button>
          <button
            onClick={() => setShowResume(true)}
            className="px-2 py-1 md:px-3 md:py-1.5 text-[10px] md:text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg transition-colors"
          >
            Saved
          </button>
          <button
            onClick={handleSave}
            disabled={!hasSelection || isSaving || !!siteNameConflict}
            title={siteNameConflict ?? undefined}
            className="px-2 py-1 md:px-3 md:py-1.5 text-[10px] md:text-xs font-medium bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded-lg transition-colors"
          >
            {isSaving ? 'Saving…' : isDirty ? 'Save *' : 'Save'}
          </button>
        </div>
      </header>

      {/* New Session confirmation dialog */}
      {confirmNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl p-6 w-80 max-w-[calc(100vw-2rem)] flex flex-col gap-4">
            <p className="text-sm font-semibold text-white">Start a new session?</p>
            <p className="text-xs text-gray-400">You have unsaved changes. Do you want to save the current session before starting fresh?</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => handleNewSession(true)}
                className="w-full px-4 py-2 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
              >
                Save &amp; New
              </button>
              <button
                onClick={() => handleNewSession(false)}
                className="w-full px-4 py-2 text-xs font-medium bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg transition-colors"
              >
                Discard &amp; New
              </button>
              <button
                onClick={() => setConfirmNew(false)}
                className="w-full px-4 py-2 text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col md:flex-row md:overflow-hidden">
        <DeviceCatalog
          devices={devices}
          quantities={quantities}
          onChange={handleQuantityChange}
        />

        <main className="flex-1 flex flex-col md:overflow-hidden">
          <SiteCanvas
            sitePlan={sitePlan}
            error={planError}
            onRemove={id => handleQuantityChange(id, Math.max(0, (quantities[id] ?? 0) - 1))}
            siteName={siteName}
            onSiteNameChange={name => { setSiteName(name); setSaveError(null); setIsDirty(true) }}
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
              onTargetMWhChange={handleTargetMWhChange}
              appliedSnapshots={appliedSnapshots}
              onRevert={handleRevert}
              onSaveAs={handleSaveAs}
              currentSiteName={siteName}
              sessionNames={sessionNames}
              optimalLayouts={optimalLayouts}
              constraintMode={constraintMode}
              onConstraintModeChange={handleConstraintModeChange}
              targetAreaSqFt={targetAreaSqFt ?? sitePlan.metrics.boundingAreaSqFt}
              onTargetAreaChange={handleTargetAreaChange}
              optimalMaxPower={optimalMaxPower}
              pendingTargetPlan={pendingTargetPlan ? { requestedMWh: pendingTargetPlan.requestedMWh, achievedMWh: pendingTargetPlan.plan.metrics.totalEnergyMWh } : null}
              onConfirmTargetPlan={handleConfirmTargetPlan}
              onCancelTargetPlan={handleCancelTargetPlan}
            />
          )}
        </main>
      </div>

      {showResume && (
        <ResumeModal
          onResume={handleResume}
          onDelete={id => { if (id === currentSessionId) { setCurrentSessionId(null); setIsDirty(true) }; refreshSessionNames() }}
          onClose={() => setShowResume(false)}
        />
      )}
    </div>
  )
}
