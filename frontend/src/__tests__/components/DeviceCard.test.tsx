import { render, screen, fireEvent } from '@testing-library/react'
import DeviceCard from '../../components/DeviceCard'
import type { Device } from '../../types/api'

const mockDevice: Device = {
  id: 1,
  name: 'Megapack 2',
  category: 'battery',
  widthFt: 30,
  heightFt: 10,
  energyMWh: 4,
  cost: 80_000,
  releaseYear: 2022,
}

describe('DeviceCard', () => {
  it('renders the device name', () => {
    render(<DeviceCard device={mockDevice} quantity={0} onChange={vi.fn()} />)
    expect(screen.getByText('Megapack 2')).toBeInTheDocument()
  })

  it('shows cost per device', () => {
    const { container } = render(<DeviceCard device={mockDevice} quantity={0} onChange={vi.fn()} />)
    expect(container.textContent).toContain('$80,000')
  })

  it('calls onChange with incremented value on + click', () => {
    const onChange = vi.fn()
    render(<DeviceCard device={mockDevice} quantity={3} onChange={onChange} />)
    fireEvent.click(screen.getByText('+'))
    expect(onChange).toHaveBeenCalledWith(4)
  })

  it('calls onChange with decremented value on − click', () => {
    const onChange = vi.fn()
    render(<DeviceCard device={mockDevice} quantity={3} onChange={onChange} />)
    fireEvent.click(screen.getByText('−'))
    expect(onChange).toHaveBeenCalledWith(2)
  })

  it('does not decrement below 0', () => {
    const onChange = vi.fn()
    render(<DeviceCard device={mockDevice} quantity={0} onChange={onChange} />)
    fireEvent.click(screen.getByText('−'))
    expect(onChange).toHaveBeenCalledWith(0)
  })

  it('does not increment above 99', () => {
    const onChange = vi.fn()
    render(<DeviceCard device={mockDevice} quantity={99} onChange={onChange} />)
    fireEvent.click(screen.getByText('+'))
    expect(onChange).toHaveBeenCalledWith(99)
  })

  it('shows subtotal when quantity is greater than 0', () => {
    const { container } = render(<DeviceCard device={mockDevice} quantity={2} onChange={vi.fn()} />)
    expect(container.textContent).toContain('$160,000')
  })

  it('does not show subtotal when quantity is 0', () => {
    const { container } = render(<DeviceCard device={mockDevice} quantity={0} onChange={vi.fn()} />)
    expect(container.textContent).not.toContain('$160,000')
  })

  it('renders transformer category styling without crashing', () => {
    const transformer: Device = { ...mockDevice, id: 2, name: 'Megapack Transformer', category: 'transformer' }
    render(<DeviceCard device={transformer} quantity={0} onChange={vi.fn()} />)
    expect(screen.getByText('Megapack Transformer')).toBeInTheDocument()
  })
})
