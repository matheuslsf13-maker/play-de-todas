// Roda o medidor da forca (scripts/medir-forca.ts): o esbuild empacota (os
// imports do app nao tem extensao) e o node executa. Argumento opcional: um
// JSON com variantes a mais, [["nome", {confianca: 1.5}], ...].
import { build } from 'esbuild'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

const out = join(mkdtempSync(join(tmpdir(), 'pdt-medir-')), 'medir.mjs')
await build({
  entryPoints: ['scripts/medir-forca.ts'], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'error',
  define: { 'import.meta.env': '{}' },
})
const r = spawnSync(process.execPath, [out, ...process.argv.slice(2)], { stdio: 'inherit' })
process.exit(r.status ?? 1)
