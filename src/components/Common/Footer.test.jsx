import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Footer from './Footer'

test('says which build this is: version, commit and date', () => {
  render(
    <MemoryRouter>
      <Footer />
    </MemoryRouter>,
  )
  expect(screen.getByTestId('build')).toHaveTextContent(/TANGO \d+\.\d+\.\d+ · [0-9a-f]{7,}|unknown · built \d{1,2} \w{3} \d{4}/)
})

test('keeps the data attributions and the link to the limitations', () => {
  render(
    <MemoryRouter>
      <Footer />
    </MemoryRouter>,
  )
  expect(screen.getByRole('link', { name: 'Method and limitations' })).toHaveAttribute('href', '/about')
  // named in the data note and again in the attributions
  expect(screen.getAllByText(/OpenStreetMap/).length).toBeGreaterThan(0)
})
