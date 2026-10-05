import { filePrefix } from '../config/run'
import { useCallback, useEffect, useRef } from 'react'
import { askFreeText, askQuestion, generateReport } from '../services/copilotService'
import { downloadBlob } from '../services/exportService'
import { useCopilotStore } from '../store/copilotStore'
import { useUIStore } from '../store/uiStore'
import { copyText } from '../utils/clipboard'
import { QUESTIONS } from '../utils/constants'

const REPORT_REQUEST = { en: 'Generate the full situation report', np: 'पूर्ण स्थिति प्रतिवेदन तयार गर्नुहोस्' }

function fetchResponse(kind, language, stats, text) {
  if (kind === 'report') return generateReport(language, stats)
  if (kind === 'free-text') return askFreeText(text, language, stats)
  return askQuestion(kind, language, stats)
}

export function useCopilot(stats) {
  const {
    language, conversation, loading,
    setLanguage, setLoading, addMessage, replaceLastResponse, clearConversation,
  } = useCopilotStore()
  const addToast = useUIStore((s) => s.addToast)
  const requestId = useRef(0)

  const latest = conversation.findLast((m) => m.role === 'assistant')?.response ?? null
  // Only real answers can be copied or downloaded, not "cannot answer" notices.
  const latestAnswer = latest?.answer ? latest : null

  const run = useCallback(
    async (kind, lang, { text, replace = false } = {}) => {
      if (!stats) return
      const id = ++requestId.current
      setLoading(true)
      try {
        const response = await fetchResponse(kind, lang, stats, text)
        // A newer request (another question or a language switch) supersedes this one.
        if (id !== requestId.current) return
        if (replace) replaceLastResponse(response)
        else addMessage({ role: 'assistant', response })
      } catch (error) {
        if (id === requestId.current) addToast(error.message || 'Copilot request failed', 'error')
      } finally {
        if (id === requestId.current) setLoading(false)
      }
    },
    [stats, setLoading, addMessage, replaceLastResponse, addToast],
  )

  // Switching language re-renders the newest answer in the new language.
  // Each answer is retried at most once per language, so a failing request cannot loop.
  const translated = useRef(null)
  useEffect(() => {
    if (!latest || latest.language === language || loading) return
    const attempt = `${conversation.length}:${language}`
    if (translated.current === attempt) return
    translated.current = attempt
    run(latest.question ? 'free-text' : latest.kind, language, { text: latest.question, replace: true })
  }, [language, latest, loading, conversation.length, run])

  const ask = (questionId) => {
    const question = QUESTIONS.find((q) => q.id === questionId)
    addMessage({ role: 'user', text: question[language] ?? question.en })
    run(questionId, language)
  }

  const askText = (text) => {
    const trimmed = text.trim()
    if (!trimmed) return
    addMessage({ role: 'user', text: trimmed })
    run('free-text', language, { text: trimmed })
  }

  const generateFullReport = () => {
    addMessage({ role: 'user', text: REPORT_REQUEST[language] ?? REPORT_REQUEST.en })
    run('report', language)
  }

  const copy = async () => {
    if (!latestAnswer) return
    const ok = await copyText(latestAnswer.answer)
    addToast(ok ? 'Copied to clipboard' : 'Could not copy', ok ? 'success' : 'error')
  }

  const download = () => {
    if (!latestAnswer) return
    downloadBlob(
      latestAnswer.answer,
      `${filePrefix()}-${latestAnswer.kind}-${latestAnswer.language}.txt`,
      'text/plain;charset=utf-8',
    )
    addToast('Report downloaded')
  }

  return {
    language,
    setLanguage,
    conversation,
    latestAnswer,
    loading,
    ask,
    askText,
    generateFullReport,
    copy,
    download,
    clear: () => {
      requestId.current++
      clearConversation()
    },
  }
}
