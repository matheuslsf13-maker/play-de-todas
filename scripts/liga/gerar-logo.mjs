// Gera o logo e os icones do Play de Todos (masculino) a partir de
// liga/masculino/logo.svg, em public-masculino/. Rodar: node scripts/liga/gerar-logo.mjs
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const svg = readFileSync('liga/masculino/logo.svg', 'utf8')
const saidas = [
  ['logo.png', 512, 0],
  ['icon-512.png', 512, 0],
  ['icon-192.png', 192, 0],
  ['icon-180.png', 180, 0],
  // maskable: o sistema corta ate 20% das bordas, entao o desenho encolhe
  ['icon-maskable-512.png', 512, 0.12],
]
const b = await chromium.launch()
const p = await b.newPage()
for (const [nome, lado, folga] of saidas) {
  await p.setViewportSize({ width: lado, height: lado })
  const dentro = Math.round(lado * (1 - 2 * folga))
  await p.setContent(`<html><body style="margin:0;background:#fff;display:grid;place-items:center;width:${lado}px;height:${lado}px">
    <div style="width:${dentro}px;height:${dentro}px">${svg.replace('width="512" height="512"', 'width="100%" height="100%"')}</div></body></html>`)
  await p.screenshot({ path: `public-masculino/${nome}` })
}
await b.close()
console.log('ok')
