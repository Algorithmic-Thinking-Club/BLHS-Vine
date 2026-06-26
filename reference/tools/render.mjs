import { pdfToPng } from 'pdf-to-png-converter'
import { mkdirSync } from 'node:fs'
import { basename } from 'node:path'

const [pdf, outDir, range] = process.argv.slice(2)
if (!pdf || !outDir) {
  console.error('usage: node render.mjs <pdf> <outDir> [start-end]')
  process.exit(1)
}
mkdirSync(outDir, { recursive: true })

let pagesToProcess
if (range) {
  const [a, b] = range.split('-').map(Number)
  pagesToProcess = []
  for (let i = a; i <= b; i++) pagesToProcess.push(i)
}

const tag = basename(pdf).replace(/\.pdf$/i, '')
const pages = await pdfToPng(pdf, {
  outputFolder: outDir,
  viewportScale: 1.8,
  outputFileMaskFunc: (p) => `${tag}-p${String(p).padStart(2, '0')}.png`,
  ...(pagesToProcess ? { pagesToProcess } : {}),
})
console.log(`rendered ${pages.length} pages -> ${outDir}`)
