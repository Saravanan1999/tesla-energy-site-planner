import type { Device } from '../types/api'
import InfoTooltip from './InfoTooltip'

interface Props {
  device: Device
  quantity: number
  maxQty: number
  onChange: (qty: number) => void
}

/** Visual battery/transformer shape scaled to device proportions */
function DeviceIcon({ device }: { device: Device }) {
  const segments = Math.max(1, Math.round(device.widthFt / 10))
  const isBattery = device.category === 'battery'

  return (
    <div className="flex items-center h-14">
      {/* Main body — fixed-width blocks so proportions are consistent across devices */}
      <div
        className={`relative flex items-center gap-0.5 px-1 h-10 rounded overflow-hidden
          ${isBattery
            ? 'bg-linear-to-br from-blue-950 to-blue-900 border border-blue-700'
            : 'bg-linear-to-br from-amber-950 to-amber-900 border border-amber-700'
          }`}
      >
        {/* Each block = 10 ft, fixed 40px wide */}
        {Array.from({ length: segments }).map((_, i) => (
          <div
            key={i}
            className={`w-10 h-6 rounded-sm shrink-0
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

export default function DeviceCard({ device, quantity, maxQty, onChange }: Props) {
  const isActive = quantity > 0
  const atLimit = quantity >= maxQty

  return (
    <div className={`rounded-xl border p-4 transition-all duration-200 cursor-default
      ${isActive
        ? 'bg-gray-800/80 border-blue-500/50 shadow-lg shadow-blue-500/10'
        : 'bg-gray-900/60 border-gray-700/50 hover:border-gray-600'
      }`}
    >
      <DeviceIcon device={device} />

      <div className="mt-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <h3 className="text-sm font-semibold text-white leading-tight truncate">{device.name}</h3>
            <InfoTooltip align="left">
              <div className="flex flex-col gap-1">
                <span><span className="text-gray-500">Energy</span> {device.energyMWh} MWh</span>
                <span><span className="text-gray-500">Released</span> {device.releaseYear}</span>
              </div>
            </InfoTooltip>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-xs text-gray-400 cursor-default">${device.cost.toLocaleString()}<span className="text-gray-600">/device</span></span>
            <InfoTooltip align="right">Unit price per device</InfoTooltip>
          </div>
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
          max={maxQty}
          value={quantity}
          onChange={e => onChange(Math.max(0, Math.min(maxQty, parseInt(e.target.value) || 0)))}
          className={`w-14 h-7 text-center text-sm bg-gray-800 border rounded-md text-white focus:outline-none transition-colors
            ${atLimit ? 'border-amber-500/70 focus:border-amber-400' : 'border-gray-600 focus:border-blue-500'}`}
        />
        <button
          onClick={() => onChange(Math.min(maxQty, quantity + 1))}
          disabled={atLimit}
          className="w-7 h-7 rounded-md bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm flex items-center justify-center transition-colors"
        >+</button>
        {isActive && (
          <div className="flex items-center gap-1 ml-auto">
            <span className="text-xs text-blue-400 font-medium cursor-default">
              ${(device.cost * quantity).toLocaleString()}
            </span>
            <InfoTooltip align="right">Subtotal: {quantity} × ${device.cost.toLocaleString()}</InfoTooltip>
          </div>
        )}
      </div>
      {atLimit && (
        <p className="mt-1.5 text-[10px] text-amber-400/80">
          500 MWh total limit reached — remove other devices to add more.
        </p>
      )}
    </div>
  )
}
