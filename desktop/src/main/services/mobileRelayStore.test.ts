import { describe, expect, it } from 'vitest'
import { MOBILE_DEVICE_NAME_MAX, normalizeDeviceName } from './mobileRelayStore'

describe('normalizeDeviceName', () => {
  it('trims and keeps a real name', () => {
    expect(normalizeDeviceName('  Pixel 9  ')).toBe('Pixel 9')
  })

  it('treats blank or non-string input as no custom name', () => {
    expect(normalizeDeviceName('   ')).toBeUndefined()
    expect(normalizeDeviceName(42)).toBeUndefined()
    expect(normalizeDeviceName(undefined)).toBeUndefined()
  })

  it('caps the length', () => {
    expect(normalizeDeviceName('x'.repeat(200))).toHaveLength(MOBILE_DEVICE_NAME_MAX)
  })
})
