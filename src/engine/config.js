/* Os números que decidem quanto o motor acerta. Cada um tem um dono só: este arquivo.
 *
 * A prova de que eles estão certos é comparar o horizonte com os mapas de visibilidade da NASA
 * (Mazarico et al. 2011, CREDITS.md): scripts/prepare-data/compare-nasa.mjs, com o relevo do site.
 * O resultado está no card E1 do backlog. Mudar qualquer número do horizonte pede
 * rodar a comparação de novo.
 *
 * Os erros citados abaixo são a média da diferença no Sol, em pontos percentuais, nos 259 pontos
 * sorteados de 85° a 90°S, medidos em 30/10/2026 com o compare-nasa.mjs e a opção dita em cada um.
 */

export const HORIZON = Object.freeze({
  /* Altura do observador acima do chão. Erro com 0, 1, 2 e 10 m (--mast=0, 1 e 10): 6,8; 3,1;
     2,1 e 3,6 pontos. Com 10 m, a Terra também se afasta da NASA (3,2 pontos, contra 1,2 com 2 m). */
  mastM: 2,
  /* Uma direção por grau. Com 720 direções (--directions=720), o erro fica igual: 2,1 pontos. */
  directions: 360,
  /* A montanha mais distante que entra no horizonte. */
  maxDistanceM: 200000,
  /* Passo ao longo do chão: 40 m até 40 km de distância; dali em diante, 0,1% da distância
     (200 m a 200 km). */
  step: (distanceM) => Math.max(40, 0.001 * distanceM),
})

/* O relevo fino vale até esta distância; dali até HORIZON.maxDistanceM, o grosso. O fino é o
   LDEM_80S_80MPP_ADJ, de 80 m por pixel; o grosso, de 960 m por pixel, é a média de 4 × 4 pixels
   do LDEM_60S_240MPP_ADJ (os dois no CREDITS.md). */
export const NEAR_LAYER_UP_TO_M = 10000

/* Janela de pouso mínima: 1 dia seguido com Sol e Terra à vista. Decisão do Enzo em 12/11/2026
   (card I6): os 144 h de antes não tinham requisito de missão por trás. Pela medição do card I1,
   nos pontos sorteados de 85° a 90°S em 30 dias, com 144 h só 38% têm janela, e com 24 h, 58%; os
   outros 42% não têm nem um dia seguido de Sol e Terra. Zerar o mínimo encheria a lista de pedaços
   de poucas horas. Muda aqui, e só aqui.
   Janela cortada no começo ou no fim do período entra mesmo mais curta (series.js). */
export const MIN_LANDING_WINDOW_HOURS = 24

/* O período que a tela mostra para um ponto, a partir da data escolhida. 30 dias cobrem um dia
   lunar inteiro (29,5 dias: o tempo que o Sol leva para dar uma volta no céu da Lua), então todo
   ponto mostra o ciclo inteiro de luz e escuro, e não só o pedaço em que a data caiu. Medido em
   03/11/2026 no Node, no computador do Enzo: a posição do Sol e da Terra de 30 dias leva de 32 a
   79 ms a cada troca de data; a de 365 dias, de 123 a 180 ms, e o ponto mais iluminado do mapa da
   NASA chega a 13 janelas de pouso na lista. Muda aqui, e só aqui. */
export const PERIOD_DAYS = 30

/* O propagador de órbitas (orbit.js, card C14). A prova é o orbit.test.js: a trajetória voada da
   Artemis I, do JPL Horizons, e as órbitas que têm fórmula. As medições abaixo são de 18/11/2026,
   no Node, no computador do Marco; mudar um número pede medir de novo. */
export const ORBIT = Object.freeze({
  /* O passo é esta fração do tempo que a gravidade leva para mudar o caminho ali, √(distância³/GM):
     8 s na órbita baixa da Terra. Numa elipse da órbita baixa até a distância da Lua, 5 dias de
     subida só com a Terra, o erro na chegada foi de 4 km com 0,05, de 215 m com 0,02, de 19 m com
     0,01 e de 1,5 m com 0,005. O custo quase não muda (de 2893 a 3290 passos em 4 dias), porque a
     fração só manda perto da Terra e da Lua. */
  stepFraction: 0.01,
  /* O teto do passo, em segundos: vale de 39 mil km da Terra em diante, quase a travessia toda.
     Com 60, 120, 300 e 600 s, o erro na mesma elipse foi de 13, 19, 25 e 27 m, e um caminho de
     4 dias levou 0,5, 0,3, 0,2 e 0,1 ms. Contra a Artemis I o resultado não muda nem com 1800 s.
     120 s dá um ponto a cada 2 minutos para a linha da tela (card C16), e a conta já é rápida. */
  maxStepS: 120,
  /* De quanto em quanto tempo a Lua e o Sol são lidos do astronomy-engine para a grade, em
     segundos. Com 1 hora, a Lua interpolada fica a 8 cm da lida direto; com 6 horas, a 16 m; com
     12 horas, a 254 m. Montar a grade de 6 dias leva 2 ms. */
  gridStepS: 3600,
})

/* A missão de referência (mission.js, card C15): o caminho de uma base de lançamento até um local
   de pouso, dentro de uma janela de pouso.

   TODOS OS VALORES SÃO PROVISÓRIOS. Os quatro primeiros são os do rascunho de 17/11/2026
   (docs/mission-simulation-plan.md) e os outros foram postos em 18/11/2026 para a conta fechar;
   nenhum tem fonte ainda. Escolher cada um, com a fonte ou a razão escrita, é decisão do Marco e
   do Enzo (plano, "Decisions that are not Claude's to make"). A tela tem que mostrá-los como
   escolhas do modelo, e não como dados de uma missão que voou. */
export const MISSION = Object.freeze({
  // a altura da órbita de espera em volta da Terra, de onde a nave sai para a Lua
  parkingAltitudeKm: 185,
  /* O tempo de travessia que se procura, em dias. O lançamento é escolhido pela inclinação, e não
     pela hora, então a travessia de cada missão sai meio dia para mais ou para menos (de 3,6 a
     4,3 dias em 26 missões de dezembro de 2026, medido em 18/11/2026). */
  crossingDays: 4,
  // a altura da passagem pela Lua e da órbita circular em que a nave fica depois dela
  lunarOrbitAltitudeKm: 100,
  /* Quanto tempo a nave fica na órbita lunar antes de descer. A saída só pode ser num ponto certo
     da volta (1 h 58 min cada uma), então a espera de verdade é a mais próxima deste valor. */
  lunarOrbitStayHours: 12,
  // o pouso é mirado tantas horas depois de a janela abrir, ou no meio dela, se ela for mais curta que o dobro
  landingAimHours: 12,
  /* A subida da base até a órbita de espera é desenho, e não conta: uma curva que leva este tempo
     e anda este ângulo em volta da Terra. */
  ascentMinutes: 10,
  ascentArcDeg: 20,
  /* A descida: uma elipse que sai da órbita lunar e chega a esta altura do chão meia volta
     depois, tantos graus antes do local de pouso. Dali ao chão é desenho de novo: uma curva que
     leva este tempo. */
  descentLowPointKm: 15,
  poweredDescentArcDeg: 15,
  poweredDescentMinutes: 12,
})

/* A mira da missão: quanto falta para a conta parar de corrigir, e em quantos degraus a gravidade
   da Lua e do Sol entra. */
export const AIMING = Object.freeze({
  /* A mira começa só com a Terra, onde o primeiro chute (uma elipse) é exato, e liga a Lua e o
     Sol aos poucos: em cada degrau a resposta do anterior ainda está perto. */
  gravitySteps: Object.freeze([0, 0.25, 0.5, 0.75, 1]),
  // a passagem pela Lua tem que acertar a altura e o plano a menos de 1 m, e a hora a menos de 0,01 s
  toleranceKm: 0.001,
  toleranceS: 0.01,
  // em 26 missões de dezembro de 2026, cada degrau fechou em 2 ou 3 correções (medido em 18/11/2026)
  maxCorrections: 12,
})
