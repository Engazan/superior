const { test } = require('node:test')
const assert = require('node:assert/strict')
const vm = require('node:vm')
const fs = require('node:fs')
const { patchKeychain } = require('./fix-builder-keychain.cjs')

test('actual builder import uses separate certificate and keychain passwords', async () => {
  const source = patchKeychain(fs.readFileSync(require.resolve('app-builder-lib/out/codeSign/macCodeSign.js'), 'utf8'))
  const body = source.slice(source.indexOf('async function importCerts('), source.indexOf('async function sign('))
  const calls = []
  const context = vm.createContext({ builder_util_1: { exec: async (...args) => calls.push(args) } })
  vm.runInContext(`${body}\nglobalThis.importCerts = importCerts`, context)
  await context.importCerts('temporary.keychain', ['certificate.p12'], ['certificate-password'], 'keychain-password')
  assert.equal(calls[0][1].at(-1), 'certificate-password')
  assert.equal(calls[1][1].at(-2), 'keychain-password')
  assert.ok(source.includes('importCerts(keychainFile, certPaths, cscPasswords, keychainPassword)'))
  assert.equal(patchKeychain(source), source)
})

test('unexpected signing source fails closed', () => {
  assert.throws(() => patchKeychain('changed implementation'), /Unexpected/)
})
