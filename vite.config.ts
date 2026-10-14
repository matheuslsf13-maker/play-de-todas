import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { ligaDe } from './liga.config'
import { traduzirParaMasculino } from './liga/traduzir'
import { cpSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// Caminhos RELATIVOS de proposito: assim o mesmo build funciona na raiz do
// dominio (playdetodas.com.br) e tambem em subpasta (o endereco antigo do
// GitHub Pages, e o app masculino em /masculino/). Sem isso, a troca de
// endereco quebraria o site enquanto o DNS nao propagasse.
const versao = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')

// qual liga esta sendo compilada: feminino (padrao), masculino ou misto
const liga = ligaDe(process.env.VITE_LIGA)

const manifesto = {
  name: `${liga.nome} — Beach Tennis`,
  short_name: liga.nomeCurto,
  description: liga.descricao,
  start_url: '.',
  scope: '.',
  display: 'standalone',
  orientation: 'portrait',
  background_color: liga.tema,
  theme_color: liga.tema,
  icons: [
    { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}

export default defineConfig({
  base: './',
  plugins: [
    // no masculino, os textos de tela passam para o masculino antes de compilar
    // no misto, os do masculino (o plural neutro) e os do misto por cima
    ...(liga.id === 'masculino' ? [traduzirParaMasculino('liga/masculino.json')] : []),
    ...(liga.id === 'misto' ? [traduzirParaMasculino(['liga/masculino.json', 'liga/misto.json'])] : []),
    react(),
    {
      // nome, cor e manifesto da liga no index.html (que nao passa pelo React)
      name: 'play-liga',
      transformIndexHtml: (html) =>
        html
          .replace(/%LIGA_ID%/g, liga.id)
          .replace(/%LIGA_NOME%/g, liga.nome)
          .replace(/%LIGA_CURTO%/g, liga.nomeCurto)
          .replace(/%LIGA_DESCRICAO%/g, liga.descricao)
          .replace(/%LIGA_TEMA%/g, liga.tema)
          .replace(/%LIGA_MARCA%/g, liga.marca),
      // masculino e misto tem logo e icones proprios (public-<liga>/), que vao
      // por cima dos do public/ depois que o build copia a pasta publica
      writeBundle(opcoes) {
        const pasta = resolve(`public-${liga.id}`)
        if (liga.id !== 'feminino' && existsSync(pasta) && opcoes.dir) cpSync(pasta, opcoes.dir, { recursive: true })
      },
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: JSON.stringify(manifesto, null, 2) })
      },
    },
  ],
  define: { __VERSAO__: JSON.stringify(versao) },
})
