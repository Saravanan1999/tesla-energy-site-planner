import type { SiteMetrics } from '../types/api'

interface Props {
  metrics: SiteMetrics
}

interface Stat {
  label: string
  value: string
  sub?: string
  accent?: string
}

export default function MetricsPanel({ metrics }: Props) {
  const stats: Stat[] = [
    {
      label: 'Total Cost',
      value: `$${metrics.totalCost.toLocaleString()}`,
      accent: 'text-green-400',
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
    },
    {
      label: 'Site Dimensions',
      value: `${metrics.siteWidthFt} × ${metrics.siteHeightFt} ft`,
      sub: `${metrics.boundingAreaSqFt.toLocaleString()} sq ft`,
    },
    {
      label: 'Equipment Footprint',
      value: `${metrics.equipmentFootprintSqFt.toLocaleString()} sq ft`,
      sub: `${((metrics.equipmentFootprintSqFt / metrics.boundingAreaSqFt) * 100).toFixed(0)}% utilisation`,
    },
  ]

  return (
    <div className="shrink-0 border-t border-gray-800 bg-gray-900/60 px-4 py-3">
      <div className="flex items-center gap-6 overflow-x-auto">
        {stats.map((s, i) => (
          <div key={i} className="shrink-0">
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-0.5">{s.label}</p>
            <p className={`text-base font-semibold leading-tight ${s.accent ?? 'text-white'}`}>
              {s.value}
            </p>
            {s.sub && <p className="text-[10px] text-gray-500 mt-0.5">{s.sub}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}
