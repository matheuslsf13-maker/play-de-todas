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
