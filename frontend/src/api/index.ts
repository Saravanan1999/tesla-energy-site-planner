import type {
  APIResponse,
  ConfiguredDevice,
  Device,
  OptimizationObjective,
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

async function put<T>(path: string, body: unknown): Promise<APIResponse<T>> {
  const res = await fetch(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

export const fetchDevices = () =>
  get<{ devices: Device[] }>('/api/devices')

export const generateSitePlan = (devices: ConfiguredDevice[], objective?: OptimizationObjective) =>
  post<SitePlanData>('/api/site-plan', { devices, objective: objective ?? 'min_area' })

export const optimizeSitePlan = (devices: ConfiguredDevice[], objective: OptimizationObjective) =>
  post<SitePlanData>('/api/optimize', { devices, objective })

export const optimizeMaxPower = (targetAreaSqFt: number) =>
  post<SitePlanData>('/api/optimize-power', { targetAreaSqFt })

export const createSession = (name: string, devices: ConfiguredDevice[], objective?: OptimizationObjective, sitePlan?: SitePlanData) =>
  post<SessionData>('/api/sessions', { name, devices, objective: objective ?? 'min_area', sitePlan })

export const listSessions = () =>
  get<{ sessions: SessionData[] }>('/api/sessions')

export const getSession = (sessionId: string) =>
  get<SessionSitePlanData>(`/api/sessions/${sessionId}`)

export const updateSession = (sessionId: string, name: string, devices: ConfiguredDevice[], objective?: OptimizationObjective, sitePlan?: SitePlanData) =>
  put<SessionData>(`/api/sessions/${sessionId}`, { name, devices, objective: objective ?? 'min_area', sitePlan })

export const deleteSession = (sessionId: string) =>
  fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' })
    .then(r => r.json() as Promise<APIResponse<never>>)
