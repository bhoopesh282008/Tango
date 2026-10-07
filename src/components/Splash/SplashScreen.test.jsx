import { fireEvent, render, screen } from '@testing-library/react'
import { useCopilotStore } from '../../store/copilotStore'
import SplashScreen from './SplashScreen'

test('lists what is loading, then offers Launch and hands over', async () => {
  const onReady = vi.fn()
  render(<SplashScreen onReady={onReady} />)

  expect(screen.getByRole('heading', { name: 'TANGO' })).toBeInTheDocument()
  expect(screen.getAllByText('loading')).toHaveLength(3)
  // The button is there from the start, as the loading bar, but cannot be pressed yet
  const waiting = screen.getByRole('button', { name: /receiving data/i })
  expect(waiting).toBeDisabled()
  expect(screen.queryByRole('button', { name: /launch monitoring/i })).not.toBeInTheDocument()

  const start = await screen.findByRole('button', { name: /launch monitoring/i }, { timeout: 5000 })
  expect(start).toBeEnabled()
  expect(screen.getAllByText('loaded')).toHaveLength(3)
  expect(screen.getByRole('status')).toHaveTextContent('System operational')

  fireEvent.click(start)
  expect(onReady).toHaveBeenCalledTimes(1)
})

test('each line says what was loaded, in inputs and never in findings', async () => {
  render(<SplashScreen onReady={() => {}} />)
  await screen.findByRole('button', { name: /launch monitoring/i }, { timeout: 5000 })
  // the dates of the two scenes, the buildings mapped, the settlements listed
  expect(screen.getByText(/\d{1,2} \w{3} \d{4} to \d{1,2} \w{3} \d{4}/)).toBeInTheDocument()
  expect(screen.getByText(/[\d,]+ buildings/)).toBeInTheDocument()
  expect(screen.getByText(/[\d,]+ settlements/)).toBeInTheDocument()
  // nothing like a damage count: that needs the lower-bound note beside it
  expect(screen.queryByText(/damaged|cut off|flooded/i)).not.toBeInTheDocument()
})

test('language toggle switches the splash text and the copilot language', async () => {
  render(<SplashScreen onReady={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: 'नेपाली' }))

  expect(await screen.findByRole('button', { name: 'अनुगमन सुरु गर्नुहोस्' }, { timeout: 5000 })).toBeInTheDocument()
  expect(useCopilotStore.getState().language).toBe('np')
})
