import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useCopilotStore = create(
  persist(
    (set) => ({
      language: 'en',
      conversation: [],
      currentResponse: null,
      loading: false,

      setLanguage: (lang) => set({ language: lang }),
      addMessage: (msg) =>
        set((state) => ({
          conversation: [...state.conversation, msg],
        })),
      setCurrentResponse: (resp) => set({ currentResponse: resp }),
      setLoading: (loading) => set({ loading }),
      clearConversation: () => set({ conversation: [], currentResponse: null }),
    }),
    { name: 'flood-copilot', partialize: (state) => ({ language: state.language }) },
  ),
)
