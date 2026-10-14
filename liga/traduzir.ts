/**
 * Plugin do Vite que troca os textos femininos pelos masculinos, so no build
 * da liga masculina.
 *
 * Funciona por TEXTO EXATO: percorre o codigo com o compilador do TypeScript e
 * so mexe em strings e texto de JSX cujo conteudo esta em `masculino.json`.
 * Nao e um "procurar e trocar" de palavras -- "Todas" sozinho continua "Todas"
 * (quase sempre fala de partidas, categorias ou arenas), e nomes internos
 * (classes, chaves, valores gravados no banco) nunca estao no mapa.
 *
 * Uma chave `Arquivo.tsx::texto` vale so naquele arquivo -- para palavras que
 * tambem sao valor interno em outro lugar (`'jogadora'` e o modo do Stats, mas
 * em Players.tsx e so o `plural(n, 'jogadora')`). Atributos `className`/`key`
 * nunca sao traduzidos: `"pausada"` e tambem uma classe do CSS.
 *
 * Texto novo no app fica no feminino ate entrar no mapa:
 * `node scripts/liga/extrair.mjs` lista os candidatos.
 */
import ts from 'typescript'
import { readFileSync } from 'node:fs'
import type { Plugin } from 'vite'

const junta = (s: string) => s.replace(/\s+/g, ' ').trim()

export function traduzirParaMasculino(mapaPath: string): Plugin {
  const mapa: Record<string, string> = JSON.parse(readFileSync(mapaPath, 'utf8'))
  const usados = new Set<string>()

  let arquivo = ''
  // `exato`: string do codigo, onde "\n" e espaco das pontas importam (o texto do
  // WhatsApp). No texto de JSX as quebras viram espaco de qualquer jeito.
  const trocar = (texto: string, exato = false): string | null => {
    const local = `${arquivo}::${junta(texto)}`
    const chave = local in mapa ? local : junta(texto)
    const novo = mapa[chave]
    if (novo === undefined) return null
    usados.add(chave)
    const inicio = texto.match(/^\s*/)![0]
    const fim = texto.match(/\s*$/)![0]
    if (exato) return inicio + novo + (texto.trim() ? fim : '')
    // espacos das pontas importam ("3 jogadoras " + nome); quebras viram espaco
    return (inicio ? ' ' : '') + novo + (fim && texto.trim() ? ' ' : '')
  }
  // a string e o NOME de algo ({ 'chave': ... }), e nao um valor: nunca troca
  const ehNome = (n: ts.Node) => {
    const p = n.parent as ts.Node & { name?: ts.Node }
    if (!p) return false
    if (p.name === n) return true
    // className="pausada", key="..." -- nome de classe ou chave, nunca texto
    if (ts.isJsxAttribute(p)) return ['className', 'key', 'id', 'htmlFor'].includes(p.name.getText())
    return false
  }
  const crase = (s: string) => s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')

  return {
    name: 'play-liga-masculino',
    enforce: 'pre',
    transform(code, id) {
      if (!/\/src\/.*\.tsx?$/.test(id)) return null
      arquivo = id.split('/').pop() ?? ''
      const sf = ts.createSourceFile(id, code, ts.ScriptTarget.Latest, true,
        id.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
      const trocas: { de: number; ate: number; por: string }[] = []
      const visitar = (n: ts.Node) => {
        if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) return
        let novo: string | null = null
        if (ts.isStringLiteral(n) && !ehNome(n)) {
          novo = trocar(n.text, true)
          if (novo !== null) novo = JSON.stringify(novo)
        } else if (ts.isNoSubstitutionTemplateLiteral(n)) {
          novo = trocar(n.text, true)
          if (novo !== null) novo = '`' + crase(novo) + '`'
        } else if (ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) {
          novo = trocar(n.text, true)
          if (novo !== null) {
            const abre = ts.isTemplateHead(n) ? '`' : '}'
            const fecha = ts.isTemplateTail(n) ? '`' : '${'
            novo = abre + crase(novo) + fecha
          }
        } else if (n.kind === ts.SyntaxKind.JsxText) {
          const t = n.getText(sf)
          if (t.trim()) {
            novo = trocar(t)
            // texto de JSX nao pode ter { } < > soltos
            if (novo !== null) novo = novo.replace(/[{}<>]/g, (c) => `{'${c}'}`)
          }
        }
        if (novo !== null) {
          trocas.push({ de: n.getStart(sf), ate: n.getEnd(), por: novo })
          return
        }
        ts.forEachChild(n, visitar)
      }
      visitar(sf)
      if (!trocas.length) return null
      let out = code
      for (const t of trocas.sort((a, b) => b.de - a.de)) out = out.slice(0, t.de) + t.por + out.slice(t.ate)
      return { code: out, map: null }
    },
    buildEnd() {
      const sobra = Object.keys(mapa).filter((k) => !usados.has(k))
      if (sobra.length) this.warn(`textos do mapa masculino que nao existem mais no app: ${sobra.length}\n  ${sobra.join('\n  ')}`)
    },
  }
}
