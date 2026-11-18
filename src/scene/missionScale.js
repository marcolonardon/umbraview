/* A escala da vista da missão (card C13): a Terra, a Lua e a distância entre elas na mesma régua.
 *
 * É o contrário da vista do sistema, que aumenta os corpos para eles aparecerem. Aqui uma órbita a
 * 185 km do chão tem que caber entre a Terra e a Lua no lugar certo, e isso só fecha com tudo na
 * mesma medida: 1 unidade do desenho é o raio da Terra no equador.
 */
import { EARTH_EQUATORIAL_RADIUS_KM } from '../engine/earthSite.js'
import { MOON_RADIUS_M } from '../engine/geometry.js'

const UNITS_PER_KM = 1 / EARTH_EQUATORIAL_RADIUS_KM

export const EARTH_RADIUS = 1
export const MOON_RADIUS = (MOON_RADIUS_M / 1000) * UNITS_PER_KM

/* A que raio fica o centro da marca de uma base. A Terra desenhada é uma esfera de raio 1, e o
   chão de verdade fica um pouco abaixo dela fora do equador (a Terra é achatada: 0,9966 no polo).
   A marca vai na direção certa e é levantada até um fio acima da esfera, para não nascer
   enterrada. O desvio é de até 21 km na altura, e nenhum na latitude e na longitude. */
export const MARKER_LIFT = 1.004

// de km (as posições do motor) para as unidades do desenho
export function kmToUnits(km) {
  return km.map((value) => value * UNITS_PER_KM)
}

/* siteKm: a posição da base a partir do centro da Terra, em km (earthSiteKm). Devolve onde a marca
   dela fica, nas unidades do desenho. */
export function markerPosition(siteKm) {
  const length = Math.hypot(...siteKm)
  return siteKm.map((value) => (value / length) * MARKER_LIFT)
}

/* Se um ponto do chão da Terra está do lado que a câmera vê. point: o ponto, a partir do centro da
   Terra, em qualquer tamanho. camera: a posição da câmera, nas unidades do desenho. O ponto aparece
   enquanto a câmera está acima do chão dele: do plano que encosta na Terra ali. De perto, isso é
   bem menos que metade da Terra. */
export function facesCamera(point, camera) {
  const length = Math.hypot(...point)
  const height = (point[0] * camera[0] + point[1] * camera[1] + point[2] * camera[2]) / length
  return height > EARTH_RADIUS
}

/* A partir de que distância da câmera a marca tem o tamanho cheio dela, em raios da Terra: a
   distância até o chão quando a câmera está na vista da Terra (a 4,2 raios do centro). */
const MARKER_FULL_SIZE_FROM = 3.2

/* Por quanto multiplicar o raio da marca. distance: da câmera até a marca, nas unidades do
   desenho. De longe, 1: a marca tem o tamanho dela e some junto com a Terra. De perto, encolhe na
   proporção da distância, e por isso fica do mesmo tamanho na tela: com o tamanho fixo, a marca
   virava um disco de 140 km em cima da base, tampando a costa e o próprio nome (visto no
   navegador). */
export function markerScale(distance) {
  return Math.min(1, distance / MARKER_FULL_SIZE_FROM)
}
