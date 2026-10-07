// Gera os quadros da animacao de uma menina do Hall, em alta resolucao.
//
//   node scripts/hall/quadros.mjs exemplo
//
// Le src/lib/hall/menina-<nome>.json e as peles de scripts/hall/menina.py, abre
// um Chrome sem janela (o Chrome instalado na maquina), desenha cada quadro com
// a malha e grava em arte/hall/menina/quadros/ (+ quadros.json com o logo e a
// cabeca de cada quadro). O pixel art sai depois: scripts/hall/sprites.py.
import { build } from 'esbuild'
import puppeteer from 'puppeteer-core'
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'

const nome = process.argv[2] ?? 'exemplo'
const RAIZ = resolve('.')
const PASTA = join(RAIZ, 'arte', 'hall', 'menina')
const SAIDA = join(PASTA, 'quadros')
const S = 4 // supersample: cada pixel do sprite e desenhado com 4x4

const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const cfg = JSON.parse(readFileSync(join(RAIZ, 'src', 'lib', 'hall', `menina-${nome}.json`), 'utf8'))

// as 8 direcoes: 6 desenhadas (a frente34 espelhada tambem, por causa do logo)
// e 2 espelhadas na hora (perfil e costas34 para a esquerda)
const VISTAS = [
  ['frente', false],
  ['frente34', false],
  ['frente34', true],
  ['perfil', false],
  ['costas34', false],
  ['costas', false],
]
const ANIMS = { andar: 12, parada: 16 }

const tmp = join(tmpdir(), 'pdt-quadros')
mkdirSync(tmp, { recursive: true })
await build({ entryPoints: [join(RAIZ, 'scripts', 'hall', 'quadros', 'pagina.ts')], bundle: true, outfile: join(tmp, 'pagina.js'), logLevel: 'error' })
writeFileSync(join(tmp, 'pagina.html'), '<!doctype html><meta charset="utf-8"><body><script src="pagina.js"></script>')

const navegador = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--allow-file-access-from-files', '--disable-web-security'] })
const pagina = await navegador.newPage()
pagina.on('pageerror', (e) => console.log('ERRO na pagina:', e.message))
await pagina.goto(pathToFileURL(join(tmp, 'pagina.html')).href)

const base = pathToFileURL(PASTA).href
for (const [vista, v] of Object.entries(cfg.vistas)) {
  await pagina.evaluate((b, n, vv) => window.preparar(b, n, vv), base, vista, v)
}

rmSync(SAIDA, { recursive: true, force: true })
mkdirSync(SAIDA, { recursive: true })
const lista = []
for (const [vista, espelho] of VISTAS) {
  const temOlhos = (cfg.vistas[vista].olhos ?? []).length > 0
  for (const [tipo, n] of Object.entries(ANIMS)) {
    for (const piscando of tipo === 'parada' && temOlhos ? [false, true] : [false]) {
      for (let i = 0; i < n; i++) {
        const r = await pagina.evaluate((p, s) => window.quadro(p, s), { vista, tipo, fase: i / n, espelho, piscando }, S)
        const id = `${vista}${espelho ? 'E' : ''}-${tipo}${piscando ? '-piscando' : ''}-${String(i).padStart(2, '0')}`
        writeFileSync(join(SAIDA, id + '.png'), Buffer.from(r.png.split(',')[1], 'base64'))
        lista.push({ id, vista, espelho, tipo, piscando, i, logo: r.logo, cabeca: r.cabeca })
      }
    }
  }
  console.log('ok', vista, espelho ? '(espelho)' : '')
}
const QUADRO = await pagina.evaluate(() => window.QUADRO)
writeFileSync(join(SAIDA, 'quadros.json'), JSON.stringify({ S, QUADRO, quadros: lista }, null, 1))
await navegador.close()
console.log(lista.length, 'quadros em', SAIDA)
