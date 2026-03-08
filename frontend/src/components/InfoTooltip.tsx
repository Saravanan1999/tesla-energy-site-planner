import { useState, useRef, useEffect, useLayoutEffect } from 'react'

interface Props {
  children: React.ReactNode
  align?: 'left' | 'center' | 'right'
  position?: 'top' | 'bottom'
}

export default function InfoTooltip({ children, align = 'center', position = 'top' }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const [xOffset, setXOffset] = useState(0)
  const [flipped, setFlipped] = useState(false)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [open])

  // Reset on close
  useEffect(() => { if (!open) { setXOffset(0); setFlipped(false) } }, [open])

  // After render: clamp horizontally and flip vertically if needed.
  useLayoutEffect(() => {
    if (!open || !boxRef.current) return
    const rect = boxRef.current.getBoundingClientRect()
    const vw = window.innerWidth
    const MARGIN = 8

    // Horizontal correction
    if (rect.right > vw - MARGIN) {
      setXOffset(-(rect.right - (vw - MARGIN)))
    } else if (rect.left < MARGIN) {
      setXOffset(MARGIN - rect.left)
    }

    // Flip vertically if tooltip clips the top of the viewport
    if (rect.top < MARGIN) {
      setFlipped(true)
    }
  }, [open, flipped])

  const effectivePos = flipped ? (position === 'top' ? 'bottom' : 'top') : position
  const tooltipPos = effectivePos === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'
  const tooltipAnchor =
    align === 'left' ? 'left-0' :
    align === 'right' ? 'right-0' :
    'left-1/2 -translate-x-1/2'
  const arrowAlign =
    align === 'left' ? 'left-3' :
    align === 'right' ? 'right-3' :
    'left-1/2 -translate-x-1/2'
  const arrowPos = effectivePos === 'top'
    ? 'top-full border-r border-b -mt-1'
    : 'bottom-full border-l border-t -mb-1'

  const style: React.CSSProperties = {}
  if (xOffset !== 0) style.transform = `translateX(${xOffset}px)`

  return (
    <div ref={ref} className="relative shrink-0" onClick={e => { e.stopPropagation(); setOpen(v => !v) }}>
      <svg
        className="w-3 h-3 text-gray-600 hover:text-gray-400 cursor-pointer transition-colors"
        fill="currentColor" viewBox="0 0 20 20"
      >
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
      </svg>
      {open && (
        <div className={`absolute ${tooltipPos} ${tooltipAnchor} z-50 pointer-events-none`} style={style}>
          <div
            ref={boxRef}
            className="bg-gray-800 border border-gray-600 rounded-lg px-2.5 py-1.5 text-xs text-gray-300 shadow-xl w-max max-w-[200px]"
          >
            {children}
            <div className={`absolute ${arrowPos} ${arrowAlign} w-2 h-2 bg-gray-800 border-gray-600 rotate-45`} />
          </div>
        </div>
      )}
    </div>
  )
}
