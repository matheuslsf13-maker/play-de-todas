import { categoriaDe } from './mensalidade'
import { dividaDaMensalidade, fichaDe, MES_INICIAL, proximoMes, renovada } from './fichaDaMensalidade'
import { monthOf, todayISO, type AppData, type Player } from './types'

/*
 * LIMITE DE MENSALISTAS E LISTA DE ESPERA (dono, 07/11/2026): o total e configuravel
 * (padrao 12, em `ajustes`), quem pede depois de lotar entra na espera pela ordem do
 * pedido (`players.espera_mensalista`), e quando abre vaga o app mostra a proxima e a
 * organizadora confirma. Conta as mensalistas ATIVAS (inativa nao ocupa vaga).
 */
export const LIMITE_PADRAO = 12
export const CHAVE_DO_LIMITE = 'limite_mensalistas'

export function limiteDeMensalistas(data: AppData): number {
  const v = data.ajustes.find((a) => a.id === CHAVE_DO_LIMITE)?.valor
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : LIMITE_PADRAO
}

/**
 * NAO RENOVOU (dono, 07/11): passou o dia 5 sem pagar a parte que renova (80, ou os 180) da mensalidade
 * do mes, OU ainda devendo check-ins da anterior -> perde a vaga na hora (a vaga conta como livre). A
 * organizadora passa ela para avulsa no fim da espera.
 */
export function perdeuAVaga(data: AppData, p: Player, hoje = todayISO()): boolean {
  const mes = monthOf(hoje)
  if (!p.active || categoriaDe(p) !== 'mensalista' || mes < MES_INICIAL || Number(hoje.slice(8, 10)) <= 5) return false
  // para renovar tem de quitar o que deve da mensalidade anterior (dono, 07/11): devendo no dia 6, nao renovou
  if (dividaDaMensalidade(data, p.id, hoje).total > 0) return true
  // pagar a mensalidade seguinte adiantado tambem segura a vaga
  return !renovada(fichaDe(data, p.id, mes), hoje) && !renovada(fichaDe(data, p.id, proximoMes(mes)), hoje)
}

export const naoRenovaram = (data: AppData, hoje = todayISO()) => data.players.filter((p) => perdeuAVaga(data, p, hoje))

export const mensalistasAtivas = (data: AppData, hoje = todayISO()) =>
  data.players.filter((p) => p.active && categoriaDe(p) === 'mensalista' && !perdeuAVaga(data, p, hoje))

/** A espera, na ordem do pedido (quem ja virou mensalista sai da conta). */
export function filaDeEspera(data: AppData): Player[] {
  return data.players
    .filter((p) => p.espera_mensalista && categoriaDe(p) !== 'mensalista')
    .sort((a, b) => (a.espera_mensalista as string).localeCompare(b.espera_mensalista as string) || a.name.localeCompare(b.name, 'pt-BR'))
}

export const vagasLivres = (data: AppData, hoje = todayISO()) => Math.max(0, limiteDeMensalistas(data) - mensalistasAtivas(data, hoje).length)

/** Pode virar mensalista agora? Quem ja e mensalista sempre pode (nao ocupa vaga nova). */
export const cabeMensalista = (data: AppData, p: Player, hoje = todayISO()) => categoriaDe(p) === 'mensalista' || vagasLivres(data, hoje) > 0
