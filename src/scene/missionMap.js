/* O mapa pequeno do voo (card C17, fase 4): o trajeto inteiro, da Terra à Lua, numa escala só.
 *
 * Na cena 3D, que é em escala, ou se vê a nave ou se vê o trajeto: a Lua fica a 60 raios da
 * Terra. Com a câmera na nave, no meio da travessia, sobrava uma linha num céu preto. O mapa
 * responde "onde estou no caminho inteiro" sem falsear a escala da cena.
 *
 * É a vista de cima do plano da órbita da Terra (a eclíptica), olhando do norte: no desenho do
 * system.js o y é o norte, e o mapa fica com o x e o z. As distâncias no plano estão em escala; o
 * que sai do plano (a órbita da Lua é inclinada 5°) aparece achatado. Só a travessia entra na
 * linha: a órbita de espera e a órbita lunar têm menos de 1% do tamanho do mapa.
 *
 * Este arquivo não conhece o React: recebe a missão e devolve números, para ser testado no Node.
 */

// em quantos pedaços, no máximo, a linha da travessia é desenhada: ela chega com uns 3 mil pontos
const MAX_PIECES = 120
// a folga em volta do caminho, em vezes o tamanho dele: a Terra e a Lua não encostam na borda
const MARGIN = 0.12
/* A largura sobre a altura da moldura, sempre a mesma, deitada. Seguindo o formato do caminho, uma
   travessia quase reta para o norte deixava o mapa com 200 × 490 pixels, por cima dos controles do
   lado direito da cena (visto pelo Marco em 19/11/2026). O caminho fica no meio, na mesma escala. */
export const MAP_ASPECT = 4 / 3

/* Do desenho do system.js (km, y para o norte da eclíptica) para o mapa: [x, y], com o y do mapa
   para baixo, como no SVG. Visto do norte, é assim que o que gira no sentido anti-horário (a Lua
   em volta da Terra) aparece girando no sentido anti-horário. */
export function mapPoint([x, , z]) {
  return [x, z]
}

/* A parte da linha que a nave já voou, [[x, y]], para ser desenhada mais forte. path: a linha do
   mapa (missionMap). dateMs: o instante do relógio. craft: onde a nave está no mapa, [x, y].
   Durante a travessia a parte voada termina na nave, que está entre dois pontos da linha; antes
   dela não há nada, e depois é a linha inteira. */
export function flownOnMap(path, dateMs, craft) {
  const behind = []
  for (const point of path) {
    if (point.dateMs > dateMs) break
    behind.push([point.x, point.y])
  }
  const crossing = behind.length > 0 && behind.length < path.length
  return crossing ? [...behind, craft] : behind
}

/* mission: a missão da ponte (useMission). moonOrbitKm: o caminho da Lua em volta da Terra, em km,
   no desenho (moonOrbitPath). Devolve:
   path: a travessia, [{ x, y, dateMs }], em km a partir do centro da Terra;
   orbit: a órbita da Lua, [[x, y]];
   viewBox: [x, y, largura, altura], a moldura que cabe a Terra e a travessia com folga. */
export function missionMap(mission, moonOrbitKm) {
  const { timesMs, positionsKm } = mission.segments.find((segment) => segment.phase === 'crossing')
  const last = timesMs.length - 1
  const stride = Math.max(1, Math.ceil(last / MAX_PIECES))
  const path = []
  for (let i = 0; i < last; i += stride) path.push({ x: positionsKm[3 * i], y: positionsKm[3 * i + 2], dateMs: timesMs[i] })
  // o último ponto entra sempre: é onde a nave chega à Lua
  path.push({ x: positionsKm[3 * last], y: positionsKm[3 * last + 2], dateMs: timesMs[last] })

  const xs = path.map((point) => point.x).concat(0)
  const ys = path.map((point) => point.y).concat(0)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const width = Math.max(...xs) - minX
  const height = Math.max(...ys) - minY
  // a mesma folga dos quatro lados, pelo maior dos dois tamanhos
  const margin = Math.max(width, height) * MARGIN
  // o lado que falta para o formato do mapa cresce por igual dos dois lados, e o caminho fica no meio
  const framedWidth = Math.max(width + 2 * margin, (height + 2 * margin) * MAP_ASPECT)
  const framedHeight = framedWidth / MAP_ASPECT
  const centerX = minX + width / 2
  const centerY = minY + height / 2
  return {
    path,
    orbit: moonOrbitKm.map(mapPoint),
    viewBox: [centerX - framedWidth / 2, centerY - framedHeight / 2, framedWidth, framedHeight],
  }
}
