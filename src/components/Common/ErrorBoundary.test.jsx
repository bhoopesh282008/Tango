import { fireEvent, render, screen } from '@testing-library/react'
import ErrorBoundary from './ErrorBoundary'

// React logs every caught error; keep the test output readable.
beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}))
afterEach(() => vi.restoreAllMocks())

let broken = true
function Fragile({ message = 'boom' }) {
  if (broken) throw new Error(message)
  return <p>All good</p>
}

beforeEach(() => {
  broken = true
})

test('renders its children when nothing fails', () => {
  broken = false
  render(
    <ErrorBoundary>
      <Fragile />
    </ErrorBoundary>,
  )
  expect(screen.getByText('All good')).toBeInTheDocument()
})

test('a failing child becomes a message with the technical detail, not a blank page', () => {
  render(
    <ErrorBoundary>
      <Fragile message="Cannot read properties of undefined" />
    </ErrorBoundary>,
  )
  expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong')
  expect(screen.getByText('Cannot read properties of undefined')).toBeInTheDocument()
})

test('Try again renders the children afresh', () => {
  render(
    <ErrorBoundary>
      <Fragile />
    </ErrorBoundary>,
  )
  broken = false
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(screen.getByText('All good')).toBeInTheDocument()
})

test('the error clears when the reset key changes (another page)', () => {
  const { rerender } = render(
    <ErrorBoundary resetKey="/">
      <Fragile />
    </ErrorBoundary>,
  )
  expect(screen.getByRole('alert')).toBeInTheDocument()
  broken = false
  rerender(
    <ErrorBoundary resetKey="/about">
      <Fragile />
    </ErrorBoundary>,
  )
  expect(screen.getByText('All good')).toBeInTheDocument()
})

test('a page that failed to load after a new deploy asks for a reload, not a retry', () => {
  render(
    <ErrorBoundary>
      <Fragile message="Failed to fetch dynamically imported module: /assets/DashboardPage-abc.js" />
    </ErrorBoundary>,
  )
  expect(screen.getByRole('heading', { name: 'This page is out of date' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Reload the page/ })).toBeInTheDocument()
})

test('a custom fallback gets the error and a way to reset', () => {
  render(
    <ErrorBoundary fallback={({ error, reset }) => <button onClick={reset}>Custom: {error.message}</button>}>
      <Fragile />
    </ErrorBoundary>,
  )
  broken = false
  fireEvent.click(screen.getByRole('button', { name: 'Custom: boom' }))
  expect(screen.getByText('All good')).toBeInTheDocument()
})
