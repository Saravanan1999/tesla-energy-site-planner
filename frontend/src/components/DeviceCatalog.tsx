import type { Device } from '../types/api'
import DeviceCard from './DeviceCard'
import InfoTooltip from './InfoTooltip'

const MAX_PLAN_MWH = 500 // must match backend maxPlanMWh

interface Props {
  devices: Device[]
  quantities: Record<number, number>
  onChange: (id: number, qty: number) => void
}

export default function DeviceCatalog({ devices, quantities, onChange }: Props) {
  const totalCost = devices.reduce((sum, d) => sum + d.cost * (quantities[d.id] ?? 0), 0)
  const totalEnergy = devices.reduce((sum, d) => sum + d.energyMWh * (quantities[d.id] ?? 0), 0)
  const atEnergyLimit = totalEnergy >= MAX_PLAN_MWH

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
              <span className={`font-mono ${atEnergyLimit ? 'text-amber-400' : 'text-blue-400'}`}>
                {totalEnergy.toFixed(1)} MWh
              </span>
              <InfoTooltip align="left">Total energy storage capacity</InfoTooltip>
            </div>
          </div>
        )}
        {atEnergyLimit && (
          <p className="mt-1.5 text-[10px] text-amber-400/90 leading-snug">
            Maximum {MAX_PLAN_MWH} MWh reached — remove devices to add more.
          </p>
        )}
      </div>

      {/* Device list */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {devices.length === 0 ? (
          <div className="text-center text-gray-600 text-sm py-8">Loading devices…</div>
        ) : (
          devices.map(device => {
            const qty = quantities[device.id] ?? 0
            const remainingMWh = MAX_PLAN_MWH - totalEnergy
            const additionalAllowed = device.energyMWh > 0
              ? Math.max(0, Math.floor(remainingMWh / device.energyMWh))
              : 999
            const maxQty = qty + additionalAllowed
            return (
              <DeviceCard
                key={device.id}
                device={device}
                quantity={qty}
                maxQty={maxQty}
                onChange={newQty => onChange(device.id, newQty)}
              />
            )
          })
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
