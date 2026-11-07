import { categoriaDe } from './mensalidade'
import type { AppData, Player } from './types'

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

export const mensalistasAtivas = (data: AppData) => data.players.filter((p) => p.active && categoriaDe(p) === 'mensalista')

/** A espera, na ordem do pedido (quem ja virou mensalista sai da conta). */
export function filaDeEspera(data: AppData): Player[] {
  return data.players
    .filter((p) => p.espera_mensalista && categoriaDe(p) !== 'mensalista')
    .sort((a, b) => (a.espera_mensalista as string).localeCompare(b.espera_mensalista as string) || a.name.localeCompare(b.name, 'pt-BR'))
}

export const vagasLivres = (data: AppData) => Math.max(0, limiteDeMensalistas(data) - mensalistasAtivas(data).length)

/** Pode virar mensalista agora? Quem ja e mensalista sempre pode (nao ocupa vaga nova). */
export const cabeMensalista = (data: AppData, p: Player) => categoriaDe(p) === 'mensalista' || vagasLivres(data) > 0
