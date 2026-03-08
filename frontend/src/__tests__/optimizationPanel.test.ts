import { fmtCost, buildReason, computePlanBadges, entryToSuggestion } from '../components/OptimizationPanel'
import type { SitePlanData, SiteMetrics, OptimalLayouts } from '../types/api'

function makeMetrics(overrides: Partial<SiteMetrics> = {}): SiteMetrics {
  return {
    totalBatteryCount: 4,
    requiredTransformers: 2,
    totalCost: 100_000,
    transformerCostEach: 10_000,
    totalEnergyMWh: 8,
    equipmentFootprintSqFt: 800,
    siteWidthFt: 100,
    siteHeightFt: 100,
    boundingAreaSqFt: 10_000,
    ...overrides,
  }
}

function makePlan(metricsOverrides: Partial<SiteMetrics> = {}, devices = [{ id: 1, quantity: 4 }]): SitePlanData {
  return {
    requestedDevices: devices,
    metrics: makeMetrics(metricsOverrides),
    layout: [],
    safetyAssumptions: { perimeterMarginFt: 10, sideClearanceFt: 2, rowAisleFt: 5, transformerBufferFt: 10, maxUsableWidthFt: 100 },
    objective: 'min_area',
  }
}

// ─── fmtCost ──────────────────────────────────────────────────────────────────

describe('fmtCost', () => {
  it('formats sub-thousand values as dollars', () => {
    expect(fmtCost(0)).toBe('$0')
    expect(fmtCost(500)).toBe('$500')
    expect(fmtCost(999)).toBe('$999')
  })

  it('formats thousands as $Xk', () => {
    expect(fmtCost(1_000)).toBe('$1k')
    expect(fmtCost(30_000)).toBe('$30k')
  })

  it('formats millions as $X.YM', () => {
    expect(fmtCost(1_000_000)).toBe('$1.0M')
    expect(fmtCost(1_500_000)).toBe('$1.5M')
    expect(fmtCost(2_250_000)).toBe('$2.3M')
  })
})

// ─── buildReason ──────────────────────────────────────────────────────────────

describe('buildReason', () => {
  it('min_area: includes label, dimensions and savings', () => {
    const current = makePlan({ boundingAreaSqFt: 10_000, siteWidthFt: 100, siteHeightFt: 100, totalCost: 100_000 })
    const optimal = makePlan({ boundingAreaSqFt: 8_000, siteWidthFt: 80, siteHeightFt: 100, totalCost: 100_000 })
    const result = buildReason('min_area', { label: '4× Megapack 2', plan: optimal }, current)

    expect(result).toContain('4× Megapack 2')
    expect(result).toContain('80×100 ft')
    expect(result).toContain('saves')
  })

  it('min_area: notes extra cost when optimal costs more', () => {
    const current = makePlan({ boundingAreaSqFt: 10_000, totalCost: 100_000 })
    const optimal = makePlan({ boundingAreaSqFt: 8_000, totalCost: 130_000 })
    const result = buildReason('min_area', { label: 'Opt', plan: optimal }, current)

    expect(result).toContain('costs')
    expect(result).toContain('more')
  })

  it('min_area: notes cost saving when optimal also costs less', () => {
    const current = makePlan({ boundingAreaSqFt: 10_000, totalCost: 100_000 })
    const optimal = makePlan({ boundingAreaSqFt: 8_000, totalCost: 80_000 })
    const result = buildReason('min_area', { label: 'Opt', plan: optimal }, current)

    expect(result).toContain('saves')
    expect(result).toContain('in cost too')
  })

  it('min_area: no cost note when cost is identical', () => {
    const current = makePlan({ boundingAreaSqFt: 10_000, totalCost: 100_000 })
    const optimal = makePlan({ boundingAreaSqFt: 8_000, totalCost: 100_000 })
    const result = buildReason('min_area', { label: 'Opt', plan: optimal }, current)

    expect(result).not.toContain('costs')
    expect(result).not.toContain('in cost too')
  })

  it('min_cost: includes label and cost figures', () => {
    const current = makePlan({ totalCost: 100_000, requiredTransformers: 2, totalEnergyMWh: 8 })
    const optimal = makePlan({ totalCost: 70_000, requiredTransformers: 1, totalEnergyMWh: 8 })
    const result = buildReason('min_cost', { label: '3× Megapack', plan: optimal }, current)

    expect(result).toContain('3× Megapack')
    expect(result).toContain('saves')
    expect(result).toContain('$30k')
  })

  it('min_cost: uses plural "transformers" when count > 1', () => {
    const current = makePlan({ totalCost: 100_000, requiredTransformers: 2 })
    const optimal = makePlan({ totalCost: 70_000, requiredTransformers: 2 })
    const result = buildReason('min_cost', { label: 'Opt', plan: optimal }, current)
    expect(result).toContain('transformers')
  })

  it('adds single-device energy note when achieved energy differs from target', () => {
    const current = makePlan({ totalEnergyMWh: 10 })
    const optimal = makePlan({ totalEnergyMWh: 9.6, siteWidthFt: 80, siteHeightFt: 80, boundingAreaSqFt: 6_400 }, [{ id: 2, quantity: 3 }])
    const result = buildReason('min_area', { label: 'Opt', plan: optimal }, current)

    expect(result).toContain('Note: each unit holds')
    expect(result).toContain('MWh')
  })

  it('adds multi-device energy note when multiple device types deviate from target', () => {
    const current = makePlan({ totalEnergyMWh: 10 })
    // Multiple device types → hits the else branch (line 60)
    const optimal = makePlan(
      { totalEnergyMWh: 9.5, siteWidthFt: 80, siteHeightFt: 80, boundingAreaSqFt: 6_400 },
      [{ id: 1, quantity: 2 }, { id: 2, quantity: 1 }],
    )
    const result = buildReason('min_area', { label: 'Opt', plan: optimal }, current)

    expect(result).toContain("battery units can't be split")
    expect(result).toContain('MWh')
  })
})

// ─── entryToSuggestion ────────────────────────────────────────────────────────

describe('entryToSuggestion', () => {
  it('maps delta metrics from entry vs current plan', () => {
    const current = makePlan({ boundingAreaSqFt: 10_000, totalCost: 100_000, totalEnergyMWh: 8 })
    const optimal = makePlan({ boundingAreaSqFt: 8_000, totalCost: 80_000, totalEnergyMWh: 8 }, [{ id: 3, quantity: 2 }])
    const entry = { label: '2× Megapack XL', plan: optimal }

    const suggestion = entryToSuggestion(entry, current)

    expect(suggestion.toLabel).toBe('2× Megapack XL')
    expect(suggestion.toDeviceId).toBe(3)
    expect(suggestion.toQty).toBe(2)
    expect(suggestion.deltaAreaSqFt).toBe(-2_000)
    expect(suggestion.deltaCost).toBe(-20_000)
    expect(suggestion.deltaEnergyMWh).toBeCloseTo(0)
    expect(suggestion.fromQty).toBe(4) // sum of current quantities
  })

  it('populates newQuantities from the entry plan devices', () => {
    const current = makePlan()
    const optimal = makePlan({}, [{ id: 5, quantity: 3 }, { id: 6, quantity: 1 }])
    const suggestion = entryToSuggestion({ label: 'Mixed', plan: optimal }, current)

    expect(suggestion.newQuantities).toEqual({ 5: 3, 6: 1 })
  })

  it('handles entry with no devices gracefully', () => {
    const current = makePlan()
    const optimal = makePlan({}, [])
    const suggestion = entryToSuggestion({ label: 'Empty', plan: optimal }, current)

    expect(suggestion.toDeviceId).toBe(-1)
    expect(suggestion.toQty).toBe(0)
  })
})

// ─── computePlanBadges ────────────────────────────────────────────────────────

describe('computePlanBadges', () => {
  const current = makePlan()

  it('shows loading state when optimal layouts not yet computed', () => {
    const badges = computePlanBadges(current, {})
    const area = badges.find(b => b.label === 'Area')!
    const cost = badges.find(b => b.label === 'Cost')!

    expect(area.loading).toBe(true)
    expect(cost.loading).toBe(true)
  })

  it('marks area and cost as good when already optimal', () => {
    const layouts: OptimalLayouts = { min_area: null, min_cost: null }
    const badges = computePlanBadges(current, layouts)
    const area = badges.find(b => b.label === 'Area')!
    const cost = badges.find(b => b.label === 'Cost')!

    expect(area.good).toBe(true)
    expect(area.text).toBe('✔ Smallest site')
    expect(cost.good).toBe(true)
    expect(cost.text).toBe('✔ Lowest cost')
  })

  it('shows improvement opportunity when optimal plan has smaller area', () => {
    const betterAreaPlan = makePlan({ boundingAreaSqFt: 7_000 })
    const layouts: OptimalLayouts = { min_area: { label: '3× Megapack', plan: betterAreaPlan } }
    const badges = computePlanBadges(current, layouts)
    const area = badges.find(b => b.label === 'Area')!

    expect(area.good).toBe(false)
    expect(area.text).toContain('3,000')
    expect(area.text).toContain('Could save')
  })

  it('shows improvement opportunity when optimal plan is cheaper', () => {
    const betterCostPlan = makePlan({ totalCost: 70_000 })
    const layouts: OptimalLayouts = { min_cost: { label: '3× Megapack', plan: betterCostPlan } }
    const badges = computePlanBadges(current, layouts)
    const cost = badges.find(b => b.label === 'Cost')!

    expect(cost.good).toBe(false)
    expect(cost.text).toContain('above minimum')
  })
})
