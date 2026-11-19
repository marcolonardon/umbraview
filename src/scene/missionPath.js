/* O caminho da missão para o desenho (card C16): onde a nave está no instante do relógio, onde
 * fica o nome de cada evento e os pontos de cada trecho nas unidades da cena.
 *
 * A missão vem pronta do motor (computeMission, pelo useMission): os trechos, cada um com os
 * instantes e os pontos em km. Aqui não tem conta de órbita: só a leitura desses pontos.
 */
import { kmToUnits } from './missionScale.js'

const pointAt = (positionsKm, i) => [positionsKm[3 * i], positionsKm[3 * i + 1], positionsKm[3 * i + 2]]

/* segments: mission.segments. dateMs: o instante, em milissegundos UTC. Devolve a nave naquele
   instante: { phase, kind, center, positionKm }, com a posição em km a partir do centro do trecho
   (a Terra ou a Lua), na reta entre os dois pontos vizinhos do caminho. Antes do lançamento ela
   fica no primeiro ponto, e depois do pouso, no último: o relógio da vista pode passar das pontas. */
export function spacecraftAt(segments, dateMs) {
  // o último trecho que já começou: na emenda entre dois, vale o seguinte
  let segment = segments[0]
  for (const candidate of segments) {
    if (dateMs >= candidate.timesMs[0]) segment = candidate
  }
  const { phase, kind, center, timesMs, positionsKm } = segment
  const last = timesMs.length - 1
  let positionKm
  if (dateMs <= timesMs[0]) positionKm = pointAt(positionsKm, 0)
  else if (dateMs >= timesMs[last]) positionKm = pointAt(positionsKm, last)
  else {
    // o par de pontos em volta do instante, cortando o trecho ao meio até sobrar um intervalo
    let low = 0
    let high = last
    while (high - low > 1) {
      const middle = (low + high) >> 1
      if (timesMs[middle] <= dateMs) low = middle
      else high = middle
    }
    const u = (dateMs - timesMs[low]) / (timesMs[high] - timesMs[low])
    const a = pointAt(positionsKm, low)
    const b = pointAt(positionsKm, high)
    positionKm = [a[0] + u * (b[0] - a[0]), a[1] + u * (b[1] - a[1]), a[2] + u * (b[2] - a[2])]
  }
  return { phase, kind, center, positionKm }
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
