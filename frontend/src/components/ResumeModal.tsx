import { useEffect, useState } from 'react'
import { listSessions, deleteSession } from '../api'
import type { APIResponse, SessionData, SessionSitePlanData } from '../types/api'

interface Props {
  onResume: (sessionId: string) => Promise<APIResponse<SessionSitePlanData>>
  onDelete: (sessionId: string) => void
  onClose: () => void
}

export default function ResumeModal({ onResume, onDelete, onClose }: Props) {
  const [sessions, setSessions] = useState<SessionData[]>([])
  const [loading, setLoading] = useState(true)
  const [resuming, setResuming] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [trashHover, setTrashHover] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listSessions().then(res => {
      if (res.success && res.data) setSessions(res.data.sessions)
      setLoading(false)
    })
  }, [])

  const handleResume = async (sessionId: string) => {
    setResuming(sessionId)
    setError(null)
    const res = await onResume(sessionId)
    if (!res.success) setError(res.error?.message ?? 'Failed to load session.')
    setResuming(null)
  }

  const handleDelete = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation()
    setDeleting(sessionId)
    const res = await deleteSession(sessionId)
    if (res.success) {
      setSessions(prev => prev.filter(s => s.sessionId !== sessionId))
      onDelete(sessionId)
    } else {
      setError(res.error?.message ?? 'Failed to delete session.')
    }
    setDeleting(null)
  }

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-md mx-4">
        <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">Saved Sessions</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none">✕</button>
        </div>

        <div className="p-4 max-h-80 overflow-y-auto">
          {loading && (
            <div className="flex justify-center py-8">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loading && sessions.length === 0 && (
            <p className="text-center text-gray-500 text-sm py-8">No saved sessions yet.</p>
          )}

          {!loading && sessions.map(s => (
            <div
              key={s.sessionId}
              className="relative flex items-stretch mb-1 rounded-lg border border-gray-700/60 overflow-hidden transition-colors duration-200"
              style={{ borderColor: trashHover === s.sessionId || deleting === s.sessionId ? 'rgb(153 27 27 / 0.7)' : undefined }}
            >
              {/* Red overlay spreads right→left across the entire row */}
              <div className={`absolute inset-0 bg-red-900/50 origin-right transition-transform duration-300 ease-out pointer-events-none ${trashHover === s.sessionId || deleting === s.sessionId ? 'scale-x-100' : 'scale-x-0'}`} />

              {/* Session button */}
              <button
                onClick={() => handleResume(s.sessionId)}
                disabled={resuming === s.sessionId || deleting === s.sessionId}
                className="group/row flex-1 text-left px-4 py-3 hover:bg-white/5 transition-colors disabled:opacity-50 relative z-10"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white group-hover/row:text-blue-300 transition-colors">{s.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{fmt(s.savedAt)}</p>
                  </div>
                  {resuming === s.sessionId
                    ? <div className="w-4 h-4 shrink-0 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                    : <span className="text-xs text-gray-500 shrink-0">→</span>
                  }
                </div>
              </button>

              {/* Divider */}
              <div className="w-px bg-gray-700/60 relative z-10" />

              {/* Trash button — no separate background, unified with row */}
              <button
                onClick={e => handleDelete(e, s.sessionId)}
                onMouseEnter={() => setTrashHover(s.sessionId)}
                onMouseLeave={() => setTrashHover(null)}
                disabled={deleting === s.sessionId || resuming === s.sessionId}
                title="Delete session"
                className="shrink-0 w-11 flex items-center justify-center relative z-10 text-red-400/70 hover:text-red-200 transition-colors disabled:opacity-40"
              >
                {deleting === s.sessionId
                  ? <div className="w-3.5 h-3.5 border border-red-300 border-t-transparent rounded-full animate-spin" />
                  : <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor">
                      <path d="M6.5 1h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1 0-1ZM2 3.5A.5.5 0 0 1 2.5 3h11a.5.5 0 0 1 0 1H13v8a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 12V4H2.5a.5.5 0 0 1-.5-.5ZM4 4v8a.5.5 0 0 0 .5.5h7a.5.5 0 0 0 .5-.5V4H4Z"/>
                    </svg>
                }
              </button>
            </div>
          ))}

          {error && <p className="text-xs text-red-400 px-2 mt-2">{error}</p>}
        </div>
      </div>
    </div>
  )
}
