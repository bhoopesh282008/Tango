import { ENDPOINTS, USE_MOCK } from '../config/apiConfig'
import { templates } from '../data/copilotTemplates'
import { EVENT, QUESTIONS } from '../utils/constants'
import { formatDate } from '../utils/formatters'
import { mock, post } from './api'

const DATA_SOURCE = `Sentinel-1 change detection and OSM overlay, ${formatDate(EVENT.afterDate)}`

export function buildAnswer(questionId, language, stats) {
  const t = templates[language] ?? templates.en
  return {
    kind: questionId,
    language,
    title: t.title[questionId],
    answer: t[questionId](stats),
    confidence: stats.meanConfidence,
    dataSource: USE_MOCK ? `${DATA_SOURCE} (demo data)` : DATA_SOURCE,
  }
}

export async function askQuestion(questionId, language, stats) {
  if (USE_MOCK) return mock(buildAnswer(questionId, language, stats), 350)
  const question = QUESTIONS.find((q) => q.id === questionId)
  const reply = await post(ENDPOINTS.copilotAsk, { question: question.en, language })
  const title = (templates[language] ?? templates.en).title[questionId]
  return { kind: questionId, language, title, ...reply }
}

// All four answers combined into one document.
export async function generateReport(language, stats) {
  const sections = await Promise.all(QUESTIONS.map((q) => askQuestion(q.id, language, stats)))
  const t = templates[language] ?? templates.en
  const header = `${EVENT.name}: ${EVENT.location}\n${formatDate(EVENT.beforeDate)} → ${formatDate(EVENT.afterDate)}`
  const body = sections
    .map((s) => `${s.title.toUpperCase()}\n${'-'.repeat(40)}\n${s.answer}`)
    .join('\n\n\n')
  return {
    kind: 'report',
    language,
    title: t.title.report,
    answer: `${header}\n\n\n${body}`,
    confidence: sections[0].confidence,
    dataSource: sections[0].dataSource,
  }
}
