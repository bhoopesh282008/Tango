import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import * as demo from '../../data/mockData'
import { useMapStore } from '../../store/mapStore'
import { computeStats } from '../../utils/calculations'
import { formatNumber } from '../../utils/formatters'
import Evidence from './Evidence'
import SettlementPriorityRanking from './SettlementPriorityRanking'
import Situation from './Situation'

const stats = computeStats(demo)
const show = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>)

beforeEach(() => useMapStore.setState({ focus: null, highlightedSettlement: null }))

describe('the key figures', () => {
  test('lead with how much is flooded and how many settlements are cut off, from the computed statistics', () => {
    show(<Situation stats={stats} />)
    const figures = screen.getByRole('region', { name: 'Key figures' }) // the labelled section
    expect(within(figures).getByText('Flooded area').closest('div')).toHaveTextContent(formatNumber(stats.floodedAreaKm2, 1))
    const cutOff = within(figures).getByText('Settlements cut off').closest('div')
    expect(cutOff).toHaveTextContent(`${stats.cutOff.length} of ${stats.settlementRows.length}`)
  })

  test('say so when the infrastructure was not assessed, rather than show zeros', () => {
    show(<Situation stats={{ ...stats, infrastructureAssessed: false }} />)
    expect(screen.getByText(/were not assessed in this run/)).toBeInTheDocument()
  })

  test('give sizes in buildings, and say population is not recorded, when it is not', () => {
    show(<Situation stats={{ ...stats, sizeBasis: 'buildings' }} />)
    expect(screen.getByText('Buildings in them')).toBeInTheDocument()
    expect(screen.getByText('population not recorded')).toBeInTheDocument()
  })
})

describe('the rescue list', () => {
  test('ranks the cut-off settlements, one button per row', () => {
    show(<SettlementPriorityRanking stats={stats} />)
    const rows = screen.getAllByRole('button').filter((b) => b.hasAttribute('title'))
    expect(rows).toHaveLength(stats.priority.length)
    expect(rows[0]).toHaveTextContent(stats.priority[0].name)
  })

  test('choosing a row sends the map to that settlement and marks the row', () => {
    show(<SettlementPriorityRanking stats={stats} />)
    const second = stats.priority[1]
    fireEvent.click(screen.getByRole('button', { name: new RegExp(second.name) }))
    expect(useMapStore.getState().focus.settlement.id).toBe(second.id)
    expect(screen.getByRole('button', { name: new RegExp(second.name) })).toHaveAttribute('aria-current', 'true')
  })

  test('sorting by damage reorders the rows', () => {
    show(<SettlementPriorityRanking stats={stats} />)
    fireEvent.click(screen.getByRole('button', { name: 'Damage' }))
    const mostDamaged = [...stats.priority].sort((a, b) => b.damageRatio - a.damageRatio)[0]
    const first = screen.getAllByRole('button').find((b) => b.hasAttribute('title'))
    expect(first).toHaveTextContent(mostDamaged.name)
    expect(screen.getByRole('button', { name: 'Damage' })).toHaveAttribute('aria-pressed', 'true')
  })

  test('the explanation of the score is there, folded away', () => {
    show(<SettlementPriorityRanking stats={stats} />)
    expect(screen.getByText('How the score is worked out').closest('details')).not.toHaveAttribute('open')
  })
})

describe('the evidence section', () => {
  test('lists identical names once, with a count', () => {
    const bridges = ['Unnamed bridge', 'Unnamed bridge', 'Unnamed bridge', 'Falaakhu River Bridge'].map((name, i) => ({ id: `b${i}`, name }))
    show(<Evidence stats={{ ...stats, infrastructureAssessed: true, bridgesDestroyed: bridges }} />)
    expect(screen.getAllByText(/Unnamed bridge/)).toHaveLength(1)
    expect(screen.getByText('×3')).toBeInTheDocument()
  })

  test('says confidence is a score and not a measured accuracy, and shows ranges, not meters', () => {
    show(<Evidence stats={stats} />)
    expect(screen.getByText(/not a measured accuracy/)).toBeInTheDocument()
    expect(screen.queryByRole('meter')).not.toBeInTheDocument()
  })

  test('says how complete the road map is, from the figures the run measured, and nothing when it was not', () => {
    const quality = { buildings: 1000, buildings_near_road: 0.874, near_road_m: 300, settlements: 40, settlements_without_road: 12, road_km: 90 }
    const { unmount } = show(<Evidence stats={{ ...stats, osmQuality: quality }} />)
    const section = screen.getByRole('heading', { name: 'How complete the road map is' }).closest('section')
    expect(section).toHaveTextContent('87% of the 1,000 mapped buildings are within 300 m of a mapped road')
    expect(section).toHaveTextContent('12 of 40 settlements have no mapped road at all')
    unmount()
    show(<Evidence stats={{ ...stats, osmQuality: null }} />)
    expect(screen.queryByText('How complete the road map is')).not.toBeInTheDocument()
  })
})

describe('context beside the map', () => {
  const context = {
    population: { source: 'WorldPop 2020, 100 m', people_in_mapped_buildings: 41234, by_settlement: {} },
    river: { event: '2026-08-26', on_event_m3s: 4.9, normal_m3s: 5.5, ratio_on_event: 0.9, ratio_peak: 1.1, years: 26, limits: 'About 5 km resolution.' },
    attribution: ['Population: WorldPop.'],
  }

  test('says it is not part of the map, rounds the modelled people and gives the river against its norm', () => {
    show(<Evidence stats={{ ...stats, context }} />)
    const section = screen.getByRole('heading', { name: 'Context, not part of the map' }).closest('section')
    expect(section).toHaveTextContent('No flood, damage or cut-off figure here is calculated from them')
    expect(section).toHaveTextContent('about 41,200')
    expect(section).toHaveTextContent('Modelled, not counted')
    expect(section).toHaveTextContent('0.9 times the norm')
    expect(section).toHaveTextContent('About 5 km resolution.')
    expect(section).toHaveTextContent('Population: WorldPop.')
  })

  test('is absent when the run has none', () => {
    show(<Evidence stats={{ ...stats, context: null }} />)
    expect(screen.queryByText('Context, not part of the map')).not.toBeInTheDocument()
  })

  test('the rescue table gives a modelled head count beside the buildings, and does not use it in the score', () => {
    const first = stats.priority[0]
    const withPeople = { ...stats, context: { population: { by_settlement: { [first.id]: 8123 } } } }
    show(<SettlementPriorityRanking stats={withPeople} />)
    expect(screen.getAllByText(/people, modelled/)).toHaveLength(1)
    expect(screen.getByText('about 8,100 people, modelled')).toBeInTheDocument()
    expect(withPeople.priority.map((p) => p.priority)).toEqual(stats.priority.map((p) => p.priority))
  })

  test('small modelled counts are not given to the person', async () => {
    const { modelledPeople } = await import('./ContextNote')
    expect([modelledPeople(12), modelledPeople(437), modelledPeople(8123), modelledPeople(null)]).toEqual(['under 50', '440', '8,100', null])
  })
})
