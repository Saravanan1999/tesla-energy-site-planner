import {
  fetchDevices,
  generateSitePlan,
  optimizeSitePlan,
  optimizeMaxPower,
  createSession,
  listSessions,
  getSession,
  updateSession,
  deleteSession,
} from '../../api/index'

const mockJson = vi.fn()
const mockFetch = vi.fn()
globalThis.fetch = mockFetch

beforeEach(() => {
  vi.clearAllMocks()
  mockJson.mockResolvedValue({ success: true, data: {} })
  mockFetch.mockResolvedValue({ ok: true, json: mockJson })
})

const devices = [{ id: 1, quantity: 2 }]

describe('fetchDevices', () => {
  it('calls GET /api/devices', async () => {
    await fetchDevices()
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/api/devices'))
  })
})

describe('generateSitePlan', () => {
  it('calls POST /api/site-plan with devices and objective', async () => {
    await generateSitePlan(devices, 'min_area')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/site-plan'),
      expect.objectContaining({ method: 'POST', body: expect.stringContaining('min_area') }),
    )
  })

  it('defaults objective to min_area when omitted', async () => {
    await generateSitePlan(devices)
    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
    expect(body.objective).toBe('min_area')
  })
})

describe('optimizeSitePlan', () => {
  it('calls POST /api/optimize', async () => {
    await optimizeSitePlan(devices, 'min_cost')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/optimize'),
      expect.objectContaining({ method: 'POST' }),
    )
  })
})

describe('optimizeMaxPower', () => {
  it('calls POST /api/optimize-power with targetAreaSqFt', async () => {
    await optimizeMaxPower(5000)
    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
    expect(body.targetAreaSqFt).toBe(5000)
  })
})

describe('createSession', () => {
  it('calls POST /api/sessions', async () => {
    await createSession('My Plan', devices, 'min_area')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/sessions'),
      expect.objectContaining({ method: 'POST' }),
    )
  })
})

describe('listSessions', () => {
  it('calls GET /api/sessions', async () => {
    await listSessions()
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/api/sessions'))
  })
})

describe('getSession', () => {
  it('calls GET /api/sessions/:id', async () => {
    await getSession('abc123')
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/api/sessions/abc123'))
  })
})

describe('updateSession', () => {
  it('calls PUT /api/sessions/:id', async () => {
    await updateSession('abc123', 'Updated', devices, 'min_cost')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/sessions/abc123'),
      expect.objectContaining({ method: 'PUT' }),
    )
  })
})

describe('deleteSession', () => {
  it('calls DELETE /api/sessions/:id', async () => {
    await deleteSession('abc123')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/sessions/abc123'),
      expect.objectContaining({ method: 'DELETE' }),
    )
  })
})
