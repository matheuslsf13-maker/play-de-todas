import { useState } from 'react'
import { Modal } from './ui'
import { useStore } from '../lib/store'
import { categoriaDe } from '../lib/mensalidade'
import { perdeuAVaga, vagasLivres } from '../lib/vagasDeMensalista'
import { contasDaAtleta, creditoDisponivel, formatarReais, lerValor, nomeDoTitular } from '../lib/checkins'
import {
  checkinsDaFicha,
  contaDaRenovacao,
  dividaDaMensalidade,
  dividirPix,
  faltaDaFicha,
  fichaDe,
  idDaFicha,
  MENSALIDADE_PADRAO,
  mensalidadeDaData,
  mesAnterior,
  MES_INICIAL,
  mesSugeridoDoCheckin,
  prazoDosCheckins,
  proximoMes,
  quitada,
  renovada,
  valorDaFicha,
  valorParaRenovar,
  vencimento,
} from '../lib/fichaDaMensalidade'
import { dateLabel, monthLabel, todayISO, uid, type ItemDaMensalidade } from '../lib/types'

/*
 * 📅 A FICHA DA MENSALIDADE (dono, 07/11): a Ingryd registra o que chega pelo
 * WhatsApp -- o Pix e cada check-in direcionado a mensalidade (data, arena e
 * conta). Tudo o mais (em dia, divida, virou avulsa) sai da regra pura
 * (fichaDaMensalidade.ts); aqui so se grava item.
 */

/** A mensalidade que importa hoje: a do mes (nunca antes da regra nova). */
export const mensalidadeDeHoje = (hoje = todayISO()) => mensalidadeDaData(hoje)

const dm = (date: string) => dateLabel(date).slice(0, 5)
const prazos = (mes: string) => `renovar até ${dm(vencimento(mes))} · check-ins até ${dm(prazoDosCheckins(mes))}`

/** A situacao da ficha numa data, em texto curto e cor (a mesma na lista e na ficha). */
function situacaoDaFicha(f: ReturnType<typeof fichaDe>, hoje: string, devendoAntes = 0): { t: string; c: string } {
  const falta = faltaDaFicha(f, hoje)
  // para renovar tem de quitar a anterior (dono, 07/11): com divida vencida, os 80 deste mes nao bastam
  if (devendoAntes > 0 && !quitada(f, hoje)) return { t: `não renovou: deve ${formatarReais(devendoAntes)} da anterior (joga como avulsa)`, c: 'var(--danger)' }
  if (quitada(f, hoje)) return { t: '✅ quitada', c: 'var(--verde)' }
  if (!renovada(f, hoje)) {
    if (vencimento(f.mes) < hoje) return { t: 'não renovou (joga como avulsa)', c: 'var(--danger)' }
    return { t: f.itens.length ? `falta renovar até ${dm(vencimento(f.mes))}` : 'nada registrado', c: f.itens.length ? 'var(--yellow)' : 'var(--muted)' }
  }
  if (prazoDosCheckins(f.mes) < hoje) return { t: `deve ${formatarReais(falta)} (joga como avulsa até quitar)`, c: 'var(--danger)' }
  return { t: `renovada · faltam ${formatarReais(falta)} em check-ins até ${dm(prazoDosCheckins(f.mes))}`, c: 'var(--verde)' }
}

/** Uma linha curta para a lista de atletas: "R$ 80 + 2/4 check-ins · falta R$ 50". */
export function resumoDaMensalidade(f: ReturnType<typeof fichaDe>, hoje: string, devendoAntes = 0): { texto: string; cor: string } {
  if (devendoAntes > 0) {
    const s = situacaoDaFicha(f, hoje, devendoAntes)
    return { texto: s.t, cor: s.c }
  }
  if (f.itens.length === 0) return vencimento(f.mes) < hoje ? { texto: 'não renovou (joga como avulsa)', cor: 'var(--danger)' } : { texto: 'nada registrado', cor: 'var(--muted)' }
  const partes = [] as string[]
  const dinheiro = f.itens.filter((i) => i.tipo === 'dinheiro').reduce((s, i) => s + (i.valor ?? 0), 0)
  if (dinheiro > 0) partes.push(formatarReais(dinheiro))
  const ck = checkinsDaFicha(f)
  if (ck > 0 || (dinheiro > 0 && dinheiro < f.valor_cheio)) partes.push(`${Math.min(ck, f.max_checkins)}/${f.max_checkins} check-ins`)
  const s = situacaoDaFicha(f, hoje)
  return { texto: `${partes.join(' + ')} · ${s.t}`, cor: s.c }
}

/** Grava um item na ficha, criando o cabecalho (valores congelados) se for o primeiro do mes. Lanca sem o script 34. */
export function useGravarNaFicha() {
  const { data, saveMensalidade, saveItemDaMensalidade } = useStore()
  return (item: ItemDaMensalidade) => {
    if (!data.mensalidades.some((m) => m.player_id === item.player_id && m.mes === item.mes)) {
      saveMensalidade({ id: idDaFicha(item.player_id, item.mes), player_id: item.player_id, mes: item.mes, ...MENSALIDADE_PADRAO, created_at: new Date().toISOString() })
    }
    saveItemDaMensalidade(item)
  }
}

export function FichaDaMensalidade({ playerId, mesInicial, onClose, onToast }: { playerId: string; mesInicial?: string; onClose: () => void; onToast: (m: string) => void }) {
  const { data, nameOf, deleteItemDaMensalidade, saveAcerto } = useStore()
  const gravarNaFicha = useGravarNaFicha()
  const hoje = todayISO()
  const [mes, setMes] = useState(mesInicial ?? mensalidadeDeHoje(hoje))
  const [novo, setNovo] = useState<null | 'checkin' | 'dinheiro'>(null)
  const f = fichaDe(data, playerId, mes)
  const falta = faltaDaFicha(f)
  const divida = dividaDaMensalidade(data, playerId, hoje)
  const credito = creditoDisponivel(data, playerId)
  const novoItem = (i: Pick<ItemDaMensalidade, 'mes' | 'tipo' | 'valor' | 'observacao'>, date = hoje): ItemDaMensalidade => ({
    ...i, id: uid(), player_id: playerId, date, conta_id: null, local_id: null, confirmado: true, created_at: new Date().toISOString(),
  })

  // o cabecalho congela os valores do mes; grava junto com o primeiro item
  function gravar(itens: ItemDaMensalidade | ItemDaMensalidade[]) {
    const lista = Array.isArray(itens) ? itens : [itens]
    const item = lista[lista.length - 1]
    try {
      for (const i of lista) gravarNaFicha(i)
    } catch (e) {
      // sem o script 34 a store recusa: avisa em vez de quebrar a janela
      onToast(e instanceof Error ? e.message : 'Não deu para gravar a mensalidade.')
      return
    }
    setNovo(null)
    if (item.mes !== mes) setMes(item.mes)
    onToast(item.tipo === 'checkin' ? `Check-in na mensalidade de ${monthLabel(item.mes)}` : `${formatarReais(item.valor ?? 0)} na mensalidade de ${monthLabel(item.mes)}`)
  }

  const devendoAntes = divida.porMes.filter((x) => x.mes < mes).reduce((t, x) => t + x.falta, 0)
  const s = situacaoDaFicha(f, hoje, devendoAntes)
  const situacao = { t: s.t[0].toUpperCase() + s.t.slice(1), c: s.c }
  const pct = Math.min(100, Math.round((valorDaFicha(f) / f.valor_cheio) * 100))

  return (
    <Modal title={`📅 Mensalidade · ${nameOf(playerId)}`} onClose={onClose}>
      <div className="row spread" style={{ marginBottom: 8 }}>
        <button className="btn ghost sm" disabled={mesAnterior(mes) < MES_INICIAL} onClick={() => setMes(mesAnterior(mes))} aria-label="Mensalidade anterior">‹</button>
        <div style={{ textAlign: 'center' }}>
          <strong>{monthLabel(mes)}</strong>
          <div className="tiny muted">{prazos(mes)}</div>
        </div>
        <button className="btn ghost sm" onClick={() => setMes(proximoMes(mes))} aria-label="Próxima mensalidade">›</button>
      </div>

      <div className="ficha-barra" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
      <div className="row spread" style={{ margin: '6px 0 10px' }}>
        <strong style={{ color: situacao.c }}>{situacao.t}</strong>
        <span className="tiny muted">{formatarReais(valorDaFicha(f))} de {formatarReais(f.valor_cheio)}</span>
      </div>
      <p className="tiny muted" style={{ margin: '0 0 10px' }}>
        {formatarReais(f.valor_cheio)} no Pix, ou {formatarReais(f.valor_cheio - f.max_checkins * f.valor_checkin)} + {f.max_checkins} check-ins (cada um vale {formatarReais(f.valor_checkin)}).
      </p>
      {credito <= 0 && (() => {
        const atleta = data.players.find((x) => x.id === playerId)
        return atleta && perdeuAVaga(data, atleta, hoje) && vagasLivres(data, hoje) === 0 ? (
          <div className="banner warn" style={{ margin: '0 0 10px' }}>Sem vaga: a vaga dela já foi ocupada. Ela volta pela fila de espera (Meninas), não por aqui.</div>
        ) : null
      })()}
      {credito > 0 && !renovada(f) && (() => {
        // RENOVAR COM CREDITO (dono, 07/11): a conta aparece antes; so grava quando ela pagar a diferenca
        const devendo = divida.porMes.filter((d) => d.mes < mes).reduce((t, d) => t + d.falta, 0)
        const { usa, cobrar } = contaDaRenovacao(f, credito, devendo, hoje)
        if (usa <= 0) return null
        // so renova quem ainda e mensalista e tem vaga (dono, 07/11): quem ja foi para a fila volta pelo "Topou e pagou"
        const atleta = data.players.find((x) => x.id === playerId)
        if (!atleta || categoriaDe(atleta) !== 'mensalista') {
          return <div className="banner" style={{ margin: '0 0 10px' }}>💰 Ela tem {formatarReais(credito)} de crédito. Não é mais mensalista: volta pela fila de espera (Meninas → “Topou e pagou”), e o crédito entra sozinho.</div>
        }
        if (perdeuAVaga(data, atleta, hoje) && vagasLivres(data, hoje) === 0) {
          return <div className="banner warn" style={{ margin: '0 0 10px' }}>Sem vaga: a vaga dela já foi ocupada. Passe ela para avulsa no fim da fila (Meninas). O crédito de {formatarReais(credito)} continua valendo.</div>
        }
        return (
          <div className="banner" style={{ margin: '0 0 10px' }}>
            💰 Ela tem {formatarReais(credito)} de crédito. Para renovar: {formatarReais(usa)} do crédito
            {cobrar > 0 ? <> + <strong>cobrar {formatarReais(cobrar)} no Pix</strong>{devendo > 0 ? ` (com ${formatarReais(devendo)} da dívida)` : ''}</> : ''}.
            <span className="tiny muted" style={{ display: 'block', marginTop: 4 }}>Se ela não for renovar, não toque: o crédito continua valendo para os avulsos.</span>
            <button
              className="btn teal sm block"
              style={{ marginTop: 8 }}
              onClick={() => {
                try {
                  saveAcerto({ id: uid(), player_id: playerId, date: hoje, valor: -usa, dinheiro: false, descricao: `usado na mensalidade de ${monthLabel(mes).toLowerCase()}`, created_at: new Date().toISOString() })
                } catch (e) {
                  return onToast(e instanceof Error ? e.message : 'Não deu para usar o crédito.')
                }
                gravar([
                  novoItem({ mes, tipo: 'abatimento', valor: usa, observacao: 'crédito usado na renovação' }),
                  ...(cobrar > 0 ? dividirPix(data, playerId, mes, cobrar, hoje).map((p) => novoItem(p)) : []),
                ])
              }}
            >
              {cobrar > 0 ? `Recebi os ${formatarReais(cobrar)} — renovar` : 'Renovar com o crédito'}
            </button>
          </div>
        )
      })()}
      {divida.porMes.some((d) => d.mes !== mes) && (
        <p className="hint aviso" style={{ marginTop: 0 }}>
          ⚠️ Deve {divida.porMes.filter((d) => d.mes !== mes).map((d) => `${formatarReais(d.falta)} de ${monthLabel(d.mes)}`).join(' e ')}.
        </p>
      )}

      {f.itens.length > 0 && (
        <div className="stack" style={{ gap: 6, marginBottom: 12 }}>
          {[...f.itens].sort((a, b) => a.date.localeCompare(b.date)).map((i) => (
            <div key={i.id} className="row ficha-item" style={{ gap: 8 }}>
              <span aria-hidden="true">{i.tipo === 'checkin' ? '✅' : i.tipo === 'dinheiro' ? '💸' : '➖'}</span>
              <span className="grow">
                <strong>{dateLabel(i.date).slice(0, 5)}</strong>{' '}
                {i.tipo === 'checkin'
                  ? <>check-in {data.checkinLocais.find((l) => l.id === i.local_id)?.nome ?? 'sem arena'} · <span className="muted">{tituloDaConta(i)}</span></>
                  : <>{i.tipo === 'dinheiro' ? 'Pix' : 'abatimento'} {formatarReais(i.valor ?? 0)}{i.observacao ? <span className="muted"> · {i.observacao}</span> : null}</>}
              </span>
              <button
                className="btn ghost sm"
                aria-label="Apagar"
                onClick={() => {
                  if (!confirm('Apagar este registro da mensalidade?')) return
                  try {
                    deleteItemDaMensalidade(i.id)
                    onToast('Registro apagado')
                  } catch (e) {
                    onToast(e instanceof Error ? e.message : 'Não deu para apagar.')
                  }
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {novo === null && (
        <div className="row" style={{ gap: 8 }}>
          <button className="btn grow" onClick={() => setNovo('checkin')}>➕ Check-in</button>
          <button className="btn grow" onClick={() => setNovo('dinheiro')}>➕ Pix</button>
        </div>
      )}
      {novo === 'checkin' && <NovoCheckin playerId={playerId} onCancelar={() => setNovo(null)} onGravar={gravar} />}
      {novo === 'dinheiro' && <NovoPix playerId={playerId} mes={mes} novoItem={novoItem} sugestao={renovada(f) ? falta : Math.max(0, valorParaRenovar(f) - f.itens.filter((i) => i.tipo !== 'checkin').reduce((t, i) => t + (i.valor ?? 0), 0))} onCancelar={() => setNovo(null)} onGravar={gravar} />}
    </Modal>
  )

  function tituloDaConta(i: ItemDaMensalidade) {
    const c = contasDaAtleta(data, playerId).find((x) => (i.conta_id === null ? x.principal : x.id === i.conta_id))
    return c ? nomeDoTitular(c, nameOf(playerId)) : 'conta apagada'
  }
}

function NovoCheckin({ playerId, onCancelar, onGravar }: { playerId: string; onCancelar: () => void; onGravar: (i: ItemDaMensalidade) => void }) {
  const { data, nameOf } = useStore()
  const contas = contasDaAtleta(data, playerId)
  const locais = data.checkinLocais.filter((l) => l.ativo).sort((a, b) => a.ordem - b.ordem)
  const principal = contas.find((c) => c.principal) ?? contas[0]
  const [date, setDate] = useState(todayISO())
  const [contaId, setContaId] = useState<string | null>(null)
  const conta = contas.find((c) => (contaId === null ? c.principal : c.id === contaId)) ?? principal
  const [localId, setLocalId] = useState<string | null>(conta?.local_padrao_id ?? locais[0]?.id ?? null)
  const mes = mesSugeridoDoCheckin(data, playerId, date)
  // 1 check-in por dia por conta: o mesmo dia de novo e engano quase sempre
  const repetido = data.mensalidadeItens.some((i) => i.tipo === 'checkin' && i.player_id === playerId && i.date === date && i.conta_id === contaId)

  return (
    <div className="stack" style={{ gap: 10 }}>
      <label className="field">
        <span>Dia do check-in</span>
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <div className="field">
        <span>Conta usada</span>
        <div className="row wrap" style={{ gap: 6 }}>
          {contas.map((c) => (
            <button key={c.id} className={`chip ${conta?.id === c.id ? 'on' : ''}`} onClick={() => { setContaId(c.principal ? null : c.id); if (c.local_padrao_id) setLocalId(c.local_padrao_id) }}>
              {nomeDoTitular(c, nameOf(playerId))}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>Arena</span>
        <div className="row wrap" style={{ gap: 6 }}>
          {locais.map((l) => (
            <button key={l.id} className={`chip ${localId === l.id ? 'on' : ''}`} onClick={() => setLocalId(l.id)}>{l.nome}</button>
          ))}
        </div>
      </div>
      <span className="hint">Vai para a mensalidade de <strong>{monthLabel(mes)}</strong>.</span>
      {repetido && <span className="hint aviso">⚠️ Esta conta já tem um check-in da mensalidade neste dia.</span>}
      <div className="row" style={{ gap: 8 }}>
        <button className="btn ghost grow" onClick={onCancelar}>Cancelar</button>
        <button
          className="btn grow"
          disabled={!date || !localId}
          onClick={() =>
            onGravar({ id: uid(), player_id: playerId, mes, tipo: 'checkin', date, valor: null, conta_id: contaId, local_id: localId, confirmado: true, observacao: null, created_at: new Date().toISOString() })
          }
        >
          Salvar check-in
        </button>
      </div>
    </div>
  )
}

function NovoPix({ playerId, mes, sugestao, novoItem, onCancelar, onGravar }: {
  playerId: string
  mes: string
  sugestao: number
  novoItem: (i: Pick<ItemDaMensalidade, 'mes' | 'tipo' | 'valor' | 'observacao'>, date?: string) => ItemDaMensalidade
  onCancelar: () => void
  onGravar: (i: ItemDaMensalidade[]) => void
}) {
  const { data } = useStore()
  const [date, setDate] = useState(todayISO())
  const [texto, setTexto] = useState(sugestao > 0 ? String(sugestao) : '')
  const valor = lerValor(texto)
  // quem deve: o Pix quita a divida primeiro (dono, 07/11)
  const partes = valor && valor > 0 && date ? dividirPix(data, playerId, mes, valor, date) : []
  const dividido = partes.some((p) => p.mes !== mes)
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row wrap" style={{ gap: 6 }}>
        {[80, 180, 25].map((v) => (
          <button key={v} className={`chip ${valor === v ? 'on' : ''}`} onClick={() => setTexto(String(v))}>{formatarReais(v)}</button>
        ))}
      </div>
      <div className="row" style={{ gap: 8 }}>
        <label className="field grow">
          <span>Valor</span>
          <input className="input" inputMode="decimal" value={texto} onChange={(e) => setTexto(e.target.value)} />
        </label>
        <label className="field grow">
          <span>Dia do Pix</span>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      {dividido ? (
        <span className="hint aviso">
          Ela deve: {partes.map((p) => `${formatarReais(p.valor ?? 0)} ${p.mes === mes ? `vão para ${monthLabel(mes).toLowerCase()}` : `quitam ${monthLabel(p.mes).toLowerCase()}`}`).join(' · ')}.
        </span>
      ) : (
        <span className="hint">Mensalidade de <strong>{monthLabel(mes)}</strong>.</span>
      )}
      <div className="row" style={{ gap: 8 }}>
        <button className="btn ghost grow" onClick={onCancelar}>Cancelar</button>
        <button className="btn grow" disabled={!valor || valor <= 0 || !date} onClick={() => onGravar(partes.map((p) => novoItem(p, date)))}>
          Salvar Pix
        </button>
      </div>
    </div>
  )
}
