/* O caminho da missão para o desenho (card C16): onde a nave está no instante do relógio, onde
 * fica o nome de cada evento e os pontos de cada trecho nas unidades da cena.
 *
 * A missão vem pronta do motor (computeMission, pelo useMission): os trechos, cada um com os
 * instantes e os pontos em km. Aqui não tem conta de órbita: só a leitura desses pontos.
 */
import { EARTH_EQUATORIAL_RADIUS_KM } from '../engine/earthSite.js'
import { MOON_RADIUS_M } from '../engine/geometry.js'
import { kmToUnits } from './missionScale.js'

const pointAt = (positionsKm, i) => [positionsKm[3 * i], positionsKm[3 * i + 1], positionsKm[3 * i + 2]]

/* segments: mission.segments. dateMs: o instante, em milissegundos UTC. Devolve a nave naquele
   instante: { phase, kind, center, positionKm }, com a posição em km a partir do centro do trecho
   (a Terra ou a Lua), na reta entre os dois pontos vizinhos do caminho. Antes do lançamento ela
   fica no primeiro ponto, e depois do pouso, no último: o relógio da vista pode passar das pontas. */
export function spacecraftAt(segments, dateMs) {
  const { segment, low, high, u } = locate(segments, dateMs)
  const { phase, kind, center, positionsKm } = segment
  const a = pointAt(positionsKm, low)
  const b = pointAt(positionsKm, high)
  return { phase, kind, center, positionKm: [a[0] + u * (b[0] - a[0]), a[1] + u * (b[1] - a[1]), a[2] + u * (b[2] - a[2])] }
}

/* Onde o instante cai no caminho: o trecho, os dois pontos vizinhos (low e high) e quanto do
   intervalo entre eles já passou (u, de 0 a 1). Antes do começo e depois do fim, os dois pontos
   são o mesmo: a ponta. */
function locate(segments, dateMs) {
  // o último trecho que já começou: na emenda entre dois, vale o seguinte
  let segment = segments[0]
  for (const candidate of segments) {
    if (dateMs >= candidate.timesMs[0]) segment = candidate
  }
  const { timesMs } = segment
  const last = timesMs.length - 1
  // só antes do lançamento: no primeiro instante de um trecho, a nave já está no primeiro pedaço dele
  if (dateMs < timesMs[0] || last === 0) return { segment, low: 0, high: 0, u: 0 }
  if (dateMs >= timesMs[last]) return { segment, low: last, high: last, u: 0 }
  // o par de pontos em volta do instante, cortando o trecho ao meio até sobrar um intervalo
  let low = 0
  let high = last
  while (high - low > 1) {
    const middle = (low + high) >> 1
    if (timesMs[middle] <= dateMs) low = middle
    else high = middle
  }
  return { segment, low, high, u: (dateMs - timesMs[low]) / (timesMs[high] - timesMs[low]) }
}

/* Os eventos que ganham nome na cena, em ordem: o lançamento, a saída da Terra, a chegada à Lua e
   o pouso. Cada um é { key, dateMs, center, positionKm }: o ponto do caminho em que acontece, que
   é o começo de um trecho, ou o fim do último. */
export function missionEvents(mission) {
  const start = (key, phase) => {
    const { center, timesMs, positionsKm } = mission.segments.find((segment) => segment.phase === phase)
    return { key, dateMs: timesMs[0], center, positionKm: pointAt(positionsKm, 0) }
  }
  const { center, timesMs, positionsKm } = mission.segments.at(-1)
  const end = timesMs.length - 1
  return [
    start('launch', 'ascent'),
    start('tli', 'crossing'),
    start('loi', 'lunarOrbit'),
    { key: 'landing', dateMs: timesMs[end], center, positionKm: pointAt(positionsKm, end) },
  ]
}

/* Os pontos de um trecho nas unidades do desenho (missionScale.js), todos em fila: x, y, z, x, y,
   z... É o formato que a linha do Drei recebe. */
export function segmentUnits(segment) {
  return kmToUnits(Array.from(segment.positionsKm))
}

// o comprimento de um caminho de pontos em fila (x, y, z, x, y, z...), na unidade deles
export function pathLength(points) {
  let length = 0
  for (let i = 3; i < points.length; i += 3) {
    length += Math.hypot(points[i] - points[i - 3], points[i + 1] - points[i - 2], points[i + 2] - points[i - 1])
  }
  return length
}

/* A câmera da nave: de que distância ela é vista e até onde dá para chegar perto, nas unidades do
   desenho. fromEarth e fromMoon: a nave a partir do centro de cada corpo. limits: { distance, a
   distância de sempre; near, o mais perto que dá para chegar longe dos corpos; earthClearance e
   moonClearance, o mais perto que a câmera pode ficar do centro de cada um }.

   A câmera gira em volta da nave, e a pessoa escolhe o lado. Com a nave colada num corpo, uma
   câmera a d da nave fica, no pior lado, a |d − distância da nave ao centro| do centro dele: pode
   cair dentro. Enquanto a distância de sempre não basta para ficar fora de qualquer lado, o limite
   de perto é a distância da nave ao centro mais a folga do corpo, e a câmera fica além dele. */
export function craftCamera(fromEarth, fromMoon, { distance, near, earthClearance, moonClearance }) {
  const earth = Math.hypot(...fromEarth)
  const moon = Math.hypot(...fromMoon)
  let minDistance = near
  if (earth < distance + earthClearance) minDistance = earth + earthClearance
  else if (moon < distance + moonClearance) minDistance = moon + moonClearance
  return { distance: Math.max(distance, minDistance), minDistance }
}

// quanto a câmera do passo do pouso fica inclinada em relação ao polo sul da Lua
const LANDING_VIEW_TILT = (20 * Math.PI) / 180

/* De onde a câmera olha a Lua no passo do pouso: a direção, de tamanho 1, a partir do centro da
   Lua. moonMatrix: a orientação da Lua (system.js; a coluna 1 é o polo norte). sunDirection: a
   direção do Sol, de tamanho 1.
   Os locais de pouso conhecidos ficam todos perto do polo sul, e é para lá que a câmera olha. Ela
   fica LANDING_VIEW_TILT fora do eixo, para o lado do Sol: bem em cima do polo, que é quase o
   eixo vertical do desenho, arrastar o mouse só faria a vista rodar; e do lado do Sol o chão do
   polo aparece iluminado. */
export function landingViewDirection(moonMatrix, sunDirection) {
  const south = [-moonMatrix[4], -moonMatrix[5], -moonMatrix[6]]
  const along = sunDirection[0] * south[0] + sunDirection[1] * south[1] + sunDirection[2] * south[2]
  // a parte da direção do Sol que fica de lado em relação ao eixo da Lua
  const side = sunDirection.map((value, k) => value - along * south[k])
  const length = Math.hypot(...side)
  const cos = Math.cos(LANDING_VIEW_TILT)
  const sin = Math.sin(LANDING_VIEW_TILT)
  return south.map((value, k) => value * cos + (side[k] / length) * sin)
}

// a que latitude da Terra a câmera do passo da base olha: perto da do meio das bases (28,6° N)
const LAUNCH_VIEW_LATITUDE = (25 * Math.PI) / 180

/* De onde a câmera olha a Terra no passo da base, quando nenhuma base foi escolhida ainda: a
   direção, de tamanho 1, a partir do centro da Terra. earthMatrix: a orientação da Terra
   (system.js; a coluna 1 é o polo norte). sunDirection: a direção do Sol, de tamanho 1.
   Do lado do dia, no meridiano do Sol, e LAUNCH_VIEW_LATITUDE ao norte do equador, onde ficam
   quase todas as bases. Sem isto a câmera chegava do polo sul da Lua olhando a Terra por baixo. */
export function launchViewDirection(earthMatrix, sunDirection) {
  const north = [earthMatrix[4], earthMatrix[5], earthMatrix[6]]
  const along = sunDirection[0] * north[0] + sunDirection[1] * north[1] + sunDirection[2] * north[2]
  // a parte da direção do Sol que fica no plano do equador
  const equator = sunDirection.map((value, k) => value - along * north[k])
  const length = Math.hypot(...equator)
  const cos = Math.cos(LAUNCH_VIEW_LATITUDE)
  const sin = Math.sin(LAUNCH_VIEW_LATITUDE)
  return north.map((value, k) => (equator[k] / length) * cos + value * sin)
}

/* Quantos pontos de um trecho a nave já voou no instante: os que têm instante até o do relógio.
   É o que separa a parte forte da linha da parte fraca (card C17, fase 3). */
export function flownPoints(segment, dateMs) {
  const { timesMs } = segment
  let low = 0
  let high = timesMs.length
  while (low < high) {
    const middle = (low + high) >> 1
    if (timesMs[middle] <= dateMs) low = middle + 1
    else high = middle
  }
  return low
}

const BODY_RADIUS_KM = { earth: EARTH_EQUATORIAL_RADIUS_KM, moon: MOON_RADIUS_M / 1000 }

/* A nave em números, no instante: { phase, kind, body, altitudeKm, speedKmS }. body é o corpo de
   onde o trecho é contado; a altura é sobre o raio de referência dele (o do equador, na Terra), e
   nunca negativa: a base fica um pouco abaixo desse raio. A velocidade é em relação ao mesmo
   corpo, tirada dos dois pontos do caminho em volta do instante: a distância entre eles pelo
   tempo. Nas pontas da missão, parada, é zero.
   Nos trechos desenhados (kind 'schematic') os pontos são desenho: quem usa não mostra os números. */
export function telemetryAt(segments, dateMs) {
  const { segment, low, high, u } = locate(segments, dateMs)
  const { phase, kind, center, timesMs, positionsKm } = segment
  const a = pointAt(positionsKm, low)
  const b = pointAt(positionsKm, high)
  const position = [a[0] + u * (b[0] - a[0]), a[1] + u * (b[1] - a[1]), a[2] + u * (b[2] - a[2])]
  const seconds = (timesMs[high] - timesMs[low]) / 1000
  return {
    phase,
    kind,
    body: center,
    altitudeKm: Math.max(0, Math.hypot(...position) - BODY_RADIUS_KM[center]),
    speedKmS: seconds > 0 ? Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / seconds : 0,
  }
}

/* O peso de cada fase no trilho do painel de voo: quanto do trilho ela ocupa. Não é o tempo dela:
   a travessia leva 87% do tempo da missão e a subida, 0,2%, e numa régua de tempo o lançamento e
   o pouso sumiriam nas pontas. A travessia e a órbita lunar, que são as longas, ficam mais largas. */
const TRACK_WEIGHTS = { ascent: 1, parking: 1, crossing: 3, lunarOrbit: 2, descent: 1, landing: 1 }

/* O trilho da missão: um pedaço por fase, em ordem, { phase, from, to, startMs, endMs }, com from
   e to de 0 a 1 (o lugar do pedaço no trilho) e os instantes em que a fase começa e termina. */
export function trackLayout(segments) {
  const total = segments.reduce((sum, segment) => sum + TRACK_WEIGHTS[segment.phase], 0)
  let from = 0
  return segments.map((segment) => {
    const to = from + TRACK_WEIGHTS[segment.phase] / total
    const piece = { phase: segment.phase, from, to, startMs: segment.timesMs[0], endMs: segment.timesMs.at(-1) }
    from = to
    return piece
  })
}

/* Do lugar no trilho (de 0 a 1) para o instante, em milissegundos UTC: dentro do pedaço de cada
   fase o tempo anda por igual. Fora das pontas, fica nas pontas. */
export function timeAtTrack(segments, position) {
  const layout = trackLayout(segments)
  if (position <= 0) return layout[0].startMs
  if (position >= 1) return layout.at(-1).endMs
  const piece = layout.findLast((item) => position >= item.from)
  return piece.startMs + ((position - piece.from) / (piece.to - piece.from)) * (piece.endMs - piece.startMs)
}

// o caminho de volta: do instante para o lugar no trilho
export function trackAtTime(segments, dateMs) {
  const layout = trackLayout(segments)
  if (dateMs <= layout[0].startMs) return 0
  if (dateMs >= layout.at(-1).endMs) return 1
  const piece = layout.findLast((item) => dateMs >= item.startMs)
  return piece.from + ((dateMs - piece.startMs) / (piece.endMs - piece.startMs)) * (piece.to - piece.from)
}

/* O próximo evento da missão no instante: o primeiro de events (missionEvents) que ainda não
   aconteceu; no instante de um evento, ainda é ele. Depois do pouso, continua sendo o pouso. É o
   único nome de evento que a cena mostra durante o voo. */
export function nextEvent(events, dateMs) {
  return events.find((event) => event.dateMs >= dateMs) ?? events.at(-1)
}

/* De onde a câmera olha a nave durante o voo (card C17, fase 4): a direção, de tamanho 1, da nave
   para a câmera. phase: a fase. fromEarth e fromMoon: a nave a partir do centro de cada corpo.
   phaseProgress: quanto da fase já passou, de 0 a 1.
   Perto da Terra, e na primeira metade da travessia, a câmera fica para fora da Terra: a Terra
   aparece atrás da nave, ficando para trás. Da metade da travessia em diante, e na Lua, ela fica
   na direção da Lua para a nave: na travessia, isso é atrás da nave, com a Lua à frente; em
   volta da Lua, é do lado de fora dela. Sem isto a câmera ficava parada em relação à nave, e a
   nave sumia atrás do corpo ao dar a volta nele. */
export function craftViewDirection({ phase, fromEarth, fromMoon, phaseProgress }) {
  const nearEarth = phase === 'ascent' || phase === 'parking' || (phase === 'crossing' && phaseProgress < 0.5)
  const from = nearEarth ? fromEarth : fromMoon
  const length = Math.hypot(...from)
  return from.map((value) => value / length)
}
