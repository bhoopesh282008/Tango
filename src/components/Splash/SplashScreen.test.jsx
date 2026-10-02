import { fireEvent, render, screen } from '@testing-library/react'
import { useCopilotStore } from '../../store/copilotStore'
import SplashScreen from './SplashScreen'

test('ticks off each data source, then offers Launch and hands over', async () => {
  const onReady = vi.fn()
  render(<SplashScreen onReady={onReady} />)

  expect(screen.getByRole('heading', { name: 'TANGO' })).toBeInTheDocument()
  expect(screen.getAllByText('loading')).toHaveLength(3)
  expect(screen.queryByRole('button', { name: /launch monitoring/i })).not.toBeInTheDocument()

  const start = await screen.findByRole('button', { name: /launch monitoring/i }, { timeout: 5000 })
  expect(screen.getAllByText('loaded')).toHaveLength(3)
  expect(screen.getByRole('status')).toHaveTextContent('System operational')

  fireEvent.click(start)
  expect(onReady).toHaveBeenCalledTimes(1)
})

test('language toggle switches the splash text and the copilot language', async () => {
  render(<SplashScreen onReady={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: 'नेपाली' }))

  expect(await screen.findByRole('button', { name: 'अनुगमन सुरु गर्नुहोस्' })).toBeInTheDocument()
  expect(useCopilotStore.getState().language).toBe('np')
})
