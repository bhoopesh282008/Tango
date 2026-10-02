import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const prefersDark = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches

export const useUIStore = create(
  persist(
    (set) => ({
      darkMode: prefersDark(),
      toasts: [],

      toggleDarkMode: () => set((state) => ({ darkMode: !state.darkMode })),
      addToast: (msg, type = 'success') =>
        set((state) => ({
          toasts: [...state.toasts, { id: `${Date.now()}-${Math.random()}`, msg, type }],
        })),
      removeToast: (id) =>
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        })),
    }),
    { name: 'flood-ui', partialize: (state) => ({ darkMode: state.darkMode }) },
  ),
)
