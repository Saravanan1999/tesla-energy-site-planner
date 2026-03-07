import { useState } from 'react'
import type {
  OptimalEntry, OptimalLayouts, OptimizationObjective, OptimizationSuggestion,
  SessionData, SitePlanData,
} from '../types/api'

interface Props {
  sitePlan: SitePlanData
  objective: OptimizationObjective
  onObjectiveChange: (obj: OptimizationObjective) => void
  onApply: (suggestion: OptimizationSuggestion) => void
  appliedSnapshots: { quantities: Record<number, number>; label: string; type: 'apply' | 'manual' }[]
  onRevert: () => void
  onSaveAs: (name: string) => Promise<boolean>
  currentSiteName: string
  sessionNames: SessionData[]
  optimalLayouts: OptimalLayouts
  onTargetMWhChange: (mwh: number) => void
}

const OBJECTIVES: { id: Exclude<OptimizationObjective, 'user_plan'>; label: string; description: string }[] = [
  { id: 'min_area', label: 'Min Area', description: 'Smallest site footprint at fixed total MWh' },
  { id: 'min_cost', label: 'Min Cost', description: 'Lowest total equipment cost at fixed total MWh' },
]

function fmtCost(c: number): string {
  return c >= 1_000_000 ? `$${(c / 1_000_000).toFixed(1)}M` : c >= 1000 ? `$${Math.round(c / 1000)}k` : `$${c}`
}

/** Build the reason string from actual generated metrics. */
function buildReason(
  obj: 'min_area' | 'min_cost',
  entry: OptimalEntry,
  current: SitePlanData,
): string {
  const om = entry.plan.metrics
  const cm = current.metrics
  if (obj === 'min_area') {
    const saved = cm.boundingAreaSqFt - om.boundingAreaSqFt
    const costDelta = om.totalCost - cm.totalCost
    const costNote = costDelta > 0
      ? ` (costs ${fmtCost(costDelta)} more)`
      : costDelta < 0
        ? ` (saves ${fmtCost(-costDelta)} in cost too)`
        : ''
    return `${entry.label} — total site ${om.siteWidthFt}×${om.siteHeightFt} ft (${om.boundingAreaSqFt.toLocaleString()} ft²), saves ${saved.toLocaleString()} ft² vs your current ${cm.boundingAreaSqFt.toLocaleString()} ft²${costNote}.`
  }
  const saved = cm.totalCost - om.totalCost
  return `${entry.label} — total cost ${fmtCost(om.totalCost)} incl. ${om.requiredTransformers} transformer${om.requiredTransformers !== 1 ? 's' : ''}, saves ${fmtCost(saved)} vs your current ${fmtCost(cm.totalCost)}.`
}

/** Compute a suggestion from an OptimalEntry for passing to onApply. */
function entryToSuggestion(entry: OptimalEntry, current: SitePlanData): OptimizationSuggestion {
  const om = entry.plan.metrics
  const cm = current.metrics
  const first = entry.plan.requestedDevices[0]
  return {
    fromDeviceId: -1,
    fromLabel: 'current selection',
    fromQty: current.requestedDevices.reduce((s, cd) => s + cd.quantity, 0),
    toDeviceId: first?.id ?? -1,
    toLabel: entry.label,
    toQty: first?.quantity ?? 0,
    deltaAreaSqFt: om.boundingAreaSqFt - cm.boundingAreaSqFt,
    deltaCost: om.totalCost - cm.totalCost,
    deltaEnergyMWh: om.totalEnergyMWh - cm.totalEnergyMWh,
    reason: '',
    newQuantities: Object.fromEntries(entry.plan.requestedDevices.map(cd => [cd.id, cd.quantity])),
  }
}

interface PlanBadge { label: string; text: string; good: boolean; loading: boolean }

function computePlanBadges(current: SitePlanData, optimalLayouts: OptimalLayouts): PlanBadge[] {
  const cm = current.metrics

  const areaBadge = (): PlanBadge => {
    const e = optimalLayouts.min_area
    if (e === undefined) return { label: 'Area', text: '…', good: false, loading: true }
    if (e === null) return { label: 'Area', text: '✓ optimal', good: true, loading: false }
    const delta = e.plan.metrics.boundingAreaSqFt - cm.boundingAreaSqFt
    const abs = Math.abs(delta)
    return {
      label: 'Area',
      text: delta < 0 ? `+${abs.toLocaleString()} ft²` : `−${abs.toLocaleString()} ft²`,
      good: delta >= 0,
      loading: false,
    }
  }

  const costBadge = (): PlanBadge => {
    const e = optimalLayouts.min_cost
    if (e === undefined) return { label: 'Cost', text: '…', good: false, loading: true }
    if (e === null) return { label: 'Cost', text: '✓ optimal', good: true, loading: false }
    const delta = e.plan.metrics.totalCost - cm.totalCost
    const abs = Math.abs(delta)
    const fmt = abs >= 1_000_000 ? `$${(abs / 1_000_000).toFixed(1)}M` : abs >= 1000 ? `$${Math.round(abs / 1000)}k` : `$${abs}`
    return {
      label: 'Cost',
      text: delta < 0 ? `+${fmt}` : `−${fmt}`,
      good: delta >= 0,
      loading: false,
    }
  }

  return [areaBadge(), costBadge()]
}

export default function OptimizationPanel({
  sitePlan, objective, onObjectiveChange, onApply,
  appliedSnapshots, onRevert, onSaveAs, currentSiteName, sessionNames,
  optimalLayouts, onTargetMWhChange,
}: Props) {
  const [saveAsOpen, setSaveAsOpen] = useState(false)
  const [saveAsName, setSaveAsName] = useState('')
  const [saveAsWorking, setSaveAsWorking] = useState(false)
  const [saveAsError, setSaveAsError] = useState<string | null>(null)
  const [editingMWh, setEditingMWh] = useState(false)
  const [mwhInput, setMwhInput] = useState('')

  const startEditingMWh = () => {
    setMwhInput(sitePlan.metrics.totalEnergyMWh.toFixed(1))
    setEditingMWh(true)
  }

  const commitMWh = () => {
    setEditingMWh(false)
    const val = parseFloat(mwhInput)
    if (!isNaN(val) && val > 0 && Math.abs(val - sitePlan.metrics.totalEnergyMWh) > 0.05) {
      onTargetMWhChange(val)
    }
  }

  const activeObjective = (objective === 'user_plan' ? 'min_area' : objective) as 'min_area' | 'min_cost'
  const optEntry = optimalLayouts[activeObjective]  // undefined=loading, null=already optimal, entry=suggestion available
  const planBadges = computePlanBadges(sitePlan, optimalLayouts)

  const saveAsConflict = saveAsName.trim()
    ? sessionNames.some(s => s.name.toLowerCase() === saveAsName.trim().toLowerCase())
    : false

  const openSaveAs = () => {
    setSaveAsName(currentSiteName ? `${currentSiteName} — Optimized` : 'Optimized Plan')
    setSaveAsError(null)
    setSaveAsOpen(true)
  }

  const handleSaveAsConfirm = async () => {
    if (!saveAsName.trim() || saveAsConflict) return
    setSaveAsWorking(true)
    setSaveAsError(null)
    const ok = await onSaveAs(saveAsName.trim())
    setSaveAsWorking(false)
    if (ok) setSaveAsOpen(false)
    else setSaveAsError('Failed to save. Try a different name.')
  }

  return (
    <div className="shrink-0 border-t border-gray-800" style={{ background: 'rgba(3,7,18,0.6)' }}>

      {/* Revert / Save-as bar */}
      {appliedSnapshots.length > 0 && (() => {
        const latest = appliedSnapshots[appliedSnapshots.length - 1]
        const step = appliedSnapshots.length
        return (
        <div
          className="flex items-center gap-3 px-4 py-1.5 border-b border-gray-800/60 flex-wrap"
          style={{ background: 'rgba(37,99,235,0.06)' }}
        >
          <span className="text-[10px] text-blue-400/80 shrink-0">
            {latest.type === 'apply'
              ? <>Applied: <span className="font-medium text-blue-300">{latest.label}</span></>
              : <span className="text-gray-400">Manual edit</span>
            }
            {step > 1 && <span className="text-gray-600 ml-1">({step} steps)</span>}
          </span>
          <div className="w-px h-3 bg-gray-700 shrink-0" />
          <button onClick={onRevert} className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-white transition-colors shrink-0">
            <span style={{ fontSize: 9 }}>←</span> Undo
          </button>
          <div className="w-px h-3 bg-gray-700 shrink-0" />
          {!saveAsOpen ? (
            <button onClick={openSaveAs} className="text-[10px] text-gray-400 hover:text-white transition-colors shrink-0">
              Save as new session
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <div className="flex flex-col gap-0.5">
                <input
                  autoFocus
                  value={saveAsName}
                  onChange={e => setSaveAsName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveAsConfirm(); if (e.key === 'Escape') setSaveAsOpen(false) }}
                  placeholder="Session name"
                  className="text-[10px] px-2 py-0.5 rounded bg-gray-900 text-white outline-none w-44"
                  style={{ border: `1px solid ${saveAsConflict ? 'rgba(245,158,11,0.6)' : 'rgba(55,65,81,0.8)'}` }}
                />
                {saveAsConflict && (
                  <span className="text-[9px]" style={{ color: 'rgba(251,191,36,0.85)' }}>Name already exists — choose a different name</span>
                )}
              </div>
              <button
                onClick={handleSaveAsConfirm}
                disabled={saveAsWorking || !saveAsName.trim() || saveAsConflict}
                className="text-[10px] px-2 py-0.5 rounded font-medium text-white disabled:opacity-40 transition-colors"
                style={{ background: 'rgba(37,99,235,0.5)', border: '1px solid rgba(37,99,235,0.4)' }}
              >
                {saveAsWorking ? '…' : 'Save'}
              </button>
              <button onClick={() => setSaveAsOpen(false)} className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors">Cancel</button>
              {saveAsError && <span className="text-[10px] text-red-400">{saveAsError}</span>}
            </div>
          )}
        </div>
        )
      })()}

      {/* Main row */}
      <div className="flex items-center gap-5 overflow-x-auto px-4 py-2.5">

        {/* Objective selector */}
        <div className="shrink-0">
          <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1.5 flex items-baseline gap-0">
            Optimize for
            {editingMWh ? (
              <span className="ml-1.5 flex items-baseline gap-0.5 normal-case tracking-normal font-normal">
                <span className="text-gray-600">· fixed</span>
                <input
                  autoFocus
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={mwhInput}
                  onChange={e => setMwhInput(e.target.value)}
                  onBlur={commitMWh}
                  onKeyDown={e => { if (e.key === 'Enter') commitMWh(); if (e.key === 'Escape') setEditingMWh(false) }}
                  className="w-14 mx-1 bg-gray-900 text-blue-300 text-[10px] px-1.5 py-0 rounded outline-none"
                  style={{ border: '1px solid rgba(37,99,235,0.5)' }}
                />
                <span className="text-gray-600">MWh</span>
              </span>
            ) : (
              <button
                onClick={startEditingMWh}
                title="Click to change target energy"
                className="ml-1.5 normal-case tracking-normal text-gray-600 hover:text-gray-300 font-normal transition-colors"
              >
                · {sitePlan.metrics.totalEnergyMWh.toFixed(1)} MWh ✎
              </button>
            )}
          </p>
          <div className="flex items-center gap-1">
            {OBJECTIVES.map(o => {
              const selected = activeObjective === o.id
              return (
                <button
                  key={o.id}
                  onClick={() => onObjectiveChange(o.id)}
                  title={o.description}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors"
                  style={selected
                    ? { background: 'rgba(37,99,235,0.18)', border: '1px solid rgba(37,99,235,0.45)', color: '#60a5fa' }
                    : { border: '1px solid transparent', color: '#6b7280' }}
                >
                  <div className="flex items-center justify-center shrink-0"
                    style={{ width: 10, height: 10, borderRadius: '50%', border: selected ? '1.5px solid #60a5fa' : '1.5px solid #4b5563' }}>
                    {selected && <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#60a5fa' }} />}
                  </div>
                  {o.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="shrink-0 self-stretch w-px bg-gray-800" />

        {/* Suggestion */}
        {optEntry === undefined && (
          <p className="text-[11px] text-gray-600 italic">Computing optimal layout…</p>
        )}
        {optEntry === null && (
          <p className="text-[11px] text-gray-600 italic">Layout is already globally optimal for this objective.</p>
        )}
        {optEntry && (() => {
          const dm = optEntry.plan.metrics
          const cm = sitePlan.metrics
          const deltaArea = dm.boundingAreaSqFt - cm.boundingAreaSqFt
          const deltaCost = dm.totalCost - cm.totalCost
          const deltaEnergy = dm.totalEnergyMWh - cm.totalEnergyMWh
          const suggestion = entryToSuggestion(optEntry, sitePlan)
          return (
            <div className="flex items-center gap-4 min-w-0">
              <div className="shrink-0">
                <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-0.5">Global optimum</p>
                <p className="text-xs text-white leading-tight">
                  <span className="text-blue-400 font-medium">{optEntry.label}</span>
                  <span className="text-gray-600 text-[10px] ml-1">{dm.siteWidthFt}×{dm.siteHeightFt} ft</span>
                </p>
              </div>
              <div className="shrink-0 flex items-center gap-1.5">
                {deltaArea !== 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                    style={deltaArea < 0
                      ? { background: 'rgba(34,197,94,0.1)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.25)' }
                      : { background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}>
                    {deltaArea > 0 ? '+' : ''}{deltaArea.toLocaleString()} ft²
                  </span>
                )}
                {deltaCost !== 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                    style={deltaCost < 0
                      ? { background: 'rgba(34,197,94,0.1)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.25)' }
                      : { background: 'rgba(245,158,11,0.1)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.25)' }}>
                    {deltaCost > 0 ? '+' : '−'}${Math.abs(deltaCost).toLocaleString()}
                  </span>
                )}
                {Math.abs(deltaEnergy) < 0.01
                  ? <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'rgba(55,65,81,0.5)', color: '#9ca3af', border: '1px solid #374151' }}>same energy</span>
                  : <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'rgba(55,65,81,0.5)', color: '#9ca3af', border: '1px solid #374151' }}>≈{deltaEnergy > 0 ? '+' : ''}{deltaEnergy.toFixed(1)} MWh</span>
                }
              </div>
              <p className="text-[10px] text-gray-500 shrink-0 max-w-xs">{buildReason(activeObjective, optEntry, sitePlan)}</p>
              <button
                onClick={() => onApply({ ...suggestion, reason: buildReason(activeObjective, optEntry, sitePlan) })}
                className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors"
              >
                Apply
              </button>
            </div>
          )
        })()}
      </div>

      {/* Current plan — always-visible pro/con row */}
      <div className="flex items-center gap-2 px-4 pb-2 overflow-x-auto">
        <p className="text-[9px] text-gray-600 uppercase tracking-widest shrink-0">Current plan</p>
        {planBadges.map(({ label, text, good, loading }) => (
          <span key={label} className="text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap"
            style={loading
              ? { background: 'rgba(55,65,81,0.2)', color: '#4b5563', border: '1px solid #1f2937' }
              : good
                ? { background: 'rgba(34,197,94,0.07)', color: '#86efac', border: '1px solid rgba(34,197,94,0.18)' }
                : { background: 'rgba(239,68,68,0.07)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.18)' }
            }
          >
            <span className="text-gray-600 mr-0.5">{label}:</span> {text}
          </span>
        ))}
      </div>

    </div>
  )
}
