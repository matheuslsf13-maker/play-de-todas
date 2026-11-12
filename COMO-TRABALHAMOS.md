# 🤝 Como trabalhamos — o combinado entre o dono e quem programa

Este arquivo vale para **qualquer IA ou pessoa** que pegar o projeto. Ele diz **como o dono (Matheus) quer que o
trabalho seja feito e entregue**. Os outros arquivos dizem o resto:

| Arquivo | O que guarda |
| --- | --- |
| `COMO-TRABALHAMOS.md` (este) | o modo de operação: o que entregar, o que o dono espera, o que nunca fazer |
| `CLAUDE.md` | como o app funciona **hoje** (regras do campeonato, código, telas) |
| `DECISOES.md` | **por que** é assim: o que foi medido, testado e descartado (não refazer discussão encerrada) |
| `HANDOFF-RETOMADA.md` | **local, fora do git**: o que está em andamento agora, para retomar se a sessão acabar |

**Regra deste arquivo:** toda decisão nova do dono sobre o *jeito de trabalhar* entra aqui na hora, com a data.
Decisão sobre *regra do app* vai para o `CLAUDE.md`/`DECISOES.md`.

---

## 1. Quem usa o app e como

- O app é usado **no celular, na beira da quadra**, de noite, com pressa. Toda tela é pensada para isso primeiro.
- Dois públicos: a **organização logada** (admin: monta o play, lança placar, cuida do financeiro) e a **atleta sem
  login** (só olha). Toda mudança de tela é conferida **nos dois**.
- Só o **Play de Todas** está no ar. Masculino e Mista estão parados (código fica).

## 2. O que o dono espera de cada entrega

1. **Pronto de verdade**, não "quase": a mudança inteira, com o que ela afeta em outras telas (Excel, histórico,
   resumo, tela inicial…). Antes de mexer, **procurar onde mais aquilo é usado** para não quebrar nada.
2. **Conferido antes de dizer que está pronto**: `npm test`, `npm run build` e a tela aberta (print). Se algo não
   foi conferido, **dizer o que não foi**.
3. **Explicação em português simples**, sem jargão: o que mudou, onde fica na tela, o que não foi feito.
4. **Nível de design profissional** (estilo iOS): toque com resposta, nada pulando na tela, animação só com motivo,
   parada com `prefers-reduced-motion`. Conferir **tema escuro e claro**, nomes longos e lista vazia.
5. **Imagens antes de reformular tela grande**: mostrar mockups/prints, o dono aprova, aí implementar o aprovado.
6. **Controle na mão do dono**: tudo que o app lança sozinho precisa de um jeito de ver de onde veio e de desfazer
   (ex.: caixa de eventos com "📜 De onde veio" e "🗑️ Tirar", 10–12/11/2026).

## 3. O que nunca fazer

- **Publicar sem o dono pedir.** Push na `main` publica o site. "Pode publicar" vale para aquilo que ele aprovou.
- Colocar chave secreta (`service_role`) em `src/config.ts` ou em qualquer arquivo do repositório.
- Rodar SQL no banco de produção sem o dono aprovar (os scripts de `supabase/` rodam na mão, em ordem).
- Commitar ajuste temporário de teste (ex.: o "modo visitante" no `store.tsx`).
- Apagar dado do dono: preferir desfazer o que gerou o valor a apagar registro.
- Escrever o número de WhatsApp em post/arte (usar link).
- Inventar regra de campeonato: as regras são específicas e estão no `CLAUDE.md`.

## 4. O passo a passo de uma mudança

1. Entender o pedido; se for tela grande, mostrar imagem antes.
2. Ler o código que vai mudar e **listar onde mais ele é usado**.
3. Implementar o mínimo completo, com **teste** para regra nova (`tests/*.test.ts`).
4. `npm test` + `npm run build` + abrir a tela no modo local
   (`VITE_SUPABASE_URL=local VITE_SUPABASE_ANON_KEY=local npm run dev`) e tirar print.
5. Atualizar `CLAUDE.md` (como funciona) e o `HANDOFF-RETOMADA.md` (onde parou).
6. Quando o dono pedir para publicar: branch → commit → PR → merge → conferir o deploy (`gh run watch`) e o site
   no ar (playdetodas.com.br).

## 5. Continuidade (o dono troca de IA quando os tokens acabam)

- Manter o `HANDOFF-RETOMADA.md` atualizado **durante** o trabalho, não só no fim: o que está em andamento, o que
  falta, como testar e quais skills usar.
- Roteiros de teste e prints ficam em `prints/estetica-app/roteiros/` (o scratchpad da sessão some).
- Ao retomar: ler este arquivo, o `HANDOFF-RETOMADA.md` e o `CLAUDE.md`, nessa ordem.

## 6. Skills para manter a qualidade (instaladas em `~/.claude/skills`)

- Tela: `emil-design-eng`, `apple-design`, `mobile-native`, `break-ui` (pior caso), `ui-ux-pro-max`.
- Animação: `animate`, `review-animations`.
- Processo: `verification-before-completion` (conferir antes de dizer pronto), `systematic-debugging` (quando
  quebrar), `brainstorming` (antes de feature grande).
- Arte/identidade (pedem chave do Gemini, já configurada na máquina do dono): `design`, `banner-design`, `brand`.

## 7. Decisões de modo de operação (com data)

- **08/11/2026** — Skills de design em toda mudança de tela, com print nos dois temas, logada e sem login.
- **08/11/2026** — HANDOFF sempre atualizado para outra IA retomar.
- **09/11/2026** — Reformulação grande: primeiro imagens; implementar só o aprovado.
- **12/11/2026** — Todo valor lançado automaticamente precisa de histórico ("de onde veio") e de um botão para
  desfazer. Antes de publicar, verificar onde a mudança mexe para não gerar erro.
- **12/11/2026** — Telas com lista de pessoas seguem o padrão da aba Meninas: a linha só informa, tocar abre a folha
  com as ações organizadas. Botão solto dentro do cartão não.
- **12/11/2026** — Este arquivo criado para guardar o combinado e ser atualizado a cada decisão nova.
