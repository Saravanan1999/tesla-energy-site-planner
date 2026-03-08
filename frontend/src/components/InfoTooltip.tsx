import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  children: React.ReactNode
  align?: 'left' | 'center' | 'right'
  position?: 'top' | 'bottom'
}

interface TooltipStyle {
  top?: number
  bottom?: number
  left: number
}

const MAX_TOOLTIP_WIDTH = 200

export default function InfoTooltip({ children }: Props) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState<TooltipStyle | null>(null)
  const [above, setAbove] = useState(true)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent | TouchEvent) => {
      if (
        anchorRef.current && !anchorRef.current.contains(e.target as Node) &&
        boxRef.current && !boxRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [open])

  useEffect(() => { if (!open) setStyle(null) }, [open])

  // Position the tooltip after it renders using viewport coordinates.
  // maxWidth is enforced by CSS class only — never overridden in inline style,
  // so measured box.width matches the final rendered width.
  useLayoutEffect(() => {
    if (!open || !anchorRef.current || !boxRef.current) return
    const anchor = anchorRef.current.getBoundingClientRect()
    const box = boxRef.current.getBoundingClientRect()
    const vw = window.innerWidth
    const MARGIN = 8
    const GAP = 6

    // Decide above/below based on available space
    const spaceAbove = anchor.top - MARGIN
    const spaceBelow = window.innerHeight - anchor.bottom - MARGIN
    const showAbove = spaceAbove >= box.height || spaceAbove >= spaceBelow

    // Horizontal: center on anchor, clamp so box stays within viewport
    let left = anchor.left + anchor.width / 2 - box.width / 2
    left = Math.max(MARGIN, Math.min(vw - MARGIN - box.width, left))

    const next: TooltipStyle = { left }
    if (showAbove) {
      next.bottom = window.innerHeight - anchor.top + GAP
    } else {
      next.top = anchor.bottom + GAP
    }
    setAbove(showAbove)
    setStyle(next)
  }, [open])

  const arrowLeft = anchorRef.current && style
    ? Math.max(6, Math.min(
        MAX_TOOLTIP_WIDTH - 14,
        anchorRef.current.getBoundingClientRect().left +
          anchorRef.current.getBoundingClientRect().width / 2 -
          style.left - 4
      ))
    : 8

  return (
    <div ref={anchorRef} className="relative shrink-0" onClick={e => { e.stopPropagation(); setOpen(v => !v) }}>
      <svg
        className="w-3 h-3 text-gray-600 hover:text-gray-400 cursor-pointer transition-colors"
        fill="currentColor" viewBox="0 0 20 20"
      >
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
      </svg>
      {open && createPortal(
        <div
          ref={boxRef}
          className="fixed z-[9999] bg-gray-800 border border-gray-600 rounded-lg px-2.5 py-1.5 text-xs text-gray-300 shadow-xl w-max max-w-[200px] pointer-events-none"
          style={style ? { top: style.top, bottom: style.bottom, left: style.left } : { visibility: 'hidden', top: 0, left: 0 }}
        >
          {children}
          <div
            className={`absolute w-2 h-2 bg-gray-800 border-gray-600 rotate-45 ${above ? 'top-full border-r border-b -mt-1' : 'bottom-full border-l border-t -mb-1'}`}
            style={{ left: arrowLeft }}
          />
        </div>,
        document.body
      )}
    </div>
  )
}
