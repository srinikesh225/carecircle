import type { Config } from 'tailwindcss'

const c = (v: string) => `rgb(var(${v}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: c('--paper'),
        card: c('--card'),
        ink: { DEFAULT: c('--ink'), 2: c('--ink-2') },
        line: c('--line'),
        brand: { DEFAULT: c('--brand'), soft: c('--brand-soft'), dark: c('--brand-dark') },
        warn: { DEFAULT: c('--warn'), soft: c('--warn-soft') },
        alert: { DEFAULT: c('--alert'), soft: c('--alert-soft') },
        info: { DEFAULT: c('--info'), soft: c('--info-soft') },
      },
      fontFamily: { sans: ['"Atkinson Hyperlegible"', 'system-ui', 'sans-serif'] },
      borderRadius: { DEFAULT: '6px', md: '6px', lg: '8px' },
    },
  },
  plugins: [],
} satisfies Config
