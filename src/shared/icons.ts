export interface BuiltinIcon {
  id: string
  label: string
  /** SVG data URL, usable directly as an <img> src (CSP allows data:) */
  dataUrl: string
}

interface Spec {
  id: string
  label: string
  glyph: string
  color: string
}

/** A small palette of recognizable agent icons to choose from. */
const SPECS: Spec[] = [
  { id: 'claude', label: 'Claude', glyph: 'C', color: '#D97757' },
  { id: 'codex', label: 'Codex', glyph: 'Cx', color: '#10A37F' },
  { id: 'amp', label: 'Amp', glyph: 'A', color: '#F2542D' },
  { id: 'gemini', label: 'Gemini', glyph: 'G', color: '#4285F4' },
  { id: 'mastracode', label: 'Mastracode', glyph: 'M', color: '#7C3AED' },
  { id: 'opencode', label: 'OpenCode', glyph: 'OC', color: '#14B8A6' },
  { id: 'pi', label: 'Pi', glyph: 'π', color: '#EC4899' },
  { id: 'copilot', label: 'Copilot', glyph: 'Cp', color: '#24292F' },
  { id: 'cursor', label: 'Cursor Agent', glyph: 'Cu', color: '#0F172A' },
  { id: 'droid', label: 'Droid', glyph: 'D', color: '#3DDC84' }
]

function toDataUrl(glyph: string, color: string): string {
  const fontSize = glyph.length > 1 ? 10 : 13
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">` +
    `<rect width="24" height="24" rx="5" fill="${color}"/>` +
    `<text x="12" y="12" dy="0.35em" text-anchor="middle" ` +
    `font-family="-apple-system,Helvetica,Arial,sans-serif" font-size="${fontSize}" ` +
    `font-weight="600" fill="#ffffff">${glyph}</text>` +
    `</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

export const BUILTIN_ICONS: BuiltinIcon[] = SPECS.map((s) => ({
  id: s.id,
  label: s.label,
  dataUrl: toDataUrl(s.glyph, s.color)
}))

export function builtinIcon(id: string): BuiltinIcon | undefined {
  return BUILTIN_ICONS.find((i) => i.id === id)
}
