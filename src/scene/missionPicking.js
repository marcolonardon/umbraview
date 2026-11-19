/* Os cliques da vista da missão: na marca de uma base, que escolhe a base (card C13), e na Lua,
 * que escolhe o local de pouso (card C17).
 *
 * Este arquivo não conhece o three nem o React, como o picking.js da cena da Lua: recebe o que o
 * raio do clique acertou e devolve números, para a regra ser testada sem WebGL.
 */
import { latLonToUnit, unitToLatLon } from '../engine/geometry.js'
import { MOON_RADIUS, facesCamera } from './missionScale.js'
import { CLICK_MAX_DRAG_PX } from './picking.js'

const NOTHING = -1

/* click: { delta, hits }. delta: quanto o mouse andou, em pixels, entre apertar e soltar (o delta
   do evento do React Three Fiber). hits: o índice da base de cada marca que o raio do clique
   atravessou, da mais perto da câmera para a mais longe; pode trazer repetidos e o que não é marca.
   markers: onde fica a marca de cada base, nas unidades do desenho. camera: a posição da câmera.
   selectedIndex: a base escolhida agora, ou −1.
   Devolve o índice da base a escolher, ou −1 para não fazer nada.

   Três cuidados:
   - o fim de um arrasto não é clique, pelo mesmo limite do clique na Lua (picking.js);
   - a marca que está do outro lado da Terra não conta: a Terra não entra na conta do raio, e sem
     isto um clique no mar escolheria a base que está atrás dele;
   - com várias marcas no mesmo lugar (plataformas a poucos quilômetros uma da outra), clicar de
     novo passa para a seguinte, dando a volta. Sem isto, só a da frente poderia ser escolhida pelo
     clique. */
export function readSiteClick({ delta, hits }, markers, camera, selectedIndex) {
  if (delta > CLICK_MAX_DRAG_PX) return NOTHING
  const inView = [...new Set(hits)].filter((index) => markers[index] && facesCamera(markers[index], camera))
  if (inView.length === 0) return NOTHING
  const current = inView.indexOf(selectedIndex)
  if (current === -1) return inView[0]
  if (inView.length === 1) return NOTHING
  return inView[(current + 1) % inView.length]
}

/* A marca do local de pouso é levantada um fio acima da esfera da Lua, para não nascer enterrada
   (o mesmo cuidado da marca das bases, missionScale.js). */
const LANDING_MARKER_LIFT = 1.01
// as 4 casas das coordenadas da tela: uns 3 m no chão da Lua
const COORDINATE_DIGITS = 4
const round = (value) => Number(value.toFixed(COORDINATE_DIGITS))

/* Onde fica a marca de um local de pouso, a partir do centro da Lua, nas unidades do desenho.
   site: { lat, lon } em graus. moonMatrix: a orientação da Lua no instante (o moonMatrix do
   system.js, 16 números em colunas). O ponto do motor (z para o norte) vira o da esfera do three
   (y para o norte: src/scene/coordinates.js) e é girado pela matriz. */
export function landingMarkerPosition(site, moonMatrix) {
  const [x, y, z] = latLonToUnit(site.lat, site.lon)
  const sphere = [x, z, -y]
  const m = moonMatrix
  return [0, 1, 2].map((k) => (m[k] * sphere[0] + m[4 + k] * sphere[1] + m[8 + k] * sphere[2]) * MOON_RADIUS * LANDING_MARKER_LIFT)
}

/* O clique na Lua: qual ponto dela foi escolhido. point: o ponto que o raio do clique acertou, no
   desenho. delta: quanto o mouse andou entre apertar e soltar. moonPosition e moonMatrix: onde a
   Lua está e como está virada no instante do relógio.
   Devolve { lat, lon } em graus, ou null no fim de um arrasto (o mesmo limite do clique nas
   marcas). É o caminho de volta do landingMarkerPosition: o giro da Lua é desfeito pela matriz ao
   contrário, que para um giro é a transposta. */
export function readLandingClick({ point, delta }, moonPosition, moonMatrix) {
  if (delta > CLICK_MAX_DRAG_PX) return null
  const d = [point[0] - moonPosition[0], point[1] - moonPosition[1], point[2] - moonPosition[2]]
  const length = Math.hypot(...d)
  const m = moonMatrix
  const sphere = [0, 1, 2].map((column) => (m[4 * column] * d[0] + m[4 * column + 1] * d[1] + m[4 * column + 2] * d[2]) / length)
  const { lat, lon } = unitToLatLon([sphere[0], -sphere[2], sphere[1]])
  return { lat: round(lat), lon: round(lon) }
}
