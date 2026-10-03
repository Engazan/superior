const fs = require('node:fs')
const path = require('node:path')

const expected = {
  'dist:mac': ['.dmg', '.zip'],
  'dist:win': ['.exe', '.zip'],
  'dist:linux': ['.AppImage', '.deb']
}

const target = process.argv[2]
const extensions = expected[target]
if (!extensions) throw new Error(`Unknown distribution target: ${target || '(missing)'}`)

const output = path.resolve('dist')
const files = fs.existsSync(output) ? fs.readdirSync(output) : []
const missing = extensions.filter((extension) => !files.some((file) => file.endsWith(extension)))
if (missing.length) {
  throw new Error(`${target} did not produce required artifact type(s): ${missing.join(', ')}`)
}
