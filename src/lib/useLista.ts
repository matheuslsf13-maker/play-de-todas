import { useCallback, useEffect, useState } from 'react'
import { LIGA } from '../liga'
import { CHAVE } from './chaves'
import { copiaValida, type CopiaDaApagada, type ListaCompleta } from './listaDePresenca'
import { useStore } from './store'

/** A lista de presenca e so do Play de Todas: no Play de Terca e no Play Mista o recurso some. */
export const TEM_LISTA = LIGA.id === 'feminino'

/** O codigo da lista no link (?lista=), so no Play de Todas. */
export function codigoDaUrl(): string | null {
  if (!TEM_LISTA) return null
  return new URLSearchParams(window.location.search).get('lista')?.trim().toLowerCase() || null
}

/** A URL do link, a partir de onde o app esta publicado (a raiz no site). */
export function baseDoApp(): string {
  // o BASE_URL e './': somado a origem dava 'playdetodas.com.br./' (link quebrado no WhatsApp, 06/11)
  return new URL(import.meta.env.BASE_URL, window.location.href).href.split(/[?#]/)[0]
}

/**
 * Carrega uma lista (pelo codigo do link) ou "a do momento" (cartao da tela
 * inicial: a aberta, ou a fechada com o play por vir) e ouve o canal PROPRIO
 * dela: uma rajada de nomes vira uma leitura
 * so (300 ms). Nunca chama o `reload()` do app inteiro.
 *
 * `lista`: undefined carregando, null nao existe (ou sem tabela), senao a lista.
 */
// a ultima leitura de cada lista: ao trocar de aba o cartao volta na hora (sem ~1 s vazio) e o banco atualiza por tras
const ultimaLida = new Map<string, ListaCompleta | null>()

export function useLista(ref: { codigo: string } | 'momento' | null) {
  const { repo } = useStore()
  const chave = ref === null ? null : ref === 'momento' ? 'momento' : ref.codigo
  const [lista, setLista] = useState<ListaCompleta | null | undefined>(() => (chave ? ultimaLida.get(chave) : undefined))
  const recarregar = useCallback(async () => {
    if (!chave || !TEM_LISTA) {
      setLista(null)
      return
    }
    try {
      const l = chave === 'momento' ? await repo.listaDoMomento() : await repo.carregarLista({ codigo: chave })
      ultimaLida.set(chave, l)
      setLista(l)
    } catch (e) {
      // sem sinal: fica com o que ja tinha
      console.warn('não consegui ler a lista:', e)
      setLista((cur) => (cur === undefined ? null : cur))
    }
  }, [repo, chave])

  useEffect(() => {
    void recarregar()
  }, [recarregar])

  const id = lista?.lista.id
  useEffect(() => {
    if (!id) return
    let espera = 0
    const parar = repo.ouvirLista(id, () => {
      window.clearTimeout(espera)
      espera = window.setTimeout(() => void recarregar(), 300)
    })
    return () => {
      window.clearTimeout(espera)
      parar()
    }
  }, [repo, id, recarregar])

  // voltou para a tela (celular bloqueado, outro app): le de novo
  useEffect(() => {
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') void recarregar()
    }
    document.addEventListener('visibilitychange', aoVoltar)
    return () => document.removeEventListener('visibilitychange', aoVoltar)
  }, [recarregar])

  // a tela fecha sozinha no prazo, sem esperar outra mudanca
  const fecha = lista?.lista.fecha_em
  const [, setTique] = useState(0)
  useEffect(() => {
    if (!fecha) return
    const falta = Date.parse(fecha) - Date.now()
    if (falta <= 0 || falta > 2 ** 31 - 1) return
    const t = window.setTimeout(() => setTique((x) => x + 1), falta + 500)
    return () => window.clearTimeout(t)
  }, [fecha])

  return { lista, recarregar }
}

/* ---- o que este celular lembra (localStorage; tudo em try/catch: aba anonima) */

let aparelhoEmMemoria: string | null = null

/** 32 letras hex; getRandomValues e nao randomUUID, que falta no iPhone antes do iOS 15.4. */
function novoCodigoDeAparelho(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** O codigo deste celular, criado na 1a vez que ele coloca um nome. */
export function codigoDoAparelho(): string {
  try {
    const salvo = localStorage.getItem(CHAVE.aparelho)
    if (salvo) return salvo
    const novo = novoCodigoDeAparelho()
    localStorage.setItem(CHAVE.aparelho, novo)
    return novo
  } catch {
    // sem armazenamento: vale enquanto a pagina esta aberta
    aparelhoEmMemoria ??= novoCodigoDeAparelho()
    return aparelhoEmMemoria
  }
}

export function ultimoNome(): string {
  try {
    return localStorage.getItem(CHAVE.listaNome) ?? ''
  } catch {
    return ''
  }
}

export function guardarNome(nome: string) {
  try {
    localStorage.setItem(CHAVE.listaNome, nome)
  } catch {
    /* paciencia: da proxima vez ela digita */
  }
}

function lerMeus(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(CHAVE.listaMeus) ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}

/** O nome que este celular colocou nesta lista (id), se colocou. */
export function meuNome(listaId: string): string | null {
  return lerMeus()[listaId] ?? null
}

export function marcarMeu(listaId: string, nomeId: string | null) {
  try {
    const meus = lerMeus()
    if (nomeId) meus[listaId] = nomeId
    else delete meus[listaId]
    localStorage.setItem(CHAVE.listaMeus, JSON.stringify(meus))
  } catch {
    /* sem armazenamento: ela nao vera o "Tirar meu nome" depois */
  }
}

/* ---- a copia da lista apagada (D41): so neste celular, 30 minutos */

export function guardarCopiaDaApagada(c: CopiaDaApagada) {
  try {
    localStorage.setItem(CHAVE.listaApagada, JSON.stringify(c))
  } catch {
    /* sem armazenamento: nao da para trazer os nomes depois */
  }
}

/** A copia, se ainda vale; a vencida (ou estragada) e descartada aqui. */
export function lerCopiaDaApagada(): CopiaDaApagada | null {
  try {
    const bruto = localStorage.getItem(CHAVE.listaApagada)
    if (!bruto) return null
    const c = JSON.parse(bruto) as CopiaDaApagada
    if (copiaValida(c, new Date())) return c
    localStorage.removeItem(CHAVE.listaApagada)
  } catch {
    /* estragada ou sem armazenamento */
  }
  return null
}

export function esquecerCopiaDaApagada() {
  try {
    localStorage.removeItem(CHAVE.listaApagada)
  } catch {
    /* paciencia */
  }
}
