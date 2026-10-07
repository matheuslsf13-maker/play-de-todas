# Hall das Duquesas — design

## O que é

Uma aba **👑 Hall** com um ambiente vivo, visto de cima em diagonal (estilo Habbo,
cartoon), onde cada menina que já foi **Duquesa da V3** vive como um "pet": anda,
troca de roupa e faz atividades sozinha. Começa com **uma** menina; o sistema já
nasce pronto para várias (interação entre elas e abraço na chegada ficam para quando
existir a 2ª).

Herdado da conversa com o ChatGPT (`Hall-das-Duquesas-Historico-Atualizado.pdf`):
casa com deck (modelo 2), cozinha com geladeira, sala/leitura, quarto (uma cama por
Duquesa), deck, quadra com a rede **no meio**, praia de canto com ondas; personagem
no cartoon aprovado, coroa grande, raquete com detalhes dourados, **descalça na
areia** (nunca tênis); guarda-roupa com giro 360 (The Sims); primeira chegada só
quando alguém abre a aba e escolhe assistir; menu Ações; galeria em ordem de conquista.

## Por que não aproveitar a versão do ChatGPT

- O cenário era **uma pintura única**: sem saber o que fica na frente do quê, a menina
  sempre aparecia por cima (a "foto em cima do cenário"). Porta e geladeira só trocavam
  a pintura inteira; uma cama nova exigiria repintar tudo.
- A "caminhada" eram 8 cópias quase iguais da mesma pose (ela desliza), só de um lado,
  com halo vermelho/amarelo do recorte; ela tinha a altura da porta.
- Laço de animação por `setState` a cada 50 ms (trava no celular).

## Como vai ser

**Cenário em camadas** (`<canvas>`, `requestAnimationFrame`, pausa com a aba oculta):
a pintura da casa com deck é o fundo; cada objeto que pode ficar **na frente** dela
(sombrinhas, plantas, mesas, bancada, cama, rede, paredes) é recortado da própria
pintura como camada com a sua **linha de base**, e tudo é desenhado em ordem de
profundidade. Chão andável = polígonos + busca de caminho; móveis são obstáculos.
Sombra nos pés. Porta, geladeira e guarda-roupa abrem com a pintura aberta recortada
só naquela região. Ondas animadas por cima do mar.

**Personagem articulada (cutout)**: a ilustração da menina em peças (cabeça, cabelo
de trás, tronco, braços, antebraços, coxas, canelas, coroa, raquete), nas vistas de
**frente** e de **costas** (espelhadas = 4 direções). O código anima os ossos:
caminhada, sentar, deitar, treinar, jogar a bolinha, comer, beber, ler, dormir,
acenar, giro do guarda-roupa. Roupa = troca das peças de tronco/quadril/pernas.

**Guarda-roupa (12 looks)**: esporte (descalça) = beach tennis livre, **camisa do Play
azul e rosa**, **camisa do Play dourada**; casual ×3 (casa, comida, leitura); pijama ×3;
Duquesa (vestido, chegada e comemorações) ×3. O **retrato da galeria** é com a camisa
dourada.

**Dia e noite** em relógio acelerado (um dia inteiro em poucos minutos) com botão para
alternar na hora (apresentar os dois). À noite: luzes da casa, mar escuro; ela continua
andando, senta, deita na espreguiçadeira e só às vezes dorme (o sono de 3 min continua
raro).

**Ligado ao app**: as Duquesas vêm de `computeStreaks().duquesas` (já existe). Sem
nenhuma: casa vazia + quadro "Quem será a primeira?"; um **modo demonstração** com a
menina de exemplo (só logada). Aviso "uma nova Duquesa chegou, quer ver a entrada?"
ao abrir a aba, por aparelho (`localStorage`). Tocar nela/no quadro abre a ficha.
A aba é carregada sob demanda (`lazy`), sem pesar no resto do app.

**Arte de cada nova Duquesa**: kit para o ChatGPT gerar as peças a partir da foto dela.

## Etapas

1. **Prova** (kit 1): peças de frente e de costas com a camisa do Play; ela andando no
   deck, passando atrás da sombrinha e da planta, de frente e de costas. Aprovação
   antes do resto.
2. Motor completo: obstáculos e camadas de todo o cenário, rotina automática, Ações.
3. Guarda-roupa e atividades (kit 2: os outros looks).
4. Chegada (porta, fogos, aceno, quadro), galeria, dia/noite, ligação com as Duquesas reais.
