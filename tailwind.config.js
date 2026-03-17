/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bar: 'var(--c-bar)',
        panel: 'var(--c-panel)',
        edge: 'var(--c-edge)',
        hover: 'var(--c-hover)',
        fg: 'var(--c-fg)',
        fg2: 'var(--c-fg2)',
        fgdim: 'var(--c-fgdim)',
        fgmuted: 'var(--c-fgmuted)'
      }
    }
  },
  plugins: []
}
