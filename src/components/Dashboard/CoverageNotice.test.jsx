import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import * as demo from '../../data/mockData'
import { coverageNote } from '../../data/copilotTemplates'
import { buildAnswer, generateReport } from '../../services/copilotService'
import { statisticsCsv } from '../../services/exportService'
import { computeStats } from '../../utils/calculations'
import CoverageNotice from './CoverageNotice'

const validation = {
  reference: 'Copernicus EMS EMSR927',
  areas: 3,
  recall: [0.035, 0.228],
  precision: [0.88, 0.987],
  building_recall: 0.22,
}
const plain = computeStats(demo)
const checked = computeStats({ ...demo, satelliteData: { ...demo.satellite, validation } })

const show = (props) =>
  render(
    <MemoryRouter>
      <CoverageNotice {...props} />
    </MemoryRouter>,
  )

test('the demo dataset shows no notice', () => {
  const { container } = show({ validation: plain.validation })
  expect(plain.validation).toBeNull()
  expect(container).toBeEmptyDOMElement()
})

test('a checked run states its figures as a lower bound, from the data', () => {
  show({ validation: checked.validation })
  const note = screen.getByRole('note')
  expect(note).toHaveTextContent('These figures are a lower bound.')
  expect(note).toHaveTextContent('Copernicus EMS EMSR927 in 3 areas')
  expect(note).toHaveTextContent('found 4% to 23% of the affected area and 22% of the affected buildings')
  expect(note).toHaveTextContent('88% to 99% of the mapped area')
  expect(note).toHaveTextContent('An area with nothing marked is not known to be safe.')
})

test('copilot answers that count damage end with the note, in both languages', () => {
  expect(coverageNote.en(plain)).toBeNull()
  for (const topic of ['flood-extent', 'infrastructure', 'cut-off']) {
    expect(buildAnswer(topic, 'en', plain).answer).not.toContain('Lower bound')
    expect(buildAnswer(topic, 'en', checked).answer).toMatch(/Lower bound: .* found 4% to 23% of the affected area\. .*safe\.$/)
    expect(buildAnswer(topic, 'np', checked).answer).toContain('4% देखि 23%')
  }
  expect(buildAnswer('priority', 'en', checked).answer).not.toContain('Lower bound')
})

test('the situation report carries the note once', async () => {
  const report = await generateReport('en', checked)
  expect(report.answer.match(/Lower bound/g)).toHaveLength(1)
  expect((await generateReport('en', plain)).answer).not.toContain('Lower bound')
})

test('the statistics export records the reference check', () => {
  expect(statisticsCsv(checked)).toContain('Affected area found: lowest (Copernicus EMS EMSR927),0.035,fraction')
  expect(statisticsCsv(plain)).not.toContain('Affected area found')
})
