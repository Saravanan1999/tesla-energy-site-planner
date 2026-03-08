import { render, screen, fireEvent } from '@testing-library/react'
import InfoTooltip from '../../components/InfoTooltip'

describe('InfoTooltip', () => {
  it('renders the info icon and no tooltip content initially', () => {
    const { container } = render(<InfoTooltip>Tooltip content</InfoTooltip>)
    expect(container.querySelector('svg')).toBeInTheDocument()
    expect(screen.queryByText('Tooltip content')).not.toBeInTheDocument()
  })

  it('shows tooltip content after clicking', () => {
    const { container } = render(<InfoTooltip>Tooltip content</InfoTooltip>)
    fireEvent.click(container.firstChild!)
    expect(screen.getByText('Tooltip content')).toBeInTheDocument()
  })

  it('hides tooltip after clicking again (toggle)', () => {
    const { container } = render(<InfoTooltip>Tooltip content</InfoTooltip>)
    fireEvent.click(container.firstChild!)
    fireEvent.click(container.firstChild!)
    expect(screen.queryByText('Tooltip content')).not.toBeInTheDocument()
  })

  it('closes tooltip when clicking outside', () => {
    const { container } = render(<InfoTooltip>Tooltip content</InfoTooltip>)
    fireEvent.click(container.firstChild!)
    expect(screen.getByText('Tooltip content')).toBeInTheDocument()

    fireEvent.mouseDown(document.body)
    expect(screen.queryByText('Tooltip content')).not.toBeInTheDocument()
  })

  it('does not close when clicking inside the tooltip', () => {
    const { container } = render(<InfoTooltip>Tooltip content</InfoTooltip>)
    fireEvent.click(container.firstChild!)

    // mousedown on the tooltip container itself — should not close
    fireEvent.mouseDown(container.firstChild!)
    expect(screen.getByText('Tooltip content')).toBeInTheDocument()
  })

  it('applies left alignment class when align="left"', () => {
    const { container } = render(<InfoTooltip align="left">tip</InfoTooltip>)
    fireEvent.click(container.firstChild!)
    const popup = container.querySelector('.absolute.bottom-full')!
    expect(popup.className).toContain('left-0')
  })

  it('applies right alignment class when align="right"', () => {
    const { container } = render(<InfoTooltip align="right">tip</InfoTooltip>)
    fireEvent.click(container.firstChild!)
    const popup = container.querySelector('.absolute.bottom-full')!
    expect(popup.className).toContain('right-0')
  })

  it('applies center alignment class by default', () => {
    const { container } = render(<InfoTooltip>tip</InfoTooltip>)
    fireEvent.click(container.firstChild!)
    const popup = container.querySelector('.absolute.bottom-full')!
    expect(popup.className).toContain('-translate-x-1/2')
  })

  it('positions tooltip below when position="bottom"', () => {
    const { container } = render(<InfoTooltip position="bottom">tip</InfoTooltip>)
    fireEvent.click(container.firstChild!)
    const popup = container.querySelector('.absolute.top-full')
    expect(popup).toBeInTheDocument()
  })
})
