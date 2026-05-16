export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'military-bg':     '#243026',
        'military-panel':  '#1e2921',
        'military-green':  '#3C4A3B',
        'military-amber':  '#8B8F74',
        'military-red':    '#ef4444',
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Courier New"', 'monospace'],
        sans: ['Inter', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
