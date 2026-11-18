# Infiltrados

Jogo de identidade oculta para 4 a 12 pessoas. Cada jogador usa o próprio celular como mão secreta. Serve para jogar à distância (cada um na sua casa, conversando por chamada) ou na mesma mesa, com uma TV ou tablet mostrando o andamento.

O nome, os personagens e as cartas atuais são um tema provisório. As regras e o tema ficam em arquivos separados, então dá para trocar um sem mexer no outro.

## Rodar

Precisa de Node 20 ou mais novo.

```bash
npm install
```

```bash
npm start
```

Abra `http://localhost:3000`. Crie uma sala, passe o código de 4 letras ou o link de convite e complete a mesa com bots se faltar gente. Para a tela da mesa, abra `http://localhost:3000/?mesa=CODIGO`.

A porta pode ser trocada com a variável `PORT`.

## Testar

```bash
npm test
```

Os testes cobrem a preparação para cada tamanho de mesa, os casos de regra mais delicados, o sigilo do que cada jogador recebe e 360 partidas automáticas jogadas até o fim.

## Onde mexer

| Para mudar | Arquivo |
| --- | --- |
| Nomes e textos de cartas, personagens, times e regras escritas | `public/theme.js` |
| Cores e fontes | começo de `public/style.css` |
| Quantidade de cada carta, limite de suspeita, cartas por jogador | `src/engine/content.js` |
| Efeito de uma carta ou habilidade de personagem | `src/engine/engine.js` |
| Como os bots jogam | `src/engine/bot.js` |
| Salas, reconexão, tempo de espera por quem caiu | `src/server/server.js` |
| Telas | `public/app.js` |

## Como funciona por dentro

O servidor guarda o estado completo de cada partida. O navegador só manda intenções ("jogar esta carta nesta pessoa") e recebe de volta a visão daquele jogador: a própria mão, as próprias cartas de identidade e o que é público. As cartas viradas dos outros nunca saem do servidor.

Se alguém perde a conexão, o lugar continua dele. Ao reabrir o link no mesmo aparelho ele volta para a mesma cadeira. Se uma decisão ficar esperando por ele por mais de 25 segundos, o jogo decide no lugar.

## O que ainda não existe

- Hospedagem: por enquanto roda no computador de quem inicia. Para jogar pela internet é preciso publicar em um serviço que aceite Node e WebSocket.
- As salas ficam só na memória. Se o servidor reiniciar, as partidas em andamento se perdem.
- Não há relógio de turno, conversa por texto nem contas de usuário.
- O equilíbrio dos números foi medido só com bots, que jogam mal. Precisa de partidas com gente.
