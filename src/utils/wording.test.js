// A pipeline run flags roads and bridges by overlap with a flood zone, so
// nothing in that mode may be called "destroyed".
vi.mock('../config/apiConfig', async (original) => ({
  ...(await original()),
  DATA_MODE: 'pipeline',
  USE_MOCK: false,
}))

import * as demo from '../data/mockData'
import { buildAnswer } from '../services/copilotService'
import { statisticsCsv } from '../services/exportService'
import { computeStats } from './calculations'

const stats = computeStats({ ...demo, satelliteData: demo.satellite })

test('pipeline wording says "in flood zone", not "destroyed"', () => {
  const en = ['infrastructure', 'priority'].map((q) => buildAnswer(q, 'en', stats).answer).join('\n')
  expect(en).not.toMatch(/destroyed/i)
  expect(en).toContain('in the flood zone')

  const np = ['infrastructure', 'priority'].map((q) => buildAnswer(q, 'np', stats).answer).join('\n')
  expect(np).not.toContain('भत्किए')
  expect(np).toContain('बाढी क्षेत्रभित्र')

  expect(statisticsCsv(stats)).not.toMatch(/destroyed/i)
})
