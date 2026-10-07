import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { openRun } from '../../config/run'
import { useDataStore } from '../../store/dataStore'
import Header from './Header'

vi.mock('../../hooks/useDamageData', () => ({ useDamageData: () => ({ data: {}, stats: null }) }))
vi.mock('../../config/run', async (original) => ({ ...(await original()), openRun: vi.fn() }))

const RUNS = [
  { id: 'trishuli-corridor-rasuwa', name: 'Trishuli corridor, Rasuwa' },
  { id: 'lower-trishuli-nuwakot', name: 'Lower Trishuli, Nuwakot' },
]
const satelliteData = {
  area: { name: 'Trishuli corridor, Rasuwa' },
  before: { date: '2026-08-16' },
  after: { date: '2026-08-28' },
}

const show = () =>
  render(
    <MemoryRouter>
      <Header />
    </MemoryRouter>,
  )

beforeEach(() => {
  openRun.mockClear()
  useDataStore.setState({ runs: [], run: null, satelliteData })
})

test('names the area and the dates of the two scenes', () => {
  show()
  expect(screen.getByText(/Trishuli corridor, Rasuwa · 16 Aug 2026 to 28 Aug 2026/)).toBeInTheDocument()
})

test('with one area there is nothing to choose, so there is no selector', () => {
  useDataStore.setState({ runs: [RUNS[0]], run: RUNS[0] })
  show()
  expect(screen.queryByLabelText('Area')).not.toBeInTheDocument()
})

test('with several areas a labelled selector shows the current one and switches on change', () => {
  useDataStore.setState({ runs: RUNS, run: RUNS[0] })
  show()
  const select = screen.getByLabelText('Area')
  expect(select).toHaveValue('trishuli-corridor-rasuwa')
  expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(RUNS.map((run) => run.name))
  fireEvent.change(select, { target: { value: 'lower-trishuli-nuwakot' } })
  expect(openRun).toHaveBeenCalledWith('lower-trishuli-nuwakot')
})

test('the icon buttons have names', () => {
  show()
  expect(screen.getByRole('link', { name: 'Method and limitations' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Switch to (dark|light) mode/ })).toBeInTheDocument()
})
