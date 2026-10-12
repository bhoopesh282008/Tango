import { describe, expect, test } from 'vitest'
import * as demo from '../data/mockData'
import { computeStats } from '../utils/calculations'
import { generateReport } from './copilotService'

const named = computeStats({
  ...demo,
  satelliteData: { ...demo.satellite, area: { name: 'Trishuli corridor, Rasuwa', bbox: [85.1, 27.9, 85.5, 28.3] } },
})

describe('the situation report', () => {
  test('is headed with the area it is about, in the language asked for', async () => {
    const en = await generateReport('en', named)
    const np = await generateReport('np', named)
    expect(en.answer.startsWith('Flood analysis: Trishuli corridor, Rasuwa')).toBe(true)
    // the Nepali report does not open in English
    expect(np.answer.startsWith('बाढी विश्लेषण: Trishuli corridor, Rasuwa')).toBe(true)
  })

  test('falls back to the English heading for a language it has no heading for', async () => {
    const other = await generateReport('xx', named)
    expect(other.answer.startsWith('Flood analysis: ')).toBe(true)
  })
})
