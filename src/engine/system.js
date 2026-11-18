/* A Terra, a Lua e o Sol num instante, para a vista do sistema da tela: onde a Lua está em volta da
 * Terra, de onde vem o Sol, para onde cada corpo está virado e o que isso dá no céu da Lua.
 *
 * As posições e as rotações são as mesmas do motor do horizonte (ephemeris.js: o astronomy-engine,
 * com os modelos de rotação da IAU). Aqui elas saem no referencial da eclíptica, o plano da órbita
 * da Terra, que é o jeito de ver a inclinação da órbita da Lua (uns 5°) e a do eixo dela (1,5°): é
 * dessas duas que vem o Sol sempre rasante nos polos, e da órbita oval e inclinada vem a libração.
 *
 * O "desenho" é o referencial da cena 3D da tela: y para o norte da eclíptica, e x e z no plano
 * dela (a mesma troca de eixos de src/scene/coordinates.js).
 */
import {
  Body, GeoMoon, GeoVector, Illumination, MakeTime, Observer, ObserverVector, RotateVector, Rotation_EQJ_ECL, RotationAxis, Vector,
} from 'astronomy-engine'

import { moonFixedRotation } from './ephemeris.js'
import { unitToLatLon } from './geometry.js'

export const AU_KM = 149597870.7
// O mês sideral: o tempo de uma volta da Lua em relação às estrelas (NASA NSSDC, CREDITS.md).
export const SIDEREAL_MONTH_DAYS = 27.3217
// O ano sideral: o tempo de uma volta da Terra em volta do Sol em relação às estrelas (NASA NSSDC,
// Earth Fact Sheet, "Sidereal orbit period (days) 365.256", lida em 15/11/2026; CREDITS.md).
export const SIDEREAL_YEAR_DAYS = 365.256
const DAY_MS = 24 * 3600e3

const TO_ECLIPTIC = Rotation_EQJ_ECL()

/* Do referencial equatorial (o do astronomy-engine) para o desenho. Exportada para quem põe outra
   coisa no mesmo desenho: o ponto do chão da Terra (earthSite.js) passa pelo mesmo giro, para a
   base de lançamento cair em cima da Terra que a matriz daqui desenha. */
export function toDrawing(x, y, z, time) {
  const v = RotateVector(TO_ECLIPTIC, new Vector(x, y, z, time))
  return [v.x, v.z, -v.y]
}

/* O giro que leva uma direção do catálogo de estrelas (equatorial J2000) ao desenho: os 16 números
   de uma matriz 4 × 4 em colunas. Não depende da data: a eclíptica J2000 é fixa nas estrelas. */
export const ECLIPTIC_SKY_MATRIX = (() => {
  const x = toDrawing(1, 0, 0, null)
  const y = toDrawing(0, 1, 0, null)
  const z = toDrawing(0, 0, 1, null)
  return [x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, 0, 0, 0, 1]
})()

const normalize = (v) => {
  const length = Math.hypot(...v)
  return v.map((value) => value / length)
}

/* A matriz 4 × 4 (em colunas, o formato do three) que põe uma esfera do three na orientação do
   corpo: a coluna 0 é para onde aponta a longitude 0° do equador dele, a 1 é o polo norte, a 2
   fecha a mão direita. toFixed: o giro do equatorial para o fixo do corpo (moonFixedRotation). As
   linhas desse giro são os eixos do corpo vistos do equatorial. */
function bodyMatrix(toFixed, time) {
  const rows = [toFixed(1, 0, 0), toFixed(0, 1, 0), toFixed(0, 0, 1)]
  const axis = (k) => toDrawing(rows[0][k], rows[1][k], rows[2][k], time)
  const x = axis(0)
  const y = axis(1)
  const z = axis(2)
  // a esfera do three tem o polo no y dela e a longitude 90° leste em −z (coordinates.js)
  return [x[0], x[1], x[2], 0, z[0], z[1], z[2], 0, -y[0], -y[1], -y[2], 0, 0, 0, 0, 1]
}

/* O giro do equatorial para o fixo da Terra num instante, pelos três eixos dela: para onde apontam,
   no espaço, o ponto do equador na longitude 0°, o da longitude 90° leste e o polo norte. Cada um
   é a posição de um ponto do chão (ObserverVector), a mesma conta que põe a base de lançamento
   (earthSite.js) e que bate com o JPL Horizons a 21 m.

   Por que não o RotationAxis, como na Lua: para a Terra, o ângulo de rotação que ele dá, junto com
   o polo, deixa os continentes fora do lugar. Medido em 18/11/2026 contra o ObserverVector: 0,88°
   de longitude em fevereiro de 2025 e 0,56° em novembro de 2026 (uns 60 a 100 km no equador), e
   134° em 01/01/2000, quando o polo quase coincide com o do referencial e a direção de onde o
   ângulo é medido fica indefinida. Na vista do sistema não dava para ver; na da missão, a marca
   da base cairia no mar (card C13). */
function earthFixedRotation(time) {
  const axis = (lat, lon) => {
    const v = ObserverVector(time, new Observer(lat, lon, 0), false)
    return normalize([v.x, v.y, v.z])
  }
  const rows = [axis(0, 0), axis(0, 90), axis(90, 0)]
  return (x, y, z) => rows.map((row) => row[0] * x + row[1] * y + row[2] * z)
}

/* dateMs: o instante, em milissegundos UTC. Devolve:
   moonKm: a posição da Lua a partir da Terra, em km, no desenho;
   distanceKm: a distância entre os centros;
   sunDirection: a direção do Sol a partir da Terra, de tamanho 1, no desenho;
   moonMatrix e earthMatrix: a orientação de cada corpo (bodyMatrix);
   subEarth e subSolar: o ponto da Lua com a Terra e com o Sol a pino, { lat, lon } em graus (o
   subEarth é a libração: quanto a face da Lua está virada de lado e para cima ou para baixo);
   phaseFraction: a parte iluminada do disco da Lua visto da Terra, de 0 a 1. */
export function systemStateAt(dateMs) {
  const time = MakeTime(new Date(dateMs))
  const moon = GeoMoon(time)
  const sun = GeoVector(Body.Sun, time, true)
  const moonFixed = moonFixedRotation(RotationAxis(Body.Moon, time))
  const earthFixed = earthFixedRotation(time)
  const moonKm = toDrawing(moon.x, moon.y, moon.z, time).map((v) => v * AU_KM)
  return {
    moonKm,
    distanceKm: Math.hypot(...moonKm),
    sunDirection: normalize(toDrawing(sun.x, sun.y, sun.z, time)),
    moonMatrix: bodyMatrix(moonFixed, time),
    earthMatrix: bodyMatrix(earthFixed, time),
    subEarth: unitToLatLon(normalize(moonFixed(-moon.x, -moon.y, -moon.z))),
    subSolar: unitToLatLon(normalize(moonFixed(sun.x - moon.x, sun.y - moon.y, sun.z - moon.z))),
    phaseFraction: Illumination(Body.Moon, time).phase_fraction,
  }
}

/* O caminho da Lua em volta da Terra durante um mês sideral a partir de dateMs: steps + 1 posições
   em km, no desenho, para a linha da órbita. */
export function moonOrbitPath(dateMs, steps) {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const time = MakeTime(new Date(dateMs + (i / steps) * SIDEREAL_MONTH_DAYS * DAY_MS))
    const moon = GeoMoon(time)
    return toDrawing(moon.x, moon.y, moon.z, time).map((v) => v * AU_KM)
  })
}

/* Onde o Sol está a partir da Terra num instante, em UA, no desenho: a mesma direção do
   sunDirection do systemStateAt, com a distância de verdade, que muda uns 3% ao longo do ano
   porque a órbita da Terra é um pouco oval. */
export function sunPositionAu(dateMs) {
  const time = MakeTime(new Date(dateMs))
  const sun = GeoVector(Body.Sun, time, true)
  return toDrawing(sun.x, sun.y, sun.z, time)
}

/* O caminho da Terra em volta do Sol durante um ano sideral a partir de dateMs: steps + 1 posições
   em UA, no desenho, a partir do Sol, para a linha da órbita da Terra. A Terra vista do Sol é o Sol
   visto da Terra, ao contrário: é a mesma conta do motor, sem órbita aproximada nem número
   digitado. O primeiro ponto é a Terra na data; pondo o Sol no lugar dele em cada instante
   (sunPositionAu), a Terra fica sempre em cima da linha, andando nela. */
export function earthOrbitPath(dateMs, steps) {
  return Array.from({ length: steps + 1 }, (_, i) =>
    sunPositionAu(dateMs + (i / steps) * SIDEREAL_YEAR_DAYS * DAY_MS).map((v) => -v),
  )
}
