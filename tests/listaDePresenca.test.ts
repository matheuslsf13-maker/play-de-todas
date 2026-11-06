import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ativosEmOrdem,
  avisosAoApagar,
  podeApagar,
  copiaDaApagada,
  copiaValida,
  previaDosNomes,
  juntarSemRepetir,
  VALIDADE_DA_COPIA_MS,
  dividir,
  estaAberta,
  horasAntesDoPlay,
  inicioEmSaoPaulo,
  dataDoPlay,
  horaDoPlay,
  mensagemDeAtualizacao,
  mensagemDoLink,
  novoCodigo,
  ordemParaGarantir,
  padraoDaLista,
  paraMontar,
  preIncluidas,
  problemaDaLista,
  quando,
  quandoComData,
  resumoDoCartao,
  textoDaPosicao,
  urlDaLista,
  validarNome,
  validarNomeDaAtleta,
  vinculoAutomatico,
  ehMensalista,
  sugestaoDeVinculo,
  sugestaoSegura,
  AVISO_DE_SAIDA,
  AVISO_DAS_MENSALISTAS,
  type Lista,
  type NomeNaLista,
} from '../src/lib/listaDePresenca'
import { mensalistaEmDiaNoPlay } from '../src/lib/mensalidade'
import { emptyData, type Match, type Player, type PlaySession } from '../src/lib/types'

/*
 * LISTA DE PRESENCA POR LINK: as regras puras. A ordem, o prazo e as
 * checagens de verdade sao do banco (supabase/31); aqui ficam a divisao entre
 * confirmadas e suplentes, os textos e o que o modo local repete.
 */

const LISTA: Lista = {
  id: 'L', codigo: 'k7m2p9qx4t', titulo: 'Play de Todas',
  play_em: '2026-11-09T23:00:00.000Z', // seg 09/11 20h em Sao Paulo
  fecha_em: '2026-11-08T21:00:00.000Z', // dom 08/11 18h
  vagas: 16, texto: null, fechada: false, session_id: null, created_at: '2026-11-06T12:00:00.000Z',
}

function nome(i: number, extra: Partial<NomeNaLista> = {}): NomeNaLista {
  return {
    id: `n${i}`, lista_id: 'L', nome: `Atleta ${i}`, player_id: null, chegada: i, ordem: null,
    origem: 'link', garantida: false, entrou_em: '2026-11-06T12:00:00.000Z', saiu_em: null, saiu_por: null,
    avisou_24h: null, ...extra,
  }
}

function jogadora(id: string, extra: Partial<Player> = {}): Player {
  return { id, name: id, photo_url: null, active: true, created_at: '', ...extra }
}

test('dividir: 18 ativas com 16 vagas = 16 confirmadas e 2 suplentes, na ordem de chegada', () => {
  const nomes = Array.from({ length: 18 }, (_, i) => nome(18 - i)) // chegam fora de ordem no array
  const { titulares, suplentes } = dividir(LISTA, nomes)
  assert.equal(titulares.length, 16)
  assert.deepEqual(suplentes.map((n) => n.id), ['n17', 'n18'])
  assert.equal(titulares[0].id, 'n1')
})

test('dividir: saiu uma confirmada, a 1a suplente sobe sozinha', () => {
  const nomes = Array.from({ length: 18 }, (_, i) => nome(i + 1))
  nomes[3] = { ...nomes[3], saiu_em: '2026-11-07T10:00:00.000Z', saiu_por: 'atleta' }
  const { titulares, suplentes } = dividir(LISTA, nomes)
  assert.equal(titulares.length, 16)
  assert.ok(titulares.some((n) => n.id === 'n17'), 'a n17 era suplente e subiu')
  assert.deepEqual(suplentes.map((n) => n.id), ['n18'])
})

test('ordem: a ordem mexida pela organizadora passa na frente da chegada', () => {
  const nomes = [nome(1), nome(2), nome(3, { ordem: 1.5 }), nome(4, { ordem: 0.5 })]
  assert.deepEqual(ativosEmOrdem(nomes).map((n) => n.id), ['n4', 'n1', 'n3', 'n2'])
})

test('estaAberta: fechada na mao ou depois do prazo, nao aceita', () => {
  assert.equal(estaAberta(LISTA, new Date('2026-11-08T20:59:59Z')), true)
  assert.equal(estaAberta(LISTA, new Date('2026-11-08T21:00:00Z')), false)
  assert.equal(estaAberta({ ...LISTA, fechada: true }, new Date('2026-11-07T00:00:00Z')), false)
})

test('horas em Sao Paulo, sem depender do fuso da maquina', () => {
  assert.equal(quando(LISTA.play_em), 'seg 20h')
  assert.equal(quando('2026-11-09T23:30:00.000Z'), 'seg 20h30')
  assert.equal(quandoComData(LISTA.play_em), 'seg 09/11 às 20h')
  assert.equal(quandoComData(LISTA.fecha_em), 'dom 08/11 às 18h')
  assert.equal(dataDoPlay(LISTA), '2026-11-09')
  assert.equal(horaDoPlay(LISTA.play_em), '20:00')
  assert.equal(inicioEmSaoPaulo('2026-11-10', '20:00'), '2026-11-10T23:00:00.000Z')
  // 22h em Sao Paulo ja e o dia seguinte em UTC
  assert.equal(inicioEmSaoPaulo('2026-11-10', '22:00'), '2026-11-11T01:00:00.000Z')
  assert.equal(quando(inicioEmSaoPaulo('2026-11-10', '22:00')), 'ter 22h')
})

test('resumo do cartao: com vagas, cheia com suplentes, lotada, e os singulares', () => {
  const com = (n: number) => Array.from({ length: n }, (_, i) => nome(i + 1))
  const agora = new Date('2026-11-07T12:00:00Z')
  assert.equal(resumoDoCartao(LISTA, com(14), agora), 'Lista aberta · seg 20h · 14/16 · 2 vagas · fecha dom 18h')
  assert.equal(resumoDoCartao(LISTA, com(15), agora), 'Lista aberta · seg 20h · 15/16 · 1 vaga · fecha dom 18h')
  assert.equal(resumoDoCartao(LISTA, com(19), agora), 'Lista aberta · seg 20h · 16/16 · 3 suplentes · fecha dom 18h')
  assert.equal(resumoDoCartao(LISTA, com(17), agora), 'Lista aberta · seg 20h · 16/16 · 1 suplente · fecha dom 18h')
  assert.equal(resumoDoCartao(LISTA, com(16), agora), 'Lista aberta · seg 20h · 16/16 · lotada · fecha dom 18h')
  assert.match(resumoDoCartao({ ...LISTA, fechada: true }, com(3), agora), /^Lista fechada · seg 20h · 3\/16/)
})

test('posicao: confirmada ate as vagas, depois suplente contando de 1', () => {
  assert.equal(textoDaPosicao(15, 16), 'Você é a 15ª — confirmada')
  assert.equal(textoDaPosicao(16, 16), 'Você é a 16ª — confirmada')
  assert.equal(textoDaPosicao(18, 16), 'Você é a 2ª suplente')
})

test('validarNome: a mesma regra do banco', () => {
  assert.deepEqual(validarNome('  Ana   Lúcia D\'Ávila '), { nome: "Ana Lúcia D'Ávila" })
  assert.deepEqual(validarNome('Ana D’Ávila'), { nome: "Ana D'Ávila" }, 'apostrofo do iPhone vira o reto')
  assert.deepEqual(validarNome('Maria-Clara'), { nome: 'Maria-Clara' })
  assert.deepEqual(validarNome('Ana M.'), { nome: 'Ana M.' })
  // acento digitado em duas partes (a + acento combinante) vira uma letra so
  assert.deepEqual(validarNome('José'), { nome: 'José' })
  for (const ruim of ['ab', 'a'.repeat(61), '<b>x</b>', '1234', '-Ana', 'Ana 2']) {
    assert.ok('erro' in validarNome(ruim), `recusa ${JSON.stringify(ruim)}`)
  }
})

test('vinculoAutomatico: nome, apelido ou grafia de UM cadastro so, com 2+ palavras', () => {
  const ps = [
    jogadora('a', { name: 'Ana Lúcia Pretti', nickname: 'Aninha', aliases: ['Ana Pretti'] }),
    jogadora('b1', { name: 'Bruna Souza', nickname: 'Bruna' }),
    jogadora('b2', { name: 'Bruna Lima', aliases: ['Bruna'] }),
  ]
  assert.equal(vinculoAutomatico('ana lucia  PRETTI', ps), 'a')
  assert.equal(vinculoAutomatico('Aninha', ps), null, 'uma palavra so nao vincula (outra Aninha seria barrada)')
  assert.equal(vinculoAutomatico('Ána Prétti', ps), 'a')
  assert.equal(vinculoAutomatico('Bruna', ps), null, 'as duas Bruna nao vinculam sozinhas')
  assert.equal(vinculoAutomatico('Bruna Souza', ps), 'b1')
  assert.equal(vinculoAutomatico('Ana', ps), null, 'parcial nao vincula')
  // a outra Pamela nao cai no cadastro da Pamella (alias "Pamela") e nem e recusada
  const pam = [jogadora('pa', { name: 'Pamela Alves' }), jogadora('pc', { name: 'Pamella Capelanes', aliases: ['Pamela'] })]
  assert.equal(vinculoAutomatico('Pamela', pam), null)
  assert.equal(vinculoAutomatico('Pamela Alves', pam), 'pa')
})

test('ehMensalista: pre-incluida ou em dia para o play; quem nao renovou entrou como avulsa', () => {
  const ps = [
    jogadora('emdia', { categoria: 'mensalista', pago_mes: '2026-11' }),
    jogadora('atrasada', { categoria: 'mensalista', pago_mes: '2026-10' }),
  ]
  assert.equal(ehMensalista(nome(1, { player_id: 'emdia' }), ps, '2026-11-09'), true)
  assert.equal(ehMensalista(nome(2, { player_id: 'atrasada' }), ps, '2026-11-09'), false, 'pagou so ate outubro: avulsa')
  assert.equal(ehMensalista(nome(3, { player_id: 'atrasada' }), ps, '2026-12-01'), false)
  assert.equal(ehMensalista(nome(4, { origem: 'mensalista' }), ps, '2026-11-09'), true)
  assert.equal(ehMensalista(nome(5), ps, '2026-11-09'), false, 'sem cadastro')
})

test('mensalistaEmDiaNoPlay: pago no mes, ou ate o dia 5 com o mes anterior pago', () => {
  const m = (pago_mes: string | null, categoria = 'mensalista') => jogadora('x', { categoria, pago_mes })
  assert.equal(mensalistaEmDiaNoPlay(m('2026-11'), '2026-11-09'), true)
  assert.equal(mensalistaEmDiaNoPlay(m('2026-12'), '2026-11-09'), true, 'pago adiantado')
  assert.equal(mensalistaEmDiaNoPlay(m('2026-10'), '2026-11-03'), true, 'dia 3, ainda no prazo')
  assert.equal(mensalistaEmDiaNoPlay(m('2026-10'), '2026-11-05'), true, 'dia 5, ainda no prazo')
  assert.equal(mensalistaEmDiaNoPlay(m('2026-10'), '2026-11-06'), false, 'dia 6, passou o prazo')
  assert.equal(mensalistaEmDiaNoPlay(m('2026-09'), '2026-11-03'), false, 'dois meses atras')
  assert.equal(mensalistaEmDiaNoPlay(m('2025-12'), '2026-01-02'), true, 'virada do ano')
  assert.equal(mensalistaEmDiaNoPlay(m(null), '2026-11-02'), false)
  assert.equal(mensalistaEmDiaNoPlay(m('2026-11', 'avulsa'), '2026-11-09'), false)
})

test('preIncluidas: mensalistas em dia, ativas e sem pausa, da mais forte para a mais fraca', () => {
  const d = emptyData()
  d.players = [
    jogadora('fraca', { name: 'Zélia', pago_mes: '2026-11', forca_inicial: 1440 }),
    jogadora('forte', { name: 'Ana', pago_mes: '2026-11', forca_inicial: 1560 }),
    jogadora('media', { name: 'Bia', pago_mes: '2026-11', forca_inicial: 1500 }),
    jogadora('inativa', { pago_mes: '2026-11', active: false }),
    jogadora('pausada', { pago_mes: '2026-11', pausas: [{ de: '2026-11-01', ate: null }] }),
    jogadora('devendo', { pago_mes: '2026-09' }),
    jogadora('avulsa', { categoria: 'avulsa', pago_avulso: true }),
  ]
  assert.deepEqual(preIncluidas(d, '2026-11-09'), ['forte', 'media', 'fraca'])
})

test('preIncluidas: empate na forca fica pelo nome', () => {
  const d = emptyData()
  d.players = [jogadora('z', { name: 'Zuleica', pago_mes: '2026-11' }), jogadora('a', { name: 'Amanda', pago_mes: '2026-11' })]
  // um play qualquer, so para a forca existir
  const s: PlaySession = { id: 's', date: '2026-10-01', title: '', courts: 1, rounds: 0, target: 4, player_ids: [], status: 'finished', created_at: '', format: 'todas' }
  d.sessions = [s]
  d.matches = [] as Match[]
  assert.deepEqual(preIncluidas(d, '2026-11-09'), ['a', 'z'])
})

test('ordemParaGarantir: logo depois da ultima garantida', () => {
  const nomes = [
    nome(1, { ordem: 1, garantida: true, origem: 'mensalista' }),
    nome(2, { ordem: 2, garantida: true, origem: 'mensalista' }),
    nome(10), nome(11), nome(12, { origem: 'organizadora' }),
  ]
  const k = ordemParaGarantir(nomes)
  assert.ok(k > 2 && k < 10)
  const depois = ativosEmOrdem(nomes.map((n) => (n.id === 'n12' ? { ...n, ordem: k, garantida: true } : n)))
  assert.deepEqual(depois.map((n) => n.id), ['n1', 'n2', 'n12', 'n10', 'n11'])
  // sem nenhuma garantida: vai para a frente de todas
  assert.ok(ordemParaGarantir([nome(5), nome(6)]) < 5)
})

test('horasAntesDoPlay arredonda para baixo', () => {
  assert.equal(horasAntesDoPlay('2026-11-08T22:30:00.000Z', LISTA.play_em), 24)
  assert.equal(horasAntesDoPlay('2026-11-08T23:30:00.000Z', LISTA.play_em), 23)
})

test('codigo do link: 10 letras sem as que confundem, nunca repetido', () => {
  const vistos = new Set<string>()
  for (let i = 0; i < 200; i++) {
    const c = novoCodigo()
    assert.match(c, /^[abcdefghjkmnpqrstuvwxyz23456789]{10}$/)
    vistos.add(c)
  }
  assert.equal(vistos.size, 200)
  assert.equal(urlDaLista('https://playdetodas.com.br/', 'abc'), 'https://playdetodas.com.br/?lista=abc')
})

test('padraoDaLista: proxima segunda 20h, fecha no domingo 18h, 16 vagas', () => {
  // sexta 06/11
  assert.deepEqual(padraoDaLista('2026-11-06'), { data: '2026-11-09', hora: '20:00', fechaData: '2026-11-08', fechaHora: '18:00', vagas: 16 })
  // segunda: a da semana que vem
  assert.equal(padraoDaLista('2026-11-09').data, '2026-11-16')
})

test('problemaDaLista: prazo antes do play e no futuro', () => {
  const agora = new Date('2026-11-07T12:00:00Z')
  assert.equal(problemaDaLista(LISTA, agora), null)
  assert.ok(problemaDaLista({ ...LISTA, fecha_em: '2026-11-10T00:00:00.000Z' }, agora))
  assert.ok(problemaDaLista({ ...LISTA, fecha_em: '2026-11-07T11:00:00.000Z' }, agora))
  assert.ok(problemaDaLista({ ...LISTA, vagas: 0 }, agora))
  assert.ok(problemaDaLista({ ...LISTA, titulo: '  ' }, agora))
})

test('paraMontar: so as confirmadas; as sem vinculo travam', () => {
  const nomes = [nome(1, { player_id: 'a' }), nome(2), nome(3, { player_id: 'c' })]
  const r = paraMontar({ ...LISTA, vagas: 2 }, nomes)
  assert.deepEqual(r.ids, ['a'])
  assert.deepEqual(r.semVinculo.map((n) => n.id), ['n2'])
})

test('mensagem do link: data, prazo, vagas, texto, link e os dois avisos exatos', () => {
  const url = urlDaLista('https://playdetodas.com.br/', LISTA.codigo)
  const msg = mensagemDoLink({ ...LISTA, texto: 'Traga água!' }, url)
  assert.match(msg, /seg 09\/11 às 20h/)
  assert.match(msg, /dom 08\/11 às 18h/)
  assert.match(msg, /16 vagas/)
  assert.match(msg, /Traga água!/)
  assert.ok(msg.includes(url))
  assert.ok(msg.includes(AVISO_DE_SAIDA))
  assert.ok(msg.includes(AVISO_DAS_MENSALISTAS))
  assert.equal(AVISO_DE_SAIDA, 'Não mensalistas: para sair, abra o mesmo link e toque em Tirar meu nome. Mensalistas: avisem a organização.')
  assert.equal(AVISO_DAS_MENSALISTAS, 'Mensalistas não precisam colocar o nome: já estão na lista. Abram o link só para conferir; se o seu nome não estiver, fale com a organização.')
})

test('mensagem de atualizacao: confirmadas numeradas com 📅, suplentes, o mesmo link e os avisos', () => {
  const url = urlDaLista('https://playdetodas.com.br/', LISTA.codigo)
  const nomes = [
    nome(1, { player_id: 'a', origem: 'mensalista', ordem: 1, garantida: true }),
    nome(2, { nome: 'fulana de tal' }),
    nome(3, { nome: 'Terceira Pessoa' }),
  ]
  const msg = mensagemDeAtualizacao({ ...LISTA, vagas: 2 }, nomes, (id) => (id === 'a' ? 'Aninha' : id), url, new Date('2026-11-07T12:00:00Z'))
  assert.match(msg, /2\/2 · 1 suplente/)
  assert.match(msg, /1\. Aninha 📅\n2\. fulana de tal/)
  assert.match(msg, /Suplentes\*\n1\. Terceira Pessoa/)
  assert.ok(msg.includes(url))
  assert.ok(msg.includes(AVISO_DE_SAIDA))
  assert.ok(msg.includes(AVISO_DAS_MENSALISTAS))
  assert.match(msg, /Lista aberta até dom 08\/11 às 18h/)
  // fechada: o cabecalho nao diz mais "aberta"
  const fechada = mensagemDeAtualizacao({ ...LISTA, vagas: 2, fechada: true }, nomes, (id) => id, url, new Date('2026-11-07T12:00:00Z'))
  assert.ok(!fechada.includes('Lista aberta'))
  assert.match(fechada, /📋 Lista fechada · 2\/2 · 1 suplente/)
  assert.match(fechada, /A lista fechou\. Para conferir:/)
})

test('sugestao para a organizadora: as duas Bruna aparecem e nenhuma ganha o toque unico', () => {
  const ps = [
    jogadora('b1', { name: 'Bruna' }),
    jogadora('b2', { name: 'Bruna Caiban de Castro Menezes', nickname: 'Bruna' }),
    jogadora('c', { name: 'Camila P.' }),
    jogadora('m', { name: 'Maria Paula Morini', nickname: 'Maria Paula', aliases: ['maria'] }),
  ]
  assert.deepEqual(sugestaoDeVinculo('Bruna', ps).map((s) => s.player.id).sort(), ['b1', 'b2'])
  assert.equal(sugestaoSegura('Bruna', ps), undefined)
  assert.equal(sugestaoSegura('Camila Pereira', ps)?.player.id, 'c')
  // so o primeiro nome igual nao basta para o botao de um toque
  assert.equal(sugestaoSegura('Maria Teste Silva', ps), undefined)
  assert.equal(sugestaoDeVinculo('Maria Teste Silva', ps)[0]?.player.id, 'm', 'mas aparece no menu')
})

test('validarNomeDaAtleta: exige nome e sobrenome', () => {
  for (const ok of ['Ana Souza', 'Maria de Souza', "Ana D'Ávila", 'Ana Lúcia', 'Maria-Clara Souza', '  bruna   caiban ']) {
    assert.ok('nome' in validarNomeDaAtleta(ok), `aceita ${JSON.stringify(ok)}`)
  }
  for (const ruim of ['Pamela', 'Tete', 'Ana M.', 'Maria-Clara', 'Ana D', 'ab', '1234']) {
    assert.ok('erro' in validarNomeDaAtleta(ruim), `recusa ${JSON.stringify(ruim)}`)
  }
  assert.deepEqual(validarNome('Tete'), { nome: 'Tete' }, 'a organizadora segue podendo adicionar um nome so')
})

test('apagar: so lista que nao virou play', () => {
  assert.equal(podeApagar(LISTA), true)
  assert.equal(podeApagar({ ...LISTA, session_id: 'S1' }), false)
})

test('apagar: avisos conforme os nomes', () => {
  const LINK = 'O link para de funcionar: quem abrir vai ver “Esta lista não existe mais”.'
  const FIM = 'Não dá para desfazer.'
  assert.deepEqual(avisosAoApagar([]), [LINK, FIM])
  const TRINTA = 'Os nomes ficam guardados neste celular por 30 minutos: se você criar outra lista nesse tempo, dá para trazê-los de volta.'
  assert.deepEqual(avisosAoApagar([nome(1, { origem: 'mensalista' })]), [LINK, 'O nome da lista some junto.', TRINTA, FIM])
  const nomes = [
    nome(1, { origem: 'mensalista' }),
    nome(2),
    nome(3),
    nome(4, { saiu_em: '2026-11-07T12:00:00.000Z', saiu_por: 'atleta' }), // saiu pelo link: nao conta
    nome(5, { origem: 'mensalista', saiu_em: '2026-11-07T12:00:00.000Z', saiu_por: 'organizadora', avisou_24h: false }),
  ]
  assert.deepEqual(avisosAoApagar(nomes), [
    LINK,
    'Os 3 nomes da lista somem junto.',
    '2 colocaram o nome pelo link: avise no grupo que a lista vai ser refeita, com o link novo.',
    TRINTA,
    'Quem saiu e o “avisou com 24h” também somem.',
    FIM,
  ])
  assert.equal(avisosAoApagar([nome(1), nome(2, { origem: 'organizadora' })])[2], '1 colocou o nome pelo link: avise no grupo que a lista vai ser refeita, com o link novo.')
})

test('copia da apagada: ativos na ordem da lista, so o que volta', () => {
  const agora = new Date('2026-11-06T22:00:00.000Z')
  assert.equal(copiaDaApagada(LISTA, [nome(1, { saiu_em: '2026-11-06T13:00:00.000Z' })], agora), null, 'sem ativos nao guarda')
  const c = copiaDaApagada(LISTA, [
    nome(1),
    nome(2, { ordem: 0.5, origem: 'organizadora', garantida: true }),
    nome(3, { saiu_em: '2026-11-06T13:00:00.000Z', player_id: 'p3' }),
    nome(4, { origem: 'mensalista', player_id: 'p4', garantida: true, ordem: 0.2 }),
  ], agora)
  assert.deepEqual(c, {
    apagada_em: '2026-11-06T22:00:00.000Z', titulo: 'Play de Todas', play_em: LISTA.play_em,
    nomes: [
      { nome: 'Atleta 4', player_id: 'p4', origem: 'mensalista', garantida: true },
      { nome: 'Atleta 2', player_id: null, origem: 'organizadora', garantida: true },
      { nome: 'Atleta 1', player_id: null, origem: 'link', garantida: false },
    ],
    sairam: ['p3'],
  })
})

test('copia da apagada: vale por 30 minutos', () => {
  const c = copiaDaApagada(LISTA, [nome(1)], new Date('2026-11-06T22:00:00.000Z'))!
  const depois = (ms: number) => new Date(Date.parse(c.apagada_em) + ms)
  assert.equal(copiaValida(c, depois(0)), true)
  assert.equal(copiaValida(c, depois(VALIDADE_DA_COPIA_MS - 1)), true)
  assert.equal(copiaValida(c, depois(VALIDADE_DA_COPIA_MS)), false, '30 minutos em ponto: vencida')
  assert.equal(copiaValida(c, depois(-60000)), false, 'relogio voltou: nao confia')
  assert.equal(copiaValida(null, depois(0)), false)
  assert.equal(copiaValida({ ...c, nomes: [] }, depois(0)), false)
})

test('copia da apagada: previa dos nomes', () => {
  assert.equal(previaDosNomes([]), '')
  assert.equal(previaDosNomes(['Ana']), 'Ana')
  assert.equal(previaDosNomes(['Ana', 'Bruna']), 'Ana e Bruna')
  assert.equal(previaDosNomes(['Ana', 'Bruna', 'Carla']), 'Ana, Bruna e Carla')
  assert.equal(previaDosNomes(['Ana', 'Bruna', 'Carla', ...Array(9).fill('X')]), 'Ana, Bruna, Carla e mais 9')
})

test('copia da apagada: trazidos primeiro, mensalistas sem repetir', () => {
  const t = (nome: string, player_id: string | null = null) => ({ nome, player_id, origem: 'link' as const, garantida: false })
  const m = (nome: string, player_id: string) => ({ nome, player_id, origem: 'mensalista' as const, garantida: true })
  const trazidos = [t('Ana Souza', 'pa'), t('Bia Lima'), t('Carla Reis')]
  const junta = juntarSemRepetir(trazidos, [m('Ana Souza', 'pa'), m('Bia Lima', 'pb'), m('Dani Prado', 'pd'), m('CARLA  réis', 'pc')])
  assert.deepEqual(junta.map((x) => x.nome), ['Dani Prado', 'Ana Souza', 'Bia Lima', 'Carla Reis'], 'mesmo cadastro ou mesmo nome nao repete; sem garantida, na frente')
  assert.deepEqual(juntarSemRepetir(trazidos, []), trazidos)
  // lista de 4 vagas: a mensalista nova nao pode virar suplente atras de quem veio pelo link
  const g = (nome: string, player_id: string) => ({ ...m(nome, player_id), origem: 'organizadora' as const })
  const comGarantidas = [g('Ana Souza', 'pa'), g('Bia Lima', 'pb'), t('Cris'), t('Duda'), t('Eva')]
  assert.deepEqual(
    juntarSemRepetir(comGarantidas, [m('Xuxa Mensal', 'px'), m('Mara Nova', 'pm')], ['px']).map((x) => x.nome),
    ['Ana Souza', 'Bia Lima', 'Mara Nova', 'Cris', 'Duda', 'Eva'],
    'depois da ultima garantida; quem tinha saido (px) nao volta',
  )
})
