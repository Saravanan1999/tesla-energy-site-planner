import type { Device } from '../types/api'
import DeviceCard from './DeviceCard'

interface Props {
  devices: Device[]
  quantities: Record<number, number>
  onChange: (id: number, qty: number) => void
}

export default function DeviceCatalog({ devices, quantities, onChange }: Props) {
  const totalCost = devices.reduce((sum, d) => sum + d.cost * (quantities[d.id] ?? 0), 0)
  const totalEnergy = devices.reduce((sum, d) => sum + d.energyMWh * (quantities[d.id] ?? 0), 0)

  return (
    <aside className="w-72 shrink-0 flex flex-col bg-gray-950 border-r border-gray-800">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800 shrink-0">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
          Battery Catalog
        </h2>
        {(totalCost > 0 || totalEnergy > 0) && (
          <div className="mt-2 flex gap-4 text-xs">
            <div className="flex items-center gap-1">
              <span className="text-green-400 font-mono">${totalCost.toLocaleString()}</span>
              <div className="relative group">
                <svg className="w-3 h-3 text-gray-600 hover:text-gray-400 cursor-default transition-colors shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                </svg>
                <div className="absolute left-0 bottom-full mb-1.5 hidden group-hover:block z-20 pointer-events-none">
                  <div className="bg-gray-800 border border-gray-600 rounded-lg px-2.5 py-1.5 text-xs text-gray-300 whitespace-nowrap shadow-xl">
                    Total equipment cost (batteries only)
                    <div className="absolute left-3 top-full w-2 h-2 bg-gray-800 border-r border-b border-gray-600 rotate-45 -mt-1" />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-blue-400 font-mono">{totalEnergy.toFixed(1)} MWh</span>
              <div className="relative group">
                <svg className="w-3 h-3 text-gray-600 hover:text-gray-400 cursor-default transition-colors shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                </svg>
                <div className="absolute left-0 bottom-full mb-1.5 hidden group-hover:block z-20 pointer-events-none">
                  <div className="bg-gray-800 border border-gray-600 rounded-lg px-2.5 py-1.5 text-xs text-gray-300 whitespace-nowrap shadow-xl">
                    Total energy storage capacity
                    <div className="absolute left-3 top-full w-2 h-2 bg-gray-800 border-r border-b border-gray-600 rotate-45 -mt-1" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Device list */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {devices.length === 0 ? (
          <div className="text-center text-gray-600 text-sm py-8">Loading devices…</div>
        ) : (
          devices.map(device => (
            <DeviceCard
              key={device.id}
              device={device}
              quantity={quantities[device.id] ?? 0}
              onChange={qty => onChange(device.id, qty)}
            />
          ))
        )}
      </div>

      {/* Hint */}
      <div className="px-4 py-3 border-t border-gray-800 shrink-0">
        <p className="text-xs text-gray-600 leading-relaxed">
          Enter quantities to auto-generate the site layout and cost estimate.
        </p>
      </div>
    </aside>
  )
}
