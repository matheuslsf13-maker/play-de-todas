import type { AppData, Player } from './types'
import { monthLabel, monthOf, todayISO } from './types'
import { formatarReais } from './checkins'
import { comecaNoMesSeguinte, dividaDaMensalidade, emDiaNaData, MES_INICIAL, proximoMes } from './fichaDaMensalidade'

/**
 * QUEM PODE ENTRAR NO PLAY
 *
 * Os atletas pagam para jogar, e cada um paga de um jeito:
 *
 *   mensalista  paga por mes. Fica liberada enquanto o mes gravado em
 *               `pago_mes` for o mes de hoje -- entao na virada do mes ele
 *               volta a dever SOZINHO, sem ninguem precisar rodar nada.
 *   avulsa      paga por play. `pago_avulso` e um credito de uma participacao:
 *               vale para o proximo play e some quando aquele play e
 *               finalizado.
 *   convidada   nao paga. So que convidada e para ser eventual, entao dois
 *               plays seguidos acendem um alerta -- sem travar nada, porque
 *               quem decide isso e a organizacao, nao o app.
 *
 * A regra do mensalista e DERIVADA do calendario em vez de gravada: nao existe
 * "virar o mes" para dar errado, esquecer de rodar ou rodar duas vezes.
 */

export type Categoria = 'mensalista' | 'avulsa' | 'convidada' | 'isenta'

export const CATEGORIAS: { valor: Categoria; rotulo: string; explica: string }[] = [
  {
    valor: 'mensalista',
    rotulo: '📅 Mensalista',
    explica: 'paga por mês; na virada do mês volta a aparecer como devendo',
  },
  {
    valor: 'avulsa',
    rotulo: '🎟️ Avulsa',
    explica: 'paga por play; a confirmação vale para um play só',
  },
  {
    valor: 'convidada',
    rotulo: '🤝 Convidada',
    explica: 'não paga; dois plays seguidos acendem um alerta',
  },
  {
    valor: 'isenta',
    rotulo: '🎫 Isenta',
    explica: 'não paga e nunca alerta — para quem tem acordo, e para grupo que não cobra',
  },
]

export function categoriaDe(p: Player): Categoria {
  return (p.categoria as Categoria) ?? 'mensalista'
}

export function rotuloDaCategoria(c: Categoria): string {
  return CATEGORIAS.find((x) => x.valor === c)?.rotulo ?? c
}

export type Situacao = {
  /** Pode ser escalado para um play? */
  liberado: boolean
  cor: 'ok' | 'devendo' | 'atencao'
  /** Frase curta para a lista de atletas. */
  rotulo: string
  /** O que fazer para liberar, quando esta devendo. */
  comoResolver?: string
  /** Aviso que nao impede de jogar (convidada em sequencia). */
  alerta?: string
}

/**
 * Em quantos plays seguidos, contando do mais recente, esta atleta jogou.
 *
 * Conta a partir do ultimo play do campeonato: se ela nao esteve no mais
 * recente, a sequencia e zero. Serve so para o alerta da convidada.
 */
export function playsSeguidos(data: AppData, playerId: string): number {
  const plays = data.sessions
    .filter((s) => s.status === 'finished' && s.ranked !== false)
    .sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at))
  let n = 0
  for (const s of plays) {
    if (!s.player_ids.includes(playerId)) break
    n++
  }
  return n
}

export function situacaoDoAtleta(p: Player, data: AppData, hoje = todayISO()): Situacao {
  const categoria = categoriaDe(p)
  const mes = monthOf(hoje)

  // isenta nao paga e nao vira alerta: o acordo e permanente, entao contar
  // plays seguidos so encheria a tela de aviso que ninguem vai resolver
  if (categoria === 'isenta') {
    return { liberado: true, cor: 'ok', rotulo: 'Isenta' }
  }

  if (categoria === 'convidada') {
    const seguidos = playsSeguidos(data, p.id)
    return {
      liberado: true,
      cor: seguidos >= 2 ? 'atencao' : 'ok',
      rotulo: 'Convidada',
      alerta:
        seguidos >= 2
          ? `Já jogou ${seguidos} plays seguidos como convidada — vale conversar sobre virar mensalista.`
          : undefined,
    }
  }

  if (categoria === 'avulsa') {
    return p.pago_avulso
      ? { liberado: true, cor: 'ok', rotulo: 'Avulsa paga (vale 1 play)' }
      : {
          liberado: false,
          cor: 'devendo',
          rotulo: 'Avulsa a pagar',
          comoResolver: 'Confirme o pagamento deste play para liberar.',
        }
  }

  // mensalista: desde a mensalidade de dezembro/2026, a ficha (fichaDaMensalidade.ts)
  if (mes >= MES_INICIAL) {
    if (emDiaNaData(data, p, hoje)) return { liberado: true, cor: 'ok', rotulo: 'Mensalidade em dia' }
    // pagou so o mes seguinte: a vaga e dela, este mes e como avulsa (sem divida, sem "atrasada")
    if (comecaNoMesSeguinte(data, p, hoje)) {
      const a_partir = `Mensalista a partir de ${monthLabel(proximoMes(mes)).split(' ')[0].toLowerCase()}`
      return p.pago_avulso
        ? { liberado: true, cor: 'ok', rotulo: `${a_partir} · play pago como avulsa` }
        : { liberado: false, cor: 'atencao', rotulo: `${a_partir} · este play é avulso`, comoResolver: 'Cobre este play como avulsa.' }
    }
    // sem a mensalidade em dia ela joga como avulsa: o play pago libera
    if (p.pago_avulso) return { liberado: true, cor: 'ok', rotulo: 'Play pago como avulsa (mensalidade não renovada)' }
    const divida = dividaDaMensalidade(data, p.id, hoje).total
    return {
      liberado: false,
      cor: 'devendo',
      rotulo: divida > 0 ? `Deve ${formatarReais(divida)} da mensalidade` : 'Mensalidade não renovada',
      comoResolver: 'Registre a mensalidade dela (ou cobre este play como avulsa).',
    }
  }
  if (p.pago_mes !== mes && p.pago_avulso) return { liberado: true, cor: 'ok', rotulo: 'Play pago como avulsa (mensalidade não paga)' }
  return p.pago_mes === mes
    ? { liberado: true, cor: 'ok', rotulo: 'Mensalidade em dia' }
    : {
        liberado: false,
        cor: 'devendo',
        rotulo: p.pago_mes ? `Mensalidade paga até ${p.pago_mes}` : 'Mensalidade a pagar',
        comoResolver: 'Confirme a mensalidade do mês para liberar.',
      }
}

/**
 * MENSALISTA EM DIA PARA UM PLAY (lista de presenca): pagou o mes do play (ou
 * adiantado), ou o play e ate o dia 5 e ela pagou o mes anterior -- ainda esta
 * no prazo da mensalidade (dono, 06/11). Atrasada ha mais tempo, nao.
 */
export function mensalistaEmDiaNoPlay(p: Player, dataDoPlay: string): boolean {
  if (categoriaDe(p) !== 'mensalista' || !p.pago_mes) return false
  const mes = monthOf(dataDoPlay)
  if (p.pago_mes >= mes) return true
  const [a, m] = mes.split('-').map(Number)
  const anterior = m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`
  return Number(dataDoPlay.slice(8, 10)) <= 5 && p.pago_mes === anterior
}

/** Marca o pagamento conforme a categoria, devolvendo a atleta atualizada. */
export function confirmarPagamento(p: Player, hoje = todayISO()): Player {
  const categoria = categoriaDe(p)
  if (categoria === 'avulsa') return { ...p, pago_avulso: true }
  // desde dezembro/2026 a mensalidade e a ficha; o confirmar daqui e o play pago como avulsa
  if (categoria === 'mensalista') return monthOf(hoje) >= MES_INICIAL ? { ...p, pago_avulso: true } : { ...p, pago_mes: monthOf(hoje) }
  return p
}

/** Desfaz a confirmacao -- para quando alguem marca por engano. */
export function desfazerPagamento(p: Player, hoje = todayISO()): Player {
  const categoria = categoriaDe(p)
  if (categoria === 'avulsa') return { ...p, pago_avulso: false }
  if (categoria === 'mensalista') return monthOf(hoje) >= MES_INICIAL ? { ...p, pago_avulso: false } : { ...p, pago_mes: null }
  return p
}

/**
 * Depois de finalizar um play, o credito das avulsas que jogaram acaba.
 * Devolve so quem mudou, para o app nao gravar atleta a toa.
 */
export function consumirAvulsos(jogaram: string[], data: AppData): Player[] {
  return data.players.filter(
    // a mensalista que nao renovou paga o play como avulsa: o credito dela tambem acaba
    (p) => jogaram.includes(p.id) && (categoriaDe(p) === 'avulsa' || categoriaDe(p) === 'mensalista') && p.pago_avulso,
  ).map((p) => ({ ...p, pago_avulso: false }))
}
