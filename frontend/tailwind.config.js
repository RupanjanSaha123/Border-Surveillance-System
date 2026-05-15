export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'military-bg': '#0a0c0f',
        'military-panel': '#0d1117',
        'military-green': '#4a6741',
        'military-amber': '#f59e0b',
        'military-red': '#ef4444',
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Courier New"', 'monospace'],
        sans: ['Inter', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
