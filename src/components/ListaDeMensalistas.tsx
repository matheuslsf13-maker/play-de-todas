import { useMemo, useState } from 'react'
import { Avatar, Empty } from './ui'
import { mensalidadeDeHoje, resumoDaMensalidade } from './FichaDaMensalidade'
import { categoriaDe } from '../lib/mensalidade'
import { dividaDaMensalidade, fichaDe, marcasDaMensalista, type MarcaDaMensalista } from '../lib/fichaDaMensalidade'
import { normalizar } from '../lib/roster'
import { useStore } from '../lib/store'
import { monthLabel, todayISO } from '../lib/types'

/*
 * 📅 ABA MENSALISTAS (dono, 08/11/2026): toda atleta cadastrada como mensalista numa lista so,
 * com filtro pela situacao do pagamento e a linha inteira tocavel (celular) que abre a ficha.
 */

type Filtro = 'todas' | MarcaDaMensalista

const FILTROS: { id: Filtro; rotulo: string }[] = [
  { id: 'todas', rotulo: 'Todas' },
  { id: 'sem-pagamento', rotulo: '⚠️ Sem pagamento' },
  { id: 'deve', rotulo: '🔴 Devendo' },
  { id: 'falta', rotulo: '⏳ Falta completar' },
  { id: 'parcial', rotulo: '🎟️ 80 + check-ins' },
  { id: 'integral', rotulo: '💵 Pix integral' },
  { id: 'quitada', rotulo: '✅ Quitadas' },
]

/** O que a administradora precisa ver primeiro: quem deve, quem nao pagou, quem falta completar. */
const PRIORIDADE: Record<MarcaDaMensalista, number> = { deve: 0, 'sem-pagamento': 1, falta: 2, parcial: 3, integral: 4, quitada: 5 }
const prioridadeDe = (marcas: MarcaDaMensalista[]) => Math.min(6, ...marcas.map((m) => PRIORIDADE[m]))

export function ListaDeMensalistas({ onAbrir }: { onAbrir: (playerId: string) => void }) {
  const { data, nameOf } = useStore()
  const hoje = todayISO()
  const mes = mensalidadeDeHoje(hoje)
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [busca, setBusca] = useState('')
  const termo = normalizar(busca)

  const linhas = useMemo(
    () =>
      data.players
        .filter((p) => p.active && categoriaDe(p) === 'mensalista')
        .map((p) => {
          const devendoAntes = dividaDaMensalidade(data, p.id, hoje).porMes.filter((x) => x.mes < mes).reduce((t, x) => t + x.falta, 0)
          const ficha = fichaDe(data, p.id, mes)
          return { p, marcas: marcasDaMensalista(ficha, devendoAntes), resumo: resumoDaMensalidade(ficha, hoje, devendoAntes) }
        })
        .sort((a, b) => prioridadeDe(a.marcas) - prioridadeDe(b.marcas) || nameOf(a.p.id).localeCompare(nameOf(b.p.id), 'pt-BR')),
    [data, hoje, mes, nameOf],
  )

  const contar = (f: Filtro) => (f === 'todas' ? linhas.length : linhas.filter((l) => l.marcas.includes(f)).length)
  const visiveis = linhas.filter(
    (l) =>
      (filtro === 'todas' || l.marcas.includes(filtro)) &&
      (!termo || normalizar(l.p.name).includes(termo) || normalizar(l.p.nickname ?? '').includes(termo)),
  )

  return (
    <div className="card">
      <div className="section-title" style={{ marginBottom: 4 }}>📅 Mensalidade de {monthLabel(mes)}</div>
      <div className="tiny muted" style={{ marginBottom: 10 }}>
        {linhas.length === 0 ? 'Nenhuma mensalista ativa.' : 'Toque numa mensalista para abrir a ficha: Pix, check-ins e histórico.'}
      </div>
      <input
        className="input"
        type="search"
        placeholder="Buscar pelo nome ou apelido"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        style={{ marginBottom: 10 }}
      />
      <div className="chips-scroll" style={{ paddingInline: 0, marginBottom: 12 }}>
        {FILTROS.map((f) => (
          <button key={f.id} className={`chip ${filtro === f.id ? 'on' : ''}`} onClick={() => setFiltro(f.id)}>
            {f.rotulo} <strong>{contar(f.id)}</strong>
          </button>
        ))}
      </div>
      {visiveis.length === 0 ? (
        <Empty icon="📅">{linhas.length === 0 ? 'As atletas cadastradas como mensalista aparecem aqui sozinhas.' : 'Ninguém neste filtro.'}</Empty>
      ) : (
        <div className="lista-mensalistas">
          {visiveis.map(({ p, resumo }) => (
            <button key={p.id} className="mensalista-linha" onClick={() => onAbrir(p.id)}>
              <Avatar player={p} size={40} />
              <span className="mensalista-texto">
                <strong>{nameOf(p.id)}</strong>
                <span className="tiny" style={{ color: resumo.cor, fontWeight: 700 }}>{resumo.texto}</span>
              </span>
              <span className="seta" aria-hidden>›</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
