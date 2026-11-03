import type { Player } from './types'

/**
 * Importacao da lista de confirmacao do grupo.
 *
 * A lista chega numerada e com a grafia que cada uma digitou:
 *   1- Ingryd     10 - Mariana Valério     8-Figueiredo
 * Aqui ela vira nomes limpos e cada nome e casado com a base de jogadoras,
 * tolerando acento, caixa, apelido e pequenos erros de digitacao.
 */

/**
 * Emoji, bandeirinha, coracao, raquete, joinha -- e os modificadores que vem
 * colados neles (tom de pele, seletor de variacao, o zero-width joiner que
 * gruda dois emoji num so).
 *
 * A classe `So` pega tambem os simbolos que nao sao emoji mas aparecem como
 * marcador na lista do grupo (check, quadradinho, estrela).
 */
const ICONES =
  /[\p{Extended_Pictographic}\p{So}\p{Cf}\uFE0F\u200D\u20E3\u{1F3FB}-\u{1F3FF}]/gu

/** Tira icone, numeracao, marcadores e espacos sobrando de cada linha. */
export function parseRoster(texto: string): string[] {
  const vistos = new Set<string>()
  const nomes: string[] = []
  for (const linha of texto.split(/\r?\n/)) {
    const limpo = linha
      // os icones saem PRIMEIRO: num "OK 3 - Bia" e o emoji que esconde a
      // numeracao do regex de baixo
      .replace(ICONES, ' ')
      .replace(/^\s*\d+\s*[-–—.)\]]?\s*/, '') // "12 - ", "8-", "3."
      .replace(/^[\s*•‣·>-]+/, '')
      .replace(/[\s.–—-]+$/, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
    if (!limpo) continue
    if (limpo.length > 60) continue // linha de recado, nao nome
    const chave = normalizar(limpo)
    if (!chave || vistos.has(chave)) continue
    vistos.add(chave)
    nomes.push(limpo)
  }
  return nomes
}

/** Minusculas, sem acento e sem pontuacao, para comparar nomes. */
export function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Distancia de edicao, para aceitar "Ingrid" quando a base tem "Ingryd". */
function distancia(a: string, b: string): number {
  if (a === b) return 0
  const m = a.length
  const n = b.length
  if (m === 0 || n === 0) return Math.max(m, n)
  let ant = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 1; i <= m; i++) {
    const atual = [i]
    for (let j = 1; j <= n; j++) {
      atual[j] = Math.min(
        ant[j] + 1,
        atual[j - 1] + 1,
        ant[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    ant = atual
  }
  return ant[n]
}

/** 0 a 1: o quanto dois nomes se parecem. */
export function semelhanca(a: string, b: string): number {
  const x = normalizar(a)
  const y = normalizar(b)
  if (!x || !y) return 0
  if (x === y) return 1

  // primeiro nome igual ja e um indicio forte ("Gabi" x "Gabi Martins")
  const px = x.split(' ')[0]
  const py = y.split(' ')[0]
  if (px === py) return x.startsWith(y) || y.startsWith(x) ? 0.95 : 0.88

  // apelido por encurtamento, comum no grupo: Carol/Carolina, Manu/Manuela
  const curto = px.length < py.length ? px : py
  const longo = px.length < py.length ? py : px
  if (curto.length >= 3 && longo.startsWith(curto)) return 0.86

  // um nome contido no outro ("Figueiredo" x "Ana Figueiredo")
  if (x.split(' ').includes(y) || y.split(' ').includes(x)) return 0.85

  const d = distancia(x, y)
  const base = Math.max(x.length, y.length)
  const parecido = 1 - d / base
  // erro de digitacao no primeiro nome conta mais que no sobrenome
  const dPrimeiro = 1 - distancia(px, py) / Math.max(px.length, py.length)
  return Math.max(parecido, dPrimeiro * 0.9)
}

export type Sugestao = { player: Player; score: number }

export type ItemDaLista = {
  /** Nome exatamente como veio na lista. */
  texto: string
  /** Jogadora escolhida (existente) ou null para criar nova. */
  vincularA: string | null
  /** Palpites da base, do mais provavel para o menos. */
  sugestoes: Sugestao[]
  /** Como o app resolveu sozinho, antes de qualquer ajuste da organizadora. */
  origem: 'exata' | 'apelido' | 'parecida' | 'nova'
}

const CERTEZA = 0.93 // acima disso o app vincula sozinho
const DUVIDA = 0.62 // abaixo disso nem sugere

/** Casa cada nome da lista com a base de jogadoras. */
export function conciliar(nomes: string[], players: Player[]): ItemDaLista[] {
  const usados = new Set<string>()
  const itens: ItemDaLista[] = []

  for (const texto of nomes) {
    const alvo = normalizar(texto)

    // 1) nome ou apelido identico
    const exata = players.find(
      (p) => (normalizar(p.name) === alvo || normalizar(p.nickname ?? '') === alvo) && !usados.has(p.id),
    )
    const porApelido = exata
      ? null
      : players.find((p) => (p.aliases ?? []).some((a) => normalizar(a) === alvo) && !usados.has(p.id))

    if (exata || porApelido) {
      const p = (exata ?? porApelido) as Player
      usados.add(p.id)
      itens.push({
        texto,
        vincularA: p.id,
        sugestoes: [{ player: p, score: 1 }],
        origem: exata ? 'exata' : 'apelido',
      })
      continue
    }

    // 2) parecidas
    const sugestoes = players
      .filter((p) => !usados.has(p.id))
      .map((p) => ({
        player: p,
        score: Math.max(
          semelhanca(texto, p.name),
          p.nickname ? semelhanca(texto, p.nickname) : 0,
          ...(p.aliases ?? []).map((a) => semelhanca(texto, a)),
          0,
        ),
      }))
      .filter((s) => s.score >= DUVIDA)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)

    const melhor = sugestoes[0]
    if (melhor && melhor.score >= CERTEZA) {
      usados.add(melhor.player.id)
      itens.push({ texto, vincularA: melhor.player.id, sugestoes, origem: 'parecida' })
    } else {
      itens.push({ texto, vincularA: null, sugestoes, origem: 'nova' })
    }
  }
  return itens
}

/**
 * So conta como "confira" o que o app nao resolveu com folga: nome novo, ou
 * palpite que nao bateu o primeiro nome inteiro. Vinculo por nome/apelido
 * identico e por primeiro nome exato passa direto.
 */
export function precisamDeAtencao(itens: ItemDaLista[]): number {
  return itens.filter((i) => precisaConferir(i)).length
}

export function precisaConferir(i: ItemDaLista): boolean {
  if (i.origem === 'nova') return true
  if (i.origem === 'parecida') return (i.sugestoes[0]?.score ?? 0) < 0.95
  return false
}
