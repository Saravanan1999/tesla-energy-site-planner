import { api, BASE_URL } from '../../api/client'

const mockFetch = vi.fn()
globalThis.fetch = mockFetch

beforeEach(() => vi.clearAllMocks())

describe('BASE_URL', () => {
  it('is a non-empty string', () => {
    expect(typeof BASE_URL).toBe('string')
    expect(BASE_URL.length).toBeGreaterThan(0)
  })
})

describe('api.get', () => {
  it('calls fetch with the correct path and returns json', async () => {
    const payload = { hello: 'world' }
    mockFetch.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(payload) })
    const result = await api.get('/test-path')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/test-path'),
      expect.objectContaining({ headers: { 'Content-Type': 'application/json' } }),
    )
    expect(result).toEqual(payload)
  })

  it('throws when response is not ok', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' })
    await expect(api.get('/bad')).rejects.toThrow('API error 404: Not Found')
  })
})

describe('api.post', () => {
  it('calls fetch with POST method and serialized body', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({ ok: true }) })
    await api.post('/submit', { key: 'value' })
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/submit'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ key: 'value' }),
      }),
    )
  })
})
