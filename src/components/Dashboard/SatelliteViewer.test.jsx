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
  expect(screen.getByText(/cloud is hatched/)).toBeInTheDocument()
  expect(screen.getByText('Hatched: cloud, no data')).toBeInTheDocument()
})

test('a key says what dark, bright and hatched mean, so a gap in the data is not read as water', () => {
  show(scene('before'), scene('after'))
  const key = screen.getByRole('list', { name: 'Picture key' })
  expect(key).toHaveTextContent(/Dark: little radar return \(calm water, or ground turned away/)
  expect(key).toHaveTextContent(/Hatched: no data \(radar layover and shadow/)
  // The stage behind the transparent pixels is the hatch, not black.
  const picture = screen.getByAltText('Satellite image after the flood')
  Object.defineProperty(picture, 'naturalWidth', { value: 800 })
  Object.defineProperty(picture, 'naturalHeight', { value: 800 })
  fireEvent.load(picture)
  expect(document.querySelector('.compare-stage')).toHaveClass('no-data')
})

test('demo placeholder has no key, because nothing in it is a real scene', () => {
  show({ date: '2026-08-23', url: null }, { date: '2026-08-28', url: null })
  expect(screen.queryByRole('list', { name: 'Picture key' })).not.toBeInTheDocument()
})

test('opens on the close-up of the flood area when a run provides one, and can show the whole area', () => {
  render(
    <SatelliteViewer
      before={scene('before', { detail_url: '/data/before_detail.png' })}
      after={scene('after', { detail_url: '/data/after_detail.png' })}
      detail={{ near: 'Betrawati', width_km: 8, height_km: 8 }}
      comparisonValue={50}
      onComparisonChange={() => {}}
    />,
  )
  expect(screen.getByAltText('Satellite image after the flood')).toHaveAttribute('src', '/data/after_detail.png')
  expect(screen.getByText(/8 × 8 km where the map found the most flood, near Betrawati/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Whole area' }))
  expect(screen.getByAltText('Satellite image before the flood')).toHaveAttribute('src', '/data/before.png')
  expect(screen.queryByText(/where the map found the most flood/)).not.toBeInTheDocument()
})

test('demo mode without pictures keeps the labelled placeholder', () => {
  show({ date: '2026-08-23', sensor: 'Sentinel-1 GRD (VV)', resolution: '10 m', url: null },
    { date: '2026-08-28', sensor: 'Sentinel-1 GRD (VV)', resolution: '10 m', url: null })
  expect(screen.getByText(/Placeholder rendering/)).toBeInTheDocument()
  expect(document.querySelector('img')).toBeNull()   // the stand-in is drawn, not a picture file
})

describe('outlines of the mapped flood', () => {
  const outlines = {
    whole: { width: 100, height: 120, paths: { water: 'M1 1L9 1L9 9Z', debris: 'M20 20L30 20L30 30Z' } },
    detail: { width: 80, height: 80, paths: { uncertain: 'M2 2L6 2L6 6Z' } },
  }
  const showWith = (props = {}, shapeOf = [100, 120]) => {
    render(
      <SatelliteViewer
        before={scene('before', { detail_url: '/data/before_detail.png' })}
        after={scene('after', { detail_url: '/data/after_detail.png' })}
        detail={{ near: 'Bhainse', width_km: 8, height_km: 8 }}
        outlines={outlines}
        comparisonValue={50}
        onComparisonChange={() => {}}
        {...props}
      />,
    )
    // the stage takes the picture's shape once it has loaded
    const picture = screen.getByAltText('Satellite image after the flood')
    Object.defineProperty(picture, 'naturalWidth', { value: shapeOf[0], configurable: true })
    Object.defineProperty(picture, 'naturalHeight', { value: shapeOf[1], configurable: true })
    fireEvent.load(picture)
  }
  const drawn = () => [...document.querySelectorAll('[data-testid="zone-outlines"] path')].map((p) => p.getAttribute('d'))

  test('the close-up is outlined with its own zones, and the key names them', () => {
    showWith({}, [80, 80])
    expect(drawn()).toEqual(['M2 2L6 2L6 6Z', 'M2 2L6 2L6 6Z'])         // a dark edge under the coloured line
    expect(screen.getByTestId('zone-outlines')).toHaveAttribute('viewBox', '0 0 80 80')
    expect(screen.getByRole('list', { name: 'Picture key' })).toHaveTextContent('Outline: uncertain change mapped')
    expect(screen.getByText(/outlines are the flood zones mapped from this pair/)).toBeInTheDocument()
  })

  test('the whole-area picture takes the whole-area outlines, water drawn last so it is on top', () => {
    showWith({}, [100, 120])
    fireEvent.click(screen.getByRole('button', { name: 'Whole area' }))
    fireEvent.load(screen.getByAltText('Satellite image after the flood'))
    expect(screen.getByTestId('zone-outlines')).toHaveAttribute('viewBox', '0 0 100 120')
    expect([...new Set(drawn())]).toEqual(['M20 20L30 20L30 30Z', 'M1 1L9 1L9 9Z'])
  })

  test('a button turns the outlines off and on, and the key follows', () => {
    showWith({}, [80, 80])
    const button = screen.getByRole('button', { name: 'Mapped flood' })
    expect(button).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(button)
    expect(button).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByTestId('zone-outlines')).not.toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Picture key' })).not.toHaveTextContent('Outline:')
    fireEvent.click(button)
    expect(screen.getByTestId('zone-outlines')).toBeInTheDocument()
  })

  test('outlines that are not the picture\'s shape are not drawn, because they would sit in the wrong place', () => {
    showWith({}, [120, 80])                      // the picture is 3:2, the outlines are for a square
    expect(screen.queryByTestId('zone-outlines')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mapped flood' })).not.toBeInTheDocument()
  })

  test('a run without outlines shows the pictures as before, with no button', () => {
    showWith({ outlines: null }, [80, 80])
    expect(screen.queryByRole('button', { name: 'Mapped flood' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('zone-outlines')).not.toBeInTheDocument()
  })

  test('the strokes are thinner as the picture is zoomed, so the lines stay one width', () => {
    showWith({}, [80, 80])
    const width = () => Number(document.querySelector('[data-testid="zone-outlines"] path:last-child').getAttribute('stroke-width'))
    const fit = width()
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(width()).toBeCloseTo(fit / 2)
  })
})
