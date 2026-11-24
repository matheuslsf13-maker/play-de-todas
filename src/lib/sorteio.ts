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
 * A fita da roleta: as concorrentes num CICLO (dono, 24/11: a mesma foto aparecia logo depois de passar).
 * Uma ordem embaralhada que se repete, girada para a vencedora cair na posicao `alvo`: entre duas vezes
 * da mesma pessoa passam todas as outras.
 */
export function fitaDaRoleta(ids: string[], vencedora: string, total = 64, alvo = 54, rnd = Math.random): string[] {
  const ordem = [...ids]
  for (let i = ordem.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[ordem[i], ordem[j]] = [ordem[j], ordem[i]]
  }
  const n = ordem.length
  const desloca = (((ordem.indexOf(vencedora) - alvo) % n) + n) % n
  return Array.from({ length: total }, (_, i) => ordem[(i + desloca) % n])
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
  // 🙂 normais
  { nome: 'giro-curto', trechos: () => [{ ate: qualquer(), ms: 3200, curva: sai(2) }] },
  { nome: 'normal-rapida', trechos: () => [{ ate: qualquer(), ms: 4600, curva: sai(2.6) }] },
  { nome: 'normal', trechos: () => [{ ate: qualquer(), ms: 6000, curva: sai(3) }] },
  { nome: 'normal-lenta', trechos: () => [{ ate: qualquer(), ms: 7600, curva: sai(3) }] },
  { nome: 'partida-lenta', trechos: () => [{ ate: qualquer(), ms: 6800, curva: suave }] },
  // 😂 engracadas
  { nome: 'soluco', trechos: () => [
    { ate: -360, ms: 5000, curva: sai(3) },
    ...soluco(-360, qualquer(), 3),
  ] },
  { nome: 'preguica', trechos: () => [
    { ate: -830, ms: 4400, curva: sai(3) },
    { ate: -824, ms: 1400, curva: reto }, // cochilou
    { ate: qualquer(), ms: 4000, curva: sai(1.4) }, // acordou sem pressa
  ] },
  { nome: 'turbo-no-fim', trechos: () => [
    { ate: -520, ms: 5000, curva: sai(3) },
    { ate: -515, ms: 700, curva: reto },
    { ate: qualquer(), ms: 900, curva: sai(5) }, // ZUUUM e para
  ] },
  { nome: 'gaguejo', trechos: () => [
    { ate: -572, ms: 4600, curva: sai(2.6) },
    ...degraus(-572, qualquer(), 6, 380, 0),
  ] },
  { nome: 'elevador', trechos: () => [
    { ate: -470, ms: 4600, curva: sai(2.8) },
    ...degraus(-470, qualquer(), 4, 520, 420), // para em cada andar
  ] },
  { nome: 'bebada', trechos: () => [
    { ate: -1300, ms: 2600, curva: sai(1.6) },
    { ate: qualquer(), ms: 6200, curva: (p) => sai(2)(cambaleia(p)) }, // acelera e freia sem rumo
  ] },
  { nome: 'lebre-e-tartaruga', trechos: () => [
    { ate: -1400, ms: 2500, curva: sai(1.6) },
    { ate: -1330, ms: 1200, curva: reto },
    { ate: -420, ms: 1200, curva: sai(2) },
    { ate: -385, ms: 1000, curva: reto },
    { ate: qualquer(), ms: 1700, curva: sai(3) },
  ] },
  { nome: 'engasgou', trechos: () => [
    { ate: -560, ms: 4800, curva: sai(3) },
    { ate: -549, ms: 1000, curva: reto },
    { ate: qualquer(), ms: 3000, curva: sai(3) },
  ] },
  // 😱 aflitas
  { nome: 'agonia', trechos: () => [{ ate: entre(-44, -40), ms: 11000, curva: sai(4) }] },
  { nome: 'coracao-na-mao', trechos: () => [
    { ate: -276, ms: 5400, curva: sai(3) },
    { ate: -270, ms: 500, curva: reto },
    { ate: -172, ms: 1200, curva: suave },
    { ate: -166, ms: 600, curva: reto },
    { ate: -66, ms: 1300, curva: suave },
    { ate: -60, ms: 800, curva: reto },
    { ate: entre(-42, -25), ms: 1200, curva: suave },
  ] },
  { nome: 'milimetro', trechos: () => [
    { ate: -90, ms: 6800, curva: sai(3) },
    { ate: entre(-45, -41), ms: 3200, curva: reto }, // anda o ultimo pedaco quase parada
  ] },
  { nome: 'quase-quase', trechos: () => [
    { ate: -60, ms: 7200, curva: sai(3.4) },
    { ate: -57, ms: 1500, curva: reto },
    { ate: entre(-44, -38), ms: 900, curva: suave },
  ] },
  { nome: 'sem-fim', trechos: () => [
    { ate: -478, ms: 4600, curva: sai(2.8) },
    ...degraus(-478, entre(-30, 30), 5, 900, 250),
  ] },
  // ⚡ mais rapidas
  { nome: 'flash', trechos: () => [{ ate: qualquer(), ms: 2200, curva: sai(2) }] },
  { nome: 'tiro', trechos: () => [{ ate: entre(-44, -36), ms: 2500, curva: sai(3) }] },
  { nome: 'zap', trechos: () => [{ ate: entre(36, 44), ms: 2600, curva: sai(2.4) }] },
  { nome: 'rapidinha-no-meio', trechos: () => [{ ate: entre(-10, 10), ms: 3000, curva: sai(2.6) }] },
  { nome: 'pique', trechos: () => [{ ate: -300, ms: 1800, curva: sai(1.4) }, { ate: qualquer(), ms: 900, curva: sai(4) }] },
  { nome: 'estalo', trechos: () => [{ ate: qualquer(), ms: 3400, curva: sai(3.5) }] },
  { nome: 'tapa', trechos: () => [{ ate: -600, ms: 1500, curva: sai(1.2) }, { ate: qualquer(), ms: 1300, curva: sai(5) }] },
  { nome: 'vapt-vupt', trechos: () => [{ ate: qualquer(), ms: 2400, curva: sai(2.8) }] },
  { nome: 'curtinha-tensa', trechos: () => [{ ate: entre(-44, -40), ms: 4400, curva: sai(3.4) }] },
  { nome: 'rapida-com-pulo', trechos: () => [{ ate: -260, ms: 2600, curva: sai(2.6) }, ...soluco(-260, qualquer(), 2)] },
  // 🐢 super demoradas
  { nome: 'maratona', trechos: () => [{ ate: qualquer(), ms: 14000, curva: sai(4) }] },
  { nome: 'eterna', trechos: () => [{ ate: entre(-44, -38), ms: 15500, curva: sai(4.4) }] },
  { nome: 'suspense-maximo', trechos: () => [{ ate: entre(38, 44), ms: 16000, curva: sai(5) }] },
  { nome: 'novela', trechos: () => [
    { ate: -1200, ms: 6000, curva: sai(2.6) },
    { ate: -400, ms: 4000, curva: sai(1.6) },
    { ate: qualquer(), ms: 5000, curva: sai(2) },
  ] },
  { nome: 'capitulo-final', trechos: () => [{ ate: -900, ms: 4000, curva: sai(2.6) }, ...degraus(-900, qualquer(), 8, 900, 300)] },
  { nome: 'devagar-quase-parando', trechos: () => [{ ate: -200, ms: 7000, curva: sai(3) }, { ate: qualquer(), ms: 6500, curva: reto }] },
  { nome: 'paciencia', trechos: () => [
    { ate: -1000, ms: 5000, curva: sai(3) },
    { ate: -990, ms: 1500, curva: reto },
    { ate: -150, ms: 4000, curva: suave },
    { ate: -145, ms: 1200, curva: reto },
    { ate: qualquer(), ms: 2000, curva: suave },
  ] },
  { nome: 'tartaruga', trechos: () => [{ ate: -600, ms: 5000, curva: sai(2.6) }, { ate: qualquer(), ms: 9000, curva: reto }] },
  { nome: 'contagem-longa', trechos: () => [{ ate: -686, ms: 4500, curva: sai(2.8) }, ...degraus(-686, qualquer(), 7, 1100, 300)] },
  { nome: 'prende-a-respiracao', trechos: () => [
    { ate: -380, ms: 5000, curva: sai(3) },
    { ate: -374, ms: 900, curva: reto },
    { ate: -276, ms: 1100, curva: suave },
    { ate: -270, ms: 900, curva: reto },
    { ate: -172, ms: 1100, curva: suave },
    { ate: -166, ms: 900, curva: reto },
    { ate: -66, ms: 1200, curva: suave },
    { ate: -60, ms: 1000, curva: reto },
    { ate: entre(-42, -20), ms: 1300, curva: suave },
  ] },
  // 😂 mais engracadas
  { nome: 'sapinho', trechos: () => [{ ate: -620, ms: 4200, curva: sai(2.8) }, ...soluco(-620, qualquer(), 6)] },
  { nome: 'freio-quebrado', trechos: () => [
    { ate: -700, ms: 4600, curva: sai(3) },
    { ate: -690, ms: 1000, curva: reto },
    { ate: -100, ms: 1200, curva: suave }, // o freio soltou!
    { ate: qualquer(), ms: 1300, curva: sai(4) },
  ] },
  { nome: 'soneca-dupla', trechos: () => [
    { ate: -900, ms: 4200, curva: sai(3) },
    { ate: -894, ms: 1100, curva: reto },
    { ate: -330, ms: 1800, curva: suave },
    { ate: -325, ms: 1100, curva: reto },
    { ate: qualquer(), ms: 2200, curva: sai(1.8) },
  ] },
  { nome: 'pula-corda', trechos: () => [{ ate: -1040, ms: 3800, curva: sai(2.4) }, ...degraus(-1040, qualquer(), 10, 260, 0)] },
  { nome: 'patinete', trechos: () => [{ ate: -900, ms: 3800, curva: sai(2.4) }, ...empurroes(-900, qualquer(), 4, 800)] },
  { nome: 'tropecou', trechos: () => [
    { ate: -480, ms: 4600, curva: sai(3) },
    { ate: -474, ms: 500, curva: reto },
    { ate: -160, ms: 600, curva: sai(3) }, // levantou correndo
    { ate: -155, ms: 600, curva: reto },
    { ate: qualquer(), ms: 1600, curva: sai(3) },
  ] },
  { nome: 'minhoca', trechos: () => [
    { ate: -1400, ms: 2600, curva: sai(1.6) },
    { ate: qualquer(), ms: 7000, curva: (p) => sai(1.8)(p + (0.85 * Math.sin(2 * Math.PI * 5 * p)) / (2 * Math.PI * 5)) },
  ] },
  { nome: 'gangorra', trechos: () => [
    { ate: -1500, ms: 2400, curva: sai(1.6) },
    { ate: -1440, ms: 900, curva: reto },
    { ate: -800, ms: 900, curva: suave },
    { ate: -760, ms: 900, curva: reto },
    { ate: -260, ms: 900, curva: suave },
    { ate: -235, ms: 900, curva: reto },
    { ate: qualquer(), ms: 1400, curva: sai(3) },
  ] },
  { nome: 'carro-velho', trechos: () => [
    { ate: -820, ms: 4000, curva: sai(3) },
    { ate: -812, ms: 700, curva: reto },
    { ate: -560, ms: 500, curva: sai(2) },
    { ate: -553, ms: 700, curva: reto },
    { ate: -300, ms: 500, curva: sai(2) },
    { ate: -294, ms: 700, curva: reto },
    { ate: qualquer(), ms: 1800, curva: sai(3) },
  ] },
  { nome: 'tique-taque', trechos: () => [{ ate: -832, ms: 4000, curva: sai(2.8) }, ...degraus(-832, qualquer(), 8, 300, 300)] },
  // 😬 mais tensas
  { nome: 'fio-de-cabelo', trechos: () => [{ ate: entre(-45, -43), ms: 10000, curva: sai(3.8) }] },
  { nome: 'beira-do-abismo', trechos: () => [{ ate: entre(43, 45), ms: 10000, curva: sai(3.8) }] },
  { nome: 'quase-a-anterior', trechos: () => [
    { ate: -58, ms: 8000, curva: sai(3.6) },
    { ate: -56.5, ms: 1400, curva: reto },
    { ate: entre(-44, -40), ms: 1000, curva: suave },
  ] },
  { nome: 'tremedeira', trechos: () => [{ ate: -150, ms: 6500, curva: sai(3) }, ...soluco(-150, entre(-30, 20), 4)] },
  { nome: 'ultimo-suspiro', trechos: () => [
    { ate: -104, ms: 7000, curva: sai(3.2) },
    { ate: -60, ms: 2000, curva: sai(2) },
    { ate: entre(-44, -38), ms: 1500, curva: reto },
  ] },
  { nome: 'pressao', trechos: () => [{ ate: qualquer(), ms: 9500, curva: sai(4.2) }] },
  { nome: 'ansiedade', trechos: () => [
    { ate: -270, ms: 5600, curva: sai(3) },
    { ate: -266, ms: 700, curva: reto },
    { ate: -166, ms: 1100, curva: suave },
    { ate: -162, ms: 700, curva: reto },
    { ate: -62, ms: 1100, curva: suave },
    { ate: -58, ms: 800, curva: reto },
    { ate: entre(-44, -30), ms: 900, curva: suave },
  ] },
  { nome: 'roer-unha', trechos: () => [{ ate: -70, ms: 7600, curva: sai(3.4) }, { ate: entre(-45, -42), ms: 2600, curva: reto }] },
  { nome: 'empate-tecnico', trechos: () => [
    { ate: -54, ms: 8000, curva: sai(3.6) },
    { ate: -50, ms: 1200, curva: reto }, // bem na emenda entre as duas
    { ate: entre(-44, -38), ms: 800, curva: suave },
  ] },
  { nome: 'tudo-ou-nada', trechos: () => [
    { ate: -300, ms: 6000, curva: sai(3) },
    { ate: -120, ms: 2500, curva: sai(2) },
    { ate: qualquer(), ms: 1500, curva: sai(3) },
  ] },
]

/** Empurroes de patinete: `n` impulsos iguais de `de` ate `ate`, cada um sai rapido e desliza ate quase parar. */
function empurroes(de: number, ate: number, n: number, ms: number): Trecho[] {
  const passo = (ate - de) / n
  return Array.from({ length: n }, (_, i) => ({ ate: de + passo * (i + 1), ms, curva: sai(2.2) }))
}

/** Pulinhos: `n` saltos rapidos de `de` ate `ate`, com uma paradinha antes de cada. */
function soluco(de: number, ate: number, n: number): Trecho[] {
  const passo = (ate - de) / n
  return Array.from({ length: n }, (_, i) => [
    { ate: de + passo * i + 3, ms: 320, curva: reto },
    { ate: de + passo * (i + 1), ms: 360, curva: sai(4) },
  ]).flat()
}
/** `n` degraus iguais de `de` ate `ate` (cada um sai e chega devagar), com `pausa` ms quase parada entre eles. */
function degraus(de: number, ate: number, n: number, ms: number, pausa: number): Trecho[] {
  const passo = (ate - de) / n
  const t: Trecho[] = []
  for (let i = 0; i < n; i++) {
    const ini = de + passo * i
    if (pausa && i > 0) t.push({ ate: ini + 3, ms: pausa, curva: reto })
    t.push({ ate: de + passo * (i + 1), ms, curva: suave })
  }
  return t
}
/** Anda para frente com a velocidade indo e vindo (a derivada nunca fica negativa). */
const cambaleia = (p: number) => p + (0.85 * Math.sin(2 * Math.PI * 3 * p)) / (2 * Math.PI * 3)


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
