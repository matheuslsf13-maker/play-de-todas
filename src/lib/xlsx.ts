/**
 * ESCRITOR MINIMO DE .XLSX, SEM DEPENDENCIA
 *
 * Um .xlsx e um zip com meia duzia de XMLs. Aqui vai so o que o Excel e o
 * Google Sheets precisam para abrir: as entradas do zip sem compressao
 * ("stored"), texto como `inlineStr` (sem tabela de strings compartilhadas)
 * e numeros como numeros, para a planilha somar. Uma biblioteca de xlsx
 * pesa mais do que o app inteiro; isto aqui sao 150 linhas.
 */

/** Uma celula: texto, numero, vazio, ou um valor em reais (formato de moeda). */
export type Celula = string | number | null | undefined | { reais: number }

export type Planilha = {
  /** Ate 31 caracteres, sem [ ] : * ? / \ (regra do Excel). */
  nome: string
  /** A primeira linha e o cabecalho e sai em negrito. */
  linhas: Celula[][]
}

/* ------------------------------------------------------------------- xml */

function escapar(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** 0 -> A, 25 -> Z, 26 -> AA. */
function letraDaColuna(i: number): string {
  let s = ''
  let n = i
  do {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return s
}

function nomeDaAba(nome: string): string {
  return nome.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Planilha'
}

function xmlDaPlanilha(p: Planilha): string {
  const larguras: number[] = []
  const linhas = p.linhas.map((linha, r) => {
    const celulas = linha.map((c, i) => {
      if (c === null || c === undefined || c === '') return ''
      const ref = `${letraDaColuna(i)}${r + 1}`
      let texto: string
      let xml: string
      if (typeof c === 'number') {
        texto = String(c)
        xml = `<c r="${ref}"${r === 0 ? ' s="1"' : ''}><v>${c}</v></c>`
      } else if (typeof c === 'object') {
        texto = c.reais.toFixed(2)
        xml = `<c r="${ref}" s="2"><v>${c.reais}</v></c>`
      } else {
        texto = c
        xml = `<c r="${ref}" t="inlineStr"${r === 0 ? ' s="1"' : ''}><is><t xml:space="preserve">${escapar(c)}</t></is></c>`
      }
      larguras[i] = Math.max(larguras[i] ?? 0, texto.length)
      return xml
    })
    return `<row r="${r + 1}">${celulas.join('')}</row>`
  })
  const cols = larguras
    .map((l, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.min(48, Math.max(8, l + 2))}" customWidth="1"/>`)
    .join('')
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    (cols ? `<cols>${cols}</cols>` : '') +
    `<sheetData>${linhas.join('')}</sheetData>` +
    '</worksheet>'
  )
}

/** Cabecalho em negrito (s=1) e reais com duas casas (s=2). */
const ESTILOS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;R$&quot;\\ #,##0.00"/></numFmts>' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="3">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>'

function arquivosDoPacote(planilhas: Planilha[]): { nome: string; conteudo: string }[] {
  const abas = planilhas.map((p, i) => ({ id: i + 1, nome: nomeDaAba(p.nome), xml: xmlDaPlanilha(p) }))
  return [
    {
      nome: '[Content_Types].xml',
      conteudo:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        abas
          .map(
            (a) =>
              `<Override PartName="/xl/worksheets/sheet${a.id}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
          )
          .join('') +
        '</Types>',
    },
    {
      nome: '_rels/.rels',
      conteudo:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>',
    },
    {
      nome: 'xl/workbook.xml',
      conteudo:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<sheets>' +
        abas.map((a) => `<sheet name="${escapar(a.nome)}" sheetId="${a.id}" r:id="rId${a.id}"/>`).join('') +
        '</sheets></workbook>',
    },
    {
      nome: 'xl/_rels/workbook.xml.rels',
      conteudo:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        abas
          .map(
            (a) =>
              `<Relationship Id="rId${a.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${a.id}.xml"/>`,
          )
          .join('') +
        `<Relationship Id="rId${abas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        '</Relationships>',
    },
    { nome: 'xl/styles.xml', conteudo: ESTILOS },
    ...abas.map((a) => ({ nome: `xl/worksheets/sheet${a.id}.xml`, conteudo: a.xml })),
  ]
}

/* ------------------------------------------------------------------- zip */

const TABELA_CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = TABELA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** Hora e data no formato do MS-DOS, que e o que o zip guarda. */
function dataDoZip(d: Date): { hora: number; data: number } {
  return {
    hora: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    data: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  }
}

/** Zip sem compressao: cada arquivo entra como esta, com o CRC e os tamanhos. */
function zipar(arquivos: { nome: string; conteudo: string }[]): Blob {
  const enc = new TextEncoder()
  const { hora, data } = dataDoZip(new Date())
  const partes: Uint8Array[] = []
  const centrais: Uint8Array[] = []
  let offset = 0

  const u16 = (v: DataView, pos: number, n: number) => v.setUint16(pos, n, true)
  const u32 = (v: DataView, pos: number, n: number) => v.setUint32(pos, n, true)

  for (const a of arquivos) {
    const nome = enc.encode(a.nome)
    const dados = enc.encode(a.conteudo)
    const crc = crc32(dados)

    const local = new Uint8Array(30 + nome.length)
    const lv = new DataView(local.buffer)
    u32(lv, 0, 0x04034b50)
    u16(lv, 4, 20) // versao necessaria
    u16(lv, 6, 0x0800) // nomes em UTF-8
    u16(lv, 8, 0) // stored
    u16(lv, 10, hora)
    u16(lv, 12, data)
    u32(lv, 14, crc)
    u32(lv, 18, dados.length)
    u32(lv, 22, dados.length)
    u16(lv, 26, nome.length)
    u16(lv, 28, 0)
    local.set(nome, 30)

    const central = new Uint8Array(46 + nome.length)
    const cv = new DataView(central.buffer)
    u32(cv, 0, 0x02014b50)
    u16(cv, 4, 20)
    u16(cv, 6, 20)
    u16(cv, 8, 0x0800)
    u16(cv, 10, 0)
    u16(cv, 12, hora)
    u16(cv, 14, data)
    u32(cv, 16, crc)
    u32(cv, 20, dados.length)
    u32(cv, 24, dados.length)
    u16(cv, 28, nome.length)
    u16(cv, 30, 0)
    u16(cv, 32, 0)
    u16(cv, 34, 0)
    u16(cv, 36, 0)
    u32(cv, 38, 0)
    u32(cv, 42, offset)
    central.set(nome, 46)

    partes.push(local, dados)
    centrais.push(central)
    offset += local.length + dados.length
  }

  const tamanhoCentral = centrais.reduce((t, c) => t + c.length, 0)
  const fim = new Uint8Array(22)
  const fv = new DataView(fim.buffer)
  u32(fv, 0, 0x06054b50)
  u16(fv, 4, 0)
  u16(fv, 6, 0)
  u16(fv, 8, arquivos.length)
  u16(fv, 10, arquivos.length)
  u32(fv, 12, tamanhoCentral)
  u32(fv, 16, offset)
  u16(fv, 20, 0)

  // um buffer so: o TypeScript novo nao aceita Uint8Array<ArrayBufferLike> como BlobPart
  const total = offset + tamanhoCentral + fim.length
  const tudo = new Uint8Array(new ArrayBuffer(total))
  let pos = 0
  for (const p of [...partes, ...centrais, fim]) {
    tudo.set(p, pos)
    pos += p.length
  }
  return new Blob([tudo], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

/** O arquivo .xlsx pronto para baixar ou compartilhar. */
export function gerarXlsx(planilhas: Planilha[]): Blob {
  return zipar(arquivosDoPacote(planilhas))
}
