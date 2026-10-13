// Lista os textos de interface (strings e texto de JSX) com marca de feminino.
import ts from 'typescript'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const MARCA = /\b(meninas?|jogadoras?|campe[ãa]s?|vencedoras?|parceiras?|advers[áa]rias?|atletas?|todas|ela|elas|dela|delas|novatas?|duquesas?|rainha|imperatriz|organizadora|inscritas?|confirmadas?|leitoras?|primeiras?|segundas?|terceiras?|últimas?|sozinhas?|obrigadas?|ausentes?|presentes?|outra|outras|cada uma|uma delas|nenhuma|alguma|(?:cadastr|elimin|classific|selecion|convid|escal|sorte|cham|liber|empat|march|marc|mov|pag|reserv|cortad|preench)[a-z]*?a?d?as?|ela [a-z]+)\b/i

function arquivos(d) {
  return readdirSync(d).flatMap((f) => {
    const p = join(d, f)
    return statSync(p).isDirectory() ? arquivos(p) : /\.tsx?$/.test(f) ? [p] : []
  })
}
const vistos = new Map()
for (const f of arquivos('src')) {
  const src = readFileSync(f, 'utf8')
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const visit = (n) => {
    let txt = null
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) txt = n.text
    else if (ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) txt = n.text
    else if (n.kind === ts.SyntaxKind.JsxText) txt = n.getText()
    if (txt !== null && MARCA.test(txt) && !ts.isImportDeclaration(n.parent)) {
      const k = txt
      if (!vistos.has(k)) vistos.set(k, `${f}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`)
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
}
console.log(JSON.stringify(Object.fromEntries([...vistos].map(([k, v]) => [k, v])), null, 1))
