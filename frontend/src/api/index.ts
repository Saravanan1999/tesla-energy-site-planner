import type {
  APIResponse,
  ConfiguredDevice,
  Device,
  SessionData,
  SessionSitePlanData,
  SitePlanData,
} from '../types/api'

async function post<T>(path: string, body: unknown): Promise<APIResponse<T>> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

async function get<T>(path: string): Promise<APIResponse<T>> {
  const res = await fetch(path)
  return res.json()
}

export const fetchDevices = () =>
  get<{ devices: Device[] }>('/api/devices')

export const generateSitePlan = (devices: ConfiguredDevice[]) =>
  post<SitePlanData>('/api/site-plan', { devices })

export const createSession = (name: string, devices: ConfiguredDevice[]) =>
  post<SessionData>('/api/sessions', { name, devices })

export const listSessions = () =>
  get<{ sessions: SessionData[] }>('/api/sessions')

export const getSession = (sessionId: string) =>
  get<SessionSitePlanData>(`/api/sessions/${sessionId}`)
