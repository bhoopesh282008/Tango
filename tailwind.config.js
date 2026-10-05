/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    // Breakpoints from the spec: mobile 0-640, tablet 641-1024, desktop 1025+
    screens: {
      sm: '641px',
      md: '768px',
      lg: '1025px',
      xl: '1280px',
    },
    extend: {
      colors: {
        brand: 'var(--brand)',
        primary: { DEFAULT: 'var(--primary)', soft: 'var(--primary-soft)' },
        danger: { DEFAULT: 'var(--danger)', soft: 'var(--danger-soft)' },
        critical: { DEFAULT: 'var(--critical)', soft: 'var(--critical-soft)', on: 'var(--on-critical)' },
        success: { DEFAULT: 'var(--success)', soft: 'var(--success-soft)' },
        warning: { DEFAULT: 'var(--warning)', soft: 'var(--warning-soft)' },
        water: 'var(--water)',
        debris: 'var(--debris)',
        uncertain: 'var(--uncertain)',
        surface: { DEFAULT: 'var(--bg-primary)', alt: 'var(--bg-secondary)' },
        line: 'var(--border)',
        ink: {
          DEFAULT: 'var(--text-primary)',
          soft: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
        },
      },
      // text-primary, text-critical and so on use the readable text step, not the fill colour
      backgroundColor: {
        primary: { DEFAULT: 'var(--primary-fill)', soft: 'var(--primary-soft)' },
      },
      textColor: {
        primary: { DEFAULT: 'var(--primary-text)', soft: 'var(--primary-soft)' },
        danger: { DEFAULT: 'var(--danger-text)', soft: 'var(--danger-soft)' },
        critical: { DEFAULT: 'var(--critical-text)', soft: 'var(--critical-soft)', on: 'var(--on-critical)' },
        success: { DEFAULT: 'var(--success-text)', soft: 'var(--success-soft)' },
        warning: { DEFAULT: 'var(--warning-text)', soft: 'var(--warning-soft)' },
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
    },
  },
  plugins: [],
}
