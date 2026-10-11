import { render, screen } from '@testing-library/react'
import { coverageNote, isCoverageNote } from '../../data/copilotTemplates'
import AnswerBody from './AnswerBody'

const checked = { validation: { reference: 'Copernicus EMS EMSR927', areas: 3, recall: [0.035, 0.228] } }

test('the note on how far to trust the figures is set apart from the answer, in both languages', () => {
  for (const language of ['en', 'np']) {
    const note = coverageNote[language](checked)
    expect(isCoverageNote(note)).toBe(true)
    const { unmount } = render(<AnswerBody text={`11 of 149 settlements are cut off by road.\n\n${note}`} />)
    expect(screen.getByRole('note')).toHaveTextContent(note)
    expect(screen.getByText('11 of 149 settlements are cut off by road.')).not.toHaveAttribute('role')
    unmount()
  }
})

test('an ordinary line of an answer is not taken for the note', () => {
  expect(isCoverageNote('Still connected by road (73): Somdang, Godam.')).toBe(false)
  expect(isCoverageNote('The lower bound of the estimate is 2.2 km².')).toBe(false)
})

test('a paragraph that opens with what it is about has that opening set apart; a sentence with a colon in it does not', () => {
  render(
    <AnswerBody
      text={[
        'Still connected by road (73): Somdang, Godam.',
        'Access unknown (no road to them in the pre-event map) (65): Dursagang.',
        'Recommended first: Bhainse.',
        'The score uses only the factors recorded for every settlement: structure damage (25%).',
      ].join('\n\n')}
    />,
  )
  for (const opening of ['Still connected by road (73)', 'Access unknown (no road to them in the pre-event map) (65)', 'Recommended first']) {
    expect(screen.getByText(opening)).toHaveClass('font-semibold')
  }
  expect(screen.getByText(/^The score uses only the factors/)).not.toHaveClass('font-semibold')
})

test('bullets and numbered rows are lists, with the name before the colon set apart', () => {
  render(<AnswerBody text={'• Betrawati: 1,217 mapped buildings\n• Tatopani: 158 mapped buildings\n\n1. Bhainse: 63/100, high.'} />)
  expect(screen.getAllByRole('list')).toHaveLength(2)
  expect(screen.getByText('Betrawati')).toHaveClass('font-semibold')
  expect(screen.getByText('Bhainse')).toHaveClass('font-semibold')
})
