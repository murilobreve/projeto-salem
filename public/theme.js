// Tema: todos os nomes e textos que aparecem na tela.
// Para vestir o jogo com outro tema, troque este arquivo e as cores no
// comeco de style.css. As regras ficam em src/engine e nao dependem daqui.

export const GAME_NAME = 'Infiltrados';
export const TAGLINE = 'Cada jogador guarda cartas de identidade viradas. Algumas escondem um Infiltrado.';

export const TEAMS = {
  loyal: { name: 'Leais', one: 'Leal' },
  infiltrators: { name: 'Infiltrados', one: 'Infiltrado' },
};

export const IDS = {
  LOYAL: { name: 'Leal', letter: 'L' },
  INFILTRATOR: { name: 'Infiltrado', letter: 'I' },
  GUARDIAN: { name: 'Guardião', letter: 'G' },
};

export const KINDS = {
  suspicion: 'Suspeita',
  action: 'Ação',
  persistent: 'Carta fixa',
  event: 'Evento',
};

export const CARDS = {
  SUSP1: { name: 'Suspeita', short: 'mais 1 de suspeita', text: 'Soma 1 de suspeita a outro jogador.' },
  SUSP2: { name: 'Indício', short: 'mais 2 de suspeita', text: 'Soma 2 de suspeita a outro jogador.' },
  SUSP4: { name: 'Flagrante', short: 'mais 4 de suspeita', text: 'Soma 4 de suspeita a outro jogador.' },
  CLEAR: { name: 'Defesa', short: 'tira 3 de suspeita', text: 'Tira até 3 de suspeita de outro jogador.' },
  STUN: { name: 'Detenção', short: 'perde a vez', text: 'Outro jogador perde a próxima vez.' },
  PEEK: { name: 'Interrogatório', short: 'ver uma carta', text: 'Você olha em segredo uma carta de identidade de outro jogador. Depois as cartas dele são embaralhadas.' },
  STEAL: { name: 'Confisco', short: 'pegar 2 cartas', text: 'Você pega 2 cartas ao acaso da mão de outro jogador.' },
  SHIFT: { name: 'Desvio', short: 'mover a suspeita', text: 'Toda a suspeita de um jogador passa para outro. Nenhum dos dois pode ser você.' },
  STRIP: { name: 'Revogação', short: 'tirar carta fixa', text: 'Descarta uma carta fixa que está com outro jogador.' },
  SHIELD: { name: 'Escolta', short: 'protege à noite', text: 'Fica com outro jogador. Salva ele de um ataque noturno e depois é descartada.' },
  ARMOR: { name: 'Salvo-conduto', short: 'limite mais 3', text: 'Fica com outro jogador. Ele precisa de 3 a mais de suspeita para ter uma carta revelada.' },
  NIGHT: { name: 'Noite', short: '', text: 'Os Infiltrados escolhem alguém para atacar, o Guardião protege uma pessoa e todos decidem se confessam.' },
  RECRUIT: { name: 'Aliciamento', short: '', text: 'Quem estiver sozinho com mais suspeita revela uma carta. Depois cada jogador pega uma carta de identidade do vizinho.' },
};

export const CHARACTERS = {
  HEADSTART: { name: 'Veterano', text: 'Começa a partida com 2 cartas a mais na mão.' },
  LOUD: { name: 'Agitador', text: 'Suas cartas de Suspeita valem 2 em vez de 1.' },
  COURIER: { name: 'Mensageiro', text: 'Ao encerrar um turno em que jogou cartas, compra 1 carta.' },
  SECOND_CHANCE: { name: 'Casca-grossa', text: 'Na primeira vez que sua suspeita chega ao limite, ela volta a zero e nenhuma carta é revelada.' },
  WATCHER: { name: 'Vigia', text: 'Uma vez por partida, na sua vez, olha em segredo uma carta de identidade de outro jogador.' },
  AVENGER: { name: 'Vingador', text: 'Quem revelar uma carta sua por suspeita descarta a mão inteira.' },
  SURVIVOR: { name: 'Sobrevivente', text: 'Sobrevive ao primeiro ataque noturno que sofreria.' },
  TRADER: { name: 'Negociador', text: 'Uma vez por partida, na sua vez, troca de mão com outro jogador.' },
  SCAVENGER: { name: 'Oportunista', text: 'Compra 2 cartas sempre que alguém sai da partida.' },
  MEDIC: { name: 'Advogado', text: 'Suas cartas de Defesa tiram toda a suspeita do alvo.' },
  PENITENT: { name: 'Arrependido', text: 'Compra 2 cartas quando confessa à noite.' },
  WARDEN: { name: 'Carcereiro', text: 'Suas cartas de Detenção fazem o alvo perder 2 vezes.' },
};

export const ERRORS = {
  name_required: 'Escreva seu nome para entrar.',
  room_not_found: 'Não existe sala com esse código.',
  room_started: 'Essa sala já está no meio de uma partida.',
  room_full: 'A sala está cheia.',
  too_few: 'Faltam jogadores para começar.',
  not_allowed: 'Só quem criou a sala pode fazer isso.',
  removed: 'Você foi retirado da sala.',
  not_your_turn: 'Ainda não é a sua vez.',
  wait_decision: 'Há uma decisão em andamento. Espere ela terminar.',
  already_acting: 'Você já escolheu o que fazer neste turno.',
  already_drawing: 'Você escolheu comprar neste turno.',
  already_done: 'Sua escolha já foi registrada.',
  must_act: 'Jogue pelo menos uma carta antes de encerrar.',
  bad_target: 'Esse jogador não pode ser o alvo.',
  bad_index: 'Essa carta não pode ser escolhida.',
  no_card: 'Essa carta não está mais na sua mão.',
  no_ability: 'Sua habilidade não pode ser usada agora.',
  server_error: 'O servidor falhou nessa ação. Tente de novo.',
};

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const OUT_CAUSE = {
  exposed: 'ao ter a carta de Infiltrado revelada',
  exhausted: 'ao ficar sem cartas ocultas',
  night: 'no ataque da noite',
};
const NIGHT_OUTCOME = {
  killed: (p) => `Os Infiltrados atacaram ${p}.`,
  confessed: (p) => `Os Infiltrados atacaram ${p}, que se salvou por ter confessado.`,
  guardian: (p) => `Os Infiltrados atacaram ${p}, que estava sob proteção do Guardião.`,
  shield: (p) => `Os Infiltrados atacaram ${p}, que foi salvo pela Escolta.`,
  survivor: (p) => `Os Infiltrados atacaram ${p}, que resistiu ao ataque (Sobrevivente).`,
  already_out: (p) => `Os Infiltrados miraram em ${p}, que já tinha saído ao confessar.`,
};

// Uma linha do historico publico. name(id) devolve o nome do jogador.
export function logLine(e, name) {
  const p = e.p ? name(e.p) : '';
  const target = e.target ? name(e.target) : '';
  switch (e.t) {
    case 'start':
      return `A partida começou. ${p} joga primeiro.`;
    case 'turn':
      return `Vez de ${p}.`;
    case 'draw':
      return `${p} comprou uma carta.`;
    case 'play': {
      const card = CARDS[e.card].name;
      if (e.card.startsWith('SUSP')) return `${p} jogou ${card} em ${target}: mais ${e.value} de suspeita.`;
      if (e.card === 'CLEAR') return `${p} jogou Defesa em ${target}: menos ${e.value} de suspeita.`;
      if (e.card === 'STUN') return `${p} jogou Detenção em ${target}, que perde ${plural(e.value, 'vez', 'vezes')}.`;
      if (e.card === 'PEEK') return `${p} interrogou ${target} e viu uma carta em segredo.`;
      if (e.card === 'STEAL') return `${p} confiscou ${plural(e.value, 'carta', 'cartas')} da mão de ${target}.`;
      if (e.card === 'SHIFT') return `${p} desviou ${e.value} de suspeita de ${target} para ${name(e.target2)}.`;
      if (e.card === 'STRIP') return `${p} revogou ${CARDS[e.removed].name} de ${target}.`;
      return `${p} deu ${card} a ${target}.`;
    }
    case 'threshold':
      return `A suspeita sobre ${p} chegou ao limite. ${name(e.by)} escolhe a carta que será revelada.`;
    case 'second_chance':
      return `A suspeita sobre ${p} chegou ao limite, mas voltou a zero (Casca-grossa).`;
    case 'reveal':
      if (e.cause === 'confess') return `${p} confessou e revelou uma carta: ${IDS[e.card].name}.`;
      return `Carta de ${p} revelada: ${IDS[e.card].name}.`;
    case 'out':
      return `${p} saiu da partida ${OUT_CAUSE[e.cause]}.${e.team ? ` Jogava pelos ${TEAMS[e.team].name}.` : ''}`;
    case 'avenger':
      return `${name(e.victim)} descartou a mão por revelar uma carta de ${p} (Vingador).`;
    case 'skip':
      return `${p} perdeu a vez por causa da Detenção.`;
    case 'ability':
      return `${p} usou a habilidade de ${CHARACTERS[e.character].name} em ${target}.`;
    case 'bonus':
      return `${p} comprou ${plural(e.n, 'carta', 'cartas')} pela habilidade de ${CHARACTERS[e.why].name}.`;
    case 'night_start':
      return 'Anoiteceu. Cada jogador faz sua escolha em segredo.';
    case 'night_protect':
      return e.target ? `O Guardião protege ${target} esta noite.` : 'Ninguém está sob proteção do Guardião esta noite.';
    case 'night_result':
      return NIGHT_OUTCOME[e.outcome](p);
    case 'night_end':
      return 'Amanheceu. O descarte voltou para o baralho.';
    case 'recruit_start':
      return 'Aliciamento.';
    case 'pressure':
      return `${p} é quem tem mais suspeita e vai ter uma carta revelada. ${name(e.by)} escolhe qual.`;
    case 'recruit_done':
      return 'Cada jogador pegou uma carta de identidade do vizinho.';
    case 'win':
      return `Fim da partida: vitória dos ${TEAMS[e.team].name}.`;
    default:
      return '';
  }
}

// Linhas que so o proprio jogador ve.
export function noteLine(n, name) {
  const list = (cards) => cards.map((c) => CARDS[c].name).join(', ');
  switch (n.t) {
    case 'peek':
      return `Você viu uma carta de ${name(n.p)}: ${IDS[n.card].name}.`;
    case 'stole':
      return `Você pegou da mão de ${name(n.p)}: ${list(n.cards)}.`;
    case 'robbed':
      return `${name(n.p)} pegou da sua mão: ${list(n.cards)}.`;
    case 'received':
      return `No Aliciamento você pegou de ${name(n.p)} uma carta: ${IDS[n.card].name}.`;
    case 'converted':
      return 'Você recebeu a carta de Infiltrado. Daqui até o fim você joga pelos Infiltrados, mesmo que a carta mude de mão.';
    default:
      return '';
  }
}

export const RULES_TEXT = [
  {
    title: 'O que está em jogo',
    body: [
      'Cada jogador tem uma fileira de cartas de identidade viradas para baixo. Quase todas dizem Leal. Algumas dizem Infiltrado e uma diz Guardião.',
      'Quem recebe uma carta de Infiltrado em qualquer momento passa a jogar pelos Infiltrados até o fim, mesmo que depois perca a carta.',
      'Os Leais vencem quando todas as cartas de Infiltrado da partida forem reveladas. Os Infiltrados vencem quando só restarem jogadores do time deles.',
    ],
  },
  {
    title: 'Na sua vez',
    body: [
      'Você escolhe uma coisa: comprar 2 cartas ou jogar cartas da mão. Quem joga pode jogar quantas quiser e depois encerra o turno.',
      'Cartas sempre vão para outros jogadores, nunca para você mesmo.',
      'As cartas de suspeita somam pontos no alvo. Quando a suspeita chega a 6, quem jogou a última carta escolhe uma carta de identidade do alvo para revelar e a contagem dele volta a zero.',
      'Revelar um Infiltrado tira o dono da partida. Quem fica sem nenhuma carta oculta também sai.',
    ],
  },
  {
    title: 'Noite',
    body: [
      'A Noite é uma carta do baralho e começa assim que alguém a compra.',
      'Todos escolhem em segredo no próprio aparelho: os Infiltrados votam em quem atacar, o Guardião protege alguém e os demais respondem a uma pergunta que não muda o jogo, só para ninguém perceber quem está agindo.',
      'Antes de saber quem foi atacado, cada jogador decide se confessa. Confessar revela uma carta sua e te salva do ataque daquela noite.',
      'O alvo sai da partida se não estiver protegido pelo Guardião, pela Escolta ou por uma confissão.',
    ],
  },
  {
    title: 'Aliciamento',
    body: [
      'Também é uma carta do baralho. Primeiro, quem estiver sozinho com mais suspeita tem uma carta revelada.',
      'Depois cada jogador escolhe, sem ver, uma carta de identidade do próximo jogador da roda. Todas mudam de dono ao mesmo tempo. É assim que alguém Leal pode virar Infiltrado no meio da partida.',
    ],
  },
];
