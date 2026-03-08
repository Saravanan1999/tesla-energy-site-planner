import { render, screen } from '@testing-library/react'
import MetricsPanel from '../../components/MetricsPanel'
import type { SafetyAssumptions, SiteMetrics } from '../../types/api'

function makeMetrics(overrides: Partial<SiteMetrics> = {}): SiteMetrics {
  return {
    totalBatteryCount: 4,
    requiredTransformers: 2,
    totalCost: 200_000,
    transformerCostEach: 10_000,
    totalEnergyMWh: 8,
    equipmentFootprintSqFt: 800,
    siteWidthFt: 100,
    siteHeightFt: 120,
    boundingAreaSqFt: 12_000,
    ...overrides,
  }
}

const assumptions: SafetyAssumptions = {
  perimeterMarginFt: 10,
  sideClearanceFt: 2,
  rowAisleFt: 5,
  transformerBufferFt: 10,
  maxUsableWidthFt: 100,
}

describe('MetricsPanel', () => {
  it('renders total cost', () => {
    const { container } = render(<MetricsPanel metrics={makeMetrics()} safetyAssumptions={assumptions} />)
    expect(container.textContent).toContain('$200,000')
  })

  it('renders energy capacity', () => {
    const { container } = render(<MetricsPanel metrics={makeMetrics()} safetyAssumptions={assumptions} />)
    expect(container.textContent).toContain('8.0 MWh')
  })

  it('renders battery count and transformer label', () => {
    const { container } = render(<MetricsPanel metrics={makeMetrics()} safetyAssumptions={assumptions} />)
    expect(container.textContent).toContain('+ 2 transformers')
  })

  it('renders site dimensions', () => {
    const { container } = render(<MetricsPanel metrics={makeMetrics()} safetyAssumptions={assumptions} />)
    expect(container.textContent).toContain('100 × 120 ft')
  })

  it('renders bounding area in sq ft', () => {
    const { container } = render(<MetricsPanel metrics={makeMetrics()} safetyAssumptions={assumptions} />)
    expect(container.textContent).toContain('12,000 sq ft')
  })

  it('renders equipment footprint utilisation percentage', () => {
    // 800 / 12000 * 100 = 6.67 → rounds to 7
    const { container } = render(<MetricsPanel metrics={makeMetrics()} safetyAssumptions={assumptions} />)
    expect(container.textContent).toContain('7% utilisation')
  })

  it('uses blue bar style when utilisation < 75%', () => {
    const { container } = render(<MetricsPanel metrics={makeMetrics({ equipmentFootprintSqFt: 800, boundingAreaSqFt: 12_000 })} safetyAssumptions={assumptions} />)
    const bar = container.querySelector('.bg-blue-500')
    expect(bar).toBeInTheDocument()
  })

  it('uses amber bar style when utilisation >= 75%', () => {
    // 9000 / 10000 = 90%
    const { container } = render(<MetricsPanel metrics={makeMetrics({ equipmentFootprintSqFt: 9_000, boundingAreaSqFt: 10_000 })} safetyAssumptions={assumptions} />)
    const bar = container.querySelector('.bg-amber-400')
    expect(bar).toBeInTheDocument()
  })

  it('uses singular transformer label when count is 1', () => {
    const { container } = render(<MetricsPanel metrics={makeMetrics({ requiredTransformers: 1 })} safetyAssumptions={assumptions} />)
    expect(container.textContent).toContain('incl. 1 transformer')
    expect(container.textContent).not.toContain('incl. 1 transformers')
  })
})
