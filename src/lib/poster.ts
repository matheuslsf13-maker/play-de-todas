/**
 * Gera a imagem de fechamento do mes (1080x1350, formato de post/status)
 * com o podio, as fotos das tres primeiras e a coroa na campea.
 */

export type PosterRow = {
  name: string
  points: number
  wins: number
  losses: number
  photo: string | null
  streak: number
  /** Titulo do status usado no fechamento (so aparece para a campea). */
  statusTitle?: string
  statusEmoji?: string
  /** Pontos que vieram do status. */
  statusPoints?: number
}

const W = 1080
const H = 1350
// mesma paleta do app: a noite na areia, com o por do sol do logo
const NAVY = '#0e1230'
const PINK = '#ff5c8a'
const CREAM = '#fff6ee'
const GOLD = '#ffc940'
const SILVER = '#cdd3e6'
const BRONZE = '#f0a86e'

/** Um bloco do podio na arte do dia: um grupo, ou uma dupla medalhista. */
export type PosterGrupo = {
  /** "Grupo 1", "Grupo 2", "Campeas"... */
  titulo: string
  /** As tres primeiras do grupo -- ou as duas da dupla. */
  rows: PosterRow[]
  /**
   * O bloco INTEIRO e de uma medalha so (0 ouro, 1 prata, 2 bronze).
   *
   * E o caso da dupla: as duas ganharam a mesma coisa, entao numerar 1o e 2o
   * dentro do bloco diria que uma foi melhor que a outra.
   */
  medalha?: number
}

/**
 * Arte do fechamento do dia: podio do play e o resto da classificacao.
 *
 * `chapeu` troca a linha de cima ("RANKING DO DIA") -- e por onde a arte de um
 * grupo so diz de qual grupo ela e.
 */
export async function buildDayPoster(
  data: string,
  rows: PosterRow[],
  logoUrl?: string,
  chapeu = 'RANKING DO DIA',
): Promise<Blob> {
  return desenhar(data, chapeu, rows, logoUrl)
}

/**
 * Arte do dia quando o play foi em grupos: um podio por grupo.
 *
 * O podio grande com os degraus so cabe uma vez em 1080x1350. Com dois ou tres
 * grupos ele vira um bloco compacto por grupo -- foto, medalha, nome e pontos --
 * que cabe empilhado e continua legivel no celular.
 */
export async function buildDayPosterGrupos(
  data: string,
  grupos: PosterGrupo[],
  logoUrl?: string,
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const c = canvas.getContext('2d')
  if (!c) throw new Error('Este navegador não conseguiu gerar a imagem.')

  const fotos = await Promise.all(
    grupos.map((g) => Promise.all(g.rows.map((r) => loadImage(r.photo)))),
  )
  const logo = await loadImage(logoUrl ?? null)

  fundo(c)
  cabecalho(c, data, 'RANKING DO DIA', logo)

  const topo = 400
  const sobra = H - topo - 110 // 110 = espaco do rodape
  const respiro = 26 // um pouco de ar entre um grupo e o outro
  const n = Math.max(1, grupos.length)
  const alturaGrupo = Math.min(330, (sobra - respiro * (n - 1)) / n)
  // com dois grupos os blocos nao enchem a arte: centraliza, senao fica um
  // buraco grande entre o ultimo grupo e o rodape
  const y0 = topo + Math.max(0, (sobra - (alturaGrupo * n + respiro * (n - 1))) / 2)
  grupos.forEach((g, i) =>
    blocoDeGrupo(c, g, fotos[i], y0 + i * (alturaGrupo + respiro), alturaGrupo),
  )

  rodape(c)
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Falha ao gerar a imagem'))), 'image/png'),
  )
}

/** Um grupo: faixa com o nome e as tres primeiras em linhas com foto. */
function blocoDeGrupo(
  c: CanvasRenderingContext2D,
  grupo: PosterGrupo,
  fotos: (HTMLImageElement | null)[],
  y: number,
  altura: number,
) {
  const cores = [GOLD, SILVER, BRONZE]
  const rotulos = ['1º', '2º', '3º']

  c.textAlign = 'left'
  c.font = '800 28px system-ui, Segoe UI, Arial, sans-serif'
  c.letterSpacing = '2px'
  const rotulo = grupo.titulo.toUpperCase()
  // a faixa acompanha o texto: "GRUPO 1" cabe em 250, "CAMPEAS DO DIA" nao
  const largura = Math.max(250, c.measureText(rotulo).width + 44)
  c.fillStyle = PINK
  faixa(c, 84, y, largura, 46, 23)
  c.fillStyle = '#fff'
  c.fillText(rotulo, 106, y + 32)
  c.letterSpacing = '0px'

  const linhas = grupo.rows
  const alturaLinha = Math.min(80, (altura - 66) / Math.max(1, linhas.length))
  // as vitorias so entram quando a linha e alta o bastante para duas linhas de
  // texto; com muitos grupos a linha encolhe e fica so nome e pontos
  const cabeDetalhe = alturaLinha >= 62

  linhas.forEach((r, i) => {
    // no bloco de uma medalha so, as duas linhas usam a MESMA cor e o mesmo
    // rotulo: dentro da dupla nao ha primeira nem segunda
    const posicao = grupo.medalha ?? i
    const cor = cores[posicao] ?? BRONZE
    const ly = y + 62 + i * alturaLinha
    const meio = ly + alturaLinha / 2 - 4
    c.fillStyle = posicao === 0 ? 'rgba(255,201,64,.14)' : 'rgba(255,255,255,.07)'
    faixa(c, 84, ly, W - 168, alturaLinha - 8, 18)

    const raio = Math.min(28, (alturaLinha - 24) / 2)
    retrato(c, fotos[i] ?? null, r.name, 140, meio, raio, cor)

    c.textAlign = 'left'
    c.fillStyle = cor
    c.font = '800 30px system-ui, Segoe UI, Arial, sans-serif'
    c.fillText(rotulos[posicao] ?? `${posicao + 1}º`, 192, meio + 10)

    c.fillStyle = '#fff'
    c.font = '700 32px system-ui, Segoe UI, Arial, sans-serif'
    c.fillText(cortar(c, r.name, 480), 250, cabeDetalhe ? meio - 1 : meio + 10)

    if (cabeDetalhe) {
      c.font = '700 21px system-ui, Segoe UI, Arial, sans-serif'
      const recorde = `${r.wins}V · ${r.losses}D`
      c.fillStyle = 'rgba(255,255,255,.55)'
      c.fillText(recorde, 250, meio + 23)
      if (r.statusTitle) {
        // o status de cada uma do podio, logo depois do retrospecto
        const x = 250 + c.measureText(recorde + '  ').width
        c.fillStyle = '#ffb877'
        c.fillText(`${r.statusEmoji ?? '🔥'} ${r.statusTitle}`, x, meio + 23)
      }
    }

    c.textAlign = 'right'
    c.fillStyle = GOLD
    c.font = '800 31px system-ui, Segoe UI, Arial, sans-serif'
    c.fillText(`${r.points} pts`, W - 112, meio + 10)
    c.textAlign = 'left'
  })
}

/** Arte do fechamento do mes. */
export async function buildMonthPoster(
  mes: string,
  rows: PosterRow[],
  logoUrl?: string,
): Promise<Blob> {
  return desenhar(`RANKING DE ${mes}`, null, rows, logoUrl)
}

async function desenhar(
  faixaTexto: string,
  chapeu: string | null,
  rows: PosterRow[],
  logoUrl?: string,
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const c = canvas.getContext('2d')
  if (!c) throw new Error('Este navegador não conseguiu gerar a imagem.')

  const [fotos, logo] = await Promise.all([
    Promise.all(rows.slice(0, 3).map((r) => loadImage(r.photo))),
    loadImage(logoUrl ?? null),
  ])

  fundo(c)
  cabecalho(c, faixaTexto, chapeu, logo)
  // o podio devolve onde as faixas de status terminaram, para o resto da
  // classificacao comecar abaixo delas em vez de passar por cima
  const fimDoPodio = podio(c, rows, fotos)
  demais(c, rows, fimDoPodio)
  rodape(c)

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Falha ao gerar a imagem'))), 'image/png'),
  )
}

/* ----------------------------------------------------------- partes */

function fundo(c: CanvasRenderingContext2D) {
  const g = c.createLinearGradient(0, 0, W, H)
  g.addColorStop(0, NAVY)
  g.addColorStop(0.55, '#2a2064')
  g.addColorStop(1, '#4a2260')
  c.fillStyle = g
  c.fillRect(0, 0, W, H)

  // bolinhas decorativas, bem discretas
  c.save()
  c.globalAlpha = 0.07
  for (const [x, y, r, cor] of [
    [80, 210, 150, PINK], [1000, 120, 110, GOLD], [980, 900, 190, PINK], [60, 1080, 130, GOLD],
  ] as [number, number, number, string][]) {
    c.fillStyle = cor
    c.beginPath()
    c.arc(x, y, r, 0, Math.PI * 2)
    c.fill()
  }
  c.restore()
}

function cabecalho(
  c: CanvasRenderingContext2D,
  faixaTexto: string,
  chapeu: string | null,
  logo: HTMLImageElement | null,
) {
  c.textAlign = 'center'

  const escreverFaixa = (y: number) => {
    c.font = '800 38px system-ui, Segoe UI, Arial, sans-serif'
    c.letterSpacing = '2px'
    const larg = Math.min(W - 90, c.measureText(faixaTexto.toUpperCase()).width + 90)
    c.fillStyle = PINK
    faixa(c, W / 2 - larg / 2, y, larg, 76, 38)
    c.fillStyle = '#fff'
    c.fillText(faixaTexto.toUpperCase(), W / 2, y + 51)
    c.letterSpacing = '0px'
    if (chapeu) {
      c.font = '800 26px system-ui, Segoe UI, Arial, sans-serif'
      c.fillStyle = 'rgba(255,255,255,.6)'
      c.letterSpacing = '5px'
      c.fillText(chapeu.toUpperCase(), W / 2, y - 16)
      c.letterSpacing = '0px'
    }
  }

  if (logo) {
    // com o logo, ele fala por si: o nome do camp sai do texto
    // 232 e o teto: acima disso a faixa desce e a coroa do 1o lugar bate nela
    const lado = 232
    c.drawImage(logo, W / 2 - lado / 2, 10, lado, lado)
    escreverFaixa(chapeu ? 280 : 258)
    return
  }

  c.font = '800 30px system-ui, Segoe UI, Arial, sans-serif'
  c.fillStyle = 'rgba(255,255,255,.55)'
  c.letterSpacing = '6px'
  c.fillText('V3 ARENA · BEACH TENNIS', W / 2, 92)
  c.letterSpacing = '0px'

  c.font = '900 66px system-ui, Segoe UI, Arial, sans-serif'
  const a = 'PLAY '
  const b = 'DE TODAS'
  const inicio = (W - c.measureText(a).width - c.measureText(b).width) / 2
  c.textAlign = 'left'
  c.fillStyle = '#fff'
  c.fillText(a, inicio, 168)
  c.fillStyle = PINK
  c.fillText(b, inicio + c.measureText(a).width, 168)
  c.textAlign = 'center'

  // faixa do mes
  escreverFaixa(208)
}

function podio(
  c: CanvasRenderingContext2D,
  rows: PosterRow[],
  fotos: (HTMLImageElement | null)[],
): number {
  const bases = [
    { i: 1, x: 175, alturaBarra: 195, raio: 84, cor: SILVER, rotulo: '2º' },
    { i: 0, x: W / 2, alturaBarra: 250, raio: 104, cor: GOLD, rotulo: '1º' },
    { i: 2, x: 905, alturaBarra: 168, raio: 84, cor: BRONZE, rotulo: '3º' },
  ]
  const chao = 980

  for (const b of bases) {
    const r = rows[b.i]
    if (!r) continue
    const topoBarra = chao - b.alturaBarra
    const cy = topoBarra - b.raio - 78 // espaco para o nome entre a foto e a barra

    if (b.i === 0) {
      if (r.statusTitle) chamas(c, b.x, cy, b.raio) // usou o status: pega fogo
      coroa(c, b.x, cy - b.raio - 50, 112)
    }
    retrato(c, fotos[b.i], r.name, b.x, cy, b.raio, b.cor)

    // nome
    c.textAlign = 'center'
    c.fillStyle = '#fff'
    c.font = `800 ${b.i === 0 ? 40 : 34}px system-ui, Segoe UI, Arial, sans-serif`
    c.fillText(cortar(c, r.name, 270), b.x, topoBarra - 26)

    // barra do podio
    const larguraBarra = b.i === 0 ? 300 : 250
    const g = c.createLinearGradient(0, topoBarra, 0, chao)
    g.addColorStop(0, b.cor)
    g.addColorStop(1, escurecer(b.cor))
    c.fillStyle = g
    faixa(c, b.x - larguraBarra / 2, topoBarra, larguraBarra, b.alturaBarra + 4, 22, true)

    c.fillStyle = '#3a2a05'
    c.font = '900 62px system-ui, Segoe UI, Arial, sans-serif'
    c.fillText(b.rotulo, b.x, topoBarra + 70)
    c.font = '800 40px system-ui, Segoe UI, Arial, sans-serif'
    c.fillText(`${r.points} pts`, b.x, topoBarra + 122)
    c.font = '700 26px system-ui, Segoe UI, Arial, sans-serif'
    c.fillStyle = 'rgba(0,0,0,.55)'
    c.fillText(`${r.wins}V · ${r.losses}D`, b.x, topoBarra + 164)
  }

  return faixasDeStatus(c, rows, chao)
}

/**
 * Os status de quem subiu ao podio, sob os degraus.
 *
 * A campea leva a faixa grande com gradiente; a 2a e a 3a, quando tambem estao
 * em chamas, ganham pastilhas menores lado a lado. Devolve o y onde o bloco
 * termina, porque o resto da classificacao e desenhado logo abaixo.
 */
function faixasDeStatus(c: CanvasRenderingContext2D, rows: PosterRow[], chao: number): number {
  const medalhistas = rows.slice(0, 3)
  const comStatus = medalhistas.filter((r) => Boolean(r.statusTitle))
  if (comStatus.length === 0) return chao
  const y = chao + 18
  c.textAlign = 'center'

  // so a campea em chamas: a faixa grande de sempre (e a do fechamento do mes,
  // que mostra quantos pontos o status valeu)
  if (comStatus.length === 1 && rows[0]?.statusTitle) {
    const r = rows[0]
    const texto =
      `${r.statusEmoji ?? '🔥'} ${(r.statusTitle as string).toUpperCase()}` +
      (r.statusPoints ? `  ·  +${r.statusPoints} PTS` : '')
    c.font = '900 34px system-ui, Segoe UI, Arial, sans-serif'
    const larg = Math.min(W - 120, c.measureText(texto).width + 120)
    const g = c.createLinearGradient(W / 2 - larg / 2, 0, W / 2 + larg / 2, 0)
    g.addColorStop(0, '#ff7a18')
    g.addColorStop(0.5, PINK)
    g.addColorStop(1, '#9b2fae')
    c.fillStyle = g
    faixa(c, W / 2 - larg / 2, y, larg, 62, 31)
    c.fillStyle = '#fff'
    c.fillText(texto, W / 2, y + 43)
    return y + 74
  }

  // cada uma em chamas ganha a pastilha DEBAIXO DO PROPRIO DEGRAU. Uma fileira
  // unica na ordem 1a-2a-3a ficava desencontrada com o podio, que e 2a-1a-3a:
  // o nome da campea saia debaixo da vice e vice-versa
  const degraus = [
    { i: 0, x: W / 2, largura: 300 },
    { i: 1, x: 175, largura: 250 },
    { i: 2, x: 905, largura: 250 },
  ]
  for (const d of degraus) {
    const r = rows[d.i]
    if (!r?.statusTitle) continue
    const texto = `${r.statusEmoji ?? '🔥'} ${r.statusTitle}`
    let tam = d.i === 0 ? 27 : 24
    c.font = `800 ${tam}px system-ui, Segoe UI, Arial, sans-serif`
    while (c.measureText(texto).width > d.largura - 28 && tam > 15) {
      c.font = `800 ${--tam}px system-ui, Segoe UI, Arial, sans-serif`
    }
    const larg = Math.min(d.largura, c.measureText(texto).width + 36)
    if (d.i === 0) {
      const g = c.createLinearGradient(d.x - larg / 2, 0, d.x + larg / 2, 0)
      g.addColorStop(0, '#ff7a18')
      g.addColorStop(0.5, PINK)
      g.addColorStop(1, '#9b2fae')
      c.fillStyle = g
    } else {
      c.fillStyle = 'rgba(255,124,26,.22)'
    }
    faixa(c, d.x - larg / 2, y, larg, 52, 26)
    c.fillStyle = d.i === 0 ? '#fff' : '#ffd9a8'
    c.fillText(texto, d.x, y + 34)
  }
  return y + 64
}

/**
 * Labaredas atras da foto da campea. Fogo sobe: nada embaixo, linguas longas e
 * pontudas em cima, e uma camada interna mais clara para dar profundidade.
 */
function chamas(c: CanvasRenderingContext2D, cx: number, cy: number, raio: number) {
  const irregular = [1, 0.62, 0.86, 0.5, 1.18, 0.7, 0.95, 0.55, 1.08, 0.75]
  c.save()
  for (const camada of [
    { n: 20, mult: 1, cor0: '#ffe36e', cor1: '#ff6a1f', op: 1 },
    { n: 14, mult: 0.55, cor0: '#fffbe6', cor1: '#ffb020', op: 0.9 },
  ]) {
    c.globalAlpha = camada.op
    for (let i = 0; i < camada.n; i++) {
      const ang = (Math.PI * 2 * i) / camada.n - Math.PI / 2
      const paraCima = (1 - Math.sin(ang)) / 2 // 1 no topo, 0 na base
      if (paraCima < 0.3) continue // fogo nao desce
      const alt = raio * (paraCima ** 1.6) * 1.25 * camada.mult * irregular[i % irregular.length]
      if (alt < raio * 0.1) continue
      const larg = raio * 0.115 * (0.7 + paraCima * 0.6)
      const tombo = (i % 2 === 0 ? 1 : -1) * alt * 0.28 // a ponta tomba para um lado

      const bx = cx + Math.cos(ang) * (raio - 2)
      const by = cy + Math.sin(ang) * (raio - 2)
      const nx = -Math.sin(ang) * larg
      const ny = Math.cos(ang) * larg
      const px = cx + Math.cos(ang) * (raio + alt) - Math.sin(ang) * tombo
      const py = cy + Math.sin(ang) * (raio + alt) + Math.cos(ang) * tombo

      const g = c.createLinearGradient(bx, by, px, py)
      g.addColorStop(0, camada.cor0)
      g.addColorStop(0.6, camada.cor1)
      g.addColorStop(1, 'rgba(239,75,125,0)')
      c.fillStyle = g
      c.beginPath()
      c.moveTo(bx + nx, by + ny)
      // barriga larga perto da base e ponta fina, como lingua de fogo
      c.bezierCurveTo(bx + nx * 1.9, by + ny * 1.9, px + nx * 0.5, py + ny * 0.5, px, py)
      c.bezierCurveTo(px - nx * 0.5, py - ny * 0.5, bx - nx * 1.9, by - ny * 1.9, bx - nx, by - ny)
      c.closePath()
      c.fill()
    }
  }
  c.restore()
}

function demais(c: CanvasRenderingContext2D, rows: PosterRow[], apartirDe: number) {
  // a primeira linha comeca 50 abaixo do fim das faixas de status e cada uma
  // ocupa 54; H-94 e o limite para nao encostar no rodape
  let y = apartirDe + 50
  const cabem = Math.max(0, Math.floor((H - 94 - y) / 54) + 1)
  const resto = rows.slice(3, 3 + Math.min(5, cabem))
  if (resto.length === 0) return
  c.textAlign = 'left'
  resto.forEach((r, i) => {
    c.fillStyle = 'rgba(255,255,255,.08)'
    faixa(c, 110, y - 30, W - 220, 44, 14)
    c.fillStyle = 'rgba(255,255,255,.5)'
    c.font = '800 26px system-ui, Segoe UI, Arial, sans-serif'
    c.fillText(`${i + 4}º`, 132, y)
    c.fillStyle = '#fff'
    c.font = '700 27px system-ui, Segoe UI, Arial, sans-serif'
    c.fillText(cortar(c, r.name, 560), 196, y)
    c.textAlign = 'right'
    c.fillStyle = GOLD
    c.font = '800 27px system-ui, Segoe UI, Arial, sans-serif'
    c.fillText(`${r.points} pts`, W - 132, y)
    c.textAlign = 'left'
    y += 54
  })
}

function rodape(c: CanvasRenderingContext2D) {
  c.textAlign = 'center'
  c.fillStyle = 'rgba(255,255,255,.75)'
  c.font = 'italic 700 34px system-ui, Segoe UI, Arial, sans-serif'
  c.fillText('Mais que um play, uma experiência!', W / 2, H - 42)
}

/* ---------------------------------------------------------- desenho */

/** Coroa dourada, desenhada em vetor para nao depender de fonte de emoji. */
function coroa(c: CanvasRenderingContext2D, cx: number, cy: number, largura: number) {
  const h = largura * 0.62
  const x = cx - largura / 2
  const y = cy - h / 2
  c.save()
  // sombra escura para a coroa nao sumir quando ha chamas atras
  c.shadowColor = 'rgba(20,10,40,.55)'
  c.shadowBlur = 14
  c.fillStyle = GOLD
  c.strokeStyle = '#8a5b00'
  c.lineWidth = 4
  c.beginPath()
  c.moveTo(x, y + h)
  c.lineTo(x, y + h * 0.28)
  c.lineTo(x + largura * 0.25, y + h * 0.66)
  c.lineTo(x + largura * 0.5, y)
  c.lineTo(x + largura * 0.75, y + h * 0.66)
  c.lineTo(x + largura, y + h * 0.28)
  c.lineTo(x + largura, y + h)
  c.closePath()
  c.fill()
  c.stroke()
  // pedrinhas
  c.fillStyle = '#fff6d0'
  for (const px of [0.16, 0.5, 0.84]) {
    c.beginPath()
    c.arc(x + largura * px, y + h * 0.78, largura * 0.045, 0, Math.PI * 2)
    c.fill()
  }
  c.restore()
}

function retrato(
  c: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  nome: string,
  cx: number,
  cy: number,
  raio: number,
  cor: string,
) {
  c.save()
  c.beginPath()
  c.arc(cx, cy, raio, 0, Math.PI * 2)
  c.closePath()
  c.clip()
  if (img) {
    const lado = Math.min(img.width, img.height)
    c.drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, cx - raio, cy - raio, raio * 2, raio * 2)
  } else {
    const g = c.createLinearGradient(cx - raio, cy - raio, cx + raio, cy + raio)
    g.addColorStop(0, '#6d3fa0')
    g.addColorStop(1, PINK)
    c.fillStyle = g
    c.fillRect(cx - raio, cy - raio, raio * 2, raio * 2)
    c.fillStyle = '#fff'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.font = `800 ${Math.round(raio * 0.8)}px system-ui, Segoe UI, Arial, sans-serif`
    c.fillText(iniciais(nome), cx, cy + 2)
    c.textBaseline = 'alphabetic'
  }
  c.restore()

  c.beginPath()
  c.arc(cx, cy, raio + 6, 0, Math.PI * 2)
  c.strokeStyle = cor
  c.lineWidth = 9
  c.stroke()
}

function faixa(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  soTopo = false,
) {
  const rb = soTopo ? 0 : r
  c.beginPath()
  c.moveTo(x + r, y)
  c.lineTo(x + w - r, y)
  c.quadraticCurveTo(x + w, y, x + w, y + r)
  c.lineTo(x + w, y + h - rb)
  c.quadraticCurveTo(x + w, y + h, x + w - rb, y + h)
  c.lineTo(x + rb, y + h)
  c.quadraticCurveTo(x, y + h, x, y + h - rb)
  c.lineTo(x, y + r)
  c.quadraticCurveTo(x, y, x + r, y)
  c.closePath()
  c.fill()
}

/* ------------------------------------------------------------ apoio */

function loadImage(url: string | null): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null)
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous' // sem isso a imagem "suja" o canvas
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null) // sem foto, entra a inicial
    img.src = url
  })
}

function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/)
  if (p.length === 0) return '?'
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase()
  return (p[0][0] + p[p.length - 1][0]).toUpperCase()
}

function cortar(c: CanvasRenderingContext2D, texto: string, max: number): string {
  if (c.measureText(texto).width <= max) return texto
  let t = texto
  while (t.length > 2 && c.measureText(t + '…').width > max) t = t.slice(0, -1)
  return t + '…'
}

function escurecer(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  const f = 0.72
  const r = Math.round(((n >> 16) & 255) * f)
  const g = Math.round(((n >> 8) & 255) * f)
  const b = Math.round((n & 255) * f)
  return `rgb(${r},${g},${b})`
}

export const POSTER_BG = CREAM
