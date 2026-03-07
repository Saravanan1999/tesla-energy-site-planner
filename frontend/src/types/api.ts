export interface Device {
  id: number
  name: string
  category: 'battery' | 'transformer'
  widthFt: number
  heightFt: number
  energyMWh: number
  cost: number
  releaseYear: number
}

export interface ConfiguredDevice {
  id: number
  quantity: number
}

export interface SafetyAssumptions {
  perimeterMarginFt: number
  sideClearanceFt: number
  rowAisleFt: number
  transformerBufferFt: number
  maxUsableWidthFt: number
  version?: string
}

export interface SiteMetrics {
  totalBatteryCount: number
  requiredTransformers: number
  totalCost: number
  transformerCostEach: number
  totalEnergyMWh: number
  equipmentFootprintSqFt: number
  siteWidthFt: number
  siteHeightFt: number
  boundingAreaSqFt: number
}

export interface LayoutItem {
  id: string
  deviceId: number
  type: string
  label: string
  zone: 'battery' | 'transformer'
  xFt: number
  yFt: number
  widthFt: number
  heightFt: number
  energyMWh: number
  cost: number
}

export interface SitePlanData {
  requestedDevices: ConfiguredDevice[]
  metrics: SiteMetrics
  layout: LayoutItem[]
  safetyAssumptions: SafetyAssumptions
  warnings?: string[]
}

export interface SessionData {
  sessionId: string
  name: string
  savedAt: string
}

export interface SessionSitePlanData extends SitePlanData {
  sessionId: string
  name: string
  savedAt: string
}

export interface APIError {
  code: string
  message: string
  details?: string[]
}

export interface APIResponse<T> {
  success: boolean
  data?: T
  error?: APIError
}
