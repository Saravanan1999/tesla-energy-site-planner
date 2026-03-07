import type { SitePlanData, LayoutItem } from '../types/api'

interface Props {
  sitePlan: SitePlanData | null
  isLoading: boolean
  error: string | null
}

const SCALE = 6 // px per foot

function LayoutBlock({ item }: { item: LayoutItem }) {
  const isBattery = item.zone === 'battery'
  const segments = Math.max(1, Math.round(item.widthFt / 10))

  return (
    <div
      className={`absolute rounded-sm border flex flex-col items-center justify-center overflow-hidden group
        ${isBattery
          ? 'bg-blue-900/70 border-blue-500/60 hover:bg-blue-800/80'
          : 'bg-amber-900/70 border-amber-500/60 hover:bg-amber-800/80'
        }`}
      style={{
        left: item.xFt * SCALE,
        top: item.yFt * SCALE,
        width: item.widthFt * SCALE,
        height: item.heightFt * SCALE,
      }}
      title={`${item.label} — ${item.widthFt}×${item.heightFt}ft${item.energyMWh ? ` · ${item.energyMWh} MWh` : ''}`}
    >
      {/* Cell segments */}
      <div className="absolute inset-0.5 flex gap-px">
        {Array.from({ length: segments }).map((_, i) => (
          <div
            key={i}
            className={`flex-1 rounded-sm
              ${isBattery ? 'bg-blue-700/30' : 'bg-amber-700/30'}`}
          />
        ))}
      </div>

      {/* Label — only show if wide enough */}
      {item.widthFt * SCALE > 36 && (
        <span className={`relative z-10 text-[9px] font-semibold truncate px-1 leading-tight
          ${isBattery ? 'text-blue-200' : 'text-amber-200'}`}>
          {item.label}
        </span>
      )}

      {/* Gloss */}
      <div className="absolute inset-0 bg-linear-to-b from-white/5 to-transparent pointer-events-none" />
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

export default function SiteCanvas({ sitePlan, isLoading, error }: Props) {
  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-md text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <p className="text-red-400 font-medium">{error}</p>
        </div>
      </div>
    )
  }

  if (isLoading) {
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

  const { metrics, layout, safetyAssumptions } = sitePlan
  const canvasW = metrics.siteWidthFt * SCALE
  const canvasH = metrics.siteHeightFt * SCALE

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Canvas toolbar */}
      <div className="px-4 py-2 border-b border-gray-800 flex items-center justify-between shrink-0">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Site Layout</h2>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-blue-700/70 border border-blue-500/60" /> Battery
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-amber-700/70 border border-amber-500/60" /> Transformer
          </span>
          <span>{SCALE}px/ft</span>
        </div>
      </div>

      {/* Scrollable canvas area */}
      <div className="flex-1 overflow-auto p-6 bg-gray-950">
        {/* Site bounding box */}
        <div
          className="relative bg-slate-900 border border-slate-700 rounded shadow-xl shadow-black/40"
          style={{ width: canvasW, height: canvasH, minWidth: canvasW, minHeight: canvasH }}
        >
          <GridLines widthFt={metrics.siteWidthFt} heightFt={metrics.siteHeightFt} />

          {/* Perimeter margin indicator */}
          <div
            className="absolute border border-dashed border-gray-700/50 pointer-events-none rounded"
            style={{
              left: safetyAssumptions.perimeterMarginFt * SCALE,
              top: safetyAssumptions.perimeterMarginFt * SCALE,
              width: (metrics.siteWidthFt - 2 * safetyAssumptions.perimeterMarginFt) * SCALE,
              height: (metrics.siteHeightFt - 2 * safetyAssumptions.perimeterMarginFt) * SCALE,
            }}
          />

          {/* Layout items */}
          {layout.map(item => <LayoutBlock key={item.id} item={item} />)}

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
