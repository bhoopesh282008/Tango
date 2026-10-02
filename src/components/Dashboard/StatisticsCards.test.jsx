import { fireEvent, render, screen } from '@testing-library/react'
import * as demo from '../../data/mockData'
import { computeStats } from '../../utils/calculations'
import StatisticsCards from './StatisticsCards'

const stats = computeStats(demo)

test('shows the four key metrics', () => {
  render(<StatisticsCards stats={stats} />)
  expect(screen.getByText('42.3')).toBeInTheDocument()
  expect(screen.getByText('1,247')).toBeInTheDocument()
  expect(screen.getByText('6.2')).toBeInTheDocument()
  expect(screen.getByText('3,560')).toBeInTheDocument()
})

test('expands a card to show its breakdown', () => {
  render(<StatisticsCards stats={stats} />)
  fireEvent.click(screen.getByRole('button', { name: /road damage/i }))
  expect(screen.getByText(/Pasang Lhamu Highway km 1\.0/)).toBeInTheDocument()
})
