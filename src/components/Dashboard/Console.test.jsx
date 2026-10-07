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
})
