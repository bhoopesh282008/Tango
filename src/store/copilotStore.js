import { create } from 'zustand'
import { persist } from 'zustand/middleware'

let nextId = 1

export const useCopilotStore = create(
  persist(
    (set) => ({
      language: 'en',
      // { id, role: 'user', text } or { id, role: 'assistant', response }
      conversation: [],
      loading: false,

      setLanguage: (lang) => set({ language: lang }),
      addMessage: (msg) =>
        set((state) => ({
          conversation: [...state.conversation, { id: nextId++, ...msg }],
        })),
      // Swap the newest answer, e.g. for the same answer in another language.
      replaceLastResponse: (response) =>
        set((state) => {
          const index = state.conversation.findLastIndex((m) => m.role === 'assistant')
          if (index < 0) return state
          const conversation = [...state.conversation]
          conversation[index] = { ...conversation[index], response }
          return { conversation }
        }),
      setLoading: (loading) => set({ loading }),
      clearConversation: () => set({ conversation: [], loading: false }),
    }),
    { name: 'flood-copilot', partialize: (state) => ({ language: state.language }) },
  ),
)
