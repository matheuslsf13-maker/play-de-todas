import { mensalistaEmDiaNoPlay } from './mensalidade'
import { normalizar, semelhanca, type Sugestao } from './roster'
import { notaDeForca } from './forca'
import { pausaAberta, ratings } from './stats'
import { plural, type AppData, type Player } from './types'

/**
 * LISTA DE PRESENCA POR LINK (so o Play de Todas; script 31).
 *
 * A organizadora cria a lista e manda o link no grupo; cada atleta, sem login,
 * coloca o nome e recebe a posicao dada pelo BANCO (ordem de chegada no
 * servidor). Confirmada x suplente nao e gravado: sai da posicao entre os
 * nomes ativos e do numero de vagas, aqui. As checagens que importam (prazo,
 * um nome por celular, so tirar o proprio nome) moram nas funcoes do banco;
 * o modo local repete essas regras com as funcoes daqui.
 *
 * Estes tipos nao entram no `AppData`: a lista tem carga e canal de tempo
 * real proprios (`useLista`), para o app da organizadora nao recarregar
 * inteiro a cada nome que chega.
 */

export type Lista = {
  id: string
  /** O que vai no link (?lista=). Nao adivinhavel, mas nao e segredo. */
  codigo: string
  titulo: string
  /** ISO, em UTC. A tela mostra no horario de Sao Paulo. */
  play_em: string
  /** Quando a lista fecha sozinha (relogio do servidor). */
  fecha_em: string
  vagas: number
  texto: string | null
  /** Fechada na mao pela organizadora (ou ao montar o play). */
  fechada: boolean
  /** O play montado a partir dela. */
  session_id: string | null
  created_at: string
}

export type OrigemDoNome = 'link' | 'mensalista' | 'organizadora'

export type NomeNaLista = {
  id: string
  lista_id: string
  /** Como foi digitado (ou o nome do cadastro, para as pre-incluidas). */
  nome: string
  player_id: string | null
  /** Ordem de chegada, dada pelo banco. Nunca muda. */
  chegada: number
  /** Ordem mexida pela organizadora (garantir vaga, trocar); nula = a chegada. */
  ordem: number | null
  origem: OrigemDoNome
  garantida: boolean
  entrou_em: string
  saiu_em: string | null
  saiu_por: 'atleta' | 'organizadora' | null
  /** Mensalista tirada pela organizadora: ela avisou com 24h? */
  avisou_24h: boolean | null
}

export type ListaCompleta = { lista: Lista; nomes: NomeNaLista[] }

export type MotivoDaLista =
  | 'aparelho' | 'nome' | 'nao_existe' | 'fechada' | 'aparelho_ja_tem_nome'
  | 'repetido' | 'ja_na_lista' | 'cheia' | 'nao_esta' | 'nao_e_seu' | 'sem_tabela'

export type RespostaDaLista =
  | { ok: true; id?: string; posicao?: number; vagas?: number }
  | { ok: false; motivo: MotivoDaLista }

/** Teto contra spam: nomes ativos por lista = vagas x 3 (o banco confere o mesmo). */
export const TETO_POR_VAGA = 3
/** E linhas no total, contando quem saiu (colocar e tirar sem fim): vagas x 10. */
export const TETO_TOTAL_POR_VAGA = 10

export const MENSAGEM_DO_MOTIVO: Record<MotivoDaLista, string> = {
  aparelho: 'Não consegui identificar este celular. Recarregue a página e tente de novo.',
  nome: 'Escreva o nome completo, só com letras.',
  nao_existe: 'Esta lista não existe mais.',
  fechada: 'A lista já fechou. Fale com a organização.',
  aparelho_ja_tem_nome: 'Este celular já colocou um nome nesta lista. Para trocar, tire o nome primeiro.',
  repetido: 'Esse nome já está na lista.',
  ja_na_lista: 'Você já está na lista.',
  cheia: 'A lista e a fila de suplentes estão cheias. Fale com a organização.',
  nao_esta: 'Esse nome já não estava na lista.',
  nao_e_seu: 'Só dá para tirar o nome colocado por este celular. Fale com a organização.',
  sem_tabela: 'A lista de presença ainda não está ligada. Fale com a organização.',
}

/** Os dois avisos das mensagens do WhatsApp (texto do dono, 06/11). */
export const AVISO_DE_SAIDA =
  'Não mensalistas: para sair, abra o mesmo link e toque em Tirar meu nome. Mensalistas: avisem a organização.'
export const AVISO_DAS_MENSALISTAS =
  'Mensalistas não precisam colocar o nome: já estão na lista. Abram o link só para conferir; se o seu nome não estiver, fale com a organização.'

// ---------------------------------------------------------------- nome

const LETRA = 'A-Za-zÀ-ÖØ-öø-ÿ'
const RE_NOME = new RegExp(`^[${LETRA}]([${LETRA} .'-]*[${LETRA}.])?$`)

/**
 * A mesma regra de `lista_colocar` (supabase/31): NFC (acento digitado em
 * duas partes vira uma letra), apostrofo do iPhone vira o reto, espacos
 * colapsados; 3 a 60 caracteres, comeca com letra, so letras, espaco, ponto,
 * apostrofo e hifen.
 */
export function validarNome(texto: string): { nome: string } | { erro: string } {
  const nome = texto.normalize('NFC').replace(/’/g, "'").replace(/\s+/g, ' ').trim()
  if (nome.length < 3) return { erro: 'Escreva o nome completo (pelo menos 3 letras).' }
  if (nome.length > 60) return { erro: 'Nome comprido demais (até 60 letras).' }
  if (!RE_NOME.test(nome)) return { erro: 'Use só letras, espaço, ponto, hífen e apóstrofo.' }
  return { nome }
}

/**
 * O formulario da atleta pede nome E sobrenome (2+ palavras de 2+ letras): sem isso o vinculo
 * automatico nao acontece (D33) e a organizadora teria de vincular a mao. A organizadora segue
 * podendo adicionar um nome so. O banco aceita uma palavra (quem burla a tela so perde o vinculo).
 */
export function validarNomeDaAtleta(texto: string): { nome: string } | { erro: string } {
  const v = validarNome(texto)
  if ('erro' in v) return v
  const palavras = v.nome.split(' ').filter((p) => p.replace(/[.']/g, '').length >= 2)
  if (palavras.length < 2) return { erro: 'Escreva nome e sobrenome (ex.: Ana Souza).' }
  return v
}

// ---------------------------------------------------------------- ordem

export function chaveDeOrdem(n: NomeNaLista): number {
  return n.ordem ?? n.chegada
}

/** Os nomes ativos (sem saida), na ordem da lista: ordem da organizadora, senao chegada. */
export function ativosEmOrdem(nomes: NomeNaLista[]): NomeNaLista[] {
  return nomes
    .filter((n) => !n.saiu_em)
    .sort((a, b) => chaveDeOrdem(a) - chaveDeOrdem(b) || a.chegada - b.chegada)
}

/** As `vagas` primeiras ativas sao confirmadas; o resto, suplentes. */
export function dividir(lista: Lista, nomes: NomeNaLista[]): { titulares: NomeNaLista[]; suplentes: NomeNaLista[] } {
  const ativos = ativosEmOrdem(nomes)
  return { titulares: ativos.slice(0, lista.vagas), suplentes: ativos.slice(lista.vagas) }
}

/** 1, 2, 3... entre as ativas; 0 se saiu. */
export function posicaoDe(nomes: NomeNaLista[], id: string): number {
  return ativosEmOrdem(nomes).findIndex((n) => n.id === id) + 1
}

export function estaAberta(lista: Lista, agora: Date): boolean {
  return !lista.fechada && agora.getTime() < Date.parse(lista.fecha_em)
}

/**
 * Onde entra um nome adicionado a mao quando a organizadora garante a vaga:
 * logo depois da ultima garantida (sem nenhuma, na frente de todas).
 */
export function ordemParaGarantir(nomes: NomeNaLista[]): number {
  const ativos = ativosEmOrdem(nomes)
  if (ativos.length === 0) return 1
  const ultima = ativos.map((n) => n.garantida).lastIndexOf(true)
  if (ultima < 0) return chaveDeOrdem(ativos[0]) - 1
  const seguinte = ativos[ultima + 1]
  if (!seguinte) return chaveDeOrdem(ativos[ultima]) + 1
  return (chaveDeOrdem(ativos[ultima]) + chaveDeOrdem(seguinte)) / 2
}

// ---------------------------------------------------------------- horas

// shortcut: fuso fixo -03:00 (o Brasil esta sem horario de verao desde 2019);
// se ele voltar, trocar por Intl.DateTimeFormat com timeZone 'America/Sao_Paulo'
const FUSO_MS = 3 * 3600 * 1000
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

/** A data no relogio de Sao Paulo, para ler com getUTC*. */
function emSaoPaulo(iso: string): Date {
  return new Date(Date.parse(iso) - FUSO_MS)
}

function hora(d: Date): string {
  const m = d.getUTCMinutes()
  return `${d.getUTCHours()}h${m ? String(m).padStart(2, '0') : ''}`
}

/** "seg 20h" / "seg 20h30". */
export function quando(iso: string): string {
  const d = emSaoPaulo(iso)
  return `${DIAS[d.getUTCDay()]} ${hora(d)}`
}

/** "seg 09/11 às 20h". */
export function quandoComData(iso: string): string {
  const d = emSaoPaulo(iso)
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${DIAS[d.getUTCDay()]} ${dd}/${mm} às ${hora(d)}`
}

/** A data (AAAA-MM-DD) de um instante em Sao Paulo. */
export function dataEmSaoPaulo(iso: string): string {
  return emSaoPaulo(iso).toISOString().slice(0, 10)
}

/** O dia do play (AAAA-MM-DD), em Sao Paulo. */
export function dataDoPlay(lista: Lista): string {
  return dataEmSaoPaulo(lista.play_em)
}

/** "20:00", para o campo de hora. */
export function horaDoPlay(iso: string): string {
  return emSaoPaulo(iso).toISOString().slice(11, 16)
}

/** Dia e hora de Sao Paulo -> ISO em UTC. */
export function inicioEmSaoPaulo(data: string, horaHHMM: string): string {
  return new Date(`${data}T${horaHHMM}:00-03:00`).toISOString()
}

export function horasAntesDoPlay(saiuEm: string, playEm: string): number {
  return Math.floor((Date.parse(playEm) - Date.parse(saiuEm)) / 3600000)
}

/** Formulario novo: a proxima segunda 20h, fechando no domingo 18h, 16 vagas (calendario do Play de Todas). */
export function padraoDaLista(hojeISO: string) {
  const hoje = new Date(`${hojeISO}T12:00:00Z`)
  const ate = (8 - hoje.getUTCDay()) % 7 || 7
  const segunda = new Date(hoje.getTime() + ate * 86400000)
  const domingo = new Date(segunda.getTime() - 86400000)
  return {
    data: segunda.toISOString().slice(0, 10),
    hora: '20:00',
    fechaData: domingo.toISOString().slice(0, 10),
    fechaHora: '18:00',
    vagas: 16,
  }
}

/** O que impede de gravar a lista, ou null. */
export function problemaDaLista(l: Lista, agora: Date): string | null {
  if (!l.titulo.trim()) return 'Dê um nome ao play.'
  if (l.titulo.trim().length > 60) return 'O nome do play pode ter até 60 letras.'
  if (!(l.vagas >= 1 && l.vagas <= 100)) return 'As vagas vão de 1 a 100.'
  if ((l.texto ?? '').length > 300) return 'O texto curto pode ter até 300 letras.'
  if (!Number.isFinite(Date.parse(l.play_em)) || !Number.isFinite(Date.parse(l.fecha_em))) return 'Confira as datas.'
  if (Date.parse(l.fecha_em) > Date.parse(l.play_em)) return 'A lista precisa fechar antes do play.'
  if (Date.parse(l.fecha_em) <= agora.getTime()) return 'O prazo da lista já passou: escolha um horário no futuro.'
  return null
}

// ---------------------------------------------------------------- textos

/** "14/16 · 2 vagas", "16/16 · 3 suplentes" ou "16/16 · lotada". */
export function ocupacao(lista: Lista, nomes: NomeNaLista[]): string {
  const { titulares, suplentes } = dividir(lista, nomes)
  const n = titulares.length
  const sobra = lista.vagas - n
  const fim = sobra > 0 ? plural(sobra, 'vaga') : suplentes.length > 0 ? plural(suplentes.length, 'suplente') : 'lotada'
  return `${n}/${lista.vagas} · ${fim}`
}

/** "Lista aberta · seg 20h · 14/16 · 2 vagas · fecha dom 18h". */
export function resumoDoCartao(lista: Lista, nomes: NomeNaLista[], agora: Date): string {
  const estado = estaAberta(lista, agora) ? 'Lista aberta' : 'Lista fechada'
  return `${estado} · ${quando(lista.play_em)} · ${ocupacao(lista, nomes)} · fecha ${quando(lista.fecha_em)}`
}

/** "Você é a 15ª — confirmada" / "Você é a 2ª suplente". */
export function textoDaPosicao(posicao: number, vagas: number): string {
  return posicao <= vagas ? `Você é a ${posicao}ª — confirmada` : `Você é a ${posicao - vagas}ª suplente`
}

export function urlDaLista(base: string, codigo: string): string {
  return `${base}?lista=${codigo}`
}

const LETRAS_DO_CODIGO = 'abcdefghjkmnpqrstuvwxyz23456789'

/** 10 caracteres sem os que confundem (~49 bits): nao da para adivinhar o link de outra lista. */
export function novoCodigo(): string {
  let out = ''
  const bytes = new Uint8Array(32)
  while (out.length < 10) {
    crypto.getRandomValues(bytes)
    // so os bytes abaixo de 248 (8 x 31): sem preferencia por nenhuma letra
    for (const b of bytes) if (b < 248 && out.length < 10) out += LETRAS_DO_CODIGO[b % 31]
  }
  return out
}

function cabecalho(lista: Lista, vagas: string, aberta = true): string {
  return [
    `🎾 *${lista.titulo}* — ${quandoComData(lista.play_em)}`,
    aberta ? `📋 Lista aberta até ${quandoComData(lista.fecha_em)} · ${vagas}` : `📋 Lista fechada · ${vagas}`,
    ...(lista.texto?.trim() ? [lista.texto.trim()] : []),
  ].join('\n')
}

/** A mensagem que a organizadora manda no grupo ao criar a lista. */
export function mensagemDoLink(lista: Lista, url: string): string {
  return [
    cabecalho(lista, plural(lista.vagas, 'vaga')),
    '',
    'Coloque seu nome e sobrenome pelo link:',
    url,
    '',
    AVISO_DE_SAIDA,
    AVISO_DAS_MENSALISTAS,
  ].join('\n')
}

/** A lista atual, para colar no grupo: o mesmo link (cada celular continua lembrando o nome). */
export function mensagemDeAtualizacao(
  lista: Lista,
  nomes: NomeNaLista[],
  nomeDe: (playerId: string) => string,
  url: string,
  agora: Date,
): string {
  const { titulares, suplentes } = dividir(lista, nomes)
  const linha = (n: NomeNaLista, i: number) =>
    `${i + 1}. ${n.player_id ? nomeDe(n.player_id) : n.nome}${n.origem === 'mensalista' ? ' 📅' : ''}`
  const aberta = estaAberta(lista, agora)
  return [
    cabecalho(lista, ocupacao(lista, nomes), aberta),
    '',
    '✅ *Confirmadas*',
    ...(titulares.length ? titulares.map(linha) : ['(ninguém ainda)']),
    ...(suplentes.length ? ['', '⏳ *Suplentes*', ...suplentes.map(linha)] : []),
    '',
    aberta ? 'Coloque seu nome e sobrenome pelo link:' : 'A lista fechou. Para conferir:',
    url,
    '',
    AVISO_DE_SAIDA,
    AVISO_DAS_MENSALISTAS,
  ].join('\n')
}

// ---------------------------------------------------------------- cadastro

/**
 * A grafia e o nome, o apelido ou uma grafia guardada de UM cadastro so? Se
 * bater em dois (as duas "Bruna"), nao vincula: quem decide e a organizadora.
 * O banco faz o mesmo em `lista_colocar`; isto serve o modo local.
 */
export function vinculoAutomatico(texto: string, players: Player[]): string | null {
  const alvo = normalizar(texto)
  // so com 2+ palavras: um primeiro nome so ("Pamela") e de muita gente
  if (!alvo.includes(' ')) return null
  const achou = players.filter(
    (p) =>
      normalizar(p.name) === alvo ||
      normalizar(p.nickname ?? '') === alvo ||
      (p.aliases ?? []).some((a) => normalizar(a) === alvo),
  )
  return achou.length === 1 ? achou[0].id : null
}

/**
 * Os palpites para a organizadora, do mais provavel para o menos: a mesma
 * `semelhanca` do "Colar lista", so que SEM parar no primeiro identico -- com
 * duas "Bruna" as duas aparecem, e quem escolhe e ela.
 */
export function sugestaoDeVinculo(texto: string, players: Player[], soComposto = false): Sugestao[] {
  return players
    .map((p) => ({
      player: p,
      score: Math.max(
        0,
        ...[p.name, p.nickname ?? '', ...(p.aliases ?? [])]
          .filter((x) => (soComposto ? normalizar(x).includes(' ') : !!x))
          .map((x) => semelhanca(texto, x)),
      ),
    }))
    .filter((s) => s.score >= 0.62)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
}

/**
 * O palpite que merece o botao de um toque na linha: quase certo, sem empate
 * (as duas Bruna nao) e por um nome de duas palavras ou mais -- um apelido de
 * uma palavra so ("maria") casaria com toda Maria que chegar.
 */
export function sugestaoSegura(texto: string, players: Player[]): Sugestao | undefined {
  const a = sugestaoDeVinculo(texto, players, true)[0]
  const [x, y] = sugestaoDeVinculo(texto, players)
  // o empate conta com TODAS as grafias: a "Bruna" de uma palavra empata com a outra
  return a && a.score >= 0.93 && x?.player.id === a.player.id && !(y && y.score >= x.score) ? a : undefined
}

/** A grafia ainda nao e conhecida do cadastro? Entao vale guardar em `aliases`. */
export function grafiaNova(texto: string, p: Player): boolean {
  const alvo = normalizar(texto)
  return ![p.name, p.nickname ?? '', ...(p.aliases ?? [])].some((x) => normalizar(x) === alvo)
}

/**
 * As mensalistas que entram garantidas quando a lista e criada: em dia para o
 * dia do play, ativas e sem pausa aberta. Ordem: da mais forte para a mais
 * fraca (dono, 06/11); empate pelo nome.
 */
export function preIncluidas(data: AppData, dataDoPlay: string): string[] {
  const forca = ratings(data)
  return data.players
    .filter((p) => p.active && mensalistaEmDiaNoPlay(p, dataDoPlay) && !pausaAberta(data, p))
    .map((p) => ({ p, nota: notaDeForca(forca.get(p.id) ?? 2) }))
    .sort((a, b) => b.nota - a.nota || a.p.name.localeCompare(b.p.name, 'pt-BR'))
    .map((x) => x.p.id)
}

/**
 * Ao tirar este nome a organizadora responde "avisou com 24h?": pre-incluida,
 * ou mensalista em dia para este play. A que nao renovou entrou como avulsa.
 */
export function ehMensalista(n: NomeNaLista, players: Player[], dataDoPlay: string): boolean {
  if (n.origem === 'mensalista') return true
  const p = n.player_id ? players.find((x) => x.id === n.player_id) : undefined
  return !!p && mensalistaEmDiaNoPlay(p, dataDoPlay)
}

/** Para montar o play: os cadastros das confirmadas e as confirmadas ainda sem cadastro. */
export function paraMontar(lista: Lista, nomes: NomeNaLista[]): { ids: string[]; semVinculo: NomeNaLista[] } {
  const { titulares } = dividir(lista, nomes)
  return {
    ids: titulares.flatMap((n) => (n.player_id ? [n.player_id] : [])),
    semVinculo: titulares.filter((n) => !n.player_id),
  }
}

// ---------------------------------------------------------------- apagar (D39)

/**
 * So lista que ainda nao virou play: a que virou guarda quem jogou e o "avisou com 24h"
 * (base do credito da mensalista). Se o play for apagado, o banco zera o session_id e ela volta a poder.
 */
export function podeApagar(lista: Lista): boolean {
  return !lista.session_id
}

/** Os avisos da janela "Apagar esta lista?", na ordem em que aparecem. */
export function avisosAoApagar(nomes: NomeNaLista[]): string[] {
  const ativos = ativosEmOrdem(nomes)
  const peloLink = ativos.filter((n) => n.origem === 'link').length
  return [
    'O link para de funcionar: quem abrir vai ver “Esta lista não existe mais”.',
    ...(ativos.length === 1 ? ['O nome da lista some junto.'] : []),
    ...(ativos.length > 1 ? [`Os ${plural(ativos.length, 'nome')} da lista somem junto.`] : []),
    ...(peloLink > 0
      ? [`${peloLink === 1 ? '1 colocou' : `${peloLink} colocaram`} o nome pelo link: avise no grupo que a lista vai ser refeita, com o link novo.`]
      : []),
    ...(ativos.length > 0
      ? ['Os nomes ficam guardados neste celular por 30 minutos: se você criar outra lista nesse tempo, dá para trazê-los de volta.']
      : []),
    ...(nomes.some((n) => n.saiu_em && n.avisou_24h !== null) ? ['Quem saiu e o “avisou com 24h” também somem.'] : []),
    'Não dá para desfazer.',
  ]
}

// ---------------------------------------------------------------- trazer da apagada (D41)

/** Um nome guardado da lista apagada, como volta para a lista nova. */
export type NomeTrazido = Pick<NomeNaLista, 'nome' | 'player_id' | 'origem' | 'garantida'>

/** A copia que fica NESTE celular por 30 minutos depois de apagar (uma so: a ultima). */
export type CopiaDaApagada = {
  apagada_em: string
  titulo: string
  play_em: string
  nomes: NomeTrazido[]
  /** Cadastros de quem tinha saido: a mensalista que saiu nao volta pelo "Ja incluir as mensalistas". */
  sairam?: string[]
}

export const VALIDADE_DA_COPIA_MS = 30 * 60 * 1000

/** Os nomes ativos na ordem da lista; null sem nenhum (nao ha o que guardar). */
export function copiaDaApagada(lista: Lista, nomes: NomeNaLista[], agora: Date): CopiaDaApagada | null {
  const ativos = ativosEmOrdem(nomes)
  if (ativos.length === 0) return null
  return {
    apagada_em: agora.toISOString(),
    titulo: lista.titulo,
    play_em: lista.play_em,
    nomes: ativos.map(({ nome, player_id, origem, garantida }) => ({ nome, player_id, origem, garantida })),
    sairam: nomes.flatMap((n) => (n.saiu_em && n.player_id ? [n.player_id] : [])),
  }
}

/** A copia ainda serve? (menos de 30 minutos e com nomes) */
export function copiaValida(c: CopiaDaApagada | null | undefined, agora: Date): c is CopiaDaApagada {
  if (!c || !Array.isArray(c.nomes) || c.nomes.length === 0) return false
  const idade = agora.getTime() - Date.parse(c.apagada_em)
  return idade >= 0 && idade < VALIDADE_DA_COPIA_MS
}

/** "Ana, Bruna, Carla e mais 9" / "Ana e Bruna". */
export function previaDosNomes(nomes: string[], quantos = 3): string {
  if (nomes.length <= quantos) return nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}` : (nomes[0] ?? '')
  return `${nomes.slice(0, quantos).join(', ')} e mais ${nomes.length - quantos}`
}

/**
 * Os trazidos na ordem da apagada e as mensalistas que ainda nao estao (mesmo cadastro ou mesmo nome)
 * nem tinham saido; elas entram logo depois da ultima garantida (sem nenhuma, na frente), como no
 * garantir a mao: no fim, uma mensalista garantida podia virar suplente.
 */
export function juntarSemRepetir(trazidos: NomeTrazido[], mensalistas: NomeTrazido[], sairam: string[] = []): NomeTrazido[] {
  const ids = new Set([...sairam, ...trazidos.flatMap((n) => (n.player_id ? [n.player_id] : []))])
  const grafias = new Set(trazidos.map((n) => normalizar(n.nome)))
  const novas = mensalistas.filter((m) => !(m.player_id && ids.has(m.player_id)) && !grafias.has(normalizar(m.nome)))
  const depois = trazidos.map((n) => n.garantida).lastIndexOf(true) + 1
  return [...trazidos.slice(0, depois), ...novas, ...trazidos.slice(depois)]
}
