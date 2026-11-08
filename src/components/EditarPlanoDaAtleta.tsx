import { useState } from 'react'
import { Modal } from './ui'
import { LIGA } from '../liga'
import { formatarReais } from '../lib/checkins'
import { CATEGORIAS, categoriaDe, type Categoria } from '../lib/mensalidade'
import { useStore } from '../lib/store'
import { cabeMensalista, consequenciasDeSair, filaDeEspera, limiteDeMensalistas, mensalistasAtivas } from '../lib/vagasDeMensalista'
import { todayISO, type Player } from '../lib/types'

/*
 * 💳 COMO ELA PAGA (dono, 08/11/2026): a categoria da atleta (mensalista, avulsa, convidada, isenta) fica em
 * Financeiro › Atletas, junto do dinheiro. Abre com o modo atual marcado.
 *  - Tirar de mensalista avisa o que acontece (vaga livre, divida/credito na ficha, proxima da fila) e NAO entra
 *    na fila sozinha: o interruptor "interesse em ser mensalista" comeca desligado.
 *  - Com o limite cheio, o quadrado Mensalista fica trancado (🔒) e o interruptor coloca na lista de espera.
 *  - Com vaga, basta marcar Mensalista; ao salvar abre a ficha para registrar o Pix da mensalidade.
 * Trocar de categoria zera o pagamento atual (pago_mes / pago_avulso).
 */
export function EditarPlanoDaAtleta({
  jogadora,
  onClose,
  onToast,
  onAbrirFicha,
}: {
  jogadora: Player
  onClose: () => void
  onToast: (m: string) => void
  onAbrirFicha?: (playerId: string) => void
}) {
  const { data, savePlayer, nameOf } = useStore()
  const hoje = todayISO()
  const feminino = LIGA.id === 'feminino'
  const atual = categoriaDe(jogadora)
  const [categoria, setCategoria] = useState<Categoria>(atual)
  const [interesse, setInteresse] = useState(feminino && atual !== 'mensalista' && !!jogadora.espera_mensalista)

  const fila = filaDeEspera(data)
  const posicao = fila.findIndex((x) => x.id === jogadora.id)
  const travado = feminino && atual !== 'mensalista' && !cabeMensalista(data, jogadora, hoje)
  const mostraInteresse = feminino && categoria !== 'mensalista'
  const interesseLiberado = mostraInteresse && (travado || atual === 'mensalista')
  const saindo = feminino && atual === 'mensalista' && categoria !== 'mensalista'
  const virando = feminino && atual !== 'mensalista' && categoria === 'mensalista'
  const mudou = categoria !== atual
  const c = saindo ? consequenciasDeSair(data, jogadora, hoje) : null

  function alternarInteresse() {
    if (interesse && posicao >= 0 && !confirm('Tirar da lista de espera? Ela perde a posição.')) return
    setInteresse(!interesse)
  }

  function salvar() {
    const naEspera = feminino && categoria !== 'mensalista' ? (interesse ? jogadora.espera_mensalista ?? new Date().toISOString() : null) : null
    savePlayer({
      ...jogadora,
      categoria,
      espera_mensalista: feminino ? naEspera : jogadora.espera_mensalista ?? null,
      pago_mes: mudou ? null : jogadora.pago_mes,
      pago_avulso: mudou ? false : jogadora.pago_avulso,
    })
    const nome = nameOf(jogadora.id)
    onToast(
      saindo
        ? `${nome} saiu das mensalistas`
        : virando
          ? `${nome} agora é mensalista`
          : mudou
            ? `${nome}: ${CATEGORIAS.find((x) => x.valor === categoria)?.rotulo}`
            : interesse !== !!jogadora.espera_mensalista
              ? interesse ? `${nome} entrou na lista de espera` : `${nome} saiu da lista de espera`
              : 'Nada mudou',
    )
    onClose()
    if (virando) onAbrirFicha?.(jogadora.id)
  }

  return (
    <Modal title={`Como ${nameOf(jogadora.id)} paga`} onClose={onClose}>
      <div className="plano-opcoes">
        {CATEGORIAS.map((o) => {
          const trancada = o.valor === 'mensalista' && travado
          return (
            <button
              key={o.valor}
              className={`plano-opcao ${categoria === o.valor ? 'on' : ''} ${trancada ? 'travada' : ''}`}
              aria-disabled={trancada}
              onClick={() => !trancada && setCategoria(o.valor)}
            >
              {o.rotulo}
              {o.valor === atual && <small>atual</small>}
              {trancada && <small>🔒 cheio {mensalistasAtivas(data, hoje).length}/{limiteDeMensalistas(data)}</small>}
            </button>
          )
        })}
      </div>
      <p className="tiny muted" style={{ marginTop: 10 }}>
        {CATEGORIAS.find((o) => o.valor === categoria)?.explica}
        {mudou && !saindo && ' — trocar de categoria zera o pagamento atual.'}
      </p>

      {mostraInteresse && (
        <button
          role="switch"
          aria-checked={interesse}
          disabled={!interesseLiberado}
          className={`interruptor ${interesse ? 'on' : ''}`}
          onClick={alternarInteresse}
        >
          <span className="trilho"><span className="bolinha" /></span>
          <span className="interruptor-texto">
            <strong>Tenho interesse em ser mensalista</strong>
            <span className="tiny muted">
              {interesse
                ? posicao >= 0 ? `Na lista de espera: ela é a ${posicao + 1}ª.` : `Entra na lista de espera (${fila.length + 1}ª).`
                : interesseLiberado ? 'Desligado: não entra na lista de espera.' : 'Há vaga: é só marcar Mensalista.'}
            </span>
          </span>
        </button>
      )}

      {saindo && c && (
        <div className="banner warn" style={{ marginTop: 10 }}>
          ⚠️ Ela deixa de ser mensalista e a vaga fica livre
          {c.proxima ? ` (a próxima da lista de espera é ${nameOf(c.proxima.id)})` : ''}. Em listas de presença abertas, deixa de ser garantida.
          {c.divida > 0 && <><br />💸 Deve {formatarReais(c.divida)} da mensalidade: continua na ficha (Financeiro › Mensalistas).</>}
          {c.credito > 0 && <><br />🎟️ Tem {formatarReais(c.credito)} de crédito da mensalidade, que continua na ficha.</>}
        </div>
      )}
      {virando && (
        <div className="banner info" style={{ marginTop: 10 }}>
          📅 Ao salvar, abrimos a ficha para registrar o Pix da mensalidade. Sem Pix depois do dia 5, ela conta como “não renovou”.
        </div>
      )}

      <button className={`btn ${saindo ? 'danger' : 'pink'} block`} style={{ marginTop: 14 }} onClick={salvar}>
        {saindo ? 'Tirar das mensalistas' : virando ? 'Virar mensalista' : 'Salvar'}
      </button>
    </Modal>
  )
}
