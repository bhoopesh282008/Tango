import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Footer from '../components/Common/Footer'
import AboutPage from './AboutPage'

// Wording the data licences require in every submission.
const REQUIRED = [
  'Contains modified Copernicus Sentinel data 2026.',
  'Copernicus WorldDEM-30 © DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018',
  '© OpenStreetMap contributors.',
]

test.each([
  ['footer', Footer],
  ['about page', AboutPage],
])('%s carries the required attributions', (_, Component) => {
  const { container } = render(<Component />, { wrapper: MemoryRouter })
  for (const text of REQUIRED) expect(container).toHaveTextContent(text)
})

test('the about page states the limitations and flags demo data', () => {
  render(<AboutPage />, { wrapper: MemoryRouter })
  expect(screen.getByRole('heading', { name: 'What the system cannot do' })).toBeInTheDocument()
  expect(screen.getByText('No early warning')).toBeInTheDocument()
  expect(screen.getByText(/currently showing bundled demo data/)).toBeInTheDocument()
})

test('the footer links to the method and limitations page', () => {
  render(<Footer />, { wrapper: MemoryRouter })
  expect(screen.getByRole('link', { name: 'Method and limitations' })).toHaveAttribute('href', '/about')
})
