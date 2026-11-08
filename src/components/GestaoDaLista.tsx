import { useMemo, useState } from 'react'
import { LIGA } from '../liga'
import NovaAtleta from './NovaAtleta'
import { Avatar, Modal } from './ui'
import {
  ehMensalista,
  grafiaNova,
  horasAntesDoPlay,
  posicaoDe,
  quandoComData,
  sugestaoDeVinculo,
  validarNome,
  ativosEmOrdem,
  avisosAoApagar,
  copiaDaApagada,
  dataDoPlay,
  ordemParaGarantir,
  type ListaCompleta,
  type NomeNaLista,
} from '../lib/listaDePresenca'
import { normalizar, semelhanca } from '../lib/roster'
import { useStore } from '../lib/store'
import { categoriaDe } from '../lib/mensalidade'
import { emDiaNaData } from '../lib/fichaDaMensalidade'
import { esquecerCopiaDaApagada, guardarCopiaDaApagada } from '../lib/useLista'
import { plural, type Player } from '../lib/types'
import { EscolherCompensacao, useCompensarFalta } from './FichaDaMensalidade'
import { avisoDoFinanceiro, lancadosPelaLista, type Desfazer } from '../lib/pagamentoNaLista'

/*
 * GESTAO DA LISTA (organizadora, logada). Toda escrita espera o banco e o erro
 * vira aviso: a ordem e decidida no servidor com atletas escrevendo ao mesmo
 * tempo, entao nada vai pela fila offline (uma troca enviada depois inverteria
 * posicoes que todas ja viram). O tempo real atualiza a lista na tela.
 */

/** O erro do banco numa frase. O indice unico (23505) e "ja esta na lista". */
export function mensagemDeErro(e: unknown): string {
  const err = e as { code?: string; message?: string }
  if (err?.code === '23505' || /já está na lista/.test(err?.message ?? '')) return 'Esse nome (ou essa atleta) já está na lista'
  return `Não consegui gravar: ${err?.message ?? 'sem conexão'}`
}

export const ORIGEM: Record<NomeNaLista['origem'], string> = {
  link: 'pelo link',
  mensalista: 'mensalista em dia (entrou ao criar)',
  organizadora: 'pela organização',
}

/** Roda uma escrita da organizadora: espera, avisa o erro e rele a lista. */
export function useEscrita(recarregar: () => Promise<void>, onToast: (m: string) => void) {
  const [ocupada, setOcupada] = useState(false)
  async function escrever(acao: () => Promise<void>, ok?: string): Promise<boolean> {
    setOcupada(true)
    try {
      await acao()
      if (ok) onToast(ok)
      return true
    } catch (e) {
      onToast(mensagemDeErro(e))
      return false
    } finally {
      setOcupada(false)
      void recarregar()
    }
  }
  return { ocupada, escrever }
}

/** As atletas ativas, filtradas pela busca (ou pelas mais parecidas com `perto`). */
function buscar(players: Player[], busca: string, perto: string): Player[] {
  const alvo = normalizar(busca)
  if (alvo) {
    return players
      .filter((p) => [p.name, p.nickname ?? '', ...(p.aliases ?? [])].some((x) => normalizar(x).includes(alvo)))
      .slice(0, 30)
  }
  if (perto) {
    return [...players]
      .map((p) => ({ p, s: Math.max(semelhanca(perto, p.name), p.nickname ? semelhanca(perto, p.nickname) : 0) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 12)
      .map((x) => x.p)
  }
  return players.slice(0, 30)
}

/**
 * Escolher uma atleta do cadastro (vincular a "Outra…" ou adicionar a mao).
 * Sem foco automatico: no celular o teclado subiria cobrindo a lista.
 */
export function EscolherAtleta({
  titulo,
  perto = '',
  ocupadas,
  nomeLivre,
  onEscolher,
  onClose,
}: {
  titulo: string
  /** O nome digitado: sem busca, as mais parecidas aparecem primeiro. */
  perto?: string
  /** Quem ja esta ativa na lista (aparece marcada, sem toque). */
  ocupadas: Set<string>
  /** Adicionar so o nome escrito, sem cadastro. */
  nomeLivre?: (nome: string) => void
  onEscolher: (p: Player) => void
  onClose: () => void
}) {
  const { data, nameOf } = useStore()
  const [busca, setBusca] = useState('')
  const ativas = useMemo(
    () => data.players.filter((p) => p.active).sort((a, b) => nameOf(a.id).localeCompare(nameOf(b.id), 'pt-BR')),
    [data.players, nameOf],
  )
  const achadas = buscar(ativas, busca, perto)
  const livre = nomeLivre && busca.trim() ? validarNome(busca) : null
  return (
    <Modal title={titulo} onClose={onClose}>
      <div className="stack lista-pagina">
        <label className="field">
          <span>Procurar pelo nome</span>
          <input className="input" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="nome, apelido…" />
        </label>
        {livre && 'nome' in livre && (
          <button className="btn ghost block" onClick={() => nomeLivre?.(livre.nome)}>
            ✍️ Adicionar só o nome “{livre.nome}”
          </button>
        )}
        <div className="stack" style={{ gap: 6 }}>
          {achadas.map((p) => {
            const ja = ocupadas.has(p.id)
            return (
              <button key={p.id} className="lista-escolha" disabled={ja} onClick={() => onEscolher(p)}>
                <Avatar player={p} size={32} />
                <span className="grow">
                  {nameOf(p.id)}
                  {p.nickname?.trim() && <span className="tiny muted"> · {p.name}</span>}
                </span>
                {ja && <span className="tiny muted nowrap">já na lista</span>}
              </button>
            )
          })}
          {achadas.length === 0 && <p className="small muted" style={{ margin: 0 }}>Ninguém com esse nome.</p>}
        </div>
      </div>
    </Modal>
  )
}

/** Vincula o nome digitado a um cadastro e guarda a grafia para a proxima vez. */
export function useVincular(lc: ListaCompleta, recarregar: () => Promise<void>, onToast: (m: string) => void) {
  const { repo, savePlayer, playerById } = useStore()
  const { ocupada, escrever } = useEscrita(recarregar, onToast)
  /** A atleta ja esta ativa noutra linha: a organizadora decide tirar a duplicada. */
  const [duplicada, setDuplicada] = useState<{ n: NomeNaLista; outra: NomeNaLista } | null>(null)

  async function vincular(n: NomeNaLista, p: Player): Promise<boolean> {
    const outra = lc.nomes.find((x) => !x.saiu_em && x.player_id === p.id && x.id !== n.id)
    if (outra) {
      setDuplicada({ n, outra })
      return false
    }
    const ok = await escrever(() => repo.mexerNoNome(n.id, { player_id: p.id }), 'Vinculado ✓')
    // o app aprende a grafia: na proxima lista ela vincula sozinha (se for de uma atleta so)
    if (ok && grafiaNova(n.nome, p)) savePlayer({ ...p, aliases: [...(p.aliases ?? []), n.nome] })
    return ok
  }

  const avisoDeDuplicada = duplicada && (
    <Modal title="Ela já está na lista" onClose={() => setDuplicada(null)}>
      <div className="stack lista-pagina">
        <p style={{ margin: 0 }}>
          {/* o nome do cadastro: as duas Bruna tem o mesmo apelido */}
          <strong>{(duplicada.outra.player_id && playerById(duplicada.outra.player_id)?.name) || duplicada.outra.nome}</strong> já está na
          lista (posição {posicaoDe(lc.nomes, duplicada.outra.id)}). Se “{duplicada.n.nome}” é ela, tire esta duplicada.
        </p>
        <button
          className="btn danger block"
          disabled={ocupada}
          onClick={async () => {
            const d = duplicada
            setDuplicada(null)
            await escrever(
              () => repo.mexerNoNome(d.n.id, { saiu_em: new Date().toISOString(), saiu_por: 'organizadora' }),
              'Duplicada tirada',
            )
          }}
        >
          Tirar a duplicada
        </button>
        <button className="btn ghost block" onClick={() => setDuplicada(null)}>Deixar como está</button>
      </div>
    </Modal>
  )

  return { vincular, ocupada, avisoDeDuplicada }
}

/** A compensacao da falta avisada pela lista: id fixo por lista e atleta. */
function useCompensarFaltaNaLista(lc: ListaCompleta) {
  const compensar = useCompensarFalta()
  return (playerId: string, tipo: 'credito' | 'checkin') => compensar(playerId, tipo, dataDoPlay(lc.lista), `falta:${lc.lista.id}:${playerId}`)
}

/** Tocar num nome (organizadora): vincular, trocar de lugar, garantir a vaga, tirar. */
export function OpcoesDoNome({
  n,
  lc,
  recarregar,
  onToast,
  onTrocar,
  onClose,
}: {
  n: NomeNaLista
  lc: ListaCompleta
  recarregar: () => Promise<void>
  onToast: (m: string) => void
  onTrocar: (n: NomeNaLista) => void
  onClose: () => void
}) {
  const { data, repo, nameOf, playerById } = useStore()
  const { ocupada, escrever } = useEscrita(recarregar, onToast)
  const { vincular, avisoDeDuplicada } = useVincular(lc, recarregar, onToast)
  const [tela, setTela] = useState<'menu' | 'outra' | 'nova' | 'tirar' | 'compensar'>('menu')
  const compensarFalta = useCompensarFaltaNaLista(lc)
  const player = n.player_id ? playerById(n.player_id) : undefined
  const ativas = data.players.filter((p) => p.active)
  const sugestoes = n.player_id ? [] : sugestaoDeVinculo(n.nome, ativas).slice(0, 3)
  const ocupadas = new Set(lc.nomes.filter((x) => !x.saiu_em && x.player_id).map((x) => x.player_id as string))
  const posicao = posicaoDe(lc.nomes, n.id)
  const mensalista = ehMensalista(n, data, dataDoPlay(lc.lista))

  async function vincularEFechar(p: Player) {
    if (await vincular(n, p)) onClose()
  }

  async function tirar(avisou: boolean | null) {
    // a confirmada que sai com aviso: a 1a suplente sobe e fica marcada como substituta dela
    const ordem = ativosEmOrdem(lc.nomes)
    const entra = avisou && n.player_id && posicao <= lc.lista.vagas ? ordem[lc.lista.vagas] : undefined
    const ok = await escrever(async () => {
      await repo.mexerNoNome(n.id, { saiu_em: new Date().toISOString(), saiu_por: 'organizadora', avisou_24h: avisou })
      if (entra) await repo.mexerNoNome(entra.id, { substitui: n.player_id }).catch(() => {}) // sem o script 36: so nao liga
    }, `${player ? nameOf(player.id) : n.nome} saiu da lista`)
    if (ok) onClose()
  }

  if (avisoDeDuplicada) return avisoDeDuplicada
  if (tela === 'outra') {
    return (
      <EscolherAtleta
        titulo={`Quem é “${n.nome}”?`}
        perto={n.nome}
        ocupadas={ocupadas}
        onEscolher={(p) => void vincularEFechar(p)}
        onClose={() => setTela('menu')}
      />
    )
  }
  if (tela === 'nova') {
    return (
      <NovaAtleta
        nomeInicial={n.nome}
        acao="Cadastrar e vincular"
        onClose={() => setTela('menu')}
        onCriada={async (p) => {
          // o cadastro novo vai pela fila; o vinculo aponta para ele, entao grava ja
          try {
            await repo.savePlayer(p)
          } catch (e) {
            onToast(mensagemDeErro(e))
            return
          }
          await vincularEFechar(p)
        }}
      />
    )
  }
  if (tela === 'compensar' && player) {
    // FALTA AVISADA (dono, 07/11): R$ 25 de credito na proxima mensalidade ou um check-in a menos na deste ciclo
    const compensar = async (tipo: 'credito' | 'checkin' | null) => {
      if (tipo) {
        try {
          compensarFalta(player.id, tipo)
        } catch (e) {
          onToast(mensagemDeErro(e))
          return
        }
      }
      await tirar(true)
    }
    return (
      <Modal title={`${nameOf(player.id)} avisou com 24h`} onClose={() => setTela('tirar')}>
        <div className="stack lista-pagina">
          <EscolherCompensacao playerId={player.id} dataDoPlay={dataDoPlay(lc.lista)} ocupada={ocupada} onEscolher={(t) => void compensar(t)} />
        </div>
      </Modal>
    )
  }
  if (tela === 'tirar') {
    const faltam = horasAntesDoPlay(new Date().toISOString(), lc.lista.play_em)
    return (
      <Modal title={`Tirar ${player ? nameOf(player.id) : n.nome}?`} onClose={() => setTela('menu')}>
        <div className="stack lista-pagina">
          {mensalista ? (
            <>
              <p style={{ margin: 0 }}>
                <strong>Ela avisou com 24h de antecedência?</strong>
                <br />
                <span className="small muted">
                  {faltam >= 0 ? `Faltam ${plural(faltam, 'hora')} para o play.` : 'O play já começou.'} A resposta fica guardada
                  (vale para o crédito da mensalista).
                </span>
              </p>
              <button
                className="btn teal block"
                disabled={ocupada}
                // a compensacao so existe no Play de Todas, para quem tem cadastro (a ficha e da atleta)
                onClick={() => (LIGA.id === 'feminino' && player ? setTela('compensar') : void tirar(true))}
              >
                Sim, avisou — tirar
              </button>
              <button className="btn danger block" disabled={ocupada} onClick={() => void tirar(false)}>Não avisou — tirar</button>
            </>
          ) : (
            <>
              <p style={{ margin: 0 }}>
                {posicao <= lc.lista.vagas
                  ? 'A vaga vai para a próxima suplente.'
                  : 'Ela sai da fila de suplentes.'}
              </p>
              <button className="btn danger block" disabled={ocupada} onClick={() => void tirar(null)}>Tirar da lista</button>
            </>
          )}
          <button className="btn ghost block" onClick={() => setTela('menu')}>Cancelar</button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title={player ? nameOf(player.id) : n.nome} onClose={onClose}>
      <div className="stack lista-pagina">
        <p className="small muted" style={{ margin: 0 }}>
          {posicao}ª da lista · {ORIGEM[n.origem]} · entrou {quandoComData(n.entrou_em)}
          {player && n.nome !== player.name && <> · digitou “{n.nome}”</>}
        </p>
        {!player && (
          <>
            <div className="section-title" style={{ margin: '4px 0 0' }}>Quem é?</div>
            {sugestoes.map((s) => (
              <button key={s.player.id} className="lista-escolha" disabled={ocupada} onClick={() => void vincularEFechar(s.player)}>
                <Avatar player={s.player} size={32} />
                <span className="grow">
                  É a <strong>{nameOf(s.player.id)}</strong>
                  {s.player.nickname?.trim() && <span className="tiny muted"> · {s.player.name}</span>}
                </span>
                {ocupadas.has(s.player.id) ? (
                  <span className="tiny muted nowrap">já na lista</span>
                ) : (
                  <span className="nowrap">✓</span>
                )}
              </button>
            ))}
            <div className="lista-acoes">
              <button className="btn ghost" onClick={() => setTela('outra')}>🔎 Outra…</button>
              <button className="btn ghost" onClick={() => setTela('nova')}>➕ Nova atleta</button>
            </div>
          </>
        )}
        <div className="lista-acoes">
          <button className="btn ghost" onClick={() => { onTrocar(n); onClose() }}>⇅ Trocar de lugar</button>
          {player && <button className="btn ghost" onClick={() => setTela('outra')}>🔁 Outro cadastro</button>}
          {n.origem === 'organizadora' && !n.garantida && (
            <button
              className="btn ghost"
              disabled={ocupada}
              onClick={async () => {
                const ok = await escrever(
                  () => repo.mexerNoNome(n.id, { garantida: true, ordem: ordemParaGarantir(lc.nomes) }),
                  'Vaga garantida ⭐',
                )
                if (ok) onClose()
              }}
            >
              ⭐ Garantir vaga
            </button>
          )}
          <button className="btn danger" onClick={() => setTela('tirar')}>✕ Tirar da lista</button>
        </div>
      </div>
    </Modal>
  )
}

/** "A decisao e sua": troca dois nomes de lugar. */
export function ConfirmarTroca({
  a,
  b,
  lc,
  recarregar,
  onToast,
  onClose,
}: {
  a: NomeNaLista
  b: NomeNaLista
  lc: ListaCompleta
  recarregar: () => Promise<void>
  onToast: (m: string) => void
  onClose: () => void
}) {
  const { data, repo, nameOf, deleteItemDaMensalidade } = useStore()
  const { ocupada, escrever } = useEscrita(recarregar, onToast)
  const compensarFalta = useCompensarFaltaNaLista(lc)
  const [passo, setPasso] = useState<'confirmar' | 'avisou' | 'compensar'>('confirmar')
  const nome = (n: NomeNaLista) => (n.player_id ? nameOf(n.player_id) : n.nome)
  const pa = posicaoDe(lc.nomes, a.id)
  const pb = posicaoDe(lc.nomes, b.id)
  const vagas = lc.lista.vagas
  const quando = dataDoPlay(lc.lista)
  const movidas: [NomeNaLista, number, number][] = [[a, pa, pb], [b, pb, pa]]
  // TROCAR DE LUGAR (dono, 07/11): a mensalista que sai das confirmadas e como a tirada -- pergunta as 24h
  const sai = LIGA.id === 'feminino' ? movidas.find(([n, de, para]) => de <= vagas && para > vagas && n.player_id && ehMensalista(n, data, quando))?.[0] : undefined
  const entra = sai ? (sai.id === a.id ? b : a) : undefined
  // e a que volta para as confirmadas: desfaz o aviso, a compensacao e a substituta
  const volta = movidas.find(([n, de, para]) => de > vagas && para <= vagas && n.player_id && n.avisou_24h !== null)?.[0]

  async function trocar(avisou: boolean | null) {
    const ok = await escrever(async () => {
      await repo.trocarNaLista(a.id, b.id)
      if (sai) {
        await repo.mexerNoNome(sai.id, { avisou_24h: avisou })
        if (avisou && entra) await repo.mexerNoNome(entra.id, { substitui: sai.player_id }).catch(() => {}) // sem o script 36: so nao liga
      }
      if (volta?.player_id) {
        await repo.mexerNoNome(volta.id, { avisou_24h: null })
        const falta = `falta:${lc.lista.id}:${volta.player_id}`
        if (data.mensalidadeItens.some((i) => i.id === falta)) deleteItemDaMensalidade(falta)
        for (const x of lc.nomes.filter((x) => x.substitui === volta.player_id)) await repo.mexerNoNome(x.id, { substitui: null }).catch(() => {})
      }
    }, 'Trocadas ⇅')
    if (ok) onClose()
  }

  if (sai && passo === 'avisou') {
    return (
      <Modal title={`${nome(sai)} sai das confirmadas`} onClose={() => setPasso('confirmar')}>
        <div className="stack lista-pagina">
          <p style={{ margin: 0 }}><strong>Ela avisou com 24h de antecedência?</strong></p>
          <button className="btn teal block" disabled={ocupada} onClick={() => setPasso('compensar')}>Sim, avisou — trocar</button>
          <button className="btn danger block" disabled={ocupada} onClick={() => void trocar(false)}>Não avisou — trocar</button>
          <button className="btn ghost block" onClick={() => setPasso('confirmar')}>Voltar</button>
        </div>
      </Modal>
    )
  }
  if (sai && sai.player_id && passo === 'compensar') {
    const pid = sai.player_id
    return (
      <Modal title={`${nome(sai)} avisou com 24h`} onClose={() => setPasso('avisou')}>
        <div className="stack lista-pagina">
          <EscolherCompensacao
            playerId={pid}
            dataDoPlay={quando}
            ocupada={ocupada}
            onEscolher={(t) => {
              if (t) {
                try {
                  compensarFalta(pid, t)
                } catch (e) {
                  onToast(mensagemDeErro(e))
                  return
                }
              }
              void trocar(true)
            }}
          />
          {entra && <span className="hint">{nome(entra)} fica marcada como substituta dela (no 💰).</span>}
        </div>
      </Modal>
    )
  }

  return (
    <Modal title="Trocar de lugar" onClose={onClose}>
      <div className="stack lista-pagina">
        <p style={{ margin: 0 }}>
          A decisão é sua: <strong>{nome(a)}</strong> vai para a posição {pb} e <strong>{nome(b)}</strong> para a {pa}.
          {sai && <> <strong>{nome(sai)}</strong> é mensalista e sai das confirmadas: vem a pergunta das 24h.</>}
          {volta && <> <strong>{nome(volta)}</strong> volta para as confirmadas: o aviso e a compensação dela são desfeitos.</>}
        </p>
        <button className="btn purple block" disabled={ocupada} onClick={() => (sai ? setPasso('avisou') : void trocar(null))}>
          Trocar
        </button>
        <button className="btn ghost block" onClick={onClose}>Cancelar</button>
      </div>
    </Modal>
  )
}

/** Quem saiu: hora, quem tirou, quantas horas antes do play e o "avisou 24h". */
export function Sairam({ lc }: { lc: ListaCompleta }) {
  const { nameOf } = useStore()
  const sairam = lc.nomes
    .filter((n) => n.saiu_em)
    .sort((a, b) => (b.saiu_em as string).localeCompare(a.saiu_em as string))
  if (sairam.length === 0) return null
  return (
    <details className="card">
      <summary className="section-title lista-resumo">↩️ Saíram ({sairam.length})</summary>
      <div className="stack" style={{ gap: 8 }}>
        {sairam.map((n) => (
          <div key={n.id} className="small" style={{ borderBottom: '1px dashed var(--line)', paddingBottom: 6 }}>
            <strong>{n.player_id ? nameOf(n.player_id) : n.nome}</strong>
            {n.origem === 'mensalista' && ' 📅'}
            <div className="tiny muted">
              saiu {quandoComData(n.saiu_em as string)} · {n.saiu_por === 'atleta' ? 'ela mesma, pelo link' : 'tirada pela organização'} ·{' '}
              {plural(Math.max(0, horasAntesDoPlay(n.saiu_em as string, lc.lista.play_em)), 'hora')} antes do play
              {n.avisou_24h !== null && <> · avisou com 24h: <strong>{n.avisou_24h ? 'sim' : 'não'}</strong></>}
            </div>
          </div>
        ))}
      </div>
    </details>
  )
}

/** Adicionar a mao: do cadastro ou so o nome. Entra no fim da fila. */
export function AdicionarNaLista({
  lc,
  recarregar,
  onToast,
  onClose,
}: {
  lc: ListaCompleta
  recarregar: () => Promise<void>
  onToast: (m: string) => void
  onClose: () => void
}) {
  const { repo, data } = useStore()
  const { escrever } = useEscrita(recarregar, onToast)
  const ocupadas = new Set(ativosEmOrdem(lc.nomes).flatMap((x) => (x.player_id ? [x.player_id] : [])))
  async function incluir(nome: string, player_id: string | null) {
    // mensalista que ficou em dia DEPOIS de a lista ser criada entra garantida, na vez das mensalistas (nao no fim como suplente)
    const p = player_id ? data.players.find((x) => x.id === player_id) : undefined
    const emDia = !!p && categoriaDe(p) === 'mensalista' && emDiaNaData(data, p, dataDoPlay(lc.lista))
    const ok = await escrever(
      () => repo.incluirNaLista([emDia
        ? { lista_id: lc.lista.id, nome, player_id, origem: 'mensalista', garantida: true, ordem: ordemParaGarantir(lc.nomes) }
        : { lista_id: lc.lista.id, nome, player_id, origem: 'organizadora', garantida: false, ordem: null }]),
      emDia ? 'Mensalista em dia: entrou com a vaga garantida' : 'Adicionada no fim da lista',
    )
    if (ok) onClose()
  }
  return (
    <EscolherAtleta
      titulo="➕ Adicionar à lista"
      ocupadas={ocupadas}
      nomeLivre={(nome) => void incluir(nome, null)}
      onEscolher={(p) => void incluir(p.name, p.id)}
      onClose={onClose}
    />
  )
}

/** "Apagar esta lista?" (D39): os avisos, um so passo, sem digitar. Espera o banco; erro deixa a janela aberta. */
/** Quem tem cadastro na lista (ativa ou que saiu): o 💰 so lanca para elas. */
export const cadastrosDaLista = (lc: ListaCompleta) => lc.nomes.flatMap((n) => (n.player_id ? [n.player_id] : []))

/** Grava o desfazer pela fila da store (nunca recusada pelo banco): cadastros, lancamentos soltos e os dias. */
export function aplicarDesfazer(store: ReturnType<typeof useStore>, d: Desfazer) {
  for (const p of d.players) store.savePlayer(p)
  const dosDias = new Set(store.data.checkins.filter((c) => d.dias.includes(c.dia_id)).map((c) => c.id))
  for (const id of d.checkins) if (!dosDias.has(id)) store.deleteCheckin(id)
  // o dia leva junto os lancamentos e pagamentos dele (cascata no banco e na store)
  for (const id of d.dias) store.deleteCheckinDia(id)
  for (const id of d.itens ?? []) store.deleteItemDaMensalidade(id)
}

/**
 * Apaga a lista (D39) e desfaz o 💰 dela. `antes`: o que roda antes de apagar
 * (apagar o play junto: soltar o vinculo, senao o banco recusa).
 */
export async function apagarListaComTudo(store: ReturnType<typeof useStore>, lc: ListaCompleta, antes?: () => Promise<void>) {
  const desfazer = lancadosPelaLista(store.data, { ...lc.lista, session_id: null }, cadastrosDaLista(lc))
  await antes?.()
  await store.repo.apagarLista(lc.lista.id)
  aplicarDesfazer(store, desfazer)
  // D41: os nomes ficam neste celular por 30 minutos, para a lista refeita (lista sem nomes: nao sobra a copia de antes)
  const copia = copiaDaApagada(lc.lista, lc.nomes, new Date())
  if (copia) guardarCopiaDaApagada(copia)
  else esquecerCopiaDaApagada()
}

export function ApagarLista({ lc, onApagou, onClose }: { lc: ListaCompleta; onApagou: () => void; onClose: () => void }) {
  const store = useStore()
  const { repo } = store
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')
  const financeiro = avisoDoFinanceiro(store.data, lancadosPelaLista(store.data, lc.lista, cadastrosDaLista(lc)), true)
  async function apagar() {
    setBusy(true)
    setErro('')
    try {
      await apagarListaComTudo(store, lc)
      onApagou()
    } catch (e) {
      console.warn('não consegui apagar a lista:', e)
      // a resposta pode ter se perdido com a lista ja apagada, ou outro celular montou o play
      const atual = await repo.carregarLista({ id: lc.lista.id }).catch(() => undefined)
      if (atual === null) {
        // apagou mesmo: desfaz o 💰 e guarda a copia como no caminho certo
        aplicarDesfazer(store, lancadosPelaLista(store.data, lc.lista, cadastrosDaLista(lc)))
        const copia = copiaDaApagada(lc.lista, lc.nomes, new Date())
        if (copia) guardarCopiaDaApagada(copia)
        return onApagou()
      }
      setErro(atual?.lista.session_id ? 'Esta lista já virou play e não pode ser apagada.' : 'Não consegui apagar agora. Confira a internet e tente de novo.')
      setBusy(false)
    }
  }
  return (
    <Modal title="Apagar esta lista?" onClose={onClose}>
      <div className="stack lista-pagina">
        <p className="small muted" style={{ margin: '-6px 0 0', overflowWrap: 'anywhere' }}>
          {lc.lista.titulo} · {quandoComData(lc.lista.play_em)}
        </p>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {/* o 💰 entra antes do "Não dá para desfazer", que fecha a lista */}
          {avisosAoApagar(lc.nomes).flatMap((a, i, xs) => (i === xs.length - 1 && financeiro ? [financeiro, a] : [a])).map((a) => <li key={a}>{a}</li>)}
        </ul>
        {erro && <div className="banner err" style={{ margin: 0 }}>{erro}</div>}
        <button className="btn danger block" disabled={busy} onClick={() => void apagar()}>
          {busy ? 'Apagando…' : '🗑️ Apagar lista'}
        </button>
        <button className="btn ghost block" disabled={busy} onClick={onClose}>Cancelar</button>
      </div>
    </Modal>
  )
}
