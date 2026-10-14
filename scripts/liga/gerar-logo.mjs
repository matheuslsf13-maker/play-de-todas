// Gera o logo e os icones de uma liga a partir de liga/<liga>/logo.svg, em
// public-<liga>/. Rodar: node scripts/liga/gerar-logo.mjs [masculino|misto]
//
// O logo.png sai TRANSPARENTE fora do circulo: e o que aparece no app e na arte,
// e um fundo branco virava um quadrado em volta. Os icones da tela inicial
// precisam de fundo (o iPhone pinta o transparente de preto), entao saem com o
// circulo sobre o azul-noite da liga.
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const liga = process.argv[2] ?? 'masculino'
const svg = readFileSync(`liga/${liga}/logo.svg`, 'utf8')
// o fundo dos icones e a cor-tema da liga (liga.config.ts)
const FUNDO = { masculino: '#0a1626', misto: '#0b1f22' }[liga]
const saidas = [
  ['logo.png', 512, 0, null],
  ['icon-512.png', 512, 0.03, FUNDO],
  ['icon-192.png', 192, 0.03, FUNDO],
  ['icon-180.png', 180, 0.03, FUNDO],
  // maskable: o sistema corta ate 20% das bordas, entao o desenho encolhe
  ['icon-maskable-512.png', 512, 0.12, FUNDO],
]
const b = await chromium.launch()
const p = await b.newPage()
for (const [nome, lado, folga, fundo] of saidas) {
  await p.setViewportSize({ width: lado, height: lado })
  const dentro = Math.round(lado * (1 - 2 * folga))
  await p.setContent(`<html><body style="margin:0;background:${fundo ?? 'transparent'};display:grid;place-items:center;width:${lado}px;height:${lado}px">
    <div style="width:${dentro}px;height:${dentro}px">${svg.replace('width="512" height="512"', 'width="100%" height="100%"')}</div></body></html>`)
  await p.screenshot({ path: `public-${liga}/${nome}`, omitBackground: !fundo })
}
await b.close()
console.log('ok')
