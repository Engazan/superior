/**
 * Semantic tokens live as hex CSS vars in index.css (swapped by .light/.dark).
 * Colors are registered as functions so Tailwind's `/NN` opacity modifier works
 * with them: plain string values like 'var(--c-x)' silently DROP classes such
 * as `bg-accentBg/70` (Tailwind can't inject alpha into an opaque var), which
 * left several backgrounds missing. color-mix() keeps the vars themselves hex.
 */
const token = (name) => {
  return ({ opacityValue }) =>
    opacityValue === undefined || Number(opacityValue) === 1
      ? `var(${name})`
      : `color-mix(in srgb, var(${name}) calc(${opacityValue} * 100%), transparent)`
}

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bar: token('--c-bar'),
        panel: token('--c-panel'),
        edge: token('--c-edge'),
        hover: token('--c-hover'),
        fg: token('--c-fg'),
        fg2: token('--c-fg2'),
        fgdim: token('--c-fgdim'),
        fgmuted: token('--c-fgmuted'),
        accent: token('--c-accent'),
        accentBg: token('--c-accent-bg'),
        accentBorder: token('--c-accent-border'),
        accentSolid: token('--c-accent-solid'),
        accentSolidHover: token('--c-accent-solid-hover'),
        status: token('--c-status'),
        statusBg: token('--c-status-bg'),
        statusBorder: token('--c-status-border'),
        danger: token('--c-danger'),
        dangerSolid: token('--c-danger-solid'),
        dangerBg: token('--c-danger-bg'),
        dangerBorder: token('--c-danger-border'),
        warn: token('--c-warn'),
        warnBg: token('--c-warn-bg'),
        warnBorder: token('--c-warn-border')
      }
    }
  },
  plugins: []
}
