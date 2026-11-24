/*
 * SORTEIO DO PLAY (dono, 24/11): quem entra, quanto de chance cada uma tem e quem sai.
 * Sem bonus todas tem o mesmo peso. Com bonus do podio a 1a do dia (ou do grupo dela) ganha
 * +bonus%, a 2a +2/3 e a 3a +1/3 disso. Quem ganhou sai do proximo sorteio, salvo se a
 * organizadora deixar repetir.
 */

export type Participante = { id: string; nome: string; foto?: string | null }

/** Peso de cada uma: 1, mais o bonus do podio (`colocacao` 1, 2 ou 3; `bonus` em %). */
export function pesoNoSorteio(colocacao: number | undefined, bonus: number): number {
  if (!bonus || !colocacao || colocacao > 3) return 1
  return 1 + (bonus / 100) * ((4 - colocacao) / 3)
}

/** A chance (0 a 1) de cada uma, na ordem dada. */
export function chances(ids: string[], colocacao: Map<string, number>, bonus: number): Map<string, number> {
  const pesos = ids.map((id) => pesoNoSorteio(colocacao.get(id), bonus))
  const total = pesos.reduce((s, p) => s + p, 0)
  return new Map(ids.map((id, i) => [id, total ? pesos[i] / total : 0]))
}

/** Sorteia uma pelos pesos. `rnd` em [0, 1). */
export function sortear(ids: string[], colocacao: Map<string, number>, bonus: number, rnd = Math.random): string | null {
  if (ids.length === 0) return null
  const c = chances(ids, colocacao, bonus)
  let r = rnd()
  for (const id of ids) {
    r -= c.get(id) ?? 0
    if (r < 0) return id
  }
  return ids[ids.length - 1]
}

/** Quem concorre agora: as escolhidas, menos as que ja ganharam (se nao pode repetir). */
export function concorrentes(escolhidas: string[], ganhadoras: string[], repetir: boolean): string[] {
  if (repetir) return escolhidas
  const saiu = new Set(ganhadoras)
  return escolhidas.filter((id) => !saiu.has(id))
}

/**
 * A fita da roleta: `total` cartoes sorteados entre as concorrentes (so para encher), com a
 * vencedora na posicao `alvo`. Evita a mesma pessoa em dois cartoes vizinhos quando da.
 */
export function fitaDaRoleta(ids: string[], vencedora: string, total = 64, alvo = 54, rnd = Math.random): string[] {
  const fita: string[] = []
  for (let i = 0; i < total; i++) {
    if (i === alvo) { fita.push(vencedora); continue }
    let id = ids[Math.floor(rnd() * ids.length)]
    for (let t = 0; t < 4 && ids.length > 1 && (id === fita[i - 1] || (i + 1 === alvo && id === vencedora)); t++) id = ids[Math.floor(rnd() * ids.length)]
    fita.push(id)
  }
  return fita
}

export const entre = (a: number, b: number) => a + Math.random() * (b - a)

/*
 * AS FREADAS (dono, 24/11: "vai para, para, para"; sem voltar, que da briga). A roleta SO ANDA PARA FRENTE.
 * Posicao em `c`: onde o ponteiro esta em relacao ao centro da sorteada. A sorteada vai de -48 a 48
 * (-48 = entrou por um fio; 48 = quase passou para a proxima); a anterior termina em -56, a de antes em
 * -160, e cada cartao a mais para tras soma -104. Cada freada e uma lista de trechos, um depois do outro,
 * sempre com `c` crescendo; o ultimo termina dentro da sorteada. Sorteada uma por giro.
 */
export type Trecho = { ate: number; ms: number; curva: (p: number) => number }
export const sai = (n: number) => (p: number) => 1 - Math.pow(1 - p, n) // rapido no comeco, cauda longa
const reto = (p: number) => p // velocidade constante: rasteja sem parar
const suave = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2) // sai devagar e chega devagar
const qualquer = () => entre(-38, 38)

export const FREADAS: { nome: string; trechos: () => Trecho[] }[] = [
  // ⚡ rapidas
  { nome: 'relampago', trechos: () => [{ ate: entre(-24, 24), ms: 2800, curva: sai(2.2) }] },
  { nome: 'direta', trechos: () => [{ ate: qualquer(), ms: 3600, curva: sai(2.5) }] },
  { nome: 'curta-no-fio', trechos: () => [{ ate: entre(-44, -36), ms: 4200, curva: sai(2.8) }] },
  { nome: 'curta-na-ponta', trechos: () => [{ ate: entre(36, 44), ms: 4200, curva: sai(2.8) }] },
  // 😬 tensas
  { nome: 'no-meio', trechos: () => [{ ate: entre(-12, 12), ms: 7600, curva: sai(2.8) }] },
  { nome: 'por-um-fio', trechos: () => [{ ate: entre(-44, -36), ms: 8600, curva: sai(3.2) }] },
  { nome: 'quase-passa', trechos: () => [{ ate: entre(36, 44), ms: 8600, curva: sai(3.2) }] },
  { nome: 'na-linha', trechos: () => [{ ate: entre(-45, -41), ms: 9200, curva: sai(3.4) }] },
  { nome: 'na-beiradinha', trechos: () => [{ ate: entre(41, 45), ms: 9200, curva: sai(3.4) }] },
  { nome: 'suspense-longo', trechos: () => [{ ate: qualquer(), ms: 10500, curva: sai(3.6) }] },
  // quase para na anterior... e escorrega para a sorteada
  { nome: 'falso-fim', trechos: () => [
    { ate: -66, ms: 6600, curva: sai(3) },
    { ate: -59, ms: 900, curva: reto },
    { ate: entre(-40, -15), ms: 1500, curva: suave },
  ] },
  { nome: 'falso-fim-duplo', trechos: () => [
    { ate: -172, ms: 5800, curva: sai(3) },
    { ate: -164, ms: 600, curva: reto },
    { ate: -66, ms: 1900, curva: suave },
    { ate: -60, ms: 700, curva: reto },
    { ate: entre(-42, -20), ms: 1300, curva: suave },
  ] },
  { nome: 'escorrega', trechos: () => [
    { ate: -63, ms: 7000, curva: sai(3.2) },
    { ate: -58, ms: 1100, curva: reto },
    { ate: entre(-45, -42), ms: 700, curva: reto },
  ] },
  // rasteja um cartao inteiro, devagar e sem parar
  { nome: 'rastejando', trechos: () => [
    { ate: -150, ms: 5800, curva: sai(2.6) },
    { ate: entre(-25, 25), ms: 3600, curva: reto },
  ] },
  { nome: 'lesma', trechos: () => [
    { ate: -260, ms: 4800, curva: sai(2.4) },
    { ate: qualquer(), ms: 5200, curva: sai(1.6) },
  ] },
  // passo a passo: quase para em cada emenda e segue
  { nome: 'respira', trechos: () => [
    { ate: -370, ms: 5200, curva: sai(2.8) },
    { ate: -362, ms: 400, curva: reto },
    { ate: -166, ms: 1500, curva: suave },
    { ate: -158, ms: 500, curva: reto },
    { ate: qualquer(), ms: 1700, curva: suave },
  ] },
  { nome: 'contagem', trechos: () => [
    { ate: -374, ms: 5000, curva: sai(2.8) },
    { ate: -268, ms: 900, curva: suave },
    { ate: -164, ms: 1000, curva: suave },
    { ate: -60, ms: 1150, curva: suave },
    { ate: entre(-40, 10), ms: 1300, curva: sai(2) },
  ] },
  // parece que vai parar longe... e ganha um ultimo empurrao
  { nome: 'tranco', trechos: () => [
    { ate: -470, ms: 5200, curva: sai(3) },
    { ate: -462, ms: 450, curva: reto },
    { ate: qualquer(), ms: 2600, curva: sai(3) },
  ] },
  // corre ate o fim e freia de vez
  { nome: 'freio-de-mao', trechos: () => [
    { ate: -230, ms: 3400, curva: sai(1.5) },
    { ate: qualquer(), ms: 3200, curva: sai(4) },
  ] },
]

/** A freada inteira, em `c` (posicao do ponteiro) pelo tempo: devolve a posicao em `ms` e se ja acabou. */
export function posicaoNaFreada(c0: number, trechos: Trecho[], ms: number): { c: number; acabou: boolean } {
  let de = c0
  for (const t of trechos) {
    if (ms < t.ms) return { c: de + (t.ate - de) * t.curva(ms / t.ms), acabou: false }
    ms -= t.ms
    de = t.ate
  }
  return { c: de, acabou: true }
}
