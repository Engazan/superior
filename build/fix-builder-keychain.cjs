const fs = require('node:fs')

// app-builder-lib 26.15.3 passes the certificate password where security needs
// the generated keychain password. Keep this narrow backport until upgrading
// to a release containing the upstream macCodeSign.ts fix.
function patchKeychain(source) {
  const replacements = [
    ['importCerts(keychainFile, certPaths, cscPasswords)', 'importCerts(keychainFile, certPaths, cscPasswords, keychainPassword)'],
    ['async function importCerts(keychainFile, paths, keyPasswords)', 'async function importCerts(keychainFile, paths, keyPasswords, keychainPassword)'],
    ['"set-key-partition-list", "-S", "apple-tool:,apple:", "-s", "-k", password, keychainFile',
      '"set-key-partition-list", "-S", "apple-tool:,apple:", "-s", "-k", keychainPassword, keychainFile']
  ]
  if (replacements.every(([, fixed]) => source.includes(fixed))) return source
  for (const [original, fixed] of replacements) {
    if (source.split(original).length !== 2) throw new Error('Unexpected app-builder-lib signing implementation; review keychain backport.')
    source = source.replace(original, fixed)
  }
  return source
}

if (require.main === module) {
  const { version } = require('app-builder-lib/package.json')
  if (version !== '26.15.3') throw new Error('Review/remove the keychain backport after upgrading app-builder-lib.')
  const file = require.resolve('app-builder-lib/out/codeSign/macCodeSign.js')
  const original = fs.readFileSync(file, 'utf8')
  const patched = patchKeychain(original)
  if (patched !== original) fs.writeFileSync(file, patched)
  console.log('Verified electron-builder keychain password fix.')
}

module.exports = { patchKeychain }
