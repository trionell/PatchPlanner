import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        zinc: {
          850: '#1f2028',
        },
      },
    },
  },
  plugins: [],
} satisfies Config
