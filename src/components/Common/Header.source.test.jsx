import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { setDataSource } from '../../config/dataSource'
import { useDataStore } from '../../store/dataStore'
import Header from './Header'

vi.mock('../../hooks/useDamageData', () => ({ useDamageData: () => ({ data: {}, stats: null }) }))
vi.mock('../../config/dataSource', () => ({ setDataSource: vi.fn() }))
vi.mock('../../config/apiConfig', async (original) => ({
  ...(await original()),
  CAN_SWITCH_SOURCE: true,
  DATA_SOURCE: 'real',
}))

const show = () =>
  render(
    <MemoryRouter>
      <Header />
    </MemoryRouter>,
  )

beforeEach(() => {
  setDataSource.mockClear()
  useDataStore.setState({ runs: [], run: null, satelliteData: { area: { name: 'Trishuli corridor, Rasuwa' } } })
})

test('a build with run data offers a labelled switch between it and the demo, showing which is on', () => {
  show()
  expect(screen.getByRole('group', { name: 'Data source' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Run data' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: 'Demo' })).toHaveAttribute('aria-pressed', 'false')
})

test('pressing the other source switches to it, and pressing the one that is on does nothing', () => {
  show()
  fireEvent.click(screen.getByRole('button', { name: 'Run data' }))
  expect(setDataSource).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Demo' }))
  expect(setDataSource).toHaveBeenCalledWith('demo')
})
