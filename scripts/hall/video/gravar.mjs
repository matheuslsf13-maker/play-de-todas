// Grava o video de aprovacao da animacao da menina (palco provisorio).
//   node scripts/hall/video/gravar.mjs saida.mp4
// Precisa do ffmpeg (FFMPEG=... ou no PATH) e do Chrome instalado.
import { build } from 'esbuild'
import puppeteer from 'puppeteer-core'
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'

const saida = resolve(process.argv[2] ?? 'hall-animacao.mp4')
const RAIZ = resolve('.')
const FPS = 30
const L = 1080
const A = 1920
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg'

const tmp = join(tmpdir(), 'pdt-palco')
mkdirSync(tmp, { recursive: true })
await build({ entryPoints: [join(RAIZ, 'scripts', 'hall', 'video', 'palco.ts')], bundle: true, outfile: join(tmp, 'palco.js'), logLevel: 'error' })
writeFileSync(join(tmp, 'palco.html'), '<!doctype html><meta charset="utf-8"><body style="margin:0;background:#000"><script src="palco.js"></script>')

const nav = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--allow-file-access-from-files', '--disable-web-security'] })
const pag = await nav.newPage()
pag.on('pageerror', (e) => console.log('ERRO:', e.message))
await pag.goto(pathToFileURL(join(tmp, 'palco.html')).href)
const base = pathToFileURL(join(RAIZ, 'public', 'hall', 'menina')).href
const total = await pag.evaluate((b, l, a, f) => window.preparar(b, l, a, f), base, L, A, FPS)
console.log(total, 'quadros', (total / FPS).toFixed(1), 's')

const ff = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', saida], { stdio: ['pipe', 'inherit', 'inherit'] })
for (let i = 0; i < total; i++) {
  const url = await pag.evaluate((k) => window.quadro(k), i)
  const buf = Buffer.from(url.split(',')[1], 'base64')
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r))
}
ff.stdin.end()
await new Promise((r) => ff.on('close', r))
await nav.close()
console.log('pronto:', saida)
