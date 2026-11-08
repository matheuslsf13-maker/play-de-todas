import { useState } from 'react'
import { Modal } from './ui'
import { LIGA } from '../liga'
import { CATEGORIAS, categoriaDe, type Categoria } from '../lib/mensalidade'
import { useStore } from '../lib/store'
import { filaDeEspera, vagasLivres } from '../lib/vagasDeMensalista'
import type { Player } from '../lib/types'

/*
 * 💳 COMO ELA PAGA (dono, 08/11/2026): a categoria da atleta (mensalista, avulsa, convidada, isenta)
 * mudou de "editar perfil" em Meninas para Check-ins › Atletas, junto do dinheiro. Mesma regra de
 * antes: trocar de categoria zera o pagamento atual; mensalistas lotadas → ela continua como esta e
 * entra na lista de espera (aviso antes de salvar).
 */
export function EditarPlanoDaAtleta({ jogadora, onClose, onToast }: { jogadora: Player; onClose: () => void; onToast: (m: string) => void }) {
  const { data, savePlayer, nameOf } = useStore()
  const atual = categoriaDe(jogadora)
  const [categoria, setCategoria] = useState<Categoria>(atual)
  const paraEspera = LIGA.id === 'feminino' && categoria === 'mensalista' && atual !== 'mensalista' && vagasLivres(data) === 0
  const posicao = filaDeEspera(data).findIndex((x) => x.id === jogadora.id)
  const mudou = !paraEspera && categoria !== atual

  function salvar() {
    savePlayer({
      ...jogadora,
      categoria: paraEspera ? atual : categoria,
      ...(paraEspera ? { espera_mensalista: jogadora.espera_mensalista ?? new Date().toISOString() } : {}),
      // virou mensalista (havia vaga): sai da espera
      ...(categoria === 'mensalista' && !paraEspera ? { espera_mensalista: null } : {}),
      pago_mes: mudou ? null : jogadora.pago_mes,
      pago_avulso: mudou ? false : jogadora.pago_avulso,
    })
    onToast(
      paraEspera
        ? `${nameOf(jogadora.id)} entrou na lista de espera`
        : mudou
          ? `${nameOf(jogadora.id)}: ${CATEGORIAS.find((c) => c.valor === categoria)?.rotulo}`
          : 'Nada mudou',
    )
    onClose()
  }

  return (
    <Modal title={`Como ${nameOf(jogadora.id)} paga`} onClose={onClose}>
      <div className="plano-opcoes">
        {CATEGORIAS.map((c) => (
          <button key={c.valor} className={`plano-opcao ${categoria === c.valor ? 'on' : ''}`} onClick={() => setCategoria(c.valor)}>
            {c.rotulo}
          </button>
        ))}
      </div>
      <p className="tiny muted" style={{ marginTop: 10 }}>
        {CATEGORIAS.find((c) => c.valor === categoria)?.explica}
        {mudou && ' — trocar de categoria zera o pagamento atual.'}
      </p>
      {paraEspera && (
        <div className="banner warn" style={{ marginTop: 8 }}>
          ⏳ O limite de mensalistas está cheio. Ao salvar, ela continua {atual} e vai para a lista de espera
          {posicao >= 0 ? ` (já é a ${posicao + 1}ª)` : ` (${filaDeEspera(data).length + 1}ª)`}.
        </div>
      )}
      <button className="btn pink block" style={{ marginTop: 14 }} onClick={salvar}>
        {paraEspera ? 'Entrar na lista de espera' : 'Salvar'}
      </button>
    </Modal>
  )
}
