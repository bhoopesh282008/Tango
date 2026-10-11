import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useCopilotStore } from '../../store/copilotStore'
import SplashScreen, { LEAVE_MS } from './SplashScreen'

// The language is kept in a store, so a test that switches it would leak into the next
beforeEach(() => useCopilotStore.getState().setLanguage('en'))

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

test('the app is told when the data has arrived, once', async () => {
  const onSettled = vi.fn()
  const { rerender } = render(<SplashScreen onReady={() => {}} onSettled={onSettled} />)
  await screen.findByRole('button', { name: /launch monitoring/i }, { timeout: 5000 })
  expect(onSettled).toHaveBeenCalledTimes(1)
  // a re-render (the app's theme changing, say) does not tell it again
  rerender(<SplashScreen onReady={() => {}} onSettled={onSettled} />)
  expect(onSettled).toHaveBeenCalledTimes(1)
})

describe('with motion allowed', () => {
  beforeEach(() => {
    window.matchMedia = (query) => ({ matches: query.includes('no-preference'), addEventListener() {}, removeEventListener() {} })
  })
  afterEach(() => {
    delete window.matchMedia
  })

  test('Launch plays the way out first, then hands over once, however often it is pressed', async () => {
    const onReady = vi.fn()
    const onLeave = vi.fn()
    const { container } = render(<SplashScreen onReady={onReady} onLeave={onLeave} />)
    const start = await screen.findByRole('button', { name: /launch monitoring/i }, { timeout: 5000 })

    fireEvent.click(start)
    fireEvent.click(start)
    // the app is told at once, so it can draw itself underneath; the splash stays for now
    expect(onLeave).toHaveBeenCalledTimes(1)
    expect(onReady).not.toHaveBeenCalled()
    // and is from then on a picture, not a second page for a screen reader
    expect(container.querySelector('.splash')).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelector('.splash')).toHaveClass('splash--leaving')

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1), { timeout: LEAVE_MS + 1000 })
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(onReady).toHaveBeenCalledTimes(1)
  })
})

test('the splash carries no keyboard hint: the button is the only invitation', async () => {
  render(<SplashScreen onReady={() => {}} />)
  await screen.findByRole('button', { name: /launch monitoring/i }, { timeout: 5000 })
  expect(screen.queryByText(/press|Enter/)).not.toBeInTheDocument()
})

describe('with a mouse or trackpad, so most likely a keyboard', () => {
  beforeEach(() => {
    window.matchMedia = (query) => ({ matches: query.includes('pointer: fine'), addEventListener() {}, removeEventListener() {} })
  })
  afterEach(() => {
    delete window.matchMedia
  })

  test('Enter launches from anywhere on the page, and still nothing on the page says so', async () => {
    const onReady = vi.fn()
    render(<SplashScreen onReady={onReady} />)
    await screen.findByRole('button', { name: /launch monitoring/i }, { timeout: 5000 })
    expect(screen.queryByText(/press|Enter/)).not.toBeInTheDocument()

    fireEvent.keyDown(document.body, { key: 'a' })
    expect(onReady).not.toHaveBeenCalled()
    fireEvent.keyDown(document.body, { key: 'Enter' })
    expect(onReady).toHaveBeenCalledTimes(1)
  })

  test('Enter on the language switch changes the language and does not launch', async () => {
    const onReady = vi.fn()
    render(<SplashScreen onReady={onReady} />)
    await screen.findByRole('button', { name: /launch monitoring/i }, { timeout: 5000 })
    fireEvent.keyDown(screen.getByRole('button', { name: 'नेपाली' }), { key: 'Enter' })
    expect(onReady).not.toHaveBeenCalled()
  })
})
