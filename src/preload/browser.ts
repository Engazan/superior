// Runs in the isolated, sandboxed world of the preview only. No API is exposed to the page.
import { ipcRenderer } from 'electron'
import type { BrowserElement } from '../shared/browser'
// Keep this sandboxed entry standalone: sandbox require cannot load shared output chunks.
const BROWSER_IPC = { PICK: 'browser:pick', PICK_MODE: 'browser:pick-mode' } as const

let enabled = false
let suppressNextClick = false
let overlay: HTMLDivElement | null = null
let target: Element | null = null

function clear(): void { overlay?.remove(); overlay = null; target = null }
function selector(element: Element): string {
  const parts: string[] = []
  let current: Element | null = element
  while (current && parts.length < 6) {
    let part = current.tagName.toLowerCase()
    if (current.id) { parts.unshift(`${part}#${CSS.escape(current.id)}`); break }
    const parent: Element | null = current.parentElement
    if (parent) {
      const siblings = Array.from(parent.children).filter((child) => child.tagName === current?.tagName)
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`
    }
    parts.unshift(part); current = parent
  }
  return parts.join(' > ').slice(0, 2048)
}
function highlight(element: Element): void {
  target = element
  if (!overlay) {
    overlay = document.createElement('div')
    overlay.style.cssText = 'all:initial;position:fixed;pointer-events:none;z-index:2147483647;box-sizing:border-box;border:2px solid #f08066;background:rgba(240,128,102,.12);'
    document.documentElement.append(overlay)
  }
  const rect = element.getBoundingClientRect()
  Object.assign(overlay.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` })
}
function elementAt(event: MouseEvent): Element | null {
  const first = event.composedPath().find((item) => item instanceof Element)
  return first instanceof Element ? first : document.elementFromPoint(event.clientX, event.clientY)
}

ipcRenderer.on(BROWSER_IPC.PICK_MODE, (_event, value: boolean) => { enabled = value === true; if (!enabled) clear() })
window.addEventListener('mousemove', (event) => { if (enabled) { const element = elementAt(event); if (element) highlight(element) } }, true)
window.addEventListener('scroll', () => { if (enabled && target) highlight(target) }, true)
window.addEventListener('keydown', (event) => {
  if (enabled && event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); enabled = false; clear(); ipcRenderer.send(BROWSER_IPC.PICK, null) }
}, true)
// Suppress page controls while picking; otherwise pointerdown could navigate before click.
for (const type of ['pointerdown', 'mousedown', 'mouseup'] as const) {
  window.addEventListener(type, (event) => { if (type === 'pointerdown') suppressNextClick = false; if (enabled) { event.preventDefault(); event.stopImmediatePropagation() } }, true)
}
function selectElement(event: MouseEvent): void {
  const element = elementAt(event)
  if (!element) return
  const rect = element.getBoundingClientRect()
  const clone = element.cloneNode(true) as Element
  clone.querySelectorAll('script, style, noscript').forEach((node) => node.remove())
  // Don't include form field values in the contextual HTML snapshot.
  for (const field of [clone, ...Array.from(clone.querySelectorAll('input, textarea'))]) {
    field.removeAttribute('value')
    if (field.tagName === 'TEXTAREA') field.textContent = ''
  }
  const computed = getComputedStyle(element)
  const properties = ['display','position','top','right','bottom','left','width','height','min-width','max-width','min-height','max-height',
    'margin','padding','gap','color','background','font-family','font-size','font-weight','line-height','letter-spacing','text-align',
    'border','border-radius','box-shadow','opacity','overflow','flex-direction','align-items','justify-content','grid-template-columns','transform']
  const data: BrowserElement = {
    url: location.href.slice(0, 8192), title: document.title.slice(0, 512), selector: selector(element),
    tagName: element.tagName.toLowerCase().slice(0, 80), html: clone.outerHTML.slice(0, 16000),
    text: (element instanceof HTMLElement ? element.innerText : element.textContent ?? '').slice(0, 4000),
    styles: properties.map((key) => `${key}: ${computed.getPropertyValue(key)};`).join('\n').slice(0, 12000),
    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  }
  enabled = false; clear()
  // Let Chromium paint away the selection outline before main captures the crop.
  requestAnimationFrame(() => requestAnimationFrame(() => ipcRenderer.send(BROWSER_IPC.PICK, data)))
}
// Pointer events also reach disabled buttons, whose click event is suppressed by Chromium.
window.addEventListener('pointerup', (event) => {
  if (!enabled || !event.isTrusted) return
  event.preventDefault(); event.stopImmediatePropagation()
  suppressNextClick = true
  selectElement(event)
}, true)
window.addEventListener('click', (event) => {
  if (!event.isTrusted || (!enabled && !suppressNextClick)) return
  event.preventDefault(); event.stopImmediatePropagation()
  suppressNextClick = false
  if (enabled) selectElement(event)
}, true)
