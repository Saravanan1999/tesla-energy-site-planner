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
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <h3 className="text-sm font-semibold text-white leading-tight truncate">{device.name}</h3>
            <div className="relative group shrink-0">
              <svg className="w-3.5 h-3.5 text-gray-500 hover:text-gray-300 cursor-default transition-colors" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
              </svg>
              <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block z-20 pointer-events-none">
                <div className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-xs text-gray-300 whitespace-nowrap shadow-xl">
                  <div className="flex flex-col gap-1">
                    <span><span className="text-gray-500">Energy</span> {device.energyMWh} MWh</span>
                    <span><span className="text-gray-500">Released</span> {device.releaseYear}</span>
                  </div>
                  <div className="absolute left-1/2 -translate-x-1/2 top-full w-2 h-2 bg-gray-800 border-r border-b border-gray-600 rotate-45 -mt-1" />
                </div>
              </div>
            </div>
          </div>
          <span className="text-xs text-gray-400 shrink-0">${device.cost.toLocaleString()}<span className="text-gray-600">/device</span></span>
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
