import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from './App'

// Every page has to come up on the bundled demo data without throwing, and have exactly one
// level-one heading (the page's name for a screen reader).
const PAGES = [
  ['/', /Flood damage dashboard/],
  ['/copilot', /Situation-Report Copilot/],
  ['/about', /Method and limitations/],
  ['/report', /.+/],
  ['/nowhere', /Flood damage dashboard/], // an unknown address goes to the dashboard
]

let errors
beforeEach(() => {
  // The splash is shown once per browser session; these tests are past it.
  sessionStorage.setItem('tango-entered', '1')
  errors = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

test.each(PAGES)('%s renders its page with one h1 and no errors', async (path, name) => {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
  const heading = await screen.findByRole('heading', { level: 1, name }, { timeout: 8000 })
  expect(heading).toBeInTheDocument()
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  expect(screen.getByRole('main')).toBeInTheDocument()
  expect(errors).not.toHaveBeenCalled()
})

test('the dashboard says so, in place of the map, when the browser has no WebGL', async () => {
  render(
    <MemoryRouter initialEntries={['/']}>
      <App />
    </MemoryRouter>,
  )
  // jsdom has no WebGL, which is the case being tested
  expect(await screen.findByText('The map is not available', {}, { timeout: 8000 })).toBeInTheDocument()
  // and the rest of the page is there
  expect(screen.getByLabelText('Key figures')).toBeInTheDocument()
})

test('Launch draws the dashboard under the splash, then takes the splash away', async () => {
  sessionStorage.removeItem('tango-entered')
  // a browser that allows motion: without this the splash hands over at once
  window.matchMedia = (query) => ({
    matches: query.includes('no-preference'),
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  })
  try {
    const { container } = render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: /open the analysis/i }, { timeout: 5000 }))

    expect(container.querySelector('.splash')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { level: 1, name: /Flood damage dashboard/ }, { timeout: 8000 })).toBeInTheDocument()
    await waitFor(() => expect(container.querySelector('.splash')).not.toBeInTheDocument(), { timeout: 3000 })
    expect(sessionStorage.getItem('tango-entered')).toBe('1')
  } finally {
    delete window.matchMedia
  }
})
