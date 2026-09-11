import { describe, expect, it } from 'vitest'
import { browserKeyChord, browserUrl, buildDesignPrompt, clipBrowserBounds, validBrowserElement, type BrowserElement } from './browser'

const element: BrowserElement = { url:'http://localhost:3000/', title:'Preview', selector:'button#submit', tagName:'button',
  html:'<button id="submit">Save</button>', text:'Save', styles:'color: rgb(255, 0, 0);', rect:{x:20,y:30,width:100,height:40} }
describe('browser preview contract', () => {
  it('normalizes native keyboard modifiers to the configured app shortcut format', () => {
    const input = {key:'E',code:'KeyE',control:false,meta:true,alt:false,shift:true}
    expect(browserKeyChord(input,true)).toBe('mod+shift+e')
    expect(browserKeyChord({...input,meta:false,control:true},false)).toBe('mod+shift+e')
    expect(browserKeyChord({...input,key:'L',shift:false},true)).toBe('mod+l')
  })
  it.each(['localhost:3000','127.0.0.1:5173','my-app.local:8080/path','https://example.com/','http://[::1]:3000'])('accepts development and HTTPS URLs: %s', (input) => {
    expect(browserUrl(input)).toMatch(/^https?:\/\//)
  })
  it.each(['','javascript:alert(1)','file:///etc/passwd','data:text/html,hello','mailto:a@example.com','https://user:secret@example.com','ftp://example.com'])('rejects unsupported navigation: %s', (input) => {
    expect(() => browserUrl(input)).toThrow()
  })
  it('clips a partially offscreen element to the visible viewport', () => {
    expect(clipBrowserBounds({x:-20,y:30,width:100,height:100},80,90)).toEqual({x:0,y:30,width:80,height:60})
    expect(clipBrowserBounds({x:100,y:100,width:50,height:50},80,90)).toMatchObject({width:0,height:0})
  })
  it('validates bounded picker payloads and rejects invalid rectangles', () => {
    expect(validBrowserElement(element)).toBe(true)
    expect(validBrowserElement({...element,html:'x'.repeat(16001)})).toBe(false)
    expect(validBrowserElement({...element,rect:{...element.rect,width:NaN}})).toBe(false)
    expect(validBrowserElement({...element,styles:[]})).toBe(false)
  })
  it('gives the agent the request, DOM, styles, screenshot and workspace without terminal controls', () => {
    const prompt=buildDesignPrompt(element,'Make it blue\x1b[201~\r','/tmp/element image.png','/repo/feature')
    for (const value of [element.url, element.selector, element.html, element.styles, '/tmp/element image.png','/repo/feature','Make it blue']) expect(prompt).toContain(value)
    expect(prompt).not.toMatch(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/)
  })
})
