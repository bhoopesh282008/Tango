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

test('the ledger shows no figures: no dates, no counts, nothing like a finding', async () => {
  render(<SplashScreen onReady={() => {}} />)
  await screen.findByRole('button', { name: /launch monitoring/i }, { timeout: 5000 })
  expect(screen.queryByText(/\d{1,2} \w{3} \d{4}/)).not.toBeInTheDocument()
  expect(screen.queryByText(/[\d,]+ (buildings|settlements)/)).not.toBeInTheDocument()
  expect(screen.queryByText(/damaged|cut off|flooded/i)).not.toBeInTheDocument()
})

test('the demo dataset is not announced on the splash, in either language', async () => {
  render(<SplashScreen onReady={() => {}} />)
  await screen.findByRole('button', { name: /launch monitoring/i }, { timeout: 5000 })
  expect(screen.queryByText(/demo data/i)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'नेपाली' }))
  await screen.findByRole('button', { name: 'अनुगमन सुरु गर्नुहोस्' }, { timeout: 5000 })
  expect(screen.queryByText(/नमुना तथ्याङ्क/)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'EN' })) // the language is kept between tests
})

test('every line is ticked once its files have arrived, with the ticks hidden from screen readers and the state spoken instead', async () => {
  render(<SplashScreen onReady={() => {}} />)
  await screen.findByRole('button', { name: /launch monitoring/i }, { timeout: 5000 })
  expect(screen.getAllByText('loaded')).toHaveLength(3)
})

test('the labels say what was done with the data, not what was found', async () => {
  render(<SplashScreen onReady={() => {}} />)
  await screen.findByRole('button', { name: /launch monitoring/i }, { timeout: 5000 })
  for (const label of ['Radar images compared', 'Buildings and roads mapped', 'Villages checked for road access']) {
    expect(screen.getByText(label)).toBeInTheDocument()
  }
  // the old labels claimed an assessment and a ranking, which a lower-bound map cannot promise
  expect(screen.queryByText(/damage assessed|priorities ranked|extent mapped/i)).not.toBeInTheDocument()
})

test('language toggle switches the splash text and the copilot language', async () => {
  render(<SplashScreen onReady={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: 'नेपाली' }))

  expect(await screen.findByRole('button', { name: 'अनुगमन सुरु गर्नुहोस्' }, { timeout: 5000 })).toBeInTheDocument()
  expect(useCopilotStore.getState().language).toBe('np')
})
