import { render, screen, fireEvent } from '@testing-library/react'
import OptimizationPanel from '../../components/OptimizationPanel'
import type { SitePlanData, SiteMetrics, OptimalLayouts } from '../../types/api'

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

function makePlan(metricsOverrides: Partial<SiteMetrics> = {}): SitePlanData {
  return {
    requestedDevices: [{ id: 1, quantity: 4 }],
    metrics: makeMetrics(metricsOverrides),
    layout: [],
    safetyAssumptions: { perimeterMarginFt: 10, sideClearanceFt: 2, rowAisleFt: 5, transformerBufferFt: 10, maxUsableWidthFt: 100 },
    objective: 'min_area',
  }
}

const baseProps = {
  sitePlan: makePlan(),
  objective: 'min_area' as const,
  onObjectiveChange: vi.fn(),
  onApply: vi.fn(),
  appliedSnapshots: [] as { quantities: Record<number, number>; label: string; type: 'apply' | 'manual' }[],
  onRevert: vi.fn(),
  onSaveAs: vi.fn().mockResolvedValue(true),
  currentSiteName: 'Test Site',
  sessionNames: [],
  optimalLayouts: {} as OptimalLayouts,
  onTargetMWhChange: vi.fn(),
  constraintMode: 'power' as const,
  onConstraintModeChange: vi.fn(),
  targetAreaSqFt: 10_000,
  onTargetAreaChange: vi.fn(),
  optimalMaxPower: undefined,
  pendingTargetPlan: null,
  onConfirmTargetPlan: vi.fn(),
  onCancelTargetPlan: vi.fn(),
}

function openPanel() {
  fireEvent.click(screen.getByText(/Design Assistant/i).closest('button')!)
}

describe('OptimizationPanel (collapsed)', () => {
  it('renders the Design Assistant label', () => {
    render(<OptimizationPanel {...baseProps} />)
    expect(screen.getByText(/Design Assistant/i)).toBeInTheDocument()
  })

  it('shows "suggestions available" badge when hints exist and panel is closed', () => {
    const props = {
      ...baseProps,
      optimalLayouts: { min_area: { label: '3× Megapack', plan: makePlan({ boundingAreaSqFt: 7_000 }) } },
    }
    render(<OptimizationPanel {...props} />)
    expect(screen.getByText('suggestions available')).toBeInTheDocument()
  })

  it('shows applied step and undo button when snapshots exist', () => {
    const props = {
      ...baseProps,
      appliedSnapshots: [{ quantities: { 1: 2 }, label: '2× Megapack', type: 'apply' as const }],
    }
    render(<OptimizationPanel {...props} />)
    expect(screen.getByText(/Undo/i)).toBeInTheDocument()
    expect(screen.getByText('2× Megapack')).toBeInTheDocument()
  })
})

describe('OptimizationPanel (expanded)', () => {
  it('shows "What matters most?" section after opening', () => {
    render(<OptimizationPanel {...baseProps} />)
    openPanel()
    expect(screen.getByText(/What matters most/i)).toBeInTheDocument()
  })

  it('shows "Finding the best layout…" while computing', () => {
    render(<OptimizationPanel {...baseProps} optimalLayouts={{}} />)
    openPanel()
    expect(screen.getByText(/Finding the best layout/i)).toBeInTheDocument()
  })

  it('shows already optimal message when optEntry is null', () => {
    const props = { ...baseProps, optimalLayouts: { min_area: null, min_cost: null } }
    render(<OptimizationPanel {...props} />)
    openPanel()
    expect(screen.getByText(/most space-efficient/i)).toBeInTheDocument()
  })

  it('shows already optimal message for min_cost objective', () => {
    const props = { ...baseProps, objective: 'min_cost' as const, optimalLayouts: { min_area: null, min_cost: null } }
    render(<OptimizationPanel {...props} />)
    openPanel()
    expect(screen.getByText(/most cost-efficient/i)).toBeInTheDocument()
  })

  it('shows suggestion with Apply button when optimal layout is available', () => {
    const betterPlan = makePlan({ boundingAreaSqFt: 7_000, totalCost: 90_000 })
    const props = {
      ...baseProps,
      optimalLayouts: { min_area: { label: '3× Megapack', plan: betterPlan } },
    }
    render(<OptimizationPanel {...props} />)
    openPanel()
    expect(screen.getByText('3× Megapack')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Apply/i })).toBeInTheDocument()
  })

  it('calls onApply when Apply button is clicked', () => {
    const onApply = vi.fn()
    const betterPlan = makePlan({ boundingAreaSqFt: 7_000 })
    const props = {
      ...baseProps,
      onApply,
      optimalLayouts: { min_area: { label: '3× Megapack', plan: betterPlan } },
    }
    render(<OptimizationPanel {...props} />)
    openPanel()
    fireEvent.click(screen.getByRole('button', { name: /Apply/i }))
    expect(onApply).toHaveBeenCalledOnce()
  })

  it('shows current plan badges', () => {
    const props = { ...baseProps, optimalLayouts: { min_area: null, min_cost: null } }
    render(<OptimizationPanel {...props} />)
    openPanel()
    expect(screen.getByText(/Current plan/i)).toBeInTheDocument()
  })

  it('switches to Land Area mode and shows area input', () => {
    render(<OptimizationPanel {...baseProps} constraintMode="area" optimalMaxPower={undefined} />)
    openPanel()
    expect(screen.getByText(/Finding the best layout for your area/i)).toBeInTheDocument()
  })

  it('shows no devices message when optimalMaxPower is null', () => {
    render(<OptimizationPanel {...baseProps} constraintMode="area" optimalMaxPower={null} />)
    openPanel()
    expect(screen.getByText(/No devices fit within this area/i)).toBeInTheDocument()
  })

  it('shows energy target as editable value', () => {
    render(<OptimizationPanel {...baseProps} />)
    openPanel()
    expect(screen.getByText(/8.0 MWh/i)).toBeInTheDocument()
  })

  it('switches to input mode when clicking the MWh edit button', () => {
    render(<OptimizationPanel {...baseProps} />)
    openPanel()
    fireEvent.click(screen.getByTitle(/Click to change target energy/i))
    expect(screen.getByRole('spinbutton')).toBeInTheDocument()
  })
})
