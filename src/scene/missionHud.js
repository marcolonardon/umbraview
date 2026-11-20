/* As contas do painel de voo em estilo de transmissão (o HUD, pedido pelo Marco em 19/11/2026):
 * o arco por onde a missão anda, com um ponto por fase, e os mostradores redondos da nave.
 *
 * Este arquivo não conhece o React: recebe números e devolve números, para ser testado no Node.
 */
import { MOON_RADIUS_M } from '../engine/geometry.js'

const MOON_RADIUS_KM = MOON_RADIUS_M / 1000
/* Um ponto do arco do trilho, [x, y] em pixels do desenho. fraction: o lugar no trilho, de 0 a 1.
   width: a largura do arco. sag: quanto as pontas ficam abaixo do meio. O arco é um pedaço de
   círculo que passa pelas duas pontas, embaixo, e pelo meio, em cima (y = 0).
   O x anda por igual com o lugar no trilho: o controle deslizante comum, que fica por cima do arco
   e é quem recebe o mouse e o teclado, aponta o mesmo lugar que o desenho. */
export function arcPoint(fraction, { width, sag }) {
  const half = width / 2
  const radius = (half * half + sag * sag) / (2 * sag)
  const x = fraction * width
  const dx = x - half
  return [x, radius - Math.sqrt(radius * radius - dx * dx)]
}

/* O caminho SVG ("d") de um pedaço do arco, de um lugar do trilho a outro, em linhas curtas. */
export function arcPath(from, to, shape, steps = 48) {
  const points = []
  const count = Math.max(1, Math.ceil(steps * Math.abs(to - from)))
  for (let i = 0; i <= count; i += 1) {
    const [x, y] = arcPoint(from + ((to - from) * i) / count, shape)
    points.push(`${x.toFixed(2)},${y.toFixed(2)}`)
  }
  return `M${points.join(' L')}`
}

/* Quanto do mostrador redondo fica aceso: o valor sobre o máximo, de 0 a 1. Sem máximo, apagado. */
export function gaugeArc(value, max) {
  if (!(max > 0)) return 0
  return Math.min(1, Math.max(0, value / max))
}

/* A escala de um mostrador para o valor de agora: o primeiro degrau de 1, 2 ou 5 vezes uma potência
   de dez que não fica abaixo dele (pedido pelo Marco em 19/11/2026). Com a escala fixa no máximo da
   missão, a altura de 185 km da órbita de espera acendia 0,05% do mostrador, que ficava apagado até
   perto da Lua. Assim o mostrador fica sempre entre dois quintos e cheio, e a escala aparece escrita
   ao lado, como num instrumento que troca de faixa sozinho. Sem valor, a menor escala, 1. */
const SCALE_STEPS = [1, 2, 5, 10]
export function gaugeScale(value) {
  if (!(value > 0)) return 1
  const decade = 10 ** Math.floor(Math.log10(value))
  for (const step of SCALE_STEPS) {
    // toPrecision tira o resto do ponto flutuante: 0,1 × 5 tem que dar 0,5, e não 0,5000000001
    const scale = Number((step * decade).toPrecision(12))
    if (scale >= value) return scale
  }
  return Number((10 * decade).toPrecision(12))
}

/* A distância da nave até o chão da Lua, em km: o terceiro mostrador (pedido pelo Marco em
   19/11/2026). Na órbita de espera a altura e a velocidade não mudam, porque a órbita é um círculo;
   a distância até a Lua muda o tempo todo, uns 13 mil km a cada volta em volta da Terra.
   craft: a nave, { center, positionKm }, como spacecraftAt (missionPath.js) a dá: contada do centro
   da Terra ou do da Lua, no desenho do system.js. moonKm: a Lua no mesmo instante e no mesmo desenho
   (systemStateAt). Nunca negativa. */
export function moonDistanceKm({ center, positionKm }, moonKm) {
  const [x, y, z] = center === 'moon'
    ? positionKm
    : [positionKm[0] - moonKm[0], positionKm[1] - moonKm[1], positionKm[2] - moonKm[2]]
  return Math.max(0, Math.hypot(x, y, z) - MOON_RADIUS_KM)
}

/* Quantas vezes mais rápido que o tempo de verdade a missão anda numa fase: os segundos da fase sobre
   os segundos de tela que ela leva (pedido pelo Marco em 19/11/2026). O trilho dá a cada fase um
   pedaço pelo peso dela (trackLayout, em missionPath.js), e não pelo tempo: a aceleração muda de uma
   fase para outra, de centenas de vezes na subida a dezenas de milhares na travessia.
   piece: o pedaço da fase no trilho, { from, to, startMs, endMs }. playSeconds: quantos segundos a
   missão inteira leva tocando. speed: a velocidade escolhida (1, 2 ou 4). */
export function timeWarp({ from, to, startMs, endMs }, playSeconds, speed) {
  const screenSeconds = ((to - from) * playSeconds) / speed
  return (endMs - startMs) / 1000 / screenSeconds
}

