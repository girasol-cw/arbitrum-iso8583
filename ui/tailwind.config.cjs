/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:       '#0f1117',
        surface:  '#1a1d27',
        surface2: '#22263a',
        border:   '#2e3350',
        accent:   '#6366f1',
        accent2:  '#818cf8',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
