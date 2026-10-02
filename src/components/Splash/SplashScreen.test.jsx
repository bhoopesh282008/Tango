import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useCopilotStore } from '../../store/copilotStore'
import SplashScreen from './SplashScreen'

test('offers Start once the data has loaded, then hands over', async () => {
  const onReady = vi.fn()
  render(<SplashScreen onReady={onReady} />)

  expect(screen.getByRole('heading', { name: 'TANGO' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /start monitoring/i })).not.toBeInTheDocument()

  const start = await screen.findByRole('button', { name: /start monitoring/i }, { timeout: 5000 })
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')

  fireEvent.click(start)
  await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1))
})

test('language toggle switches the splash text and the copilot language', async () => {
  render(<SplashScreen onReady={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: 'नेपाली' }))

  expect(await screen.findByRole('button', { name: 'अनुगमन सुरु गर्नुहोस्' })).toBeInTheDocument()
  expect(useCopilotStore.getState().language).toBe('np')
})
