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

// A typed question. Demo mode has no language model: the text is matched to one of
// the four topics, and anything else gets a plain "cannot answer" notice.
export async function askFreeText(text, language, stats) {
  if (!USE_MOCK) {
    const reply = await post(ENDPOINTS.copilotAsk, { question: text, language })
    return { kind: 'free-text', language, title: null, question: text, ...reply }
  }
  const topic = matchQuestion(text)
  if (topic) return askQuestion(topic, language, stats)
  return mock({ kind: 'notice', language, question: text, notice: OFF_TOPIC[language] ?? OFF_TOPIC.en }, 200)
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
