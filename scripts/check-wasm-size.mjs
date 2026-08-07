import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const wasmDir = path.resolve('public/wasm')

if (!fs.existsSync(wasmDir)) {
  console.error(`FAIL: WASM directory does not exist: ${wasmDir}`)
  process.exit(1)
}

try {
  const files = fs.readdirSync(wasmDir)
  const wasmFiles = files.filter((f) => f.endsWith('.wasm'))

  if (wasmFiles.length === 0) {
    console.error(`FAIL: No .wasm files found in ${wasmDir}`)
    process.exit(1)
  }

  let totalGzipBytes = 0
  for (const file of wasmFiles) {
    const filePath = path.join(wasmDir, file)
    const content = fs.readFileSync(filePath)
    const gzipped = zlib.gzipSync(content)
    totalGzipBytes += gzipped.length
  }

  const totalKb = (totalGzipBytes / 1024).toFixed(1)
  const budgetKb = 800

  console.log(`wasm gzip size: ${totalKb} kB (budget ${budgetKb} kB)`)

  if (totalGzipBytes > budgetKb * 1024) {
    console.error(`FAIL: WASM gzip size ${totalKb} kB exceeds budget of ${budgetKb} kB`)
    process.exit(1)
  }

  process.exit(0)
} catch (err) {
  console.error('FAIL: Error checking WASM size:', err)
  process.exit(1)
}
