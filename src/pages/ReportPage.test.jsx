import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import * as demo from '../data/mockData'
import { useCopilotStore } from '../store/copilotStore'
import { computeStats } from '../utils/calculations'
import { formatNumber } from '../utils/formatters'
import ReportPage, { framed, scaleLength } from './ReportPage'

const stats = computeStats(demo)
const open = () =>
  render(
    <MemoryRouter>
      <ReportPage />
    </MemoryRouter>,
  )

beforeEach(() => useCopilotStore.getState().setLanguage('en'))

test('the sheet leads with the four figures the dashboard leads with, from the same statistics', async () => {
  open()
  const sheet = (await screen.findByRole('heading', { level: 1 }, { timeout: 8000 })).closest('article')
  const figure = (label) => within(sheet).getByText(label).closest('div')
  expect(figure('Mapped flood area')).toHaveTextContent(`${formatNumber(stats.floodedAreaKm2, 1)} km²`)
  expect(figure('Settlements cut off')).toHaveTextContent(`${stats.cutOff.length} of ${stats.settlementRows.length}`)
  expect(figure('People in them')).toHaveTextContent(formatNumber(stats.populationAffected))
  expect(figure('Buildings in a flood zone')).toHaveTextContent(`${formatNumber(stats.damagedStructures)}of ${formatNumber(stats.totalStructures)} mapped`)
})

test('the priority table names its units in the headings and gives each band by name', async () => {
  open()
  const table = await screen.findByRole('table', {}, { timeout: 8000 })
  expect(within(table).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['#', 'Settlement', 'Band', 'Score', 'People', 'Damaged', 'Also'])
  const first = within(table).getAllByRole('row')[1]
  expect(first).toHaveTextContent(stats.priority[0].name)
  expect(first).toHaveTextContent(formatNumber(stats.priority[0].population))
  expect(first).not.toHaveTextContent(/people|buildings/)
})

test('the map has a key in words, a north arrow and a scale, and the sheet is in Nepali when asked', async () => {
  open()
  const map = await screen.findByRole('img', { name: /North up/ }, { timeout: 8000 })
  expect(map).toHaveTextContent(/\d+(\.\d)? km/)
  const key = map.closest('figure').querySelector('figcaption')
  for (const label of ['Cut off, numbered by priority', 'Connected', 'Access unknown', 'Water']) {
    expect(within(key).getByText(label)).toBeInTheDocument()
  }
  fireEvent.click(screen.getByRole('button', { name: 'नेपाली' }))
  expect(screen.getByText('सम्पर्कविहीन बस्ती')).toBeInTheDocument()
  expect(screen.getByRole('img', { name: /माथि उत्तर/ })).toBeInTheDocument()
})

test('the scale bar is a round length no longer than a third of the map', () => {
  expect(scaleLength(31)).toBe(10)
  expect(scaleLength(29)).toBe(5)
  expect(scaleLength(160)).toBe(50)
  expect(scaleLength(1)).toBe(0.5)
})

test('a sliver of an area is framed wider, about its middle, and an ordinary one is left alone', () => {
  const tall = framed([85.0, 27.0, 85.1, 28.0], 0.88)
  const aspect = (tall[3] - tall[1]) / ((tall[2] - tall[0]) * 0.88)
  expect(aspect).toBeCloseTo(1.45, 5)
  expect((tall[0] + tall[2]) / 2).toBeCloseTo(85.05, 6)
  expect([tall[1], tall[3]]).toEqual([27.0, 28.0])

  const wide = framed([85.0, 27.0, 86.0, 27.1], 0.88)
  expect((wide[2] - wide[0]) * 0.88 / (wide[3] - wide[1])).toBeCloseTo(1.45, 5)

  expect(framed([85.0, 27.8, 85.45, 28.3], 0.88)).toEqual([85.0, 27.8, 85.45, 28.3])
})
