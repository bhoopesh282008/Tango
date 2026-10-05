import { DATA_MODE, ENDPOINTS, USE_MOCK } from '../config/apiConfig'
import { coverageNote, templates } from '../data/copilotTemplates'
import { EVENT, QUESTIONS } from '../utils/constants'
import { formatDate } from '../utils/formatters'
import { mock, post } from './api'

// Only a REST backend answers questions itself; otherwise answers are built here.
const LOCAL = DATA_MODE !== 'api'

function dataSource(stats) {
  const source = 'Sentinel-1 change detection and OSM overlay'
  const dated = stats.imagery.after ? `${source}, ${formatDate(stats.imagery.after)}` : source
  return USE_MOCK ? `${dated} (demo data)` : dated
}

// Answers that count what the flood hit; each ends with the lower-bound note when there is one.
const COUNTING_TOPICS = ['flood-extent', 'infrastructure', 'cut-off']
const noteFor = (language, stats) => (coverageNote[language] ?? coverageNote.en)(stats)

export function buildAnswer(questionId, language, stats, { withNote = true } = {}) {
  const t = templates[language] ?? templates.en
  const note = withNote && COUNTING_TOPICS.includes(questionId) ? noteFor(language, stats) : null
  return {
    kind: questionId,
    language,
    title: t.title[questionId],
    answer: [t[questionId](stats), note].filter(Boolean).join('\n\n'),
    confidence: stats.meanConfidence,
    dataSource: dataSource(stats),
  }
}

export async function askQuestion(questionId, language, stats) {
  if (LOCAL) return mock(buildAnswer(questionId, language, stats), 350)
  const question = QUESTIONS.find((q) => q.id === questionId)
  const reply = await post(ENDPOINTS.copilotAsk, { question: question.en, language })
  const title = (templates[language] ?? templates.en).title[questionId]
  return { kind: questionId, language, title, ...reply }
}

// Words that point a typed question at one of the four topics (English and Nepali).
const TOPIC_KEYWORDS = {
  priority: ['priorit', 'rescue', 'urgent', 'first', 'most', 'प्राथमिक', 'उद्धार', 'तुरुन्त'],
  'cut-off': ['cut off', 'cut-off', 'cutoff', 'isolated', 'settlement', 'village', 'सम्पर्कविहीन', 'बस्ती', 'गाउँ'],
  infrastructure: [
    'infrastructure', 'bridge', 'road', 'power', 'health', 'hospital', 'building', 'structure',
    'पूर्वाधार', 'पुल', 'सडक', 'विद्युत्', 'बिजुली', 'स्वास्थ्य', 'संरचना',
  ],
  'flood-extent': ['where', 'extent', 'area', 'flood hit', 'how big', 'कहाँ', 'क्षेत्र', 'बाढी'],
}

// The topic whose keywords appear most in the text, or null when none do.
export function matchQuestion(text) {
  const lower = text.toLowerCase()
  let best = null
  let bestHits = 0
  for (const [id, words] of Object.entries(TOPIC_KEYWORDS)) {
    const hits = words.filter((word) => lower.includes(word)).length
    if (hits > bestHits) {
      best = id
      bestHits = hits
    }
  }
  return best
}

const OFF_TOPIC = {
  en: 'I can only answer from the satellite analysis, on four topics: flood extent, damaged infrastructure, cut-off settlements and rescue priorities. Try rephrasing, or pick one of the questions below.',
  np: 'म भू-उपग्रह विश्लेषणका आधारमा चार विषयमा मात्र उत्तर दिन सक्छु: बाढीको क्षेत्र, क्षतिग्रस्त पूर्वाधार, सम्पर्कविहीन बस्ती र उद्धार प्राथमिकता। फरक शब्दमा सोध्नुहोस् वा तलका प्रश्नमध्ये एक छान्नुहोस्।',
}

// A typed question. Without a backend there is no language model: the text is matched to one of
// the four topics, and anything else gets a plain "cannot answer" notice.
export async function askFreeText(text, language, stats) {
  if (!LOCAL) {
    const reply = await post(ENDPOINTS.copilotAsk, { question: text, language })
    return { kind: 'free-text', language, title: null, question: text, ...reply }
  }
  const topic = matchQuestion(text)
  if (topic) return askQuestion(topic, language, stats)
  return mock({ kind: 'notice', language, question: text, notice: OFF_TOPIC[language] ?? OFF_TOPIC.en }, 200)
}

// All four answers combined into one document.
export async function generateReport(language, stats) {
  // The note is given once, under the header, not after every section.
  const sections = LOCAL
    ? QUESTIONS.map((q) => buildAnswer(q.id, language, stats, { withNote: false }))
    : await Promise.all(QUESTIONS.map((q) => askQuestion(q.id, language, stats)))
  const note = LOCAL ? noteFor(language, stats) : null
  const t = templates[language] ?? templates.en
  const { before, after } = stats.imagery
  const title = stats.areaName ? `Flood analysis: ${stats.areaName}` : `${EVENT.name}: ${EVENT.location}`
  const header = title + (before && after ? `\n${formatDate(before)} → ${formatDate(after)}` : '')
  const body = sections
    .map((s) => `${s.title.toUpperCase()}\n${'-'.repeat(40)}\n${s.answer}`)
    .join('\n\n\n')
  return {
    kind: 'report',
    language,
    title: t.title.report,
    answer: [header, note, body].filter(Boolean).join('\n\n\n'),
    confidence: sections[0].confidence,
    dataSource: sections[0].dataSource,
  }
}
