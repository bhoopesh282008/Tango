import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../../App'
import { useCopilotStore } from '../../store/copilotStore'

// The copilot page on the bundled demo data: it opens on the four questions with a figure beside
// each, and an answer arrives as plain text with Copy and Download under the newest one.
beforeEach(() => {
  sessionStorage.setItem('tango-entered', '1')
  useCopilotStore.getState().clearConversation()
})

const open = () =>
  render(
    <MemoryRouter initialEntries={['/copilot']}>
      <App />
    </MemoryRouter>,
  )

test('opens on the questions, each with a figure from the data, and no conversation yet', async () => {
  open()
  // the figures appear once the data has loaded; until then the questions wait
  expect(await screen.findByRole('button', { name: /Where did the flood hit\?.*km²/ }, { timeout: 8000 })).toBeInTheDocument()
  const list = screen.getByRole('button', { name: /Where did the flood hit/ }).closest('ul')
  expect(within(list).getAllByRole('button')).toHaveLength(5) // four questions and the full report
  expect(screen.queryByRole('log')).not.toBeInTheDocument()
})

test('asking a question puts it and its answer in the thread, with Copy and Download on the answer', async () => {
  open()
  // a question asked before the data has loaded is ignored, so wait for its figure
  fireEvent.click(await screen.findByRole('button', { name: /Which settlements cut off\?.*of/ }, { timeout: 8000 }))
  const thread = await screen.findByRole('log', {}, { timeout: 8000 })
  expect(await within(thread).findByRole('heading', { level: 2 }, { timeout: 8000 })).toBeInTheDocument()
  expect(within(thread).getByRole('button', { name: /Copy/ })).toBeInTheDocument()
  expect(within(thread).getByRole('button', { name: /Download/ })).toBeInTheDocument()
  // the questions stay within reach as compact buttons beside the input
  expect(screen.getByRole('textbox', { name: 'Your question' })).toBeInTheDocument()
})
