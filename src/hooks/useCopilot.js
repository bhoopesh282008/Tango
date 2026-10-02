import { useCallback, useEffect, useRef } from 'react'
import { askQuestion, generateReport } from '../services/copilotService'
import { downloadBlob } from '../services/exportService'
import { useCopilotStore } from '../store/copilotStore'
import { useUIStore } from '../store/uiStore'
import { copyText } from '../utils/clipboard'

export function useCopilot(stats) {
  const { language, currentResponse, loading, setLanguage, setCurrentResponse, setLoading, addMessage } =
    useCopilotStore()
  const addToast = useUIStore((s) => s.addToast)
  const requestId = useRef(0)

  const run = useCallback(
    async (kind, lang) => {
      if (!stats) return
      const id = ++requestId.current
      setLoading(true)
      try {
        const response =
          kind === 'report' ? await generateReport(lang, stats) : await askQuestion(kind, lang, stats)
        // A newer request (another question or a language switch) supersedes this one.
        if (id !== requestId.current) return
        setCurrentResponse(response)
        addMessage(response)
      } catch (error) {
        if (id === requestId.current) addToast(error.message || 'Copilot request failed', 'error')
      } finally {
        if (id === requestId.current) setLoading(false)
      }
    },
    [stats, setLoading, setCurrentResponse, addMessage, addToast],
  )

  // Switching language re-renders the answer on screen in the new language.
  useEffect(() => {
    if (currentResponse && currentResponse.language !== language) run(currentResponse.kind, language)
  }, [language, currentResponse, run])

  const copy = async () => {
    if (!currentResponse) return
    const ok = await copyText(currentResponse.answer)
    addToast(ok ? 'Copied to clipboard' : 'Could not copy', ok ? 'success' : 'error')
  }

  const download = () => {
    if (!currentResponse) return
    downloadBlob(
      currentResponse.answer,
      `trishuli-${currentResponse.kind}-${currentResponse.language}.txt`,
      'text/plain;charset=utf-8',
    )
    addToast('Report downloaded')
  }

  return {
    language,
    setLanguage,
    response: currentResponse,
    loading,
    ask: (questionId) => run(questionId, language),
    generateFullReport: () => run('report', language),
    copy,
    download,
  }
}
