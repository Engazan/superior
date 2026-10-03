// npm tarballs may omit executable bits on node-pty's native spawn helper.
const fs = require('node:fs')
const path = require('node:path')

/** Recursively chmod +x every node-pty `spawn-helper` under a directory. */
function fixSpawnHelperPerms(root) {
  if (!fs.existsSync(root)) return
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) {
      fixSpawnHelperPerms(full)
    } else if (entry.name === 'spawn-helper') {
      fs.chmodSync(full, 0o755)
      console.log(`node-pty: chmod +x ${full}`)
    }
  }
}

if (require.main === module) {
  fixSpawnHelperPerms(path.dirname(require.resolve('node-pty/package.json')))
}

module.exports = { fixSpawnHelperPerms }
