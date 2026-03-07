import { useLayoutEffect, useRef, useState } from 'react'
import type { SitePlanData, LayoutItem } from '../types/api'

interface Props {
  sitePlan: SitePlanData | null
  isLoading: boolean
  error: string | null
  onRemove?: (deviceId: number) => void
  siteName?: string
  onSiteNameChange?: (name: string) => void
  nameError?: string | null
}

const SCALE = 6 // px per foot

function TransformerIcon() {
  const tabs = [10, 21, 33, 44]
  return (
    <svg
      viewBox="0 0 60 60"
      className="absolute inset-0 w-full h-full pointer-events-none"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Top tabs */}
      {tabs.map(x => (
        <rect key={`t${x}`} x={x} y="4" width="5" height="6" rx="0.8" fill="#92400e" stroke="#b45309" strokeWidth="0.8" />
      ))}
      {/* Top rail */}
      <rect x="2" y="9" width="56" height="7" rx="1" fill="#92400e" stroke="#b45309" strokeWidth="0.8" />

      {/* Main body */}
      <rect x="4" y="16" width="52" height="28" rx="1.5" fill="#78350f" stroke="#b45309" strokeWidth="0.8" />

      {/* Warning triangle — yellow fill */}
      <path d="M 30 20 L 16 42 L 44 42 Z" fill="#fbbf24" stroke="#92400e" strokeWidth="1" />
      {/* Lightning bolt — dark */}
      <path d="M 32.5 24 L 26 34 L 30.5 34 L 27.5 42 L 34 32 L 29.5 32 Z" fill="#78350f" />

      {/* Bottom rail */}
      <rect x="2" y="44" width="56" height="7" rx="1" fill="#92400e" stroke="#b45309" strokeWidth="0.8" />
      {/* Bottom tabs */}
      {tabs.map(x => (
        <rect key={`b${x}`} x={x} y="50" width="5" height="6" rx="0.8" fill="#92400e" stroke="#b45309" strokeWidth="0.8" />
      ))}
    </svg>
  )
}

function LayoutBlock({ item, onRemove, isExiting }: { item: LayoutItem; onRemove?: (deviceId: number) => void; isExiting?: boolean }) {
  const isBattery = item.zone === 'battery'
  const segments = Math.max(1, Math.round(item.widthFt / 10))
  const w = item.widthFt * SCALE
  const h = item.heightFt * SCALE
  // Each cell is 10ft wide; leave 3px right for the terminal nub
  const cellPx = (w - 3) / segments

  return (
    <div
      className={`absolute flex items-stretch ${isExiting
        ? (isBattery ? 'animate-shrink-battery' : 'animate-shrink-transformer')
        : (isBattery ? 'animate-grow-battery' : 'animate-grow-transformer')
      } ${isExiting ? 'pointer-events-none' : ''}`}
      style={{ left: item.xFt * SCALE, top: item.yFt * SCALE, width: w, height: h }}
      title={`${item.label} — ${item.widthFt}×${item.heightFt}ft${item.energyMWh ? ` · ${item.energyMWh} MWh` : ''}`}
    >
      {/* Body */}
      <div className={`relative flex-1 flex items-center gap-px p-0.5 rounded-sm border overflow-hidden
        ${isBattery
          ? 'bg-blue-900/70 border-blue-500/60 hover:bg-blue-800/80'
          : 'bg-amber-950/80 border-amber-600/70 hover:bg-amber-900/80'
        }`}
      >
        {isBattery ? (
          <>
            {/* Fixed-width cell segments */}
            {Array.from({ length: segments }).map((_, i) => (
              <div
                key={i}
                className="shrink-0 rounded-sm h-full bg-blue-700/50 border border-blue-600/40"
                style={{ width: cellPx }}
              />
            ))}
            {/* Remove button */}
            {onRemove && (
              <button
                onClick={e => { e.stopPropagation(); onRemove(item.deviceId) }}
                className="absolute top-0.5 right-0.5 z-20 w-3.5 h-3.5 rounded-sm bg-blue-950/80 hover:bg-red-600 text-blue-300 hover:text-white flex items-center justify-center leading-none transition-colors text-[10px] font-bold"
              >−</button>
            )}
            {/* Label */}
            {w > 36 && (
              <span className="absolute bottom-0.5 left-1 right-0.5 z-10 text-[8px] font-semibold leading-tight text-blue-200 truncate">
                {item.label}
              </span>
            )}
          </>
        ) : (
          <>
            {/* Transformer icon */}
            <TransformerIcon />
            {/* Label */}
            {w > 36 && (
              <span className="absolute bottom-0.5 left-1 right-0.5 z-10 text-[7px] font-semibold leading-tight text-amber-300">
                {item.label}
              </span>
            )}
          </>
        )}

        {/* Gloss */}
        <div className="absolute inset-0 bg-linear-to-b from-white/5 to-transparent pointer-events-none" />
      </div>

      {/* Terminal nub */}
      <div className={`w-[3px] self-center h-1/3 rounded-r
        ${isBattery ? 'bg-blue-500' : 'bg-amber-500'}`}
      />
    </div>
  )
}

function GridLines({ widthFt, heightFt }: { widthFt: number; heightFt: number }) {
  const vLines = []
  const hLines = []
  for (let x = 0; x <= widthFt; x += 10) {
    vLines.push(
      <line key={`v${x}`} x1={x * SCALE} y1={0} x2={x * SCALE} y2={heightFt * SCALE}
        stroke="#1e293b" strokeWidth="1" />
    )
  }
  for (let y = 0; y <= heightFt; y += 10) {
    hLines.push(
      <line key={`h${y}`} x1={0} y1={y * SCALE} x2={widthFt * SCALE} y2={y * SCALE}
        stroke="#1e293b" strokeWidth="1" />
    )
  }
  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      width={widthFt * SCALE}
      height={heightFt * SCALE}
    >
      {vLines}{hLines}
    </svg>
  )
}

export default function SiteCanvas({ sitePlan, isLoading, error, onRemove, siteName, onSiteNameChange, nameError }: Props) {
  // Derive values unconditionally so hooks are always called in the same order
  const layout = sitePlan?.layout ?? []
  const canvasW = sitePlan ? sitePlan.metrics.siteWidthFt * SCALE : 0
  const canvasH = sitePlan ? sitePlan.metrics.siteHeightFt * SCALE : 0

  // displayLayout: what we actually render (frozen at old positions during exit animation)
  // exitingIds: IDs of items that are animating out
  const [displayLayout, setDisplayLayout] = useState<LayoutItem[]>([])
  const [exitingIds, setExitingIds] = useState<Set<string>>(new Set())
  const [minCanvasSize, setMinCanvasSize] = useState<{ w: number; h: number } | null>(null)
  const [perimeterTooltip, setPerimeterTooltip] = useState<{ x: number; y: number } | null>(null)
  const prevLayoutRef = useRef<LayoutItem[]>([])
  const prevCanvasRef = useRef({ w: canvasW, h: canvasH })

  useLayoutEffect(() => {
    if (!sitePlan) return
    const prevLayout = prevLayoutRef.current
    const currentIds = new Set(layout.map(i => i.id))
    const prevIds = new Set(prevLayout.map(i => i.id))
    const removedIds = prevLayout.filter(i => !currentIds.has(i.id)).map(i => i.id)
    const addedItems = layout.filter(i => !prevIds.has(i.id))

    if (removedIds.length > 0) {
      // Removal: freeze ALL items at old positions so nothing moves until the
      // shrink animation completes, then switch to the new layout.
      setDisplayLayout(prevLayout)
      setExitingIds(new Set(removedIds))
      setMinCanvasSize({ ...prevCanvasRef.current })

      const t = setTimeout(() => {
        setDisplayLayout(layout)
        setExitingIds(new Set())
        setMinCanvasSize(null)
        prevLayoutRef.current = layout
        prevCanvasRef.current = { w: canvasW, h: canvasH }
      }, 300)
      return () => clearTimeout(t)
    }

    if (addedItems.length > 0) {
      // Addition: show all existing items at their final positions immediately so
      // nothing jumps after the animation. Only the new items grow in (new React
      // keys trigger the CSS grow animation automatically).
      setDisplayLayout(layout)
      setExitingIds(new Set())
      prevLayoutRef.current = layout
      prevCanvasRef.current = { w: canvasW, h: canvasH }
      return
    }

    // No structural change — update positions immediately
    setDisplayLayout(layout)
    setExitingIds(new Set())
    prevLayoutRef.current = layout
    prevCanvasRef.current = { w: canvasW, h: canvasH }
  }, [layout, canvasW, canvasH, sitePlan])

  const displayedW = minCanvasSize ? Math.max(canvasW, minCanvasSize.w) : canvasW
  const displayedH = minCanvasSize ? Math.max(canvasH, minCanvasSize.h) : canvasH

  // Conditional renders AFTER all hooks
  if (error && !sitePlan) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-md text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <p className="text-red-400 font-medium">{error}</p>
        </div>
      </div>
    )
  }

  if (isLoading && !sitePlan) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-400">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          Generating layout…
        </div>
      </div>
    )
  }

  if (!sitePlan) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
        <div className="w-24 h-16 mb-6 flex items-center gap-1 opacity-20">
          {[4, 3, 2, 1].map((h, i) => (
            <div key={i} className="flex-1 bg-blue-400 rounded-sm" style={{ height: `${h * 14}px` }} />
          ))}
        </div>
        <h2 className="text-lg font-semibold text-gray-300 mb-2">No Layout Yet</h2>
        <p className="text-sm text-gray-500 max-w-xs">
          Select battery quantities from the catalog on the left to generate your site layout.
        </p>
      </div>
    )
  }

  const { metrics, safetyAssumptions } = sitePlan

  return (
    <div className="relative flex-1 flex flex-col overflow-hidden">
      {/* Canvas toolbar */}
      <div className="px-4 py-2 border-b border-gray-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Site Layout</h2>
          <div className="flex flex-col">
            <input
              type="text"
              value={siteName ?? ''}
              onChange={e => onSiteNameChange?.(e.target.value)}
              placeholder="site name"
              className={`h-6 px-2 text-xs text-gray-300 placeholder-gray-600 bg-gray-800/60 border rounded-md outline-none focus:text-white transition-colors w-36
                ${nameError ? 'border-red-500/70 focus:border-red-400' : 'border-gray-700/60 focus:border-gray-500'}`}
            />
            {nameError && <p className="text-[10px] text-red-400 mt-0.5 whitespace-nowrap">Enter a name to save</p>}
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          {/* Battery legend — mini battery with 2 cells + nub */}
          <span className="flex items-center gap-1.5">
            <span className="flex items-center h-4">
              <span className="flex items-center gap-px h-3 px-0.5 rounded-sm bg-blue-900/70 border border-blue-500/60">
                <span className="w-2.5 h-2 rounded-sm bg-blue-700/50 border border-blue-600/40 shrink-0" />
                <span className="w-2.5 h-2 rounded-sm bg-blue-700/50 border border-blue-600/40 shrink-0" />
              </span>
              <span className="w-[2px] h-1.5 bg-blue-500 rounded-r" />
            </span>
            Battery
          </span>

          {/* Transformer legend — mini version of the icon */}
          <span className="flex items-center gap-1.5">
            <span className="relative flex items-center h-4">
              <svg viewBox="0 0 60 60" className="w-6 h-4" preserveAspectRatio="xMidYMid meet">
                <rect x="6" y="4" width="4" height="5" rx="0.8" fill="#92400e" stroke="#b45309" strokeWidth="0.8" />
                <rect x="27" y="4" width="4" height="5" rx="0.8" fill="#92400e" stroke="#b45309" strokeWidth="0.8" />
                <rect x="48" y="4" width="4" height="5" rx="0.8" fill="#92400e" stroke="#b45309" strokeWidth="0.8" />
                <rect x="2" y="9" width="56" height="7" rx="1" fill="#92400e" stroke="#b45309" strokeWidth="0.8" />
                <rect x="4" y="16" width="52" height="28" rx="1.5" fill="#78350f" stroke="#b45309" strokeWidth="0.8" />
                <path d="M 30 20 L 16 42 L 44 42 Z" fill="#fbbf24" stroke="#92400e" strokeWidth="1" />
                <path d="M 32.5 24 L 26 34 L 30.5 34 L 27.5 42 L 34 32 L 29.5 32 Z" fill="#78350f" />
                <rect x="2" y="44" width="56" height="7" rx="1" fill="#92400e" stroke="#b45309" strokeWidth="0.8" />
                <rect x="6" y="50" width="4" height="5" rx="0.8" fill="#92400e" stroke="#b45309" strokeWidth="0.8" />
                <rect x="27" y="50" width="4" height="5" rx="0.8" fill="#92400e" stroke="#b45309" strokeWidth="0.8" />
                <rect x="48" y="50" width="4" height="5" rx="0.8" fill="#92400e" stroke="#b45309" strokeWidth="0.8" />
              </svg>
            </span>
            Transformer
          </span>

          <span>{SCALE}px/ft</span>
        </div>
      </div>

      {/* Subtle reload indicator — only shown when updating an existing plan */}
      {isLoading && (
        <div className="absolute top-12 right-4 z-30 flex items-center gap-1.5 px-2 py-1 rounded-md bg-gray-900/80 border border-gray-700/60 text-[10px] text-gray-400 pointer-events-none">
          <div className="w-3 h-3 border border-blue-500 border-t-transparent rounded-full animate-spin" />
          Updating…
        </div>
      )}

      {/* Scrollable canvas area */}
      <div className="flex-1 overflow-auto p-6 bg-gray-950">
        {/* Site bounding box */}
        <div
          className="relative bg-slate-900 border border-slate-700 rounded shadow-xl shadow-black/40"
          style={{ width: displayedW, height: displayedH, minWidth: displayedW, minHeight: displayedH, transition: 'width 0.28s ease-out, height 0.28s ease-out' }}
        >
          <GridLines widthFt={Math.round(displayedW / SCALE)} heightFt={Math.round(displayedH / SCALE)} />

          {/* Perimeter margin indicator */}
          <div
            className="absolute border border-dashed border-gray-700/50 pointer-events-none rounded"
            style={{
              left: safetyAssumptions.perimeterMarginFt * SCALE,
              top: safetyAssumptions.perimeterMarginFt * SCALE,
              width: (metrics.siteWidthFt - 2 * safetyAssumptions.perimeterMarginFt) * SCALE,
              height: (metrics.siteHeightFt - 2 * safetyAssumptions.perimeterMarginFt) * SCALE,
              transition: 'width 0.28s ease-out, height 0.28s ease-out',
            }}
          />

          {/* Perimeter hover strips */}
          {(() => {
            const m = safetyAssumptions.perimeterMarginFt * SCALE
            const onEnter = (e: React.MouseEvent) => setPerimeterTooltip({ x: e.clientX, y: e.clientY })
            const onMove  = (e: React.MouseEvent) => setPerimeterTooltip({ x: e.clientX, y: e.clientY })
            const onLeave = () => setPerimeterTooltip(null)
            const cls = 'absolute z-20 cursor-default hover:bg-blue-400/5'
            return (
              <>
                <div className={cls} style={{ top: 0, left: 0, right: 0, height: m }} onMouseEnter={onEnter} onMouseMove={onMove} onMouseLeave={onLeave} />
                <div className={cls} style={{ bottom: 0, left: 0, right: 0, height: m }} onMouseEnter={onEnter} onMouseMove={onMove} onMouseLeave={onLeave} />
                <div className={cls} style={{ top: m, bottom: m, left: 0, width: m }} onMouseEnter={onEnter} onMouseMove={onMove} onMouseLeave={onLeave} />
                <div className={cls} style={{ top: m, bottom: m, right: 0, width: m }} onMouseEnter={onEnter} onMouseMove={onMove} onMouseLeave={onLeave} />
              </>
            )
          })()}

          {/* Perimeter tooltip */}
          {perimeterTooltip && (
            <div
              className="fixed z-50 pointer-events-none px-2.5 py-1.5 rounded-lg bg-gray-800 border border-gray-600 shadow-xl text-xs text-gray-200 whitespace-nowrap"
              style={{ left: perimeterTooltip.x + 14, top: perimeterTooltip.y - 10 }}
            >
              Safety perimeter — {safetyAssumptions.perimeterMarginFt} ft clearance from site boundary
            </div>
          )}

          {/* Service aisle between battery zone and transformer zone */}
          {(() => {
            const batteryItems = displayLayout.filter(i => i.zone === 'battery')
            const transformerItems = displayLayout.filter(i => i.zone === 'transformer')
            if (batteryItems.length === 0 || transformerItems.length === 0) return null
            const aisleTopFt = Math.max(...batteryItems.map(i => i.yFt + i.heightFt))
            const aisleBottomFt = Math.min(...transformerItems.map(i => i.yFt))
            const aisleH = (aisleBottomFt - aisleTopFt) * SCALE
            if (aisleH <= 0) return null
            return (
              <div
                className="absolute left-0 right-0 flex items-center justify-center pointer-events-none"
                style={{ top: aisleTopFt * SCALE, height: aisleH }}
              >
                {/* Dashed top border */}
                <div className="absolute top-0 left-0 right-0 border-t border-dashed border-yellow-700/40" />
                {/* Dashed bottom border */}
                <div className="absolute bottom-0 left-0 right-0 border-t border-dashed border-yellow-700/40" />
                {/* Background tint */}
                <div className="absolute inset-0 bg-yellow-900/10" />
                {/* Label */}
                <div className="relative flex items-center gap-2 z-10">
                  <div className="h-px w-8 bg-yellow-700/50" />
                  <span className="text-[9px] font-medium tracking-widest uppercase text-yellow-600/70 whitespace-nowrap">
                    Service Aisle ({safetyAssumptions.transformerBufferFt} ft)
                  </span>
                  <div className="h-px w-8 bg-yellow-700/50" />
                </div>
              </div>
            )
          })()}

          {/* Layout items — rendered from frozen displayLayout during exit animation */}
          {displayLayout.map(item => (
            <LayoutBlock
              key={item.id}
              item={item}
              isExiting={exitingIds.has(item.id)}
              onRemove={exitingIds.has(item.id) ? undefined : onRemove}
            />
          ))}

          {/* Dimension labels */}
          <div className="absolute -bottom-5 left-0 right-0 flex justify-center">
            <span className="text-[10px] text-gray-600">{metrics.siteWidthFt} ft</span>
          </div>
          <div className="absolute -right-8 top-0 bottom-0 flex items-center">
            <span className="text-[10px] text-gray-600 -rotate-90 whitespace-nowrap">{metrics.siteHeightFt} ft</span>
          </div>
        </div>
      </div>

      {/* Warnings */}
      {sitePlan.warnings && sitePlan.warnings.length > 0 && (
        <div className="px-4 py-2 bg-amber-900/20 border-t border-amber-700/30 shrink-0">
          {sitePlan.warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-400">⚠ {w}</p>
          ))}
        </div>
      )}
    </div>
  )
}
