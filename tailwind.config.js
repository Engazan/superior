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
        fgmuted: 'var(--c-fgmuted)',
        accent: 'var(--c-accent)',
        accentBg: 'var(--c-accent-bg)',
        accentBorder: 'var(--c-accent-border)',
        accentSolid: 'var(--c-accent-solid)',
        accentSolidHover: 'var(--c-accent-solid-hover)',
        status: 'var(--c-status)',
        statusBg: 'var(--c-status-bg)',
        statusBorder: 'var(--c-status-border)',
        danger: 'var(--c-danger)',
        dangerSolid: 'var(--c-danger-solid)',
        dangerBg: 'var(--c-danger-bg)',
        dangerBorder: 'var(--c-danger-border)',
        warn: 'var(--c-warn)',
        warnBg: 'var(--c-warn-bg)',
        warnBorder: 'var(--c-warn-border)'
      }
    }
  },
  plugins: []
}
