import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ResumeModal from '../../components/ResumeModal'

vi.mock('../../api', () => ({
  listSessions: vi.fn(),
  deleteSession: vi.fn(),
}))

import { listSessions, deleteSession } from '../../api'

const mockListSessions = vi.mocked(listSessions)
const mockDeleteSession = vi.mocked(deleteSession)

const session = { sessionId: 'abc', name: 'Alpha Site', savedAt: '2024-06-01T10:00:00Z' }

function setup(overrides: Partial<Parameters<typeof ResumeModal>[0]> = {}) {
  const onResume = vi.fn().mockResolvedValue({ success: true })
  const onDelete = vi.fn()
  const onClose = vi.fn()
  render(<ResumeModal onResume={onResume} onDelete={onDelete} onClose={onClose} {...overrides} />)
  return { onResume, onDelete, onClose }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockListSessions.mockResolvedValue({ success: true, data: { sessions: [] } })
  mockDeleteSession.mockResolvedValue({ success: true })
})

describe('ResumeModal', () => {
  it('shows a loading spinner while fetching sessions', () => {
    // never resolves during this assertion
    mockListSessions.mockReturnValue(new Promise(() => {}))
    setup()
    expect(document.querySelector('.animate-spin')).toBeInTheDocument()
  })

  it('shows "No saved sessions" when list comes back empty', async () => {
    setup()
    await waitFor(() => expect(screen.getByText(/No saved sessions yet/i)).toBeInTheDocument())
  })

  it('renders session names after loading', async () => {
    mockListSessions.mockResolvedValue({ success: true, data: { sessions: [session] } })
    setup()
    await waitFor(() => expect(screen.getByText('Alpha Site')).toBeInTheDocument())
  })

  it('calls onClose when the ✕ button is clicked', async () => {
    const { onClose } = setup()
    fireEvent.click(screen.getByText('✕'))
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onResume with the session id when a row is clicked', async () => {
    mockListSessions.mockResolvedValue({ success: true, data: { sessions: [session] } })
    const { onResume } = setup()
    await waitFor(() => screen.getByText('Alpha Site'))
    fireEvent.click(screen.getByText('Alpha Site').closest('button')!)
    await waitFor(() => expect(onResume).toHaveBeenCalledWith('abc'))
  })

  it('shows an error message when resume fails', async () => {
    mockListSessions.mockResolvedValue({ success: true, data: { sessions: [session] } })
    const { onResume } = setup()
    onResume.mockResolvedValue({ success: false, error: { message: 'Load failed', code: 'ERR' } })
    await waitFor(() => screen.getByText('Alpha Site'))
    fireEvent.click(screen.getByText('Alpha Site').closest('button')!)
    await waitFor(() => expect(screen.getByText('Load failed')).toBeInTheDocument())
  })

  it('removes the session from the list after successful delete', async () => {
    mockListSessions.mockResolvedValue({ success: true, data: { sessions: [session] } })
    setup()
    await waitFor(() => screen.getByText('Alpha Site'))
    fireEvent.click(screen.getByTitle('Delete session'))
    await waitFor(() => expect(screen.queryByText('Alpha Site')).not.toBeInTheDocument())
  })

  it('shows error when delete fails', async () => {
    mockListSessions.mockResolvedValue({ success: true, data: { sessions: [session] } })
    mockDeleteSession.mockResolvedValue({ success: false, error: { message: 'Delete failed', code: 'ERR' } })
    setup()
    await waitFor(() => screen.getByText('Alpha Site'))
    fireEvent.click(screen.getByTitle('Delete session'))
    await waitFor(() => expect(screen.getByText('Delete failed')).toBeInTheDocument())
  })
})
