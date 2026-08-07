import fs from 'node:fs'
import path from 'node:path'

const distAssetsDir = path.resolve('dist/assets')

if (!fs.existsSync(distAssetsDir)) {
  console.error(`FAIL: dist/assets directory does not exist: ${distAssetsDir}`)
  process.exit(1)
}

try {
  const files = fs.readdirSync(distAssetsDir)
  const assetFiles = files.filter((f) => f.endsWith('.js') || f.endsWith('.css'))

  if (assetFiles.length === 0) {
    console.error(`FAIL: No .js or .css files found in ${distAssetsDir}`)
    process.exit(1)
  }

  let largestAsset = { name: '', size: 0 }
  let totalJsBytes = 0

  for (const file of assetFiles) {
    const filePath = path.join(distAssetsDir, file)
    const stat = fs.statSync(filePath)
    if (stat.isFile()) {
      if (file.endsWith('.js')) {
        totalJsBytes += stat.size
      }
      if (stat.size > largestAsset.size) {
        largestAsset = { name: file, size: stat.size }
      }
    }
  }

  const largestKb = (largestAsset.size / 1024).toFixed(1)
  const totalJsKb = (totalJsBytes / 1024).toFixed(1)
  const budgetKb = 4096

  console.log(`largest asset: ${largestAsset.name} ${largestKb} kB (budget ${budgetKb} kB)`)
  console.log(`total JS size: ${totalJsKb} kB`)

  if (largestAsset.size > budgetKb * 1024) {
    console.error(`FAIL: Largest asset size ${largestKb} kB exceeds raw budget of ${budgetKb} kB`)
    process.exit(1)
  }

  process.exit(0)
} catch (err) {
  console.error('FAIL: Error checking bundle size:', err)
  process.exit(1)
}
