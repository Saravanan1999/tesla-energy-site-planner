import { render, screen, fireEvent } from '@testing-library/react'
import DeviceCatalog from '../../components/DeviceCatalog'
import type { Device } from '../../types/api'

const battery: Device = {
  id: 1,
  name: 'Megapack 2',
  category: 'battery',
  widthFt: 30,
  heightFt: 10,
  energyMWh: 4,
  cost: 80_000,
  releaseYear: 2022,
}

const transformer: Device = {
  id: 2,
  name: 'Megapack Transformer',
  category: 'transformer',
  widthFt: 10,
  heightFt: 10,
  energyMWh: 0,
  cost: 10_000,
  releaseYear: 2022,
}

describe('DeviceCatalog', () => {
  it('shows loading placeholder when devices list is empty', () => {
    render(<DeviceCatalog devices={[]} quantities={{}} onChange={vi.fn()} />)
    expect(screen.getByText(/Loading devices/i)).toBeInTheDocument()
  })

  it('renders a card for each device', () => {
    render(<DeviceCatalog devices={[battery, transformer]} quantities={{}} onChange={vi.fn()} />)
    expect(screen.getByText('Megapack 2')).toBeInTheDocument()
    expect(screen.getByText('Megapack Transformer')).toBeInTheDocument()
  })

  it('does not show totals when all quantities are zero', () => {
    const { container } = render(<DeviceCatalog devices={[battery]} quantities={{ 1: 0 }} onChange={vi.fn()} />)
    expect(container.textContent).not.toContain('Total equipment cost')
  })

  it('shows total cost and energy when a device has quantity > 0', () => {
    const { container } = render(<DeviceCatalog devices={[battery]} quantities={{ 1: 2 }} onChange={vi.fn()} />)
    // 2 × $80,000 = $160,000
    expect(container.textContent).toContain('$160,000')
    // 2 × 4 MWh = 8.0 MWh
    expect(container.textContent).toContain('8.0 MWh')
  })

  it('calls onChange with the correct device id and quantity', () => {
    const onChange = vi.fn()
    render(<DeviceCatalog devices={[battery]} quantities={{ 1: 1 }} onChange={onChange} />)
    fireEvent.click(screen.getByText('+'))
    expect(onChange).toHaveBeenCalledWith(1, 2)
  })

  it('shows the hint text at the bottom', () => {
    render(<DeviceCatalog devices={[battery]} quantities={{}} onChange={vi.fn()} />)
    expect(screen.getByText(/Enter quantities/i)).toBeInTheDocument()
  })
})
