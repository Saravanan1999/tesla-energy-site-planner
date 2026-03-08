import type { SafetyAssumptions, SiteMetrics } from '../types/api'

interface Props {
  metrics: SiteMetrics
  safetyAssumptions: SafetyAssumptions
}

interface Stat {
  label: string
  value: string
  sub?: string
  subTooltip?: string
  tooltipAlign?: 'left' | 'center'
  accent?: string
  progress?: number // 0–100, renders a bar instead of sub text
}

export default function MetricsPanel({ metrics, safetyAssumptions }: Props) {
  const stats: Stat[] = [
    {
      label: 'Total Cost',
      value: `$${metrics.totalCost.toLocaleString()}`,
      accent: 'text-green-400',
      sub: `incl. ${metrics.requiredTransformers} transformer${metrics.requiredTransformers !== 1 ? 's' : ''}`,
      subTooltip: `Transformers: ${metrics.requiredTransformers} × $${metrics.transformerCostEach.toLocaleString()} = $${(metrics.requiredTransformers * metrics.transformerCostEach).toLocaleString()}`,
      tooltipAlign: 'left',
    },
    {
      label: 'Energy Capacity',
      value: `${metrics.totalEnergyMWh.toFixed(1)} MWh`,
      accent: 'text-blue-400',
    },
    {
      label: 'Batteries',
      value: String(metrics.totalBatteryCount),
      sub: `+ ${metrics.requiredTransformers} transformers`,
      subTooltip: '1 transformer required per every 2 batteries',
    },
    {
      label: 'Site Dimensions',
      value: `${metrics.siteWidthFt} × ${metrics.siteHeightFt} ft`,
      sub: `${metrics.boundingAreaSqFt.toLocaleString()} sq ft`,
      subTooltip: `Includes ${safetyAssumptions.perimeterMarginFt} ft safety perimeter on all sides`,
    },
    {
      label: 'Equipment Footprint',
      value: `${metrics.equipmentFootprintSqFt.toLocaleString()} sq ft`,
      progress: Math.round((metrics.equipmentFootprintSqFt / metrics.boundingAreaSqFt) * 100),
      subTooltip: 'Equipment footprint ÷ total site area — how much of the site is occupied by devices',
    },
  ]

  return (
    <div className="shrink-0 border-t border-gray-800 bg-gray-900/60 px-4 py-3">
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3 overflow-x-auto">
        {stats.map((s, i) => (
          <div key={i} className="shrink-0 min-w-[120px]">
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-0.5">{s.label}</p>
            <p className={`text-base font-semibold leading-tight ${s.accent ?? 'text-white'}`}>
              {s.value}
            </p>
            {s.progress !== undefined ? (
              <div className="flex items-center gap-1.5 mt-1">
                <div className="w-16 h-1 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${s.progress >= 75 ? 'bg-amber-400' : 'bg-blue-500'}`}
                    style={{ width: `${s.progress}%` }}
                  />
                </div>
                <p className="text-[10px] text-gray-500 tabular-nums">{s.progress}% utilisation</p>
                {s.subTooltip && (
                  <div className="relative group">
                    <svg className="w-3 h-3 text-gray-600 hover:text-gray-400 cursor-default transition-colors shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                    </svg>
                    <div className={`absolute bottom-full mb-2 hidden group-hover:block z-20 pointer-events-none ${s.tooltipAlign === 'left' ? 'left-0' : 'left-1/2 -translate-x-1/2'}`}>
                      <div className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-xs text-gray-300 whitespace-nowrap shadow-xl">
                        {s.subTooltip}
                        <div className={`absolute top-full w-2 h-2 bg-gray-800 border-r border-b border-gray-600 rotate-45 -mt-1 ${s.tooltipAlign === 'left' ? 'left-3' : 'left-1/2 -translate-x-1/2'}`} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : s.sub && (
              <div className="flex items-center gap-1 mt-0.5">
                <p className="text-[10px] text-gray-500">{s.sub}</p>
                {s.subTooltip && (
                  <div className="relative group">
                    <svg className="w-3 h-3 text-gray-600 hover:text-gray-400 cursor-default transition-colors shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                    </svg>
                    <div className={`absolute bottom-full mb-2 hidden group-hover:block z-20 pointer-events-none ${s.tooltipAlign === 'left' ? 'left-0' : 'left-1/2 -translate-x-1/2'}`}>
                      <div className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-xs text-gray-300 whitespace-nowrap shadow-xl">
                        {s.subTooltip}
                        <div className={`absolute top-full w-2 h-2 bg-gray-800 border-r border-b border-gray-600 rotate-45 -mt-1 ${s.tooltipAlign === 'left' ? 'left-3' : 'left-1/2 -translate-x-1/2'}`} />
                      </div>
                    </div>
                  </div>
              )}
            </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
