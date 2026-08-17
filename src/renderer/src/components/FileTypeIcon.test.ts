import { describe, expect, it } from 'vitest'
import { getFileIconDescriptor, getFolderIconDescriptor } from './FileTypeIcon'

describe('getFileIconDescriptor', () => {
  it.each([
    ['index.php', 'PHP'],
    ['App.tsx', 'TS'],
    ['package.json', 'NPM'],
    ['Dockerfile', 'DK'],
    ['.env.local', 'ENV'],
    ['schema.sql', 'DB'],
    ['README.md', 'RD']
  ])('uses a recognizable badge for %s', (name, label) => {
    expect(getFileIconDescriptor(name).label).toBe(label)
  })

  it('shows short unknown extensions instead of collapsing to one generic icon', () => {
    expect(getFileIconDescriptor('archive.xyz').label).toBe('XYZ')
  })

  it('keeps extensionless unknown files generic', () => {
    expect(getFileIconDescriptor('unknown').label).toBeNull()
  })
})

describe('getFolderIconDescriptor', () => {
  it('distinguishes common project folders', () => {
    expect(getFolderIconDescriptor('src').label).toBe('<>')
    expect(getFolderIconDescriptor('tests').label).toBe('✓')
    expect(getFolderIconDescriptor('assets').label).toBe('◇')
  })

  it('keeps ordinary folders visually quiet', () => {
    expect(getFolderIconDescriptor('feature-one').label).toBeNull()
  })
})
