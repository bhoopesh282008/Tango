import { act, render } from '@testing-library/react'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { useRouteChange } from './useRouteChange'

let navigate

function Page() {
  useRouteChange()
  navigate = useNavigate()
  return (
    <main id="main" tabIndex={-1}>
      content
    </main>
  )
}

const open = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Page />
    </MemoryRouter>,
  )

test('the tab title names the page', () => {
  open('/about')
  expect(document.title).toBe('Method and limitations · TANGO Flood Response System')
  act(() => navigate('/report'))
  expect(document.title).toBe('Situation report · TANGO Flood Response System')
  act(() => navigate('/nowhere'))
  expect(document.title).toMatch(/^Page not found/)
})

test('focus stays where it is on first load, then follows the page', () => {
  open('/')
  expect(document.activeElement).toBe(document.body)
  act(() => navigate('/copilot'))
  expect(document.activeElement).toBe(document.getElementById('main'))
})
