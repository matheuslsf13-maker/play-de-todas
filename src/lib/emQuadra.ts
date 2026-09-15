/**
 * Quais partidas estao em quadra agora e quando cada uma terminou, guardado
 * tambem no proprio celular.
 *
 * O banco tem as colunas `started_at` e `ended_at`, mas o app nao pode
 * depender so delas: se o script 04/05 ainda nao rodou, ou a escrita demora, o
 * tempo real devolve a partida sem o inicio e o botao "voltaria" sozinho. Com
 * esta camada local o inicio e o fim se mantem na tela de quem esta
 * organizando, mesmo offline.
 *
 * O fim alimenta o "quem esta fora ha mais tempo", que decide quem entra na
 * proxima partida.
 */

import { CHAVE } from './chaves'

const KEY = CHAVE.emQuadra
const KEY_FIM = CHAVE.fimDasPartidas

export type Horarios = Record<string, string> // match_id -> ISO

function ler(chave: string): Horarios {
  try {
    const raw = localStorage.getItem(chave)
    return raw ? (JSON.parse(raw) as Horarios) : {}
  } catch {
    return {}
  }
}

function gravar(chave: string, v: Horarios) {
  try {
    localStorage.setItem(chave, JSON.stringify(v))
  } catch {
    /* sem espaco: segue so em memoria */
  }
}

export type Inicios = Horarios

export function loadInicios(): Inicios {
  return ler(KEY)
}

export function saveInicios(v: Inicios) {
  gravar(KEY, v)
}

export function loadFins(): Horarios {
  return ler(KEY_FIM)
}

export function saveFins(v: Horarios) {
  gravar(KEY_FIM, v)
}

/* ------------------------------------------------------------------
   QUEM AINDA NAO CHEGOU

   Quem esta na lista do play mas ainda nao apareceu. Enquanto estiver
   marcada, o app pula as partidas dela ao sugerir a proxima -- sem isso a
   quadra ficava parada ou a organizadora tinha que escolher na mao. Quando
   chega, e desmarcada e entra na frente: e quem esta ha mais tempo sem jogar.
   Fica so neste aparelho, como a hora de inicio das partidas.
   ------------------------------------------------------------------ */

const KEY_AUSENTES = CHAVE.ausentes

export type Ausentes = Record<string, string[]> // session_id -> player_ids

export function loadAusentes(): Ausentes {
  try {
    const raw = localStorage.getItem(KEY_AUSENTES)
    return raw ? (JSON.parse(raw) as Ausentes) : {}
  } catch {
    return {}
  }
}

export function saveAusentes(v: Ausentes) {
  try {
    localStorage.setItem(KEY_AUSENTES, JSON.stringify(v))
  } catch {
    /* sem espaco ou modo privado: segue so na memoria */
  }
}
