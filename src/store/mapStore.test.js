import { useMapStore } from './mapStore'

test('undo takes back only the last measuring point', () => {
  const { setMeasureMode, addMeasurePoint, undoMeasurePoint } = useMapStore.getState()
  setMeasureMode('distance')
  addMeasurePoint([85, 28])
  addMeasurePoint([85.1, 28.1])
  addMeasurePoint([85.2, 28.2])
  undoMeasurePoint()
  expect(useMapStore.getState().measurePoints).toEqual([[85, 28], [85.1, 28.1]])
  undoMeasurePoint()
  undoMeasurePoint()
  undoMeasurePoint()
  expect(useMapStore.getState().measurePoints).toEqual([])
})
