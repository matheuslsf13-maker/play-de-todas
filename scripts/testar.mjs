// Roda os testes de tests/*.test.ts: o esbuild empacota cada um (os imports do
// app nao tem extensao, entao o node sozinho nao resolve) e o node:test executa.
import { build } from 'esbuild'
import { readdirSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

const dir = mkdtempSync(join(tmpdir(), 'pdt-testes-'))
const arquivos = readdirSync('tests').filter((f) => f.endsWith('.test.ts'))
const saidas = []
for (const f of arquivos) {
  const out = join(dir, f.replace(/\.ts$/, '.mjs'))
  await build({ entryPoints: [join('tests', f)], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'error' })
  saidas.push(out)
}
const r = spawnSync(process.execPath, ['--test', ...saidas], { stdio: 'inherit' })
process.exit(r.status ?? 1)
