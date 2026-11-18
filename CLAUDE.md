# Instruções para o Claude neste repositório

## O projeto

Jogo de cartas de identidade oculta para 4 a 12 pessoas, jogado pelo navegador. Cada jogador usa o próprio celular como mão secreta. Serve para jogar à distância ou na mesma mesa, com uma tela de mesa para TV.

São três sócios trabalhando em sessões diferentes do Claude no mesmo repositório. Outra sessão pode estar mexendo no código ao mesmo tempo que você.

A inspiração de jogabilidade é o jogo de mesa Salem 1692. Este jogo usa mecânicas parecidas: cartas de identidade viradas, suspeita que acumula até revelar uma carta, noite com ataque, proteção e confissão, e uma troca de cartas que converte jogadores para o outro time. O conteúdo é próprio. Não recrie cartas, personagens, nomes, textos ou arte do Salem 1692, nem com outro nome.

O nome "Infiltrados" e o visual de arquivo e dossiê são um tema provisório.

## Comandos

- `npm install`
- `npm start` abre o jogo em http://localhost:3000 (a porta muda com `PORT`)
- `npm test`

## Onde fica cada coisa

- `public/theme.js`: nomes e textos de cartas, personagens, times e regras escritas.
- `public/style.css`: cores e fontes, no primeiro bloco.
- `public/app.js`: telas.
- `src/engine/content.js`: quantidade de cada carta, limite de suspeita, cartas por jogador.
- `src/engine/engine.js`: efeito das cartas, habilidades, turnos, noite, aliciamento, vitória.
- `src/engine/bot.js`: como os bots jogam.
- `src/server/server.js`: salas, reconexão, tempo de espera por quem caiu.
- `test/engine.test.js`: testes do motor.

O `README.md` lista o que ainda não existe (hospedagem, salas persistentes, relógio de turno, chat, contas).

## Regras de trabalho

1. Antes de começar uma tarefa, atualize a `main`. Não envie direto para a `main`: trabalhe em uma ramificação e abra pull request quando a pessoa pedir.
2. `npm test` precisa passar antes de qualquer commit. Se mudar regra, carta ou habilidade, escreva ou ajuste o teste correspondente.
3. O servidor é a autoridade. Toda regra é validada em `src/engine`, e o navegador só recebe a visão do próprio jogador (função `viewFor`). Nunca envie ao navegador a mão ou as cartas viradas de outra pessoa.
4. Mecânica e tema ficam separados. A mecânica usa identificadores em inglês em `src/engine` (por exemplo `SUSP1` ou `WATCHER`). Nomes e textos ficam em `public/theme.js`. Uma carta ou personagem novo precisa das duas partes.
5. Não há etapa de build nem framework na tela: JavaScript puro em módulos, com uma única dependência (`ws`). Não adicione dependências sem perguntar.
6. Textos da interface em português do Brasil, diretos e sem emoji.
7. Se mudar alguma tela, rode o servidor e confira no navegador em largura de celular (390 px) e de computador antes de dizer que está pronto.
8. Ao terminar, diga o que mudou, o que você testou e o que não testou.
9. Se a tarefa mexer em arquivos que outra sessão pode estar alterando, avise antes de começar.
