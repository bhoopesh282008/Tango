import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import * as demo from '../../data/mockData'
import { computeStats } from '../../utils/calculations'
import DamageAnalysis from './DamageAnalysis'
import NoFloodNotice from './NoFloodNotice'
import SettlementPriorityRanking from './SettlementPriorityRanking'
import StatisticsCards from './StatisticsCards'

// A judge can pick an area and a date where nothing flooded. The run is then empty, and
// every part of the dashboard has to cope with that without NaN, a crash or a blank space.
const none = { type: 'FeatureCollection', features: [] }
const satelliteData = { before: { date: '2026-08-16' }, after: { date: '2026-08-28' } }

const nothing = computeStats({
  floodZones: none,
  buildings: none,
  roads: none,
  settlements: [],
  infrastructure: [],
  satelliteData,
})

// Settlements exist, but no flood zone touched any road: nobody is cut off.
const allConnected = computeStats({
  floodZones: none,
  buildings: demo.buildings,
  roads: demo.roads,
  settlements: demo.settlements.map((s) => ({ ...s, connected: true })),
  infrastructure: [],
  satelliteData,
})

const show = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>)
const broken = /NaN|Infinity|undefined/

test('statistics for a run that found nothing are zeros, not NaN', () => {
  expect(nothing.floodedAreaKm2).toBe(0)
  expect(nothing.zones).toEqual([])
  expect(nothing.cutOff).toEqual([])
  expect(nothing.priority).toEqual([])
  expect(nothing.meanConfidence).toBe(0)
  expect(nothing.infrastructureAssessed).toBe(false)
})

test.each([
  ['no data at all', nothing],
  ['settlements but nobody cut off', allConnected],
])('the statistics panel renders for %s', (_, stats) => {
  const { container } = show(<StatisticsCards stats={stats} />)
  expect(container.textContent).not.toMatch(broken)
  expect(screen.getByText('Flooded area')).toBeInTheDocument()
})

test.each([
  ['no data at all', nothing],
  ['settlements but nobody cut off', allConnected],
])('the damage analysis renders for %s', (_, stats) => {
  const { container } = show(<DamageAnalysis stats={stats} />)
  expect(container.textContent).not.toMatch(broken)
})

test('the rescue ranking has nothing to rank and shows nothing rather than an empty table', () => {
  const { container } = show(<SettlementPriorityRanking stats={nothing} />)
  expect(container).toBeEmptyDOMElement()
  expect(show(<SettlementPriorityRanking stats={allConnected} />).container).toBeTruthy()
})

test('the notice says no flood was mapped, with the dates, and that this is not proof of safety', () => {
  show(<NoFloodNotice imagery={nothing.imagery} />)
  const note = screen.getByRole('note')
  expect(note).toHaveTextContent('No flood was mapped in this area')
  expect(note).toHaveTextContent('16 Aug 2026')
  expect(note).toHaveTextContent('28 Aug 2026')
  expect(note).toHaveTextContent('not proof that it is safe')
})
