import { useState } from 'react'
import { createSession } from '../api'
import type { ConfiguredDevice } from '../types/api'

interface Props {
  quantities: Record<number, number>
  onClose: () => void
  onSaved?: (sessionId: string, name: string) => void
}

export default function SaveModal({ quantities, onClose, onSaved }: Props) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const devices: ConfiguredDevice[] = Object.entries(quantities)
    .filter(([, q]) => q > 0)
    .map(([id, q]) => ({ id: Number(id), quantity: q }))

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required.'); return }
    setSaving(true)
    setError(null)
    const res = await createSession(name.trim(), devices)
    setSaving(false)
    if (res.success && res.data) {
      onSaved?.(res.data.sessionId, name.trim())
      onClose()
    } else {
      const detail = res.error?.details?.[0] ?? res.error?.message ?? 'Failed to save.'
      setError(detail)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <h2 className="text-base font-semibold text-white mb-1">Save Session</h2>
        <p className="text-sm text-gray-400 mb-5">
          Give this configuration a name so you can resume it later.
        </p>

        <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-widest">
          Session Name
        </label>
        <input
          autoFocus
          type="text"
          placeholder="e.g. Brooklyn Industrial Site v1"
          value={name}
          onChange={e => { setName(e.target.value); setError(null) }}
          onKeyDown={e => e.key === 'Enter' && handleSave()}
          className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
        />

        {error && <p className="text-xs text-red-400 mt-2">{error}</p>}

        <div className="flex gap-2 mt-5">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-gray-600 text-sm text-gray-300 hover:text-white hover:border-gray-400 transition-colors"
          >Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm text-white font-medium transition-colors"
          >{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}
