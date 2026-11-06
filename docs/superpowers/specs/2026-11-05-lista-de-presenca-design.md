# Lista de presença por link — Play de Todas

Desenho aprovado em conversa com o dono em 05/11/2026. Projeto: Play de Todas (React 18 + TS + Vite 5,
sem router, PWA, GitHub Pages em playdetodas.com.br, Supabase schema `public`). As atletas **não têm
conta**; só a organização faz login.

## Por que
Hoje a organizadora manda no grupo do WhatsApp uma lista em texto e todas copiam e colam ao mesmo tempo:
uma apaga o nome da outra, a ordem se perde, e depois a organizadora digita tudo no app. O link resolve
a ordem (o banco decide quem chegou primeiro), traz as atletas para dentro do app (elas exploram ranking,
estatísticas) e já entrega a lista pronta para montar o play.

## Objetivos
- A organizadora cria a lista e manda um link no grupo.
- A atleta abre o link, vê a lista atual, coloca o nome completo e confirma; depois vai para a tela inicial.
- A ordem é a de chegada no **servidor**, correta mesmo com dezenas confirmando no mesmo segundo.
- Vagas definidas pela organizadora; quem passa do limite vira suplente; quando alguém sai, a próxima
  suplente sobe sozinha.
- A organizadora vincula cada nome digitado ao cadastro da atleta; o app aprende a grafia e, nas próximas
  vezes, vincula sozinho.
- Mensalistas em dia podem entrar automaticamente na lista quando ela é criada.
- Ao final, a organizadora monta o play a partir da lista (e ainda pode adicionar gente à mão).

## Não objetivos
- Conta/login para atleta (no Play de Todas não existe; no QuadraFácil v2 todas terão conta).
- Pagamento pela lista. Notificações push. Lista no Play de Terça e no Play Mista (o recurso fica
  **escondido** lá: sem botão e sem tabela; ler de forma tolerante como o app já faz com tabelas que podem
  faltar).

## Anti-objetivos (seria fracasso mesmo funcionando)
- Uma atleta conseguir tirar o nome de outra.
- A ordem depender do relógio do celular ou de quem salvou primeiro no aparelho.
- Uma atleta se vincular ao cadastro errado (por isso **ela não escolhe cadastro**; só digita o nome).
- Mostrar a força numérica de quem está em avaliação para quem não organiza.
- O app inteiro da organizadora recarregar a cada nome que chega.

## Como funciona (decidido pelo dono)

### Criar a lista (organizadora, logada)
- Entrada: na tela de **Novo Play**, a opção de criar a **lista de presença por link** (o play em si —
  quem joga, formato, grupos — é montado depois, a partir da lista).
- Campos: nome do play (sugestão "Play de Todas"), data, hora, **quando a lista fecha** (data e hora),
  **número de vagas**, um **texto curto** opcional, e a opção **"Já incluir as mensalistas em dia"**.
- "Mensalista em dia" = categoria mensalista e situação liberada no mês (a mesma regra que o app já usa:
  `situacaoDoAtleta(...).liberado`). Elas entram no topo da lista, já **vinculadas** ao cadastro, ocupando
  vagas, na ordem alfabética (ou a que o builder achar mais natural; registrar a escolha).
- Ao criar, o app mostra o link e a **mensagem pronta para o WhatsApp** (botão compartilhar/copiar), com:
  nome do play, data e hora, até quando a lista fica aberta, vagas e o link.
- O link usa query (`playdetodas.com.br/?lista=<código>`): o GitHub Pages não tem rotas e um caminho daria
  404. O código não pode ser adivinhável.

### A atleta (sem login)
- Abrir o link mostra a página da lista: nome do play, data/hora, prazo, a lista atual (confirmadas e
  suplentes) e, embaixo, o botão para colocar o nome.
- Ela digita o **nome completo** e confirma. **Sem sugestão de cadastro** para ela (risco de vínculo errado).
- Resposta imediata com a posição dada pelo servidor: "Você é a 15ª — confirmada" ou "2ª suplente".
- Depois vai para a **tela inicial** do app.
- O celular guarda (localStorage) um **código do aparelho** (gerado na 1ª confirmação) e o **último nome
  digitado** (para vir preenchido da próxima vez). Limite: o navegador interno do WhatsApp e o Safari podem
  guardar separado; nesse caso ela não consegue tirar o nome por ali e pede à organizadora.
- **"Tirar meu nome"** só aparece para o nome colocado por aquele aparelho. Antes de tirar, aviso:
  > **Tirar seu nome?** Sua vaga vai para a próxima suplente. Se mudar de ideia, você volta para o fim da fila.
  > [Tirar meu nome] [Continuar na lista]
  Para quem já é suplente: "Você sai da fila de suplentes. Se mudar de ideia, volta para o fim da fila."
- Quem tira e coloca de novo vai para o **fim** da fila.

### O que aparece em cada nome da lista (para todo mundo)
- Nome **vinculado** pela organizadora → perfil oficial: **foto e força**. Exceção (regra que já existe no
  app): quem está **em avaliação** aparece com foto e "🔍 n/3", sem o número da força, para quem não organiza.
- Nome **ainda não vinculado** → só o texto digitado.
- A lista se atualiza ao vivo para quem está com a página aberta.

### A organizadora (logada)
- Vê os nomes chegando; para cada nome não vinculado, o app sugere o cadastro mais parecido (reaproveitar
  `conciliar`/`semelhanca`/`normalizar` de `src/lib/roster.ts`, limiares já existentes). Ela confirma com um
  toque, escolhe outro, ou cria atleta nova.
- **Aprendizado:** ao vincular, a grafia digitada é gravada em `players.aliases` do cadastro (como o
  "Colar lista do grupo" já faz em `ImportarLista.tsx`). Grafia que já está nos aliases (ou é igual ao nome
  ou apelido) de **um único** cadastro vincula sozinha. Se bater em **mais de um** cadastro (ex.: hoje há
  duas "Bruna"), **não** vincula sozinha — pede à organizadora.
- Pode **tirar qualquer nome a qualquer momento** (ex.: avisou no grupo que não vai), **adicionar à mão**,
  mudar vagas e prazo, **fechar e reabrir**.
- **"Montar play com a lista"**: funciona antes ou depois do prazo; antes do prazo, aviso: "Montar o play
  agora fecha a lista. Quem ainda não colocou o nome vai precisar falar com você." Abre o Novo Play com as
  **confirmadas** já marcadas em "Quem joga" (nomes sem vínculo precisam ser vinculados ou cadastrados antes).
  A organizadora continua podendo adicionar e tirar à mão como hoje.

### Tela inicial
- Cartão da lista aberta (perto do cartão "Próximo play" de `Ranking.tsx`), com texto correto:
  - com vagas: "Lista aberta · seg 20h · 14/16 · 2 vagas · fecha dom 18h"
  - cheia: "Lista aberta · seg 20h · 16/16 · 3 suplentes · fecha dom 18h"
  - tocar abre a lista.

### Prazo
- A lista fecha sozinha no horário definido, pelo **relógio do servidor**. Fechada, a atleta vê a lista mas
  não consegue colocar nem tirar nome; a organizadora continua podendo mexer.

## Restrições técnicas (obrigatórias)
- **Primeiro caminho de escrita sem login no banco do Play de Todas.** Visitante (chave anon) só pode:
  colocar um nome e tirar o próprio nome, por **duas funções no banco** (`security definer`, `search_path`
  fixo, `grant execute` só para anon/authenticated, `revoke` de public). Nenhum insert/update/delete direto
  de visitante nas tabelas novas. Leitura pública só do necessário (o código do aparelho, ou seu hash,
  nunca sai do banco).
- Validação nas funções: nome com tamanho razoável (ex.: 3–60) e só caracteres de nome; lista existe, está
  aberta e dentro do prazo (relógio do servidor); **um nome ativo por aparelho** por lista; o mesmo nome
  (normalizado) não entra duas vezes ativo; **teto** de nomes por lista contra spam (ex.: vagas × 3).
- **Ordem**: número sequencial atribuído pelo banco + trava por lista (ex.: `pg_advisory_xact_lock`) para
  que a contagem de posição e as checagens não corram entre si. Titular x suplente é **calculado** na
  leitura (posição entre os nomes ativos × vagas), não gravado.
- **Tirar o nome**: a função compara o hash do código do aparelho com o gravado; não confere → não tira.
  **Teste obrigatório que tenta tirar o nome de outra chamando a função direto (sem a tela) e precisa falhar.**
- Tempo real: canal próprio da lista, filtrado pela lista (o canal geral do app recarrega tudo a cada evento
  — `store.tsx` — e não deve ouvir essa tabela).
- Migração nova em `supabase/31-*.sql`, no padrão dos scripts existentes (rodar inteiro no SQL Editor,
  pode rodar de novo, termina com uma conferência). **Quem roda é o dono**, no painel do Supabase.
- Modo local (`localRepo`) também precisa funcionar, para testes e para o robô de prints.
- Ligas masculino/misto: sem tabela → recurso escondido, sem erro.
- Registrar hora de entrada e de saída de cada nome (serve para a regra de 24h das mensalistas).

## Ligações com o resto
- **Financeiro (em desenho):** a mensalista que sai deixa a hora registrada, o que ajuda a organizadora a
  decidir o "avisou com 24h"; a suplente que entra na vaga dela poderá ser marcada como "no lugar de uma
  mensalista" (metade da taxa vai para o caixa de eventos). Nesta entrega, basta guardar as horas e a
  origem de cada nome; a ligação financeira vem com o modelo financeiro.
- **QuadraFácil v2:** todas as atletas têm conta; link sem conta → criar conta → volta para a lista. O
  espelho Play de Todas → QuadraFácil precisará copiar as listas.

## Decisões do dono depois da revisão (06/11/2026)
- **Mensalista sai pela organizadora.** Ao tirar uma mensalista, o app pergunta "Ela avisou com 24h de
  antecedência?" (Sim/Não) e guarda a resposta (base do crédito de R$ 25 ou 1 check-in no financeiro).
- **Quem entra garantida:** só as mensalistas **em dia na hora em que a lista é criada** (pré-incluídas).
  "Em dia" = pagou o mês do play, ou o play é até o dia 5 e ela ainda está no prazo da mensalidade
  (leitura do agente, a confirmar com o dono). Mensalista que não renovou a tempo entra **como avulsa**
  (coloca o nome pelo link, ordem de chegada); se pagar depois, só fica garantida **a partir da próxima
  lista**. Não existe "bloco que empurra a última avulsa para suplente".
- **Ordem das pré-incluídas:** por **força** (maior primeiro).
- **Organizadora pode trocar posições:** além de "garantir vaga" para um nome adicionado à mão, pode trocar
  um nome de lugar com outro da lista (ex.: uma suplente com uma confirmada), com aviso de que a decisão é
  dela. Isso exige uma ordem de exibição que a organizadora possa alterar, separada do número de chegada
  (o número de chegada continua sendo a regra para quem vem pelo link).
- **Link sempre abre o Play de Todas** (passa por cima da escolha de play guardada no aparelho); depois de
  confirmar, tirar o nome ou cancelar, vai para a tela inicial do Play de Todas.
- **Mensagem do link (WhatsApp):** dia e hora do play, até quando a lista fica aberta, vagas, o texto
  curto da organizadora, o link, e: "Não mensalistas: para sair, abra o mesmo link e toque em Tirar meu
  nome. Mensalistas: avisem a organização."
- **"Copiar atualização"** para a organizadora: mensagem com a lista atual (confirmadas numeradas,
  mensalistas marcadas, suplentes), as mesmas informações e **o mesmo link** (o celular de cada atleta
  continua lembrando o nome e o código).

- **Play até o dia 5:** mensalista que ainda não pagou mas está no prazo **entra garantida** (dono, 06/11).
- **Mensalista que coloca o nome pelo link (duplicada):** as duas mensagens (link e atualização) dizem:
  "Mensalistas não precisam colocar o nome: já estão na lista. Abram o link só para conferir; se o seu
  nome não estiver, fale com a organização." E no banco: se o nome digitado vincular sozinho a uma
  atleta que **já está ativa na lista**, não entra de novo — a tela responde "Você já está na lista".
  Se não vincular (grafia nova), entra e a organizadora resolve ao vincular (o app avisa que a atleta
  já está na lista e oferece tirar a duplicada).

## Deixado para o builder
- Nomes de tabelas/colunas/funções, formato do código da lista, como guardar o código do aparelho.
- Onde exatamente fica a página da lista no app (aba, janela) e o desenho dos cartões, seguindo o estilo
  existente (sem novas dependências) e o padrão de alvos ≥ 44 px.
- Ordem das mensalistas pré-incluídas.
- Texto exato da mensagem do WhatsApp (dentro do que está acima).
