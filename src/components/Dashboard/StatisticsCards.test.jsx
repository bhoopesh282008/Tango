import { fireEvent, render, screen } from '@testing-library/react'
import * as demo from '../../data/mockData'
import { computeStats } from '../../utils/calculations'
import StatisticsCards from './StatisticsCards'

const stats = computeStats(demo)

test('shows the headline and infrastructure figures', () => {
  render(<StatisticsCards stats={stats} />)
  expect(screen.getByText('42.3')).toBeInTheDocument()
  expect(screen.getByText('3,560')).toBeInTheDocument()
  expect(screen.getByText('1,247')).toBeInTheDocument()
  expect(screen.getByText('40%')).toBeInTheDocument()
  expect(screen.getByText('6.2')).toBeInTheDocument()
  expect(screen.getByText('Bridges destroyed').parentElement).toHaveTextContent('3')
  expect(screen.getByText('Health posts unreachable').parentElement).toHaveTextContent('2')
})

test('expands a headline card to show its breakdown', () => {
  render(<StatisticsCards stats={stats} />)
  const card = screen.getByRole('button', { name: /flooded area/i })
  fireEvent.click(card)
  expect(card).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByText('Flooded area: breakdown')).toBeInTheDocument()
})
