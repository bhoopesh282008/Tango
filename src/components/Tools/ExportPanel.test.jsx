import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { downloadBlob } from '../../services/exportService'
import { useUIStore } from '../../store/uiStore'
import ExportPanel from './ExportPanel'

vi.mock('../../hooks/useDamageData', () => ({ useDamageData: () => ({ data: {}, stats: {} }) }))
vi.mock('../../services/exportService', () => ({
  combinedGeoJson: () => '{}',
  downloadBlob: vi.fn(),
  settlementsCsv: () => 'a',
  statisticsCsv: () => 'a',
}))

const show = () =>
  render(
    <MemoryRouter>
      <ExportPanel />
    </MemoryRouter>,
  )
const trigger = () => screen.getByRole('button', { name: /export/i })
const open = () => {
  fireEvent.click(trigger())
  return screen.getAllByRole('menuitem')
}

beforeEach(() => {
  useUIStore.setState({ toasts: [] })
  downloadBlob.mockClear()
})

test('opening the menu puts focus on its first item', () => {
  show()
  const items = open()
  expect(items).toHaveLength(3)
  expect(document.activeElement).toBe(items[0])
})

test('arrow keys move through the items and wrap round', () => {
  show()
  const items = open()
  fireEvent.keyDown(document, { key: 'ArrowDown' })
  expect(document.activeElement).toBe(items[1])
  fireEvent.keyDown(document, { key: 'ArrowUp' })
  fireEvent.keyDown(document, { key: 'ArrowUp' })
  expect(document.activeElement).toBe(items[2])
})

test('Escape closes the menu and gives focus back to the button', () => {
  show()
  open()
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  expect(document.activeElement).toBe(trigger())
})

test('a press outside closes the menu', () => {
  show()
  open()
  fireEvent.pointerDown(document.body)
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
})

test('a download is confirmed by name, not as a "report"', async () => {
  show()
  fireEvent.click(open()[0])
  await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(1))
  expect(downloadBlob.mock.calls[0][1]).toMatch(/settlements\.csv$/)
  expect(useUIStore.getState().toasts.map((t) => t.msg)).toEqual(['Settlements CSV downloaded'])
})
