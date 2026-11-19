import { formatarReais } from '../lib/checkins'
import { useMemo, useState, type CSSProperties } from 'react'
import CampoDeBusca from './CampoDeBusca'
import { Avatar, Empty } from './ui'
import { mensalidadeDeHoje, resumoDaMensalidade } from './FichaDaMensalidade'
import { categoriaDe } from '../lib/mensalidade'
import { alertaDosCheckins, comecaNoMesSeguinte, dividaDaMensalidade, fichaDe, marcasDaMensalista, proximoMes, textoDoAlerta, type alertasDosCheckins, type MarcaDaMensalista } from '../lib/fichaDaMensalidade'
import { geridaNaAbaMensalistas } from '../lib/vagasDeMensalista'
import { normalizar } from '../lib/roster'
import { useStore } from '../lib/store'
import { monthLabel, todayISO } from '../lib/types'

/*
 * 📅 ABA MENSALISTAS (dono, 08/11/2026): toda atleta cadastrada como mensalista numa lista so,
 * com filtro pela situacao do pagamento e a linha inteira tocavel (celular) que abre a ficha.
 */

type Marca = MarcaDaMensalista | 'ex' | 'alerta'
type Filtro = 'todas' | Marca

const FILTROS: { id: Filtro; rotulo: string }[] = [
  { id: 'todas', rotulo: 'Todas' },
  { id: 'alerta', rotulo: '⚠️ Check-in apertado' },
  { id: 'sem-pagamento', rotulo: '⚠️ Sem pagamento' },
  { id: 'deve', rotulo: '🔴 Devendo' },
  { id: 'ex', rotulo: '↩️ Ex-mensalistas' },
  { id: 'falta', rotulo: '⏳ Falta completar' },
  { id: 'parcial', rotulo: '🎟️ 80 + check-ins' },
  { id: 'integral', rotulo: '💵 Pix integral' },
  { id: 'quitada', rotulo: '✅ Quitadas' },
]

/** O que a administradora precisa ver primeiro: quem deve, quem nao pagou, quem falta completar. */
const PRIORIDADE: Record<Marca, number> = { alerta: -1, deve: 0, ex: 1, 'sem-pagamento': 2, falta: 3, parcial: 4, integral: 5, quitada: 6 }
const prioridadeDe = (marcas: Marca[]) => Math.min(7, ...marcas.map((m) => PRIORIDADE[m]))

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
        .filter((p) => geridaNaAbaMensalistas(data, p, hoje))
        .map((p) => {
          const devendoAntes = dividaDaMensalidade(data, p.id, hoje).porMes.filter((x) => x.mes < mes).reduce((t, x) => t + x.falta, 0)
          const ex = categoriaDe(p) !== 'mensalista'
          // pagou so o mes seguinte (virou mensalista depois do dia 5): a linha mostra a ficha dele, nao "sem pagamento"
          const seguinte = !ex && comecaNoMesSeguinte(data, p, hoje) ? proximoMes(mes) : null
          const ficha = fichaDe(data, p.id, seguinte ?? mes)
          const base = resumoDaMensalidade(ficha, hoje, devendoAntes)
          const resumo = ex
            ? { ...base, texto: `ex-mensalista · ${base.texto}` }
            : seguinte ? { ...base, texto: `a partir de ${monthLabel(seguinte).split(' ')[0].toLowerCase()} · ${base.texto}` } : base
          // check-ins faltando x dias ate o prazo: vai para o topo, com o porque (dono, 18/11)
          const alerta = ex ? null : alertaDosCheckins(data, p.id, hoje)
          const marcas = (ex ? [...(devendoAntes > 0 ? ['deve'] : []), 'ex'] : marcasDaMensalista(ficha, devendoAntes)) as Marca[]
          return { p, marcas: alerta ? (['alerta', ...marcas] as Marca[]) : marcas, resumo, alerta }
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
      <CampoDeBusca valor={busca} onMudar={setBusca} placeholder="Buscar pelo nome ou apelido" style={{ marginBottom: 10 }} />
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
          {visiveis.map(({ p, resumo, alerta }) => (
            <button key={p.id} className="mensalista-linha" onClick={() => onAbrir(p.id)}>
              <Avatar player={p} size={40} />
              <span className="mensalista-texto">
                <strong>{nameOf(p.id)}</strong>
                <span className="mensalista-estado" style={{ '--cor': resumo.cor } as CSSProperties}>{resumo.texto}</span>
                {alerta && <span className="tiny alerta-checkin">⚠️ {textoDoAlerta(alerta)} ({monthLabel(alerta.mes).split(' ')[0].toLowerCase()})</span>}
              </span>
              <span className="seta" aria-hidden>›</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * ⚠️ O ALERTA DOS CHECK-INS (dono, 18/11): no topo da aba Mensalistas e da primeira tela do Financeiro,
 * quem tem mais check-ins faltando do que dias ate o prazo (um check-in por dia). Toque abre a ficha.
 */
export function AlertasDeCheckin({ alertas, onAbrir }: { alertas: ReturnType<typeof alertasDosCheckins>; onAbrir: (playerId: string) => void }) {
  const { nameOf } = useStore()
  if (alertas.length === 0) return null
  return (
    <div className="card alerta-card" role="alert">
      <div className="section-title" style={{ marginBottom: 4 }}><span className="alerta-vivo" aria-hidden>⚠️</span> Check-ins apertados</div>
      <div className="tiny muted" style={{ marginBottom: 8 }}>Um check-in por dia por conta: dá para usar outra conta, mas vale avisar.</div>
      <div className="lista-mensalistas">
        {alertas.map((a) => (
          <button key={a.player.id} className="mensalista-linha" onClick={() => onAbrir(a.player.id)}>
            <Avatar player={a.player} size={36} />
            <span className="mensalista-texto">
              <strong>{nameOf(a.player.id)}</strong>
              <span className="tiny alerta-checkin"><span className="alerta-vivo" aria-hidden>⚠️</span> {textoDoAlerta(a)} da mensalidade de {monthLabel(a.mes).split(' ')[0].toLowerCase()} (se não fizer, vira dívida de {formatarReais(a.falta)})</span>
            </span>
            <span className="seta" aria-hidden>›</span>
          </button>
        ))}
      </div>
    </div>
  )
}
