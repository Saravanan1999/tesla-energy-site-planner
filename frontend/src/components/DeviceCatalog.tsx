import type { Device } from '../types/api'
import DeviceCard from './DeviceCard'
import InfoTooltip from './InfoTooltip'

interface Props {
  devices: Device[]
  quantities: Record<number, number>
  onChange: (id: number, qty: number) => void
}

export default function DeviceCatalog({ devices, quantities, onChange }: Props) {
  const totalCost = devices.reduce((sum, d) => sum + d.cost * (quantities[d.id] ?? 0), 0)
  const totalEnergy = devices.reduce((sum, d) => sum + d.energyMWh * (quantities[d.id] ?? 0), 0)

  return (
    <aside className="w-full md:w-72 shrink-0 flex flex-col bg-gray-950 border-b md:border-b-0 md:border-r border-gray-800">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800 shrink-0">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
          Battery Catalog
        </h2>
        {(totalCost > 0 || totalEnergy > 0) && (
          <div className="mt-2 flex gap-4 text-xs">
            <div className="flex items-center gap-1">
              <span className="text-green-400 font-mono">${totalCost.toLocaleString()}</span>
              <InfoTooltip align="left">Total equipment cost (batteries only)</InfoTooltip>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-blue-400 font-mono">{totalEnergy.toFixed(1)} MWh</span>
              <InfoTooltip align="left">Total energy storage capacity</InfoTooltip>
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
