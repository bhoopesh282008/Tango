import { act, renderHook } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { TILE_FAILURES_BEFORE_NOTICE, useTileHealth } from './useTileHealth'

const tileEvent = (extra = {}) => ({ tile: {}, sourceId: 'imagery', ...extra })
const fail = (result, times, event = tileEvent()) => {
  for (let i = 0; i < times; i += 1) act(() => result.current.onError(event))
}

describe('the basemap notice', () => {
  test('stays off while only a few tiles fail', () => {
    const { result } = renderHook(() => useTileHealth())
    fail(result, TILE_FAILURES_BEFORE_NOTICE - 1)
    expect(result.current.failing).toBe(false)
  })

  test('comes on when tiles keep failing and none arrive', () => {
    const { result } = renderHook(() => useTileHealth())
    fail(result, TILE_FAILURES_BEFORE_NOTICE)
    expect(result.current.failing).toBe(true)
  })

  test('a tile arriving between failures starts the count again', () => {
    const { result } = renderHook(() => useTileHealth())
    fail(result, TILE_FAILURES_BEFORE_NOTICE - 1)
    act(() => result.current.onData(tileEvent()))
    fail(result, TILE_FAILURES_BEFORE_NOTICE - 1)
    expect(result.current.failing).toBe(false)
  })

  test('goes off again when the server answers', () => {
    const { result } = renderHook(() => useTileHealth())
    fail(result, TILE_FAILURES_BEFORE_NOTICE)
    act(() => result.current.onData(tileEvent()))
    expect(result.current.failing).toBe(false)
  })

  test('tiles arriving from another source do not hide a failing one', () => {
    // The street labels come from their own server and keep arriving while the imagery fails
    const { result } = renderHook(() => useTileHealth())
    const labels = tileEvent({ sourceId: 'openmaptiles' })
    for (let i = 0; i < TILE_FAILURES_BEFORE_NOTICE + 2; i += 1) {
      act(() => result.current.onData(labels))
      fail(result, 1)
    }
    expect(result.current.failing).toBe(true)
  })

  test('stays on while a second source is still failing', () => {
    const { result } = renderHook(() => useTileHealth())
    fail(result, TILE_FAILURES_BEFORE_NOTICE, tileEvent({ sourceId: 'imagery' }))
    fail(result, TILE_FAILURES_BEFORE_NOTICE, tileEvent({ sourceId: 'terrain' }))
    act(() => result.current.onData(tileEvent({ sourceId: 'imagery' })))
    expect(result.current.failing).toBe(true)
    act(() => result.current.onData(tileEvent({ sourceId: 'terrain' })))
    expect(result.current.failing).toBe(false)
  })

  test('errors that are not tile requests do not count', () => {
    const { result } = renderHook(() => useTileHealth())
    fail(result, TILE_FAILURES_BEFORE_NOTICE * 2, { tile: undefined })
    expect(result.current.failing).toBe(false)
  })

  test('the run\'s own GeoJSON layers neither count as failures nor hide them', () => {
    const { result } = renderHook(() => useTileHealth())
    const own = { tile: {}, sourceId: 'buildings', target: { getSource: () => ({ type: 'geojson' }) } }
    fail(result, TILE_FAILURES_BEFORE_NOTICE * 2, own)
    expect(result.current.failing).toBe(false)

    fail(result, TILE_FAILURES_BEFORE_NOTICE)
    act(() => result.current.onData(own))
    expect(result.current.failing).toBe(true)
  })

  test('dismissing keeps it off until the basemap changes', () => {
    const { result } = renderHook(() => useTileHealth())
    fail(result, TILE_FAILURES_BEFORE_NOTICE)
    act(() => result.current.dismiss())
    expect(result.current.failing).toBe(false)

    fail(result, TILE_FAILURES_BEFORE_NOTICE)
    expect(result.current.failing).toBe(false)

    act(() => result.current.reset())
    fail(result, TILE_FAILURES_BEFORE_NOTICE)
    expect(result.current.failing).toBe(true)
  })
})
