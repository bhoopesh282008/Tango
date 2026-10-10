import { fireEvent, render, screen } from '@testing-library/react'
import { act } from 'react'
import { speak } from '../../services/speech'
import { useRouteStore } from '../../store/routeStore'
import NavigationHud from './NavigationHud'

vi.mock('../../services/speech', async (original) => ({
  ...(await original()),
  speechAvailable: () => true,
  speak: vi.fn(),
  stopSpeaking: vi.fn(),
}))

const route = { distanceM: 900, steps: [], floodedParts: [], flaggedSections: [] }
const progress = {
  alongM: 100,
  offM: 2,
  remainingM: 800,
  arrived: false,
  current: { name: 'Main Road' },
  upcoming: { startM: 500, text: 'Turn left onto Hill Road', maneuver: { kind: 'turn', side: 'left' } },
  toUpcomingM: 400,
  floodedAhead: null,
}
const initial = useRouteStore.getState()

beforeEach(() => {
  speak.mockClear()
  localStorage.clear()
  act(() => useRouteStore.setState({ ...initial, voice: false, gps: 'tracking', navigating: true }, true))
})

test('voice guidance is off to begin with, says nothing, and is a labelled button', () => {
  render(<NavigationHud route={route} progress={progress} />)
  const button = screen.getByRole('button', { name: 'Voice guidance' })
  expect(button).toHaveAttribute('aria-pressed', 'false')
  expect(speak).not.toHaveBeenCalled()
})

test('turning it on confirms by voice, remembers the choice, and the next instruction is spoken', () => {
  render(<NavigationHud route={route} progress={progress} />)
  fireEvent.click(screen.getByRole('button', { name: 'Voice guidance' }))
  expect(screen.getByRole('button', { name: 'Voice guidance' })).toHaveAttribute('aria-pressed', 'true')
  expect(speak).toHaveBeenCalledWith('Voice guidance on.')
  expect(speak).toHaveBeenCalledWith('In 400 metres. Turn left onto Hill Road.')
  expect(localStorage.getItem('tango-voice')).toBe('on')
})

test('turning it off forgets the choice', () => {
  act(() => useRouteStore.getState().setVoice(true))
  render(<NavigationHud route={route} progress={progress} />)
  fireEvent.click(screen.getByRole('button', { name: 'Voice guidance' }))
  expect(screen.getByRole('button', { name: 'Voice guidance' })).toHaveAttribute('aria-pressed', 'false')
  expect(localStorage.getItem('tango-voice')).toBeNull()
})
