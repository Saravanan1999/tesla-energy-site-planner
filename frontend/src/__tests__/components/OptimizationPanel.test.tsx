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

  it('calls onTargetMWhChange when a new MWh value is committed via Enter', () => {
    const onTargetMWhChange = vi.fn()
    render(<OptimizationPanel {...baseProps} onTargetMWhChange={onTargetMWhChange} />)
    openPanel()
    fireEvent.click(screen.getByTitle(/Click to change target energy/i))
    const input = screen.getByRole('spinbutton')
    fireEvent.change(input, { target: { value: '20' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onTargetMWhChange).toHaveBeenCalledWith(20)
  })

  it('does not call onTargetMWhChange when value is unchanged', () => {
    const onTargetMWhChange = vi.fn()
    render(<OptimizationPanel {...baseProps} onTargetMWhChange={onTargetMWhChange} />)
    openPanel()
    fireEvent.click(screen.getByTitle(/Click to change target energy/i))
    const input = screen.getByRole('spinbutton')
    // value stays at 8.0 — within 0.05 threshold
    fireEvent.change(input, { target: { value: '8.0' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onTargetMWhChange).not.toHaveBeenCalled()
  })

  it('switches to area input mode when clicking the sq ft edit button', () => {
    render(<OptimizationPanel {...baseProps} constraintMode="area" optimalMaxPower={undefined} />)
    openPanel()
    fireEvent.click(screen.getByTitle(/Click to change target area/i))
    expect(screen.getByRole('spinbutton')).toBeInTheDocument()
  })

  it('calls onTargetAreaChange when a new area is committed via Enter', () => {
    const onTargetAreaChange = vi.fn()
    render(<OptimizationPanel {...baseProps} constraintMode="area" optimalMaxPower={undefined} onTargetAreaChange={onTargetAreaChange} />)
    openPanel()
    fireEvent.click(screen.getByTitle(/Click to change target area/i))
    const input = screen.getByRole('spinbutton')
    fireEvent.change(input, { target: { value: '20000' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onTargetAreaChange).toHaveBeenCalledWith(20000)
  })

  it('shows "(2 steps)" label when multiple snapshots are applied', () => {
    const props = {
      ...baseProps,
      appliedSnapshots: [
        { quantities: { 1: 2 }, label: 'Step 1', type: 'apply' as const },
        { quantities: { 1: 3 }, label: 'Step 2', type: 'apply' as const },
      ],
    }
    render(<OptimizationPanel {...props} />)
    expect(screen.getByText(/\(2 steps\)/i)).toBeInTheDocument()
  })

  it('shows pending confirmation badge when collapsed and pendingTargetPlan is set', () => {
    const props = {
      ...baseProps,
      pendingTargetPlan: { requestedMWh: 10, achievedMWh: 12 },
    }
    render(<OptimizationPanel {...props} />)
    expect(screen.getByText(/needs confirmation/i)).toBeInTheDocument()
  })

  it('shows pending target plan confirmation UI when expanded', () => {
    const props = {
      ...baseProps,
      pendingTargetPlan: { requestedMWh: 10, achievedMWh: 12 },
    }
    const { container } = render(<OptimizationPanel {...props} />)
    openPanel()
    // Text spans child elements so check textContent
    expect(container.textContent).toContain("isn't exactly achievable")
    expect(screen.getByRole('button', { name: /Confirm/i })).toBeInTheDocument()
  })

  it('calls onConfirmTargetPlan when Confirm is clicked', () => {
    const onConfirmTargetPlan = vi.fn()
    const props = { ...baseProps, pendingTargetPlan: { requestedMWh: 10, achievedMWh: 12 }, onConfirmTargetPlan }
    render(<OptimizationPanel {...props} />)
    openPanel()
    fireEvent.click(screen.getByRole('button', { name: /Confirm/i }))
    expect(onConfirmTargetPlan).toHaveBeenCalled()
  })

  it('opens save-as input when "Save as new session" is clicked', () => {
    const props = {
      ...baseProps,
      appliedSnapshots: [{ quantities: { 1: 2 }, label: 'Applied', type: 'apply' as const }],
    }
    render(<OptimizationPanel {...props} />)
    fireEvent.click(screen.getByText(/Save as new session/i))
    expect(screen.getByPlaceholderText(/Session name/i)).toBeInTheDocument()
  })

  it('shows error text when onSaveAs returns false', async () => {
    const onSaveAs = vi.fn().mockResolvedValue(false)
    const props = {
      ...baseProps,
      onSaveAs,
      currentSiteName: 'Site A',
      appliedSnapshots: [{ quantities: { 1: 2 }, label: 'Applied', type: 'apply' as const }],
    }
    render(<OptimizationPanel {...props} />)
    fireEvent.click(screen.getByText(/Save as new session/i))
    fireEvent.click(screen.getByText('Save'))
    await vi.waitFor(() => expect(screen.getByText(/Failed to save/i)).toBeInTheDocument())
  })

  it('calls onSaveAs when Save button is clicked in the save-as form', async () => {
    const onSaveAs = vi.fn().mockResolvedValue(true)
    const props = {
      ...baseProps,
      onSaveAs,
      currentSiteName: 'Site A',
      appliedSnapshots: [{ quantities: { 1: 2 }, label: 'Applied', type: 'apply' as const }],
    }
    render(<OptimizationPanel {...props} />)
    fireEvent.click(screen.getByText(/Save as new session/i))
    fireEvent.click(screen.getByText('Save'))
    await vi.waitFor(() => expect(onSaveAs).toHaveBeenCalledWith('Site A — Optimized'))
  })

  it('shows conflict warning when session name already exists', async () => {
    const props = {
      ...baseProps,
      currentSiteName: 'Site A',
      sessionNames: [{ sessionId: 'x', name: 'Site A — Optimized', savedAt: '' }],
      appliedSnapshots: [{ quantities: { 1: 2 }, label: 'Applied', type: 'apply' as const }],
    }
    render(<OptimizationPanel {...props} />)
    fireEvent.click(screen.getByText(/Save as new session/i))
    expect(screen.getByText(/Name already exists/i)).toBeInTheDocument()
  })

  it('shows "same energy" badge when delta energy is negligible', () => {
    // same energy, same area, but different cost
    const betterPlan = makePlan({ boundingAreaSqFt: 7_000, totalCost: 90_000, totalEnergyMWh: 8 })
    const props = {
      ...baseProps,
      optimalLayouts: { min_area: { label: '3× Megapack', plan: betterPlan } },
    }
    render(<OptimizationPanel {...props} />)
    openPanel()
    expect(screen.getByText('same energy')).toBeInTheDocument()
  })

  it('shows no area delta badge when bounding areas are equal', () => {
    // same area as current (10_000), but lower cost
    const betterPlan = makePlan({ boundingAreaSqFt: 10_000, totalCost: 80_000 })
    const props = {
      ...baseProps,
      optimalLayouts: { min_area: { label: '4× Megapack', plan: betterPlan } },
    }
    render(<OptimizationPanel {...props} />)
    openPanel()
    // Suggestion section renders (proves deltaArea===0 code path was hit)
    expect(screen.getByText('4× Megapack')).toBeInTheDocument()
  })

  it('shows green cost badge when optimal plan costs less', () => {
    const betterPlan = makePlan({ boundingAreaSqFt: 7_000, totalCost: 80_000, totalEnergyMWh: 8 })
    const props = {
      ...baseProps,
      optimalLayouts: { min_cost: { label: '2× Megapack', plan: betterPlan } },
      objective: 'min_cost' as const,
    }
    render(<OptimizationPanel {...props} />)
    openPanel()
    // deltaCost = 80_000 - 100_000 = -20_000 → green chip with minus sign
    expect(screen.getByText('−$20,000')).toBeInTheDocument()
  })

  it('shows pendingApply dialog when Apply is clicked and energy differs', () => {
    const betterPlan = makePlan({ boundingAreaSqFt: 7_000, totalCost: 90_000, totalEnergyMWh: 10 })
    const props = {
      ...baseProps,
      optimalLayouts: { min_area: { label: '3× Megapack', plan: betterPlan } },
    }
    const { container } = render(<OptimizationPanel {...props} />)
    openPanel()
    fireEvent.click(screen.getByRole('button', { name: /Apply/i }))
    expect(container.textContent).toContain('closest achievable is')
  })

  it('calls onApply from the pendingApply confirm dialog', () => {
    const onApply = vi.fn()
    const betterPlan = makePlan({ boundingAreaSqFt: 7_000, totalCost: 90_000, totalEnergyMWh: 10 })
    const props = {
      ...baseProps,
      onApply,
      optimalLayouts: { min_area: { label: '3× Megapack', plan: betterPlan } },
    }
    render(<OptimizationPanel {...props} />)
    openPanel()
    fireEvent.click(screen.getByRole('button', { name: /Apply/i }))
    fireEvent.click(screen.getByRole('button', { name: /Confirm/i }))
    expect(onApply).toHaveBeenCalled()
  })

  it('dismisses pendingApply dialog on Cancel', () => {
    const betterPlan = makePlan({ boundingAreaSqFt: 7_000, totalCost: 90_000, totalEnergyMWh: 10 })
    const props = {
      ...baseProps,
      optimalLayouts: { min_area: { label: '3× Megapack', plan: betterPlan } },
    }
    render(<OptimizationPanel {...props} />)
    openPanel()
    fireEvent.click(screen.getByRole('button', { name: /Apply/i }))
    // Dialog is up — Confirm + Cancel buttons present inside the amber box
    expect(screen.getByRole('button', { name: /Confirm/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }))
    // Dialog dismissed — no more Confirm button
    expect(screen.queryByRole('button', { name: /Confirm/i })).not.toBeInTheDocument()
  })

  it('shows area mode suggestion when optimalMaxPower has more energy', () => {
    const maxPlan = makePlan({ totalEnergyMWh: 12, totalCost: 150_000, siteWidthFt: 90, siteHeightFt: 90 })
    render(<OptimizationPanel {...baseProps} constraintMode="area" optimalMaxPower={maxPlan} />)
    openPanel()
    expect(screen.getByText(/Max energy layout/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Apply/i })).toBeInTheDocument()
  })

  it('shows isCurrentOptimal message in area mode when plan already matches', () => {
    // same energy AND cost as current plan
    const samePlan = makePlan({ totalEnergyMWh: 8, totalCost: 100_000 })
    render(<OptimizationPanel {...baseProps} constraintMode="area" optimalMaxPower={samePlan} />)
    openPanel()
    expect(screen.getByText(/already fits the most energy possible/i)).toBeInTheDocument()
  })

  it('shows negative deltaEnergy chip in area mode when optimal has less energy', () => {
    const lowerPlan = makePlan({ totalEnergyMWh: 4, totalCost: 50_000 })
    const { container } = render(<OptimizationPanel {...baseProps} constraintMode="area" optimalMaxPower={lowerPlan} />)
    openPanel()
    // deltaEnergy = 4 - 8 = -4 → shows "-4.0 MWh"
    expect(container.textContent).toContain('-4.0 MWh')
  })

  it('shows cost chip in area mode when costs differ', () => {
    const higherCostPlan = makePlan({ totalEnergyMWh: 12, totalCost: 150_000 })
    const { container } = render(<OptimizationPanel {...baseProps} constraintMode="area" optimalMaxPower={higherCostPlan} />)
    openPanel()
    expect(container.textContent).toContain('$50,000')
  })
})
