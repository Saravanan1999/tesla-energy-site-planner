import { useEffect, useState } from 'react'
import { listSessions } from '../api'
import type { APIResponse, SessionData, SessionSitePlanData } from '../types/api'

interface Props {
  onResume: (sessionId: string) => Promise<APIResponse<SessionSitePlanData>>
  onClose: () => void
}

export default function ResumeModal({ onResume, onClose }: Props) {
  const [sessions, setSessions] = useState<SessionData[]>([])
  const [loading, setLoading] = useState(true)
  const [resuming, setResuming] = useState<string | null>(null)
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

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-md mx-4">
        <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">Resume Session</h2>
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
            <button
              key={s.sessionId}
              onClick={() => handleResume(s.sessionId)}
              disabled={resuming === s.sessionId}
              className="w-full text-left px-4 py-3 rounded-lg hover:bg-gray-800 transition-colors mb-1 group disabled:opacity-50"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white group-hover:text-blue-400 transition-colors">
                  {s.name}
                </span>
                {resuming === s.sessionId
                  ? <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  : <span className="text-xs text-gray-500">→</span>
                }
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{fmt(s.savedAt)}</p>
            </button>
          ))}

          {error && <p className="text-xs text-red-400 px-2 mt-2">{error}</p>}
        </div>
      </div>
    </div>
  )
}
