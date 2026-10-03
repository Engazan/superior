const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { fixSpawnHelperPerms } = require('./fix-pty-helpers.cjs')

test('repairs installed and packaged spawn helpers without changing other files', {
  skip: process.platform === 'win32' // Windows does not expose POSIX execute bits.
}, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pty-perms-'))
  try {
    for (const dir of ['prebuilds/darwin-arm64', 'build/Release']) {
      const parent = path.join(root, dir)
      fs.mkdirSync(parent, { recursive: true })
      fs.writeFileSync(path.join(parent, 'spawn-helper'), 'helper', { mode: 0o644 })
    }
    const untouched = path.join(root, 'index.js')
    fs.writeFileSync(untouched, 'source', { mode: 0o644 })
    fixSpawnHelperPerms(root)
    fixSpawnHelperPerms(root)
    for (const dir of ['prebuilds/darwin-arm64', 'build/Release']) {
      assert.equal(fs.statSync(path.join(root, dir, 'spawn-helper')).mode & 0o777, 0o755)
    }
    assert.equal(fs.statSync(untouched).mode & 0o777, 0o644)
    fixSpawnHelperPerms(path.join(root, 'missing'))
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
