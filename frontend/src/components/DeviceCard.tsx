import type { Device } from '../types/api'

interface Props {
  device: Device
  quantity: number
  onChange: (qty: number) => void
}

/** Visual battery/transformer shape scaled to device proportions */
function DeviceIcon({ device }: { device: Device }) {
  const segments = Math.max(1, Math.round(device.widthFt / 10))
  const isBattery = device.category === 'battery'

  return (
    <div className="relative w-full h-14 flex items-center">
      {/* Main body */}
      <div
        className={`relative flex-1 h-10 rounded flex items-center gap-0.5 px-1.5 overflow-hidden
          ${isBattery
            ? 'bg-linear-to-br from-blue-950 to-blue-900 border border-blue-700'
            : 'bg-linear-to-br from-amber-950 to-amber-900 border border-amber-700'
          }`}
      >
        {/* Cell segments */}
        {Array.from({ length: segments }).map((_, i) => (
          <div
            key={i}
            className={`flex-1 h-6 rounded-sm
              ${isBattery ? 'bg-blue-700/50 border border-blue-600/40' : 'bg-amber-700/50 border border-amber-600/40'}`}
          />
        ))}
        {/* Gloss overlay */}
        <div className="absolute inset-0 bg-linear-to-b from-white/5 to-transparent rounded pointer-events-none" />
        {/* Dimension label */}
        <span className={`absolute bottom-0.5 right-1 text-[9px] font-mono
          ${isBattery ? 'text-blue-400/70' : 'text-amber-400/70'}`}>
          {device.widthFt}×{device.heightFt}ft
        </span>
      </div>
      {/* Terminal nub */}
      <div className={`w-1.5 h-3.5 rounded-r shrink-0
        ${isBattery ? 'bg-blue-600' : 'bg-amber-600'}`} />
    </div>
  )
}

export default function DeviceCard({ device, quantity, onChange }: Props) {
  const isActive = quantity > 0

  return (
    <div className={`rounded-xl border p-4 transition-all duration-200 cursor-default
      ${isActive
        ? 'bg-gray-800/80 border-blue-500/50 shadow-lg shadow-blue-500/10'
        : 'bg-gray-900/60 border-gray-700/50 hover:border-gray-600'
      }`}
    >
      <DeviceIcon device={device} />

      <div className="mt-3">
        <h3 className="text-sm font-semibold text-white leading-tight">{device.name}</h3>
        <div className="mt-1 flex gap-3 text-xs text-gray-400">
          <span>{device.energyMWh} MWh</span>
          <span>${device.cost.toLocaleString()}</span>
          <span>{device.releaseYear}</span>
        </div>
      </div>

      {/* Quantity control */}
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={() => onChange(Math.max(0, quantity - 1))}
          className="w-7 h-7 rounded-md bg-gray-700 hover:bg-gray-600 text-white font-bold text-sm flex items-center justify-center transition-colors"
        >−</button>
        <input
          type="number"
          min={0}
          max={99}
          value={quantity}
          onChange={e => onChange(Math.max(0, Math.min(99, parseInt(e.target.value) || 0)))}
          className="w-12 h-7 text-center text-sm bg-gray-800 border border-gray-600 rounded-md text-white focus:outline-none focus:border-blue-500"
        />
        <button
          onClick={() => onChange(Math.min(99, quantity + 1))}
          className="w-7 h-7 rounded-md bg-gray-700 hover:bg-gray-600 text-white font-bold text-sm flex items-center justify-center transition-colors"
        >+</button>
        {isActive && (
          <span className="ml-auto text-xs text-blue-400 font-medium">
            ${(device.cost * quantity).toLocaleString()}
          </span>
        )}
      </div>
    </div>
  )
}
