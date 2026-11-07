import type { AppData } from './types'

export function juntarMensalidades(d: AppData, origem: string, destino: string) {
  const mensalidades = d.mensalidades.filter((m) => m.player_id !== origem)
  const mesesDoDestino = new Set(mensalidades.filter((m) => m.player_id === destino).map((m) => m.mes))
  for (const m of d.mensalidades) {
    if (m.player_id === origem && !mesesDoDestino.has(m.mes)) {
      mensalidades.push({ ...m, player_id: destino, id: `mensalidade:${destino}:${m.mes}` })
    }
  }
  const mensalidadeItens = d.mensalidadeItens.map((i) => {
    const player_id = i.player_id === origem ? destino : i.player_id
    const conta_id = i.conta_id === `principal:${origem}` ? `principal:${destino}` : i.conta_id
    return player_id === i.player_id && conta_id === i.conta_id ? i : { ...i, player_id, conta_id }
  })
  return { mensalidades, mensalidadeItens }
}
