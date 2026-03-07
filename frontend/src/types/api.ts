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

export type OptimizationObjective = 'min_area' | 'min_cost' | 'max_density' | 'user_plan'

export interface OptimizationSuggestion {
  fromDeviceId: number
  fromLabel: string
  fromQty: number
  toDeviceId: number
  toLabel: string
  toQty: number
  deltaAreaSqFt: number
  deltaCost: number
  deltaEnergyMWh: number
  reason: string
  /** When present, Apply replaces the entire device selection with this map */
  newQuantities?: Record<number, number>
}

export interface SitePlanData {
  requestedDevices: ConfiguredDevice[]
  metrics: SiteMetrics
  layout: LayoutItem[]
  safetyAssumptions: SafetyAssumptions
  warnings?: string[]
  objective: OptimizationObjective
  suggestion?: OptimizationSuggestion
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

export interface OptimalEntry { label: string; plan: SitePlanData }
export type OptimalLayouts = Partial<Record<'min_area' | 'min_cost' | 'max_density', OptimalEntry | null>>
