const fs = require('node:fs')
const path = require('node:path')

const assetsDir = path.resolve('out', 'renderer', 'assets')
const MAX_JS_CHUNK_BYTES = 1_550_000
const MAX_TOTAL_JS_BYTES = 3_950_000

if (!fs.existsSync(assetsDir)) {
  throw new Error('Renderer assets are missing. Run the production build first.')
}

const chunks = fs.readdirSync(assetsDir)
  .filter((file) => file.endsWith('.js'))
  .map((file) => ({ file, bytes: fs.statSync(path.join(assetsDir, file)).size }))
  .sort((a, b) => b.bytes - a.bytes)

if (!chunks.length) throw new Error('Production build did not emit renderer JavaScript chunks.')

const total = chunks.reduce((sum, chunk) => sum + chunk.bytes, 0)
const oversized = chunks.filter((chunk) => chunk.bytes > MAX_JS_CHUNK_BYTES)
if (oversized.length || total > MAX_TOTAL_JS_BYTES) {
  const detail = oversized.map((chunk) => `${chunk.file}=${chunk.bytes}`).join(', ')
  throw new Error(
    `Renderer bundle budget exceeded: largest limit=${MAX_JS_CHUNK_BYTES}, ` +
    `total=${total}/${MAX_TOTAL_JS_BYTES}${detail ? `; ${detail}` : ''}`
  )
}

console.log(`Renderer bundle: largest=${chunks[0].bytes} bytes, total=${total} bytes`)
