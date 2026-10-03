import { fireEvent, render, screen } from '@testing-library/react'
import SatelliteViewer from './SatelliteViewer'

const scene = (name, extra = {}) => ({
  date: name === 'before' ? '2026-08-16' : '2026-08-28',
  sensor: 'Sentinel-1 GRD (VV)',
  resolution: '10 m',
  url: `/data/${name}.png`,
  ...extra,
})
const show = (before, after) =>
  render(<SatelliteViewer before={before} after={after} comparisonValue={50} onComparisonChange={() => {}} />)

test('shows the real before and after pictures when a run provides them', () => {
  show(scene('before'), scene('after'))
  expect(screen.getByAltText('Satellite image before the flood')).toHaveAttribute('src', '/data/before.png')
  expect(screen.getByAltText('Satellite image after the flood')).toHaveAttribute('src', '/data/after.png')
  expect(screen.queryByText(/Placeholder rendering/)).not.toBeInTheDocument()
  expect(screen.getByRole('option', { name: /Sentinel-2 optical \(not available\)/ })).toBeDisabled()
})

test('offers the optical pictures only when both exist, and switches to them', () => {
  show(scene('before', { optical_url: '/data/before_optical.png' }), scene('after', { optical_url: '/data/after_optical.png' }))
  const option = screen.getByRole('option', { name: /Sentinel-2 optical \(false colour\)/ })
  expect(option).toBeEnabled()
  fireEvent.change(screen.getByLabelText('Imagery layer'), { target: { value: 's2' } })
  expect(screen.getByAltText('Satellite image after the flood')).toHaveAttribute('src', '/data/after_optical.png')
  expect(screen.getByText(/cloud is left blank/)).toBeInTheDocument()
})

test('demo mode without pictures keeps the labelled placeholder', () => {
  show({ date: '2026-08-23', sensor: 'Sentinel-1 GRD (VV)', resolution: '10 m', url: null },
    { date: '2026-08-28', sensor: 'Sentinel-1 GRD (VV)', resolution: '10 m', url: null })
  expect(screen.getByText(/Placeholder rendering/)).toBeInTheDocument()
  expect(document.querySelector('img')).toBeNull()   // the stand-in is drawn, not a picture file
})
