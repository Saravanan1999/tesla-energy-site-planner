import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { SitePlanData, LayoutItem } from '../types/api'
import { jsPDF } from 'jspdf'

interface Props {
  sitePlan: SitePlanData | null
  isLoading: boolean
  error: string | null
  onRemove?: (deviceId: number) => void
  siteName?: string
  onSiteNameChange?: (name: string) => void
  nameError?: string | null
  nameWarning?: string | null
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

function LayoutBlock({ item, numberedLabel, onRemove, isExiting, isNew, growDelay, slideDelay, flipFrom }: { item: LayoutItem; numberedLabel: string; onRemove?: (deviceId: number) => void; isExiting?: boolean; isNew?: boolean; growDelay?: number; slideDelay?: number; flipFrom?: { x: number; y: number; delay: number } }) {
  const isBattery = item.zone === 'battery'
  const segments = Math.max(1, Math.round(item.widthFt / 10))
  const w = item.widthFt * SCALE
  const h = item.heightFt * SCALE
  const cellPx = (w - 3) / segments
  const divRef = useRef<HTMLDivElement>(null)
  const prevXRef = useRef<number | null>(null)
  const prevYRef = useRef<number | null>(null)

  // Slide animation — handles two cases:
  //   1. New React instance (reindexed key): flipFrom gives the old pixel origin.
  //   2. Same React instance, position changed (key kept but item moved): prevXRef/prevYRef track it.
  useLayoutEffect(() => {
    const el = divRef.current
    if (!el || isExiting) return

    const newX = item.xFt * SCALE
    const newY = item.yFt * SCALE
    let startX: number, startY: number

    if (prevXRef.current === null) {
      // First mount — only animate if a flip origin was supplied
      if (!flipFrom) { prevXRef.current = newX; prevYRef.current = newY; return }
      startX = flipFrom.x
      startY = flipFrom.y
    } else if (prevXRef.current !== newX || prevYRef.current !== newY) {
      // Same instance, position updated
      startX = prevXRef.current
      startY = prevYRef.current!
    } else {
      return // no movement
    }

    prevXRef.current = newX
    prevYRef.current = newY

    const dx = startX - newX
    const dy = startY - newY
    const delay = flipFrom?.delay ?? slideDelay ?? 0

    // Apply the initial offset immediately so the item visually stays put
    // while we wait for its turn in the stagger sequence.
    el.style.transition = 'none'
    el.style.transform = `translate(${dx}px, ${dy}px)`

    let delayTimer: ReturnType<typeof setTimeout>
    let raf: number
    let cleanTimer: ReturnType<typeof setTimeout>
    delayTimer = setTimeout(() => {
      raf = requestAnimationFrame(() => {
        el.getBoundingClientRect() // force reflow
        el.style.transition = 'transform 0.5s cubic-bezier(0.25, 0.8, 0.25, 1)'
        el.style.transform = ''
        cleanTimer = setTimeout(() => { if (el) el.style.transition = '' }, 520)
      })
    }, delay)
    return () => {
      clearTimeout(delayTimer)
      cancelAnimationFrame(raf)
      clearTimeout(cleanTimer)
      if (el) { el.style.transition = ''; el.style.transform = '' }
    }
  }, [item.xFt, item.yFt]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={divRef}
      className={`absolute flex items-stretch group ${isExiting
        ? (isBattery ? 'animate-shrink-battery' : 'animate-shrink-transformer')
        : isNew
          ? (isBattery ? 'animate-grow-battery' : 'animate-grow-transformer')
          : ''
      } ${isExiting ? 'pointer-events-none' : ''}`}
      style={{ left: item.xFt * SCALE, top: item.yFt * SCALE, width: w, height: h, animationDelay: isNew && growDelay ? `${growDelay}ms` : undefined }}
    >
      {/* Device tooltip */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block pointer-events-none z-50 whitespace-nowrap">
        <div className="px-2 py-1 rounded bg-gray-900 border border-gray-700 shadow-xl text-[10px] text-gray-200">
          {numberedLabel} — {item.widthFt}×{item.heightFt}ft{item.energyMWh ? ` · ${item.energyMWh} MWh` : ''}
        </div>
      </div>
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
              <span className="absolute inset-1 z-10 text-[8px] font-semibold leading-tight text-blue-200 flex items-center justify-center text-center break-words overflow-hidden">
                {numberedLabel}
              </span>
            )}
          </>
        ) : (
          <>
            {/* Transformer icon */}
            <TransformerIcon />
            {/* Label */}
            {w > 36 && (
              <span className="absolute inset-1 z-10 text-[7px] font-semibold leading-tight text-amber-300 flex items-end justify-center text-center break-words overflow-hidden">
                {numberedLabel}
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

export default function SiteCanvas({ sitePlan, isLoading, error, onRemove, siteName, onSiteNameChange, nameError, nameWarning }: Props) {
  // Derive values unconditionally so hooks are always called in the same order
  const layout = sitePlan?.layout ?? []
  const canvasW = sitePlan ? sitePlan.metrics.siteWidthFt * SCALE : 0
  const canvasH = sitePlan ? sitePlan.metrics.siteHeightFt * SCALE : 0

  // displayLayout: what we actually render (frozen at old positions during exit animation)
  // exitingIds: IDs of items that are animating out
  const [displayLayout, setDisplayLayout] = useState<LayoutItem[]>([])
  const [exitingIds, setExitingIds] = useState<Set<string>>(new Set())
  const [animatingIds, setAnimatingIds] = useState<Set<string>>(new Set())
  const [minCanvasSize, setMinCanvasSize] = useState<{ w: number; h: number } | null>(null)
  const [suppressSizeTransition, setSuppressSizeTransition] = useState(false)
  const [perimeterTooltip, setPerimeterTooltip] = useState<{ x: number; y: number } | null>(null)
  const [gapTooltip, setGapTooltip] = useState<{ x: number; y: number } | null>(null)
  const [hoveredRow, setHoveredRow] = useState<number | null>(null)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const prevLayoutRef = useRef<LayoutItem[]>([])
  const animTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevCanvasRef = useRef({ w: canvasW, h: canvasH })
  const flipMapRef = useRef<Map<string, { x: number; y: number; delay: number }>>(new Map())
  const growDelayMapRef = useRef<Map<string, number>>(new Map())
  const slideDelayMapRef = useRef<Map<string, number>>(new Map())

  useLayoutEffect(() => {
    if (!sitePlan) return
    const prevLayout = prevLayoutRef.current
    const currentIds = new Set(layout.map(i => i.id))
    const prevIds = new Set(prevLayout.map(i => i.id))
    const removedIds = prevLayout.filter(i => !currentIds.has(i.id)).map(i => i.id)
    const addedItems = layout.filter(i => !prevIds.has(i.id))

    if (removedIds.length > 0) {
      // Phase 1: freeze everything at old positions while the removed item shrinks.
      // Simultaneously compute where each surviving item will need to come FROM
      // so Phase 2 can FLIP-animate them to their new positions.
      const removedSet = new Set(removedIds)
      const survivingOld = prevLayout.filter(i => !removedSet.has(i.id))
      const sortFn = (a: LayoutItem, b: LayoutItem) => a.yFt !== b.yFt ? a.yFt - b.yFt : a.xFt - b.xFt

      const oldByDevice = new Map<number, LayoutItem[]>()
      for (const item of survivingOld) {
        const arr = oldByDevice.get(item.deviceId) ?? []
        oldByDevice.set(item.deviceId, arr)
        arr.push(item)
      }
      for (const arr of oldByDevice.values()) arr.sort(sortFn)

      const newByDevice = new Map<number, LayoutItem[]>()
      for (const item of layout) {
        const arr = newByDevice.get(item.deviceId) ?? []
        newByDevice.set(item.deviceId, arr)
        arr.push(item)
      }
      for (const arr of newByDevice.values()) arr.sort(sortFn)

      const newFlipMap = new Map<string, { x: number; y: number; delay: number }>()
      for (const [deviceId, newItems] of newByDevice) {
        const oldItems = oldByDevice.get(deviceId) ?? []
        for (let i = 0; i < newItems.length && i < oldItems.length; i++) {
          const ox = oldItems[i].xFt * SCALE, oy = oldItems[i].yFt * SCALE
          const nx = newItems[i].xFt * SCALE, ny = newItems[i].yFt * SCALE
          if (ox !== nx || oy !== ny) newFlipMap.set(newItems[i].id, { x: ox, y: oy, delay: 0 })
        }
      }
      // Stagger: sort moving items by new position (top→bottom, left→right) and
      // assign an increasing delay so they slide in one by one.
      const staggerOrder = [...newFlipMap.keys()]
        .map(id => layout.find(i => i.id === id)!)
        .sort((a, b) => a.yFt !== b.yFt ? a.yFt - b.yFt : a.xFt - b.xFt)
      staggerOrder.forEach((item, idx) => {
        const entry = newFlipMap.get(item.id)!
        newFlipMap.set(item.id, { ...entry, delay: idx * 70 })
      })
      flipMapRef.current = newFlipMap

      // Total time for all FLIP animations after Phase 2 renders:
      // last stagger delay + 520ms (0.5s transition + buffer)
      const maxFlipDelay = staggerOrder.length > 0 ? (staggerOrder.length - 1) * 70 + 550 : 0

      setDisplayLayout(prevLayout)
      setExitingIds(new Set(removedIds))
      setMinCanvasSize({ ...prevCanvasRef.current })

      // Phase 2: after shrink completes, switch to new layout.
      // Items with changed keys (reindexed) mount fresh → their useLayoutEffect
      // reads flipFrom and FLIP-animates them from old position to new.
      const sortFn2 = (a: LayoutItem, b: LayoutItem) => a.yFt !== b.yFt ? a.yFt - b.yFt : a.xFt - b.xFt
      const t = setTimeout(() => {
        setDisplayLayout(layout)
        setExitingIds(new Set())
        prevLayoutRef.current = layout
        prevCanvasRef.current = { w: canvasW, h: canvasH }
        // Wait for all FLIP slide animations to finish before allowing canvas to shrink
        setTimeout(() => setMinCanvasSize(null), maxFlipDelay)
        setTimeout(() => { flipMapRef.current = new Map() }, 350)
        // If all/most items are new (e.g. session load), play grow animation
        if (addedItems.length > 0) {
          const sortedNew = [...addedItems].sort(sortFn2)
          const newGrowDelayMap = new Map<string, number>()
          sortedNew.forEach((item, idx) => newGrowDelayMap.set(item.id, idx * 70))
          growDelayMapRef.current = newGrowDelayMap
          if (animTimerRef.current) clearTimeout(animTimerRef.current)
          setAnimatingIds(new Set(addedItems.map(i => i.id)))
          const totalDuration = 900 + (sortedNew.length - 1) * 70
          animTimerRef.current = setTimeout(() => {
            setAnimatingIds(new Set())
            growDelayMapRef.current = new Map()
          }, totalDuration)
        }
      }, 300)
      return () => clearTimeout(t)
    }

    if (addedItems.length > 0) {
      // Canvas is growing — snap immediately so new devices don't appear outside the boundary
      setSuppressSizeTransition(true)
      requestAnimationFrame(() => setSuppressSizeTransition(false))
      // Detect existing items that shifted position to make room for the new battery.
      const movedItems = layout.filter(i => prevIds.has(i.id)).filter(i => {
        const prev = prevLayout.find(p => p.id === i.id)
        return prev && (prev.xFt !== i.xFt || prev.yFt !== i.yFt)
      })
      const sortFn = (a: LayoutItem, b: LayoutItem) => a.yFt !== b.yFt ? a.yFt - b.yFt : a.xFt - b.xFt
      const sortedMoved = [...movedItems].sort(sortFn)
      const newSlideDelayMap = new Map<string, number>()
      sortedMoved.forEach((item, idx) => newSlideDelayMap.set(item.id, idx * 70))
      slideDelayMapRef.current = newSlideDelayMap

      // New items grow in after the moved items have started sliding.
      const moveOffset = sortedMoved.length * 70
      const sortedNew = [...addedItems].sort(sortFn)
      const newGrowDelayMap = new Map<string, number>()
      sortedNew.forEach((item, idx) => newGrowDelayMap.set(item.id, moveOffset + idx * 70))
      growDelayMapRef.current = newGrowDelayMap

      if (animTimerRef.current) clearTimeout(animTimerRef.current)
      setAnimatingIds(new Set(addedItems.map(i => i.id)))
      const totalDuration = moveOffset + 900 + (sortedNew.length - 1) * 70
      animTimerRef.current = setTimeout(() => {
        setAnimatingIds(new Set())
        growDelayMapRef.current = new Map()
        slideDelayMapRef.current = new Map()
      }, totalDuration)
      setDisplayLayout(layout)
      setExitingIds(new Set())
      prevLayoutRef.current = layout
      prevCanvasRef.current = { w: canvasW, h: canvasH }
      return
    }

    // No structural change — update positions immediately
    const growing = canvasW > prevCanvasRef.current.w || canvasH > prevCanvasRef.current.h
    if (growing) { setSuppressSizeTransition(true); requestAnimationFrame(() => setSuppressSizeTransition(false)) }
    setDisplayLayout(layout)
    setExitingIds(new Set())
    prevLayoutRef.current = layout
    prevCanvasRef.current = { w: canvasW, h: canvasH }
  }, [layout, canvasW, canvasH, sitePlan])

  const displayedW = minCanvasSize ? Math.max(canvasW, minCanvasSize.w) : canvasW
  const displayedH = minCanvasSize ? Math.max(canvasH, minCanvasSize.h) : canvasH

  // Zoom & pan
  const zoomRef = useRef(1)
  const panRef  = useRef({ x: 24, y: 24 })
  const [zoom, setZoomState] = useState(1)
  const [pan,  setPanState]  = useState({ x: 24, y: 24 })
  const [dragging, setDragging] = useState(false)
  const isDragging = useRef(false)
  const dragStart  = useRef({ x: 0, y: 0, px: 0, py: 0 })

  const setZoom = (z: number) => { zoomRef.current = z; setZoomState(z) }
  const setPan  = (p: { x: number; y: number }) => { panRef.current = p; setPanState(p) }
  const resetView = () => { setZoom(1); setPan({ x: 24, y: 24 }) }

  const exportCanvas = (format: 'png' | 'pdf') => {
    if (!sitePlan) return
    setShowExportMenu(false)
    const { metrics, safetyAssumptions: sa } = sitePlan
    const name = siteName?.trim() || 'site-layout'
    const S = SCALE * 2
    const pad = 56
    const W = metrics.siteWidthFt * S
    const H = metrics.siteHeightFt * S
    const totalW = W + pad * 2
    const totalH = H + pad * 2 + 24 // extra bottom for site name

    const canvas = document.createElement('canvas')
    canvas.width = totalW
    canvas.height = totalH
    const ctx = canvas.getContext('2d')!

    // ── Helpers ──────────────────────────────────────────────────────────
    const drawHatch = (x: number, y: number, w: number, h: number, color = 'rgba(71,85,105,0.3)') => {
      ctx.save()
      ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip()
      ctx.strokeStyle = color; ctx.lineWidth = 1.5
      for (let i = -(h + w); i < (h + w); i += 14) {
        ctx.beginPath(); ctx.moveTo(x + i, y); ctx.lineTo(x + i + h, y + h); ctx.stroke()
      }
      ctx.restore()
    }

    // ── Outer background ─────────────────────────────────────────────────
    ctx.fillStyle = '#020617'
    ctx.fillRect(0, 0, totalW, totalH)

    ctx.save()
    ctx.translate(pad, pad)

    // ── Site box ─────────────────────────────────────────────────────────
    ctx.fillStyle = '#0f172a'
    ctx.fillRect(0, 0, W, H)

    // Grid lines (10 ft cells)
    ctx.strokeStyle = 'rgba(51,65,85,0.45)'; ctx.lineWidth = 0.75
    for (let x = 0; x <= metrics.siteWidthFt; x += 10) {
      ctx.beginPath(); ctx.moveTo(x * S, 0); ctx.lineTo(x * S, H); ctx.stroke()
    }
    for (let y = 0; y <= metrics.siteHeightFt; y += 10) {
      ctx.beginPath(); ctx.moveTo(0, y * S); ctx.lineTo(W, y * S); ctx.stroke()
    }

    // ── Perimeter strips ─────────────────────────────────────────────────
    const pm = sa.perimeterMarginFt * S
    drawHatch(0, 0, W, pm)                        // top
    drawHatch(0, H - pm, W, pm)                   // bottom
    drawHatch(0, pm, pm, H - 2 * pm)              // left
    drawHatch(W - pm, pm, pm, H - 2 * pm)         // right

    // Dashed inner border
    ctx.strokeStyle = 'rgba(100,116,139,0.65)'; ctx.lineWidth = 1.5; ctx.setLineDash([8, 6])
    ctx.strokeRect(pm, pm, W - 2 * pm, H - 2 * pm)
    ctx.setLineDash([])

    // Perimeter labels
    const perimLabel = `SAFETY PERIMETER — ${sa.perimeterMarginFt} ft`
    ctx.fillStyle = 'rgba(100,116,139,0.75)'; ctx.font = 'bold 9px system-ui,sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(perimLabel, W / 2, pm / 2)
    ctx.fillText(perimLabel, W / 2, H - pm / 2)
    ctx.save(); ctx.translate(pm / 2, H / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(perimLabel, 0, 0); ctx.restore()
    ctx.save(); ctx.translate(W - pm / 2, H / 2); ctx.rotate(Math.PI / 2); ctx.fillText(perimLabel, 0, 0); ctx.restore()

    // ── Service aisle ────────────────────────────────────────────────────
    const batteryItems = displayLayout.filter(i => i.zone === 'battery' && !exitingIds.has(i.id))
    const transformerItems = displayLayout.filter(i => i.zone === 'transformer' && !exitingIds.has(i.id))
    if (batteryItems.length > 0 && transformerItems.length > 0) {
      const aisleTopFt = Math.max(...batteryItems.map(i => i.yFt + i.heightFt))
      const aisleBottomFt = Math.min(...transformerItems.map(i => i.yFt))
      if (aisleBottomFt > aisleTopFt) {
        const aT = aisleTopFt * S, aH = (aisleBottomFt - aisleTopFt) * S
        ctx.fillStyle = 'rgba(120,53,15,0.22)'; ctx.fillRect(0, aT, W, aH)
        ctx.strokeStyle = 'rgba(217,119,6,0.5)'; ctx.lineWidth = 1.5; ctx.setLineDash([8, 6])
        ctx.beginPath(); ctx.moveTo(0, aT); ctx.lineTo(W, aT); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(0, aT + aH); ctx.lineTo(W, aT + aH); ctx.stroke()
        ctx.setLineDash([])
        const aisleText = `SERVICE AISLE — ${sa.transformerBufferFt} ft`
        ctx.font = 'bold 10px system-ui,sans-serif'
        const tw = ctx.measureText(aisleText).width
        const pw = tw + 24, ph = 20, px2 = W / 2 - pw / 2, py2 = aT + aH / 2 - ph / 2
        ctx.fillStyle = 'rgba(120,53,15,0.7)'; ctx.beginPath(); ctx.roundRect(px2, py2, pw, ph, 4); ctx.fill()
        ctx.strokeStyle = 'rgba(217,119,6,0.4)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(px2, py2, pw, ph, 4); ctx.stroke()
        ctx.fillStyle = '#f59e0b'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(aisleText, W / 2, aT + aH / 2)
      }
    }

    // ── Row aisles between battery rows ──────────────────────────────────
    const batteryRowYs = [...new Set(batteryItems.map(i => i.yFt))].sort((a, b) => a - b)
    batteryRowYs.slice(0, -1).forEach((yFt, idx) => {
      const rowH = batteryItems.find(i => i.yFt === yFt)?.heightFt ?? 0
      const aT = (yFt + rowH) * S, aH = batteryRowYs[idx + 1] * S - aT
      if (aH <= 0) return
      ctx.fillStyle = 'rgba(30,41,59,0.5)'; ctx.fillRect(0, aT, W, aH)
      ctx.strokeStyle = 'rgba(100,116,139,0.4)'; ctx.lineWidth = 1; ctx.setLineDash([6, 5])
      ctx.beginPath(); ctx.moveTo(0, aT); ctx.lineTo(W, aT); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(0, aT + aH); ctx.lineTo(W, aT + aH); ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(100,116,139,0.75)'; ctx.font = 'bold 9px system-ui,sans-serif'
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(`ROW AISLE — ${sa.rowAisleFt} ft`, W / 2, aT + aH / 2)
    })

    // ── Battery row labels ────────────────────────────────────────────────
    batteryRowYs.forEach((yFt, idx) => {
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.font = 'bold 8px system-ui,sans-serif'
      ctx.textAlign = 'left'; ctx.textBaseline = 'top'
      ctx.fillText(`BATTERY ROW ${idx + 1}`, pm + 4, yFt * S + 3)
    })

    // ── Layout items ──────────────────────────────────────────────────────
    const labelCounters: Record<string, number> = {}
    for (const item of displayLayout) {
      if (exitingIds.has(item.id)) continue
      labelCounters[item.label] = (labelCounters[item.label] ?? 0) + 1
      const label = `${item.label} #${labelCounters[item.label]}`
      const x = item.xFt * S, y = item.yFt * S, w = item.widthFt * S, h = item.heightFt * S, r = 4

      if (item.zone === 'battery') {
        ctx.fillStyle = '#1e3a5f'; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill()
        ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.stroke()
        const segs = Math.max(1, Math.round(item.widthFt / 10))
        ctx.strokeStyle = 'rgba(59,130,246,0.25)'; ctx.lineWidth = 1
        for (let j = 1; j < segs; j++) {
          const sx = x + (w / segs) * j
          ctx.beginPath(); ctx.moveTo(sx, y + 3); ctx.lineTo(sx, y + h - 3); ctx.stroke()
        }
        ctx.fillStyle = '#93c5fd'; ctx.font = `bold ${Math.max(9, Math.min(13, h * 0.28))}px system-ui,sans-serif`
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(label, x + w / 2, y + h / 2, w - 8)
      } else {
        ctx.fillStyle = '#78350f'; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill()
        ctx.strokeStyle = '#d97706'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.stroke()
        const cx = x + w / 2, cy = y + h * 0.42, bh = h * 0.42, bw = w * 0.22
        ctx.fillStyle = '#fbbf24'; ctx.beginPath()
        ctx.moveTo(cx + bw * 0.4, cy - bh / 2); ctx.lineTo(cx - bw * 0.6, cy + bh * 0.1)
        ctx.lineTo(cx + bw * 0.1, cy + bh * 0.1); ctx.lineTo(cx - bw * 0.4, cy + bh / 2)
        ctx.lineTo(cx + bw * 0.6, cy - bh * 0.1); ctx.lineTo(cx - bw * 0.1, cy - bh * 0.1)
        ctx.closePath(); ctx.fill()
        ctx.fillStyle = '#fcd34d'; ctx.font = `bold ${Math.max(8, Math.min(11, h * 0.22))}px system-ui,sans-serif`
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
        ctx.fillText(label, x + w / 2, y + h - 3, w - 8)
      }
    }

    // ── Site border ───────────────────────────────────────────────────────
    ctx.strokeStyle = 'rgba(71,85,105,0.5)'; ctx.lineWidth = 1.5; ctx.setLineDash([])
    ctx.strokeRect(0, 0, W, H)

    ctx.restore()

    // ── Dimension labels ──────────────────────────────────────────────────
    ctx.fillStyle = 'rgba(100,116,139,0.65)'; ctx.font = '11px system-ui,sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(`${metrics.siteWidthFt} ft`, pad + W / 2, pad + H + 8)
    ctx.save(); ctx.translate(pad - 10, pad + H / 2); ctx.rotate(-Math.PI / 2)
    ctx.textAlign = 'center'; ctx.fillText(`${metrics.siteHeightFt} ft`, 0, 0); ctx.restore()

    // ── Site name ─────────────────────────────────────────────────────────
    if (siteName?.trim()) {
      ctx.fillStyle = 'rgba(148,163,184,0.8)'; ctx.font = 'bold 13px system-ui,sans-serif'
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'
      ctx.fillText(siteName.trim(), pad, pad - 8)
    }

    // ── Download ──────────────────────────────────────────────────────────
    canvas.toBlob((blob: Blob | null) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      if (format === 'png') {
        const link = document.createElement('a')
        link.download = `${name}.png`
        link.href = url
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
      } else {
        const imgW = totalW / 2, imgH = totalH / 2
        const pdf = new jsPDF({ orientation: imgW > imgH ? 'landscape' : 'portrait', unit: 'px', format: [imgW + 40, imgH + 40] })
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 20, 20, imgW, imgH)
        pdf.save(`${name}.pdf`)
        URL.revokeObjectURL(url)
      }
    }, 'image/png')
  }

  // Callback ref — runs whenever the container element mounts or unmounts,
  // so the wheel listener is attached even when the canvas renders after sitePlan loads.
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null)
  const containerRef = setContainerEl

  useEffect(() => {
    if (!containerEl) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = containerEl.getBoundingClientRect()
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
      const newZoom = Math.min(5, Math.max(0.15, zoomRef.current * factor))
      const dz = newZoom / zoomRef.current
      setZoom(newZoom)
      setPan({ x: cx - (cx - panRef.current.x) * dz, y: cy - (cy - panRef.current.y) * dz })
    }
    containerEl.addEventListener('wheel', onWheel, { passive: false })
    return () => containerEl.removeEventListener('wheel', onWheel)
  }, [containerEl])

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    isDragging.current = true
    dragStart.current = { x: e.clientX, y: e.clientY, px: panRef.current.x, py: panRef.current.y }
    setDragging(true)
  }
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return
    setPan({ x: dragStart.current.px + e.clientX - dragStart.current.x, y: dragStart.current.py + e.clientY - dragStart.current.y })
  }
  const handleMouseUp = () => { isDragging.current = false; setDragging(false) }

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
                ${nameError ? 'border-red-500/70 focus:border-red-400' : nameWarning ? 'border-amber-500/60 focus:border-amber-400' : 'border-gray-700/60 focus:border-gray-500'}`}
            />
            {nameError && <p className="text-[10px] text-red-400 mt-0.5 whitespace-nowrap">Enter a name to save</p>}
            {!nameError && nameWarning && <p className="text-[10px] text-amber-400/80 mt-0.5 whitespace-nowrap">{nameWarning}</p>}
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

          <span className="text-gray-600 border-l border-gray-700/60 pl-4">Scale: 10 × 10 ft / cell</span>

          {/* Export */}
          {sitePlan && (
            <span className="relative border-l border-gray-700/60 pl-3">
              <button
                onClick={() => setShowExportMenu(v => !v)}
                className="flex items-center gap-1 px-2 py-1 text-[11px] text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
              >
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5.5 1v6M2.5 5l3 3 3-3" />
                  <path d="M1 9h9" />
                </svg>
                Export
              </button>
              {showExportMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />
                  <div className="absolute right-0 top-full mt-1.5 z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-xl overflow-hidden whitespace-nowrap">
                    <button onClick={() => exportCanvas('png')} className="flex items-center gap-2 w-full px-4 py-2 text-xs text-gray-300 hover:bg-gray-700 hover:text-white transition-colors">
                      <span className="text-gray-500">PNG</span> Export as image
                    </button>
                    <button onClick={() => exportCanvas('pdf')} className="flex items-center gap-2 w-full px-4 py-2 text-xs text-gray-300 hover:bg-gray-700 hover:text-white transition-colors border-t border-gray-800">
                      <span className="text-gray-500">PDF</span> Export as document
                    </button>
                  </div>
                </>
              )}
            </span>
          )}

          {/* Zoom controls */}
          <span className="flex items-center gap-0.5 border-l border-gray-700/60 pl-3">
            <span className="text-[10px] text-gray-500 uppercase tracking-widest mr-1.5">Zoom level</span>
            <div className="relative group/zoomout">
              <button
                onClick={() => { const z = Math.max(0.15, zoom - 0.25); setZoom(z) }}
                className="w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:bg-gray-700 hover:text-gray-200 transition-colors text-sm leading-none"
              >−</button>
              <div className="absolute top-full right-0 mt-1.5 hidden group-hover/zoomout:block pointer-events-none z-50 whitespace-nowrap">
                <div className="px-2 py-1 rounded bg-gray-900 border border-gray-700 shadow-xl text-[10px] text-gray-200">Zoom out</div>
              </div>
            </div>
            <span className="w-10 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
            <div className="relative group/zoomin">
              <button
                onClick={() => { const z = Math.min(5, zoom + 0.25); setZoom(z) }}
                className="w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:bg-gray-700 hover:text-gray-200 transition-colors text-sm leading-none"
              >+</button>
              <div className="absolute top-full right-0 mt-1.5 hidden group-hover/zoomin:block pointer-events-none z-50 whitespace-nowrap">
                <div className="px-2 py-1 rounded bg-gray-900 border border-gray-700 shadow-xl text-[10px] text-gray-200">Zoom in</div>
              </div>
            </div>
            <div className="relative group/reset ml-0.5">
              <button
                onClick={resetView}
                className="w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:bg-gray-700 hover:text-gray-200 transition-colors"
              >
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                  <path d="M9.5 5.5A4 4 0 1 1 7 2" />
                  <path d="M7 1v2h2" />
                </svg>
              </button>
              <div className="absolute top-full right-0 mt-1.5 hidden group-hover/reset:block pointer-events-none z-50 whitespace-nowrap">
                <div className="px-2 py-1 rounded bg-gray-900 border border-gray-700 shadow-xl text-[10px] text-gray-200">Reset view</div>
              </div>
            </div>
          </span>
        </div>
      </div>

      {/* Pan/zoom canvas area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden bg-gray-950 relative select-none"
        style={{ cursor: dragging ? 'grabbing' : 'grab' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div style={{ position: 'absolute', top: 0, left: 0, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}>
        {/* Site bounding box */}
        <div
          className="relative bg-slate-900 border border-slate-700 rounded shadow-xl shadow-black/40"
          style={{ width: displayedW, height: displayedH, minWidth: displayedW, minHeight: displayedH, transition: suppressSizeTransition ? 'none' : 'width 0.28s ease-out, height 0.28s ease-out' }}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            const localY = (e.clientY - rect.top) / zoom
            const batteryRows = [...new Set(displayLayout.filter(i => i.zone === 'battery' && !exitingIds.has(i.id)).map(i => i.yFt))].sort((a, b) => a - b)
            const idx = batteryRows.findIndex(yFt => {
              const h = displayLayout.find(i => i.zone === 'battery' && i.yFt === yFt)?.heightFt ?? 0
              return localY >= yFt * SCALE && localY < (yFt + h) * SCALE
            })
            setHoveredRow(idx === -1 ? null : idx)
          }}
          onMouseLeave={() => setHoveredRow(null)}
        >
          <GridLines widthFt={Math.round(displayedW / SCALE)} heightFt={Math.round(displayedH / SCALE)} />

          {/* Perimeter strips */}
          {(() => {
            const m = safetyAssumptions.perimeterMarginFt * SCALE
            const onEnter = (e: React.MouseEvent) => {
              const r = e.currentTarget.getBoundingClientRect()
              setPerimeterTooltip({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
            }
            const onLeave = () => setPerimeterTooltip(null)
            const stripeBg = 'repeating-linear-gradient(45deg, rgba(51,65,85,0.35), rgba(51,65,85,0.35) 3px, transparent 3px, transparent 10px)'
            const label = `Safety Perimeter — ${safetyAssumptions.perimeterMarginFt} ft`
            const labelCls = 'text-[8px] font-semibold tracking-wider uppercase text-slate-500 whitespace-nowrap pointer-events-none select-none'
            return (
              <>
                {/* Top */}
                <div className="absolute z-20 cursor-default flex items-center justify-center overflow-hidden" style={{ top: 0, left: 0, right: 0, height: m, background: stripeBg }} onMouseEnter={onEnter} onMouseLeave={onLeave}>
                  <div className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ background: 'repeating-linear-gradient(90deg, #475569 0px, #475569 6px, transparent 6px, transparent 12px)' }} />
                  <span className={labelCls}>{label}</span>
                </div>
                {/* Bottom */}
                <div className="absolute z-20 cursor-default flex items-center justify-center overflow-hidden" style={{ bottom: 0, left: 0, right: 0, height: m, background: stripeBg }} onMouseEnter={onEnter} onMouseLeave={onLeave}>
                  <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: 'repeating-linear-gradient(90deg, #475569 0px, #475569 6px, transparent 6px, transparent 12px)' }} />
                  <span className={labelCls}>{label}</span>
                </div>
                {/* Left */}
                <div className="absolute z-20 cursor-default flex items-center justify-center overflow-hidden" style={{ top: m, bottom: m, left: 0, width: m, background: stripeBg }} onMouseEnter={onEnter} onMouseLeave={onLeave}>
                  <div className="absolute top-0 bottom-0 right-0 w-[2px]" style={{ background: 'repeating-linear-gradient(180deg, #475569 0px, #475569 6px, transparent 6px, transparent 12px)' }} />
                  <span className={labelCls} style={{ transform: 'rotate(-90deg)' }}>{label}</span>
                </div>
                {/* Right */}
                <div className="absolute z-20 cursor-default flex items-center justify-center overflow-hidden" style={{ top: m, bottom: m, right: 0, width: m, background: stripeBg }} onMouseEnter={onEnter} onMouseLeave={onLeave}>
                  <div className="absolute top-0 bottom-0 left-0 w-[2px]" style={{ background: 'repeating-linear-gradient(180deg, #475569 0px, #475569 6px, transparent 6px, transparent 12px)' }} />
                  <span className={labelCls} style={{ transform: 'rotate(90deg)' }}>{label}</span>
                </div>
              </>
            )
          })()}



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
                className="absolute left-0 right-0 pointer-events-none"
                style={{ top: aisleTopFt * SCALE, height: aisleH }}
              >
                {/* Background tint */}
                <div className="absolute inset-0 bg-amber-950/40" />
                {/* Top border */}
                <div className="absolute top-0 left-0 right-0 border-t-2 border-dashed border-amber-500/50" />
                {/* Bottom border */}
                <div className="absolute bottom-0 left-0 right-0 border-t-2 border-dashed border-amber-500/50" />
                {/* Centered label */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex items-center gap-3">
                    <div className="h-px flex-1 w-12 bg-amber-600/40" />
                    <div className="flex items-center gap-2 px-3 py-1 rounded bg-amber-900/60 border border-amber-600/40">
                      <span className="text-amber-500/70 text-[8px] leading-none">⚠</span>
                      <span className="text-[9px] font-semibold tracking-widest uppercase text-amber-400 whitespace-nowrap">
                        Service Aisle — {safetyAssumptions.transformerBufferFt} ft
                      </span>
                      <span className="text-amber-500/70 text-[8px] leading-none">⚠</span>
                    </div>
                    <div className="h-px flex-1 w-12 bg-amber-600/40" />
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Side clearance gap indicators */}
          {(() => {
            const rowMap = new Map<string, LayoutItem[]>()
            for (const item of displayLayout) {
              if (exitingIds.has(item.id)) continue
              const key = `${item.zone}-${item.yFt}`
              if (!rowMap.has(key)) rowMap.set(key, [])
              rowMap.get(key)!.push(item)
            }
            const gaps: React.ReactNode[] = []
            for (const items of rowMap.values()) {
              if (items.length < 2) continue
              const sorted = [...items].sort((a, b) => a.xFt - b.xFt)
              for (let i = 0; i < sorted.length - 1; i++) {
                const left = sorted[i]
                const gapX = (left.xFt + left.widthFt) * SCALE
                const gapY = left.yFt * SCALE
                const gapW = safetyAssumptions.sideClearanceFt * SCALE
                const gapH = left.heightFt * SCALE
                gaps.push(
                  <div
                    key={`gap-${left.id}`}
                    className="absolute z-10 cursor-default hover:bg-white/8 flex items-center justify-center"
                    style={{ left: gapX, top: gapY, width: gapW, height: gapH }}
                    onMouseEnter={e => { const r = e.currentTarget.getBoundingClientRect(); setGapTooltip({ x: r.left + r.width / 2, y: r.top }) }}
                    onMouseLeave={() => setGapTooltip(null)}
                  >
                    <div className="absolute inset-y-1 left-0 border-l border-dashed border-white/20" />
                    <div className="absolute inset-y-1 right-0 border-r border-dashed border-white/20" />
                    <span
                      className="font-medium text-gray-500 whitespace-nowrap pointer-events-none select-none"
                      style={{ fontSize: 5, zIndex: 20, position: 'relative', letterSpacing: '0.08em' }}
                    >|&nbsp;&nbsp;{safetyAssumptions.sideClearanceFt}ft&nbsp;&nbsp;|</span>
                  </div>
                )
              }
            }
            return gaps
          })()}


          {/* Row aisle gaps between battery rows */}
          {(() => {
            const batteryRows = [...new Set(
              displayLayout.filter(i => i.zone === 'battery' && !exitingIds.has(i.id)).map(i => i.yFt)
            )].sort((a, b) => a - b)
            return batteryRows.slice(0, -1).map((yFt, idx) => {
              const rowH = displayLayout.find(i => i.zone === 'battery' && i.yFt === yFt)?.heightFt ?? 0
              const nextYFt = batteryRows[idx + 1]
              const aisleTop = (yFt + rowH) * SCALE
              const aisleH = nextYFt * SCALE - aisleTop
              if (aisleH <= 0) return null
              return (
                <div
                  key={`row-aisle-${idx}`}
                  className="absolute left-0 right-0 pointer-events-none"
                  style={{ top: aisleTop, height: aisleH }}
                >
                  <div className="absolute inset-0 bg-slate-800/30" />
                  <div className="absolute top-0 left-0 right-0 border-t border-dashed border-slate-500/40" />
                  <div className="absolute bottom-0 left-0 right-0 border-b border-dashed border-slate-500/40" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-[8px] font-semibold tracking-widest uppercase text-slate-500 whitespace-nowrap select-none">
                      Row Aisle — {safetyAssumptions.rowAisleFt} ft
                    </span>
                  </div>
                </div>
              )
            })
          })()}

          {/* Battery row hover zones */}
          {(() => {
            const batteryRows = [...new Set(
              displayLayout
                .filter(i => i.zone === 'battery' && !exitingIds.has(i.id))
                .map(i => i.yFt)
            )].sort((a, b) => a - b)
            return batteryRows.map((yFt, idx) => {
              const rowH = displayLayout.find(i => i.zone === 'battery' && i.yFt === yFt)?.heightFt ?? 0
              const isHovered = hoveredRow === idx
              return (
                <div
                  key={`row-${yFt}`}
                  className="absolute left-0 right-0 pointer-events-none transition-colors duration-100"
                  style={{ top: yFt * SCALE, height: rowH * SCALE, zIndex: 25, backgroundColor: isHovered ? 'rgba(255,255,255,0.05)' : 'transparent' }}
                >
                  {isHovered && (
                    <>
                      <div className="absolute top-0 left-0 right-0 h-px bg-white/20" />
                      <div className="absolute bottom-0 left-0 right-0 h-px bg-white/20" />
                      <span className="absolute top-1.5 left-2 text-[9px] font-bold tracking-widest uppercase text-white/50 select-none">
                        Battery Row {idx + 1}
                      </span>
                    </>
                  )}
                </div>
              )
            })
          })()}

          {/* Layout items — rendered from frozen displayLayout during exit animation */}
          {(() => {
            const labelCounters: Record<string, number> = {}
            return displayLayout.map(item => {
              labelCounters[item.label] = (labelCounters[item.label] ?? 0) + 1
              const numberedLabel = `${item.label} #${labelCounters[item.label]}`
              return (
            <LayoutBlock
              key={item.id}
              item={item}
              numberedLabel={numberedLabel}
              isExiting={exitingIds.has(item.id)}
              isNew={animatingIds.has(item.id)}
              growDelay={growDelayMapRef.current.get(item.id)}
              slideDelay={slideDelayMapRef.current.get(item.id)}
              flipFrom={exitingIds.has(item.id) ? undefined : flipMapRef.current.get(item.id)}
              onRemove={exitingIds.has(item.id) ? undefined : onRemove}
            />
              )
            })
          })()}

          {/* Usable width indicator */}
          {(() => {
            const line = { height: '1px', background: 'rgba(71,85,105,0.5)', flexGrow: 1 } as const
            return (
              <div className="absolute pointer-events-none" style={{ top: -16, left: 0, width: displayedW, display: 'flex', alignItems: 'center' }}>
                <span style={{ fontSize: 9, color: '#475569', lineHeight: 1, flexShrink: 0 }}>|</span>
                <div style={line} />
                <span style={{ fontSize: 8, color: '#64748b', padding: '0 5px', whiteSpace: 'nowrap', lineHeight: 1, flexShrink: 0 }}>max width: 100 ft (current: {metrics.siteWidthFt} ft)</span>
                <div style={line} />
                <span style={{ fontSize: 9, color: '#475569', lineHeight: 1, flexShrink: 0 }}>|</span>
              </div>
            )
          })()}

          {/* Dimension labels */}
          <div className="absolute -bottom-5 left-0 right-0 flex justify-center">
            <span className="text-[10px] text-gray-600">{metrics.siteWidthFt} ft</span>
          </div>
          <div className="absolute -right-8 top-0 bottom-0 flex items-center">
            <span className="text-[10px] text-gray-600 -rotate-90 whitespace-nowrap">{metrics.siteHeightFt} ft</span>
          </div>
        </div>
        </div>{/* end transform wrapper */}

        {/* Tooltips rendered outside the transform wrapper so fixed positioning is viewport-relative */}
        {perimeterTooltip && (
          <div
            className="fixed z-50 pointer-events-none px-2.5 py-1.5 rounded-lg bg-gray-800 border border-gray-600 shadow-xl text-xs text-gray-200 whitespace-nowrap"
            style={{ left: perimeterTooltip.x, top: perimeterTooltip.y, transform: 'translate(-50%, -50%)' }}
          >
            Safety perimeter — {safetyAssumptions.perimeterMarginFt} ft clearance from site boundary
          </div>
        )}
        {gapTooltip && (
          <div
            className="fixed z-50 pointer-events-none px-2.5 py-1.5 rounded-lg bg-gray-800 border border-gray-600 shadow-xl text-xs text-gray-200 whitespace-nowrap"
            style={{ left: gapTooltip.x, top: gapTooltip.y - 8, transform: 'translate(-50%, -100%)' }}
          >
            {safetyAssumptions.sideClearanceFt} ft side clearance — maintenance access between devices
          </div>
        )}
      </div>{/* end pan/zoom container */}

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
